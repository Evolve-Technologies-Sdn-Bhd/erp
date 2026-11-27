import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { ActivityService } from '../../platform/activity/activity.service';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { CONFIG_ENTITY } from '../configuration.constants';
import { CONFIG_PERMISSIONS as P } from '../configuration.permissions';
import { appContentChanges, appContentErrors, APP_CONTENT_KEY, readAppContent, type AppContent } from './app-content.rules';

class ContactDto {
  @IsString()
  @MaxLength(60)
  label!: string;

  @IsString()
  @MaxLength(30)
  phone!: string;
}

export class SaveAppContentDto {
  /** The QR picture uploaded first (POST /attachments, kind APP_DUITNOW_QR); null removes it. */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  duitNowFileId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duitNowName?: string | null;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts!: ContactDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  officeHours?: string | null;

  /** 0 before anything was saved. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

/** A15 · Phone App: what the company's phones show (DuitNow QR, Help contacts, office hours). Admin keeps it here. */
@Injectable()
export class AppContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly permissions: PermissionRegistry,
  ) {}

  private async row(tenantId: string) {
    return this.prisma.sysSetting.findUnique({ where: { tenantId_key: { tenantId, key: APP_CONTENT_KEY } } });
  }

  /** For the admin page: the content, its version and whether this person may change it. */
  async view(ctx: RequestContext) {
    const row = await this.row(ctx.tenantId);
    const content = readAppContent(row?.value);
    return { ...(await this.withPicture(ctx.tenantId, content)), version: row?.version ?? 0, allowedActions: this.permissions.has(ctx.user.roles, P.SETTINGS_MANAGE) ? ['edit'] : [] };
  }

  /** For every phone, signed in: what to show. The picture is fetched with the same sign-in. */
  async forPhone(ctx: RequestContext) {
    const content = readAppContent((await this.row(ctx.tenantId))?.value);
    const shown = await this.withPicture(ctx.tenantId, content);
    return {
      duitNow: shown.duitNowUrl ? { imageUrl: shown.duitNowUrl, merchant: content.duitNowName ?? '' } : null,
      contacts: content.contacts,
      officeHours: content.officeHours,
    };
  }

  /** The picture's address, when the file is still there and is a picture. */
  private async withPicture(tenantId: string, content: AppContent) {
    const file = content.duitNowFileId ? await this.prisma.sysAttachment.findFirst({ where: { tenantId, id: content.duitNowFileId }, select: { id: true, mimeType: true } }) : null;
    const ok = file && file.mimeType.startsWith('image/');
    return { ...content, duitNowUrl: ok ? `/attachments/${file.id}/download` : null };
  }

  async save(ctx: RequestContext, dto: SaveAppContentDto) {
    const tenantId = ctx.tenantId;
    const row = await this.row(tenantId);
    if ((row?.version ?? 0) !== dto.version) throw new StaleVersionError();
    const before = readAppContent(row?.value);
    const after: AppContent = readAppContent({ duitNowFileId: dto.duitNowFileId, duitNowName: dto.duitNowName, contacts: dto.contacts, officeHours: dto.officeHours });
    const errors = appContentErrors({ ...after, contacts: dto.contacts.map((c) => ({ label: c.label, phone: c.phone })) });
    if (after.duitNowFileId) {
      const file = await this.prisma.sysAttachment.findFirst({ where: { tenantId, id: after.duitNowFileId }, select: { mimeType: true } });
      if (!file || !file.mimeType.startsWith('image/')) errors.push({ field: 'duitNowFileId', message: 'Upload the QR as a picture (PNG or JPG).' });
    }
    if (errors.length) throw new ValidationFailedError(errors);
    const changes = appContentChanges(before, after);
    if (!changes.length) return this.view(ctx);
    await this.prisma.$transaction(async (tx) => {
      const saved = row
        ? await tx.sysSetting.updateMany({ where: { id: row.id, version: dto.version }, data: { value: after as never, version: { increment: 1 }, updatedBy: ctx.user.code } })
        : await tx.sysSetting.create({ data: { tenantId, key: APP_CONTENT_KEY, value: after as never, updatedBy: ctx.user.code } }).then(() => ({ count: 1 }));
      if (saved.count !== 1) throw new StaleVersionError();
      if (after.duitNowFileId) await tx.sysAttachment.updateMany({ where: { tenantId, id: after.duitNowFileId }, data: { entityType: CONFIG_ENTITY.SETTING, entityId: tenantId } });
      await this.activity.log(tx, ctx, { entityType: CONFIG_ENTITY.SETTING, entityId: tenantId, docNo: 'phone_app', action: 'updated', message: `Phone app: ${changes.join('; ')}`.slice(0, 500) });
    });
    return this.view(ctx);
  }
}

/** A15 · Phone App — /api/v1/config/settings/app-content. Anyone in Configuration reads; settings managers change it. */
@Controller('config/settings/app-content')
export class ConfigAppContentController {
  constructor(private readonly content: AppContentService) {}

  @Get()
  @RequirePermission(P.VIEW)
  view(@CurrentContext() ctx: RequestContext) {
    return this.content.view(ctx);
  }

  @Put()
  @RequirePermission(P.SETTINGS_MANAGE)
  save(@CurrentContext() ctx: RequestContext, @Body() dto: SaveAppContentDto) {
    return this.content.save(ctx, dto);
  }
}

/** What every signed-in phone shows — /api/v1/me/app-content. Signed in, no permission: a salesperson and an installer read it. */
@Controller('me/app-content')
export class MeAppContentController {
  constructor(private readonly content: AppContentService) {}

  @Get()
  get(@CurrentContext() ctx: RequestContext) {
    return this.content.forPhone(ctx);
  }
}
