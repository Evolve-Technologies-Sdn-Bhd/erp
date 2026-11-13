import { Injectable } from '@nestjs/common';
import type { MdmPackage } from '@prisma/client';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError, type FieldError } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { CORE_ENTITY, CORE_EVENT } from '../core.constants';
import { diffRecord } from '../shared/audit.rules';
import { CoreRecordsService } from '../shared/core-records.service';
import { itemUnits } from '../price-lists/price-lists.rules';
import type { CreatePackageDto, PackageLineDto, UpdatePackageDto } from './dto/package.dto';
import { endRefusal, GIFT_RULE_LABEL, headerErrors, lineErrors, linesText, packageStatus, type GiftRule, type LineItem, type PackageLine } from './packages.rules';
import { PackagesQuery } from './packages.query';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const LABELS: Record<string, string> = {
  name: 'Name', uomCode: 'Unit', salesTaxCode: 'Sales tax', priceListCode: 'Price list', packagePrice: 'Package price',
  giftRule: 'Free gift', runsFrom: 'Runs from', runsUntil: 'Runs until', items: 'Items', gifts: 'Gifts',
};

/**
 * Package commands (C16): create, update, end now and delete. One transaction each, with the activity line (before
 * and after values) and an mdm.package.* event, like every Core record.
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: CoreRecordsService,
    private readonly clock: ClockService,
    private readonly query: PackagesQuery,
  ) {}

  async create(ctx: RequestContext, dto: CreatePackageDto) {
    const tenantId = ctx.tenantId;
    const [taken, deleted] = await Promise.all([
      this.prisma.mdmPackage.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } }, select: { name: true } }),
      this.prisma.sysActivity.findFirst({ where: { tenantId, entityType: CORE_ENTITY.PACKAGE, docNo: dto.code, action: 'deleted' }, select: { id: true } }),
    ]);
    if (taken) throw ValidationFailedError.field('code', `${dto.code} is already the code of ${taken.name}.`);
    if (deleted) throw ValidationFailedError.field('code', `${dto.code} belonged to a package that was deleted. Codes are never used again.`);
    const items = this.lines(dto.items);
    const gifts = this.lines(dto.gifts);
    const errors = await this.check(ctx, dto, items, gifts);
    if (errors.length) throw new ValidationFailedError(errors);
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mdmPackage.create({ data: { tenantId, code: dto.code, ...this.data(dto), createdBy: ctx.user.code, updatedBy: ctx.user.code } });
      await this.writeLines(tx, tenantId, row.code, items, gifts);
      const after = this.audit(dto, items, gifts);
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.PACKAGE,
        entityId: row.id,
        code: row.code,
        action: 'created',
        message: `Package ${row.code} created`,
        changes: diffRecord(null, after, LABELS),
        event: CORE_EVENT.PACKAGE_UPDATED,
        snapshot: { ...after, code: row.code },
        extra: { created: true },
      });
      return row.id;
    });
    return this.query.detail(ctx, id);
  }

  /** An ended package is kept as it was; a scheduled or running one can still change. */
  async update(ctx: RequestContext, id: string, dto: UpdatePackageDto) {
    const tenantId = ctx.tenantId;
    const before = await this.query.load(ctx, id);
    if (before.version !== dto.version) throw new StaleVersionError();
    if (packageStatus(this.query.dates(before), this.clock.today()) === 'ENDED') throw new BusinessRuleError('PACKAGE_ENDED', `${before.code} has ended, so it is kept as it was.`);
    const old = await this.query.lines(tenantId, [before.code]);
    const items = this.lines(dto.items);
    const gifts = this.lines(dto.gifts);
    const changes = diffRecord(this.auditOf(before, old.items, old.gifts), this.audit(dto, items, gifts), LABELS);
    if (!changes.length) return this.query.detail(ctx, id);
    const errors = await this.check(ctx, dto, items, gifts);
    if (errors.length) throw new ValidationFailedError(errors);
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmPackage.updateMany({ where: { id, tenantId, version: dto.version }, data: { ...this.data(dto), version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (saved.count === 0) throw new StaleVersionError();
      await tx.mdmPackageItem.deleteMany({ where: { tenantId, packageCode: before.code } });
      await tx.mdmPackageGift.deleteMany({ where: { tenantId, packageCode: before.code } });
      await this.writeLines(tx, tenantId, before.code, items, gifts);
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.PACKAGE,
        entityId: id,
        code: before.code,
        action: 'updated',
        message: changes.length === 1 ? `${changes[0]!.label}: ${changes[0]!.from ?? '—'} → ${changes[0]!.to ?? '—'}` : `Package ${before.code} changed (${changes.map((c) => c.label.toLowerCase()).join(', ')})`,
        changes,
        event: CORE_EVENT.PACKAGE_UPDATED,
        snapshot: { ...this.audit(dto, items, gifts), code: before.code },
      });
    });
    return this.query.detail(ctx, id);
  }

  /** End now: the package still runs today and has ended from tomorrow. */
  async end(ctx: RequestContext, id: string, version: number) {
    const tenantId = ctx.tenantId;
    const today = this.clock.today();
    const p = await this.query.load(ctx, id);
    if (p.version !== version) throw new StaleVersionError();
    const refusal = endRefusal(p.code, packageStatus(this.query.dates(p), today), this.query.dates(p).endedOn);
    if (refusal) throw new BusinessRuleError('PACKAGE_STATUS', refusal);
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmPackage.updateMany({ where: { id, tenantId, version }, data: { endedOn: day(today), version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (saved.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.PACKAGE,
        entityId: id,
        code: p.code,
        action: 'ended',
        message: `Package ${p.code} ended. Today is its last day.`,
        changes: [{ field: 'endedOn', label: 'Ended on', from: null, to: today }],
        event: CORE_EVENT.PACKAGE_UPDATED,
        snapshot: { code: p.code, endedOn: today },
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Delete, with its items and gifts. The code is never used again. */
  async remove(ctx: RequestContext, id: string, version: number) {
    const tenantId = ctx.tenantId;
    const p = await this.query.load(ctx, id);
    if (p.version !== version) throw new StaleVersionError();
    const used = await this.query.deleteRefusal(tenantId, p.code);
    if (used) throw new BusinessRuleError('PACKAGE_IN_USE', used);
    const old = await this.query.lines(tenantId, [p.code]);
    await this.prisma.$transaction(async (tx) => {
      await tx.mdmPackageItem.deleteMany({ where: { tenantId, packageCode: p.code } });
      await tx.mdmPackageGift.deleteMany({ where: { tenantId, packageCode: p.code } });
      const gone = await tx.mdmPackage.deleteMany({ where: { id, tenantId, version } });
      if (gone.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.PACKAGE,
        entityId: id,
        code: p.code,
        action: 'deleted',
        message: `Package ${p.code} deleted`,
        event: CORE_EVENT.PACKAGE_DELETED,
        snapshot: { ...this.auditOf(p, old.items, old.gifts), code: p.code },
      });
    });
    return { deleted: true, code: p.code };
  }

  private lines(rows: PackageLineDto[]): PackageLine[] {
    return rows.map((r) => ({ itemCode: r.itemCode, qty: dec(r.qty), uomCode: r.uomCode }));
  }

  private data(dto: CreatePackageDto | UpdatePackageDto) {
    return {
      name: dto.name, uomCode: dto.uomCode, salesTaxCode: dto.salesTaxCode, priceListCode: dto.priceListCode, packagePrice: dec(dto.packagePrice),
      giftRule: dto.giftRule, runsFrom: day(dto.runsFrom), runsUntil: dto.runsUntil ? day(dto.runsUntil) : null,
    };
  }

  private async writeLines(tx: Tx, tenantId: string, packageCode: string, items: PackageLine[], gifts: PackageLine[]) {
    const row = (l: PackageLine, i: number) => ({ tenantId, packageCode, itemCode: l.itemCode, qty: l.qty, uomCode: l.uomCode, sortOrder: i + 1 });
    if (items.length) await tx.mdmPackageItem.createMany({ data: items.map(row) });
    if (gifts.length) await tx.mdmPackageGift.createMany({ data: gifts.map(row) });
  }

  /** The values the audit trail compares, as plain text. */
  private audit(dto: CreatePackageDto | UpdatePackageDto, items: PackageLine[], gifts: PackageLine[]): Record<string, string | null> {
    return {
      name: dto.name, uomCode: dto.uomCode, salesTaxCode: dto.salesTaxCode, priceListCode: dto.priceListCode, packagePrice: dec(dto.packagePrice).toFixed(2),
      giftRule: GIFT_RULE_LABEL[dto.giftRule], runsFrom: dto.runsFrom, runsUntil: dto.runsUntil ?? null, items: linesText(items), gifts: linesText(gifts),
    };
  }

  private auditOf(p: MdmPackage, items: PackageLine[], gifts: PackageLine[]): Record<string, string | null> {
    const dates = this.query.dates(p);
    return {
      name: p.name, uomCode: p.uomCode, salesTaxCode: p.salesTaxCode, priceListCode: p.priceListCode, packagePrice: p.packagePrice.toFixed(2),
      giftRule: GIFT_RULE_LABEL[p.giftRule as GiftRule], runsFrom: dates.runsFrom, runsUntil: dates.runsUntil, items: linesText(items), gifts: linesText(gifts),
    };
  }

  /** The unit, tax code and price list exist and are in use; the dates, price and gift rule fit; each line is a usable item. */
  private async check(ctx: RequestContext, dto: CreatePackageDto | UpdatePackageDto, items: PackageLine[], gifts: PackageLine[]): Promise<FieldError[]> {
    const tenantId = ctx.tenantId;
    const errors: FieldError[] = headerErrors({ runsFrom: dto.runsFrom, runsUntil: dto.runsUntil ?? null, packagePrice: dec(dto.packagePrice), giftRule: dto.giftRule, giftCount: gifts.length });
    const codes = [...new Set([...items, ...gifts].map((l) => l.itemCode))];
    const [uom, tax, list, rows, conversions] = await Promise.all([
      this.prisma.mdmUom.findFirst({ where: { tenantId, code: dto.uomCode }, select: { isActive: true } }),
      this.prisma.mdmTaxCode.findFirst({ where: { tenantId, code: dto.salesTaxCode }, select: { code: true } }),
      this.prisma.mdmPriceList.findFirst({ where: { tenantId, code: dto.priceListCode }, select: { isActive: true } }),
      this.prisma.mdmItem.findMany({ where: { tenantId, code: { in: codes } }, select: { code: true, name: true, status: true, isSellable: true, baseUom: true } }),
      this.prisma.mdmUomConversion.findMany({ where: { tenantId, itemCode: { in: codes } }, select: { itemCode: true, fromUom: true, toUom: true } }),
    ]);
    if (!uom?.isActive) errors.push({ field: 'uomCode', message: `${dto.uomCode} is not an active unit.` });
    if (!tax) errors.push({ field: 'salesTaxCode', message: `${dto.salesTaxCode} is not a tax code.` });
    if (!list?.isActive) errors.push({ field: 'priceListCode', message: `${dto.priceListCode} is not an active price list.` });
    const known = new Map<string, LineItem>(
      rows.map((i) => [i.code, { name: i.name, status: i.status, isSellable: i.isSellable, units: itemUnits(i.baseUom, conversions.filter((c) => c.itemCode === i.code)) }]),
    );
    errors.push(...lineErrors('items', items, known), ...lineErrors('gifts', gifts, known));
    return errors;
  }
}
