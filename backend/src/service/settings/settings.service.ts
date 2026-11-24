import { Injectable } from '@nestjs/common';
import type { SvcPerson, SvcSlotGroup } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { dec } from '../../platform/http/decimal';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { JOB_TYPE_LABEL, JOB_TYPES, type JobType } from '../jobs/jobs.rules';
import {
  listOf, PERSON_ROLE_LABEL, PERSON_ROLES, personErrors, ROLE_JOB_TYPES, SITE_TYPE_LABEL, SITE_TYPES, slotGroupErrors, slotLabel, slotsOf,
  STARTER_SLOT_GROUPS, timeLabel, type PersonRole, type SiteType,
} from '../board/booking.rules';
import type { GeneralSettingsDto, PersonDto, SlotGroupDto, UpdatePersonDto, UpdateSlotGroupDto } from './settings.dto';

const ENTITY = { PERSON: 'SVC_PERSON', SLOT_GROUP: 'SVC_SLOT_GROUP', SETTING: 'SVC_SETTING' } as const;

/**
 * V05 · Slots and Stages (SvcSettings.html, kept simple): the people the office books, with the jobs they take and the
 * sites they go to (F3 part 4), and the slot groups the Planning Board offers, with the one it picks first for each job
 * type. Stages are fixed (Not booked → Booked → Done → Closed). Every change is logged.
 */
@Injectable()
export class ServiceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** The starter slot groups, made the first time Service needs them, so turning the module on needs no set-up. */
  async ensureSlotGroups(ctx: RequestContext): Promise<void> {
    const count = await this.prisma.svcSlotGroup.count({ where: { tenantId: ctx.tenantId } });
    if (count > 0) return;
    await this.prisma.svcSlotGroup.createMany({
      data: STARTER_SLOT_GROUPS.map((g) => ({ ...g, tenantId: ctx.tenantId, updatedBy: ctx.user.code })),
      skipDuplicates: true,
    });
  }

  async view(ctx: RequestContext) {
    await this.ensureSlotGroups(ctx);
    const [people, groups, general] = await Promise.all([
      this.prisma.svcPerson.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcSetting.findUnique({ where: { tenantId: ctx.tenantId } }),
    ]);
    return {
      /** Phase 5: the warehouse confirms a booked job's stock before its delivery order. Off by default. */
      general: { warehouseConfirms: general?.warehouseConfirms ?? false },
      people: people.map(personView),
      slotGroups: groups.map(slotGroupView),
      /** The roles, and the jobs a new person with that role starts with. Each person then keeps their own list. */
      roles: PERSON_ROLES.map((r) => ({ role: r, label: PERSON_ROLE_LABEL[r], jobTypes: ROLE_JOB_TYPES[r] })),
      jobTypes: JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABEL[t] })),
      siteTypes: SITE_TYPES.map((t) => ({ value: t, label: SITE_TYPE_LABEL[t] })),
      stages: ['Not booked', 'Booked', 'Done', 'Closed'],
    };
  }

  async saveGeneral(ctx: RequestContext, dto: GeneralSettingsDto) {
    const before = (await this.prisma.svcSetting.findUnique({ where: { tenantId: ctx.tenantId } }))?.warehouseConfirms ?? false;
    if (before !== dto.warehouseConfirms) {
      await this.prisma.$transaction(async (tx) => {
        await tx.svcSetting.upsert({
          where: { tenantId: ctx.tenantId },
          update: { warehouseConfirms: dto.warehouseConfirms, updatedBy: ctx.user.code },
          create: { tenantId: ctx.tenantId, warehouseConfirms: dto.warehouseConfirms, updatedBy: ctx.user.code },
        });
        await this.activity.log(tx, ctx, {
          entityType: ENTITY.SETTING, entityId: ctx.tenantId, docNo: 'Service', action: 'saved',
          message: `The warehouse confirms stock before the delivery order: ${before ? 'On' : 'Off'} → ${dto.warehouseConfirms ? 'On' : 'Off'}`, comment: null,
        });
      });
    }
    return this.view(ctx);
  }

  async addPerson(ctx: RequestContext, dto: PersonDto) {
    const jobTypes = ordered(dto.jobTypes ?? ROLE_JOB_TYPES[dto.role as PersonRole] ?? [], JOB_TYPES);
    const siteTypes = ordered(dto.siteTypes ?? [...SITE_TYPES], SITE_TYPES);
    const errors = personErrors({ jobTypes, siteTypes });
    if (errors.length) throw new ValidationFailedError(errors);
    const count = await this.prisma.svcPerson.count({ where: { tenantId: ctx.tenantId } });
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.svcPerson.create({
        data: {
          tenantId: ctx.tenantId, name: dto.name.trim(), role: dto.role, phone: dto.phone?.trim() || null, jobTypes: jobTypes.join(','),
          siteTypes: siteTypes.join(','), claimsFees: dto.claimsFees ?? dto.role === 'INSTALLER', isActive: dto.isActive ?? true, sortOrder: count + 1,
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
        },
      });
      await this.activity.log(tx, ctx, {
        entityType: ENTITY.PERSON, entityId: p.id, docNo: p.name, action: 'created',
        message: `${p.name} added as ${PERSON_ROLE_LABEL[p.role as PersonRole]}; takes ${jobsText(p.jobTypes)}; goes to ${sitesText(p.siteTypes)}`, comment: null,
      });
    });
    return this.view(ctx);
  }

  /** Job types and site types left out are kept as they are. */
  async updatePerson(ctx: RequestContext, id: string, dto: UpdatePersonDto) {
    const before = await this.prisma.svcPerson.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!before) throw new NotFoundError('Person');
    const after = {
      name: dto.name.trim(), role: dto.role, phone: dto.phone?.trim() || null, isActive: dto.isActive ?? before.isActive,
      jobTypes: dto.jobTypes ? ordered(dto.jobTypes, JOB_TYPES).join(',') : before.jobTypes,
      siteTypes: dto.siteTypes ? ordered(dto.siteTypes, SITE_TYPES).join(',') : before.siteTypes,
      claimsFees: dto.claimsFees ?? before.claimsFees,
    };
    const errors = personErrors({ jobTypes: listOf(after.jobTypes), siteTypes: listOf(after.siteTypes) });
    if (errors.length) throw new ValidationFailedError(errors);
    const changes = changeText([
      ['Name', before.name, after.name],
      ['Role', PERSON_ROLE_LABEL[before.role as PersonRole], PERSON_ROLE_LABEL[after.role as PersonRole]],
      ['Takes', jobsText(before.jobTypes), jobsText(after.jobTypes)],
      ['Goes to', sitesText(before.siteTypes), sitesText(after.siteTypes)],
      ['Phone', before.phone ?? '—', after.phone ?? '—'],
      ['Claims fees', before.claimsFees ? 'Yes' : 'No', after.claimsFees ? 'Yes' : 'No'],
      ['Active', before.isActive ? 'Yes' : 'No', after.isActive ? 'Yes' : 'No'],
    ]);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.svcPerson.updateMany({ where: { id, tenantId: ctx.tenantId, version: dto.version }, data: { ...after, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (r.count === 0) throw new StaleVersionError();
      if (changes) await this.activity.log(tx, ctx, { entityType: ENTITY.PERSON, entityId: id, docNo: after.name, action: 'saved', message: changes, comment: null });
    });
    return this.view(ctx);
  }

  async addSlotGroup(ctx: RequestContext, dto: SlotGroupDto) {
    this.check(dto);
    await this.ensureSlotGroups(ctx);
    const existing = await this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId }, select: { code: true } });
    const base = dto.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'GROUP';
    let code = base;
    for (let n = 2; existing.some((e) => e.code === code); n++) code = `${base}-${n}`;
    const defaultFor = ordered(dto.defaultFor ?? [], JOB_TYPES);
    const siteTypes = ordered(dto.siteTypes ?? [...SITE_TYPES], SITE_TYPES);
    await this.prisma.$transaction(async (tx) => {
      const g = await tx.svcSlotGroup.create({
        data: {
          tenantId: ctx.tenantId, code, name: dto.name.trim(), slotMinutes: dto.slotMinutes, firstStart: dto.firstStart, lastEnd: dto.lastEnd,
          jobTypes: dto.jobTypes.join(','), defaultFor: defaultFor.join(','), siteTypes: siteTypes.join(','), isActive: dto.isActive ?? true, sortOrder: existing.length + 1, updatedBy: ctx.user.code,
          feeAmount: dto.feeAmount ? dec(dto.feeAmount) : null,
        },
      });
      await this.activity.log(tx, ctx, { entityType: ENTITY.SLOT_GROUP, entityId: g.id, docNo: g.name, action: 'created', message: `Slot group ${g.name} added: ${describe(g)}`, comment: null });
      await this.takeDefaults(tx, ctx, g.id, defaultFor);
    });
    return this.view(ctx);
  }

  /** A changed slot group applies to new bookings; jobs already booked keep their times and their group. */
  async updateSlotGroup(ctx: RequestContext, id: string, dto: UpdateSlotGroupDto) {
    this.check(dto);
    const before = await this.prisma.svcSlotGroup.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!before) throw new NotFoundError('Slot group');
    // Left out, the defaults stay, less any job type the group is no longer used for.
    const defaultFor = ordered(dto.defaultFor ?? listOf(before.defaultFor).filter((t) => dto.jobTypes.includes(t)), JOB_TYPES);
    const data = {
      name: dto.name.trim(), slotMinutes: dto.slotMinutes, firstStart: dto.firstStart, lastEnd: dto.lastEnd, jobTypes: dto.jobTypes.join(','),
      defaultFor: defaultFor.join(','), siteTypes: dto.siteTypes ? ordered(dto.siteTypes, SITE_TYPES).join(',') : before.siteTypes, isActive: dto.isActive ?? before.isActive,
      feeAmount: dto.feeAmount === undefined ? before.feeAmount : dto.feeAmount ? dec(dto.feeAmount) : null,
    };
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.svcSlotGroup.updateMany({ where: { id, tenantId: ctx.tenantId, version: dto.version }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (r.count === 0) throw new StaleVersionError();
      await this.activity.log(tx, ctx, { entityType: ENTITY.SLOT_GROUP, entityId: id, docNo: data.name, action: 'saved', message: `Slot group ${data.name}: ${describe(before)} → ${describe({ ...before, ...data })}`, comment: null });
      await this.takeDefaults(tx, ctx, id, defaultFor);
    });
    return this.view(ctx);
  }

  /** A job type has one default slot group: a group that becomes its default takes it from the others, logged. */
  private async takeDefaults(tx: Tx, ctx: RequestContext, groupId: string, defaultFor: string[]) {
    if (!defaultFor.length) return;
    const others = await tx.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId, id: { not: groupId } } });
    for (const o of others) {
      const had = listOf(o.defaultFor);
      const lost = had.filter((t) => defaultFor.includes(t));
      if (!lost.length) continue;
      await tx.svcSlotGroup.update({ where: { id: o.id }, data: { defaultFor: had.filter((t) => !lost.includes(t)).join(','), version: { increment: 1 }, updatedBy: ctx.user.code } });
      await this.activity.log(tx, ctx, { entityType: ENTITY.SLOT_GROUP, entityId: o.id, docNo: o.name, action: 'saved', message: `Slot group ${o.name} is no longer the default for ${jobsText(lost.join(','))}`, comment: null });
    }
  }

  private check(dto: SlotGroupDto) {
    const errors = slotGroupErrors(dto);
    if (errors.length) throw new ValidationFailedError(errors);
  }
}

function changeText(rows: [string, string, string][]): string {
  return rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => `${label}: ${a} → ${b}`).join('; ');
}

/** A list kept in the order of the options, without repeats. */
function ordered(values: string[], order: readonly string[]): string[] {
  return order.filter((o) => values.includes(o));
}

/** "Installation, Warranty" */
const jobsText = (v: string) => listOf(v).map((t) => JOB_TYPE_LABEL[t as JobType] ?? t).join(', ') || '—';

/** "Landed house, Condo / apartment", or "any site" when every site type is ticked. */
const sitesText = (v: string) => (listOf(v).length === SITE_TYPES.length ? 'any site' : listOf(v).map((t) => SITE_TYPE_LABEL[t as SiteType] ?? t).join(', ') || '—');

function describe(g: Pick<SvcSlotGroup, 'slotMinutes' | 'firstStart' | 'lastEnd' | 'jobTypes' | 'defaultFor' | 'siteTypes' | 'isActive'> & { feeAmount?: SvcSlotGroup['feeAmount'] }): string {
  const defaults = listOf(g.defaultFor).length ? `, default for ${jobsText(g.defaultFor)}` : '';
  const sites = listOf(g.siteTypes).length === SITE_TYPES.length ? '' : `, at ${sitesText(g.siteTypes)}`;
  const fee = g.feeAmount ? `, installer's fee ${g.feeAmount.toFixed(2)}` : '';
  return `${g.slotMinutes / 60} h slots, ${timeLabel(g.firstStart)} – ${timeLabel(g.lastEnd)}, for ${jobsText(g.jobTypes)}${sites}${defaults}${fee}${g.isActive ? '' : ' (not in use)'}`;
}

export function personView(p: SvcPerson) {
  return {
    id: p.id, name: p.name, role: p.role, roleLabel: PERSON_ROLE_LABEL[p.role as PersonRole] ?? p.role, phone: p.phone, isActive: p.isActive, version: p.version,
    /** The jobs this person takes and the sites they go to (F3 part 4). */
    jobTypes: listOf(p.jobTypes) as JobType[],
    siteTypes: listOf(p.siteTypes) as SiteType[],
    takesText: jobsText(p.jobTypes),
    /** Claims a fee per job with their own invoice (F5). */
    claimsFees: p.claimsFees,
    goesToText: sitesText(p.siteTypes),
  };
}

export function slotGroupView(g: SvcSlotGroup) {
  const slots = slotsOf(g);
  return {
    id: g.id, code: g.code, name: g.name, slotMinutes: g.slotMinutes, firstStart: g.firstStart, lastEnd: g.lastEnd,
    jobTypes: listOf(g.jobTypes), defaultFor: listOf(g.defaultFor), isActive: g.isActive, version: g.version,
    /** The sites the group is for: a category such as hacking or ceiling work may suit only some. */
    siteTypes: listOf(g.siteTypes) as SiteType[],
    sitesText: sitesText(g.siteTypes),
    /** The installer's reference fee for a job of this category (F5), or null when not set. */
    feeAmount: g.feeAmount ? g.feeAmount.toFixed(2) : null,
    slots: slots.map((s) => ({ start: s.start, end: s.end, label: slotLabel(s.start, s.end) })),
    slotsText: slots.length <= 4 ? slots.map((s) => slotLabel(s.start, s.end)).join(' · ') : `${slots.length} slots, ${timeLabel(g.firstStart)} – ${timeLabel(g.lastEnd)}`,
  };
}
