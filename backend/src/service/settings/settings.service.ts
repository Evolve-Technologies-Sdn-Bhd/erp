import { Injectable } from '@nestjs/common';
import type { SvcPerson, SvcSlotGroup } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { JOB_TYPE_LABEL, type JobType } from '../jobs/jobs.rules';
import { PERSON_ROLE_LABEL, PERSON_ROLES, ROLE_JOB_TYPES, slotGroupErrors, slotLabel, slotsOf, STARTER_SLOT_GROUPS, timeLabel, type PersonRole } from '../board/booking.rules';
import type { PersonDto, SlotGroupDto, UpdatePersonDto, UpdateSlotGroupDto } from './settings.dto';

const ENTITY = { PERSON: 'SVC_PERSON', SLOT_GROUP: 'SVC_SLOT_GROUP' } as const;

/**
 * V05 · Slots and Stages (SvcSettings.html, kept simple): the people the office books with their role, and the slot
 * groups the Planning Board offers. Stages are fixed (Not booked → Booked → Done → Closed). Every change is logged.
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
    const [people, groups] = await Promise.all([
      this.prisma.svcPerson.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    return {
      people: people.map(personView),
      slotGroups: groups.map(slotGroupView),
      /** Who takes which job (fixed, SvcSettings.html). */
      roles: PERSON_ROLES.map((r) => ({
        role: r, label: PERSON_ROLE_LABEL[r], jobTypes: ROLE_JOB_TYPES[r],
        people: people.filter((p) => p.isActive && p.role === r).map((p) => p.name),
      })),
      stages: ['Not booked', 'Booked', 'Done', 'Closed'],
    };
  }

  async addPerson(ctx: RequestContext, dto: PersonDto) {
    const count = await this.prisma.svcPerson.count({ where: { tenantId: ctx.tenantId } });
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.svcPerson.create({
        data: { tenantId: ctx.tenantId, name: dto.name.trim(), role: dto.role, phone: dto.phone?.trim() || null, isActive: dto.isActive ?? true, sortOrder: count + 1, createdBy: ctx.user.code, updatedBy: ctx.user.code },
      });
      await this.activity.log(tx, ctx, { entityType: ENTITY.PERSON, entityId: p.id, docNo: p.name, action: 'created', message: `${p.name} added as ${PERSON_ROLE_LABEL[p.role as PersonRole]}`, comment: null });
    });
    return this.view(ctx);
  }

  async updatePerson(ctx: RequestContext, id: string, dto: UpdatePersonDto) {
    const before = await this.prisma.svcPerson.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!before) throw new NotFoundError('Person');
    const after = { name: dto.name.trim(), role: dto.role, phone: dto.phone?.trim() || null, isActive: dto.isActive ?? before.isActive };
    const changes = changeText([
      ['Name', before.name, after.name],
      ['Role', PERSON_ROLE_LABEL[before.role as PersonRole], PERSON_ROLE_LABEL[after.role as PersonRole]],
      ['Phone', before.phone ?? '—', after.phone ?? '—'],
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
    await this.prisma.$transaction(async (tx) => {
      const g = await tx.svcSlotGroup.create({
        data: { tenantId: ctx.tenantId, code, name: dto.name.trim(), slotMinutes: dto.slotMinutes, firstStart: dto.firstStart, lastEnd: dto.lastEnd, jobTypes: dto.jobTypes.join(','), isActive: dto.isActive ?? true, sortOrder: existing.length + 1, updatedBy: ctx.user.code },
      });
      await this.activity.log(tx, ctx, { entityType: ENTITY.SLOT_GROUP, entityId: g.id, docNo: g.name, action: 'created', message: `Slot group ${g.name} added: ${describe(g)}`, comment: null });
    });
    return this.view(ctx);
  }

  /** A changed slot group applies to new bookings; jobs already booked keep their times. */
  async updateSlotGroup(ctx: RequestContext, id: string, dto: UpdateSlotGroupDto) {
    this.check(dto);
    const before = await this.prisma.svcSlotGroup.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!before) throw new NotFoundError('Slot group');
    const data = { name: dto.name.trim(), slotMinutes: dto.slotMinutes, firstStart: dto.firstStart, lastEnd: dto.lastEnd, jobTypes: dto.jobTypes.join(','), isActive: dto.isActive ?? before.isActive };
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.svcSlotGroup.updateMany({ where: { id, tenantId: ctx.tenantId, version: dto.version }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (r.count === 0) throw new StaleVersionError();
      await this.activity.log(tx, ctx, { entityType: ENTITY.SLOT_GROUP, entityId: id, docNo: data.name, action: 'saved', message: `Slot group ${data.name}: ${describe(before)} → ${describe({ ...before, ...data })}`, comment: null });
    });
    return this.view(ctx);
  }

  private check(dto: SlotGroupDto) {
    const errors = slotGroupErrors(dto);
    if (errors.length) throw new ValidationFailedError(errors);
  }
}

function changeText(rows: [string, string, string][]): string {
  return rows.filter(([, a, b]) => a !== b).map(([label, a, b]) => `${label}: ${a} → ${b}`).join('; ');
}

function describe(g: Pick<SvcSlotGroup, 'slotMinutes' | 'firstStart' | 'lastEnd' | 'jobTypes' | 'isActive'>): string {
  return `${g.slotMinutes / 60} h slots, ${timeLabel(g.firstStart)} – ${timeLabel(g.lastEnd)}, for ${g.jobTypes.split(',').map((t) => JOB_TYPE_LABEL[t as JobType]).join(', ')}${g.isActive ? '' : ' (not in use)'}`;
}

export function personView(p: SvcPerson) {
  return { id: p.id, name: p.name, role: p.role, roleLabel: PERSON_ROLE_LABEL[p.role as PersonRole] ?? p.role, phone: p.phone, isActive: p.isActive, version: p.version };
}

export function slotGroupView(g: SvcSlotGroup) {
  const slots = slotsOf(g);
  return {
    id: g.id, code: g.code, name: g.name, slotMinutes: g.slotMinutes, firstStart: g.firstStart, lastEnd: g.lastEnd,
    jobTypes: g.jobTypes.split(',').filter(Boolean), isActive: g.isActive, version: g.version,
    slots: slots.map((s) => ({ start: s.start, end: s.end, label: slotLabel(s.start, s.end) })),
    slotsText: slots.length <= 4 ? slots.map((s) => slotLabel(s.start, s.end)).join(' · ') : `${slots.length} slots, ${timeLabel(g.firstStart)} – ${timeLabel(g.lastEnd)}`,
  };
}
