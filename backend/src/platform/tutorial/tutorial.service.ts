import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import type { RequestContext } from '../context/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { cleanTutorial, MAX_DONE, MAX_STEP, PATH_MAX, readTutorial, TOUR_ID, TOUR_ID_MAX, type TutorialState } from './tutorial.rules';

const TOUR_ID_MESSAGE = 'A tour id is lower case, with dots or dashes between the parts (sales.order.create).';

export class ActiveTourDto {
  @IsString()
  @MaxLength(TOUR_ID_MAX)
  @Matches(TOUR_ID, { message: TOUR_ID_MESSAGE })
  tourId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_STEP)
  step!: number;

  @IsString()
  @MaxLength(PATH_MAX)
  @Matches(/^\//, { message: 'The page is a path in the app, starting with /.' })
  path!: string;

  @IsBoolean()
  paused!: boolean;
}

/** Body of PUT /me/tutorial: the whole state, as the Help panel keeps it. */
export class SaveTutorialDto {
  @IsBoolean()
  mode!: boolean;

  @IsBoolean()
  welcomeSeen!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_DONE)
  @IsString({ each: true })
  @MaxLength(TOUR_ID_MAX, { each: true })
  @Matches(TOUR_ID, { each: true, message: TOUR_ID_MESSAGE })
  done!: string[];

  @ValidateIf((o: SaveTutorialDto) => o.active !== null)
  @ValidateNested()
  @Type(() => ActiveTourDto)
  active!: ActiveTourDto | null;
}

/**
 * A person's guided tours, saved on the server so they follow the person to any computer (and each demo user has
 * their own). A personal preference, like the home charts: saving it writes no activity line and no event.
 */
@Injectable()
export class TutorialService {
  constructor(private readonly prisma: PrismaService) {}

  private where(ctx: RequestContext) {
    return { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.user.id } };
  }

  async view(ctx: RequestContext): Promise<TutorialState> {
    return readTutorial(await this.prisma.sysUserTutorial.findUnique({ where: this.where(ctx) }));
  }

  async save(ctx: RequestContext, input: SaveTutorialDto): Promise<TutorialState> {
    const state = cleanTutorial(input);
    // A JSON column is emptied with Prisma's own marker; undefined would leave the old tour in place.
    const data = { mode: state.mode, welcomeSeen: state.welcomeSeen, done: state.done, active: state.active ? (state.active as unknown as Prisma.InputJsonObject) : Prisma.DbNull };
    await this.prisma.sysUserTutorial.upsert({
      where: this.where(ctx),
      create: { tenantId: ctx.tenantId, userId: ctx.user.id, ...data },
      update: data,
    });
    return this.view(ctx);
  }

  /** "Reset my progress": back to a first-time user, welcome card and all. */
  async reset(ctx: RequestContext): Promise<TutorialState> {
    await this.prisma.sysUserTutorial.deleteMany({ where: { tenantId: ctx.tenantId, userId: ctx.user.id } });
    return this.view(ctx);
  }
}
