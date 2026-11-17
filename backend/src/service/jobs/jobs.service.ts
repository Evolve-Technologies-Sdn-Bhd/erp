import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SVC_DOC_TYPE, SVC_ENTITY, SVC_EVENT, SVC_SEQUENCES } from '../service.constants';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import type { BookJobDto, CancelJobDto, CreateJobDto, RecordVisitDto, UpdateJobDto, VersionDto } from './dto/job.dto';
import { visitErrors, visitText } from './visit.rules';
import { bookingRefusal, slotLabel } from '../board/booking.rules';
import { ServiceSettingsService } from '../settings/settings.service';
import { allowedJobActions, JOB_STAGE_LABEL, JOB_TYPE_LABEL, manualJobErrors, shortDay, type JobAction, type JobStage, type JobType, type ReleasedOrder } from './jobs.rules';
import { JobsQuery } from './jobs.query';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** What taking a job off the board clears. */
const FREE_SLOT = { personId: null, personName: null, jobDate: null, slotStart: null, slotEnd: null, slotGroupCode: null, bookedAt: null } as const;
const trimOrNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

/**
 * Job commands (CLAUDE.md → Phase 5 · Installation module). Every change runs in one transaction: the job, its
 * activity and its event. A job from a sales order is made by the listener; the office adds the rest by hand.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: JobsQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly settings: ServiceSettingsService,
    private readonly attachments: AttachmentsService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /** A job the office adds by hand (service, warranty, repair, or an installation not from an order). */
  async create(ctx: RequestContext, dto: CreateJobDto) {
    const customer = await this.masterData.findCustomer(ctx.tenantId, dto.customerCode);
    if (!customer || customer.isCash) throw ValidationFailedError.field('customerCode', 'Pick the customer from Master Data.');
    if (customer.status === 'BLOCKED') throw ValidationFailedError.field('customerCode', `${customer.name} is blocked in Master Data and cannot be used.`);
    const siteAddress = dto.siteAddress?.trim() || customer.deliveryAddress;
    const preferredDate = dto.preferredDate || null;
    const errors = manualJobErrors({ jobType: dto.jobType, siteAddress, preferredDate }, this.clock.today());
    if (errors.length) throw new ValidationFailedError(errors);
    const branchCode = ctx.user.branchCodes.includes(customer.branchCode) ? customer.branchCode : ctx.branchCode;

    const { id } = await this.prisma.$transaction(async (tx) => {
      const job = await this.insert(tx, ctx, {
        jobType: dto.jobType as JobType, branchCode, customerCode: customer.code, customerName: customer.name,
        contactName: dto.contactName?.trim() || customer.contactName, phone: dto.phone?.trim() || customer.phone,
        siteAddress, area: dto.area?.trim() || customer.area, source: 'MANUAL', preferredDate, note: dto.note?.trim() || null,
      }, [], `Added by ${ctx.user.name}`);
      return job;
    });
    return this.query.detail(ctx, id);
  }

  /**
   * The job a released sales order with installation makes (listener `service.job-from-order`), in the listener's
   * transaction. Once per order: an order already handled is left alone.
   */
  async createFromOrder(tx: Tx, ctx: RequestContext, salesOrderId: string, order: ReleasedOrder): Promise<{ id: string; docNo: string } | null> {
    const existing = await tx.svcJob.findFirst({ where: { tenantId: ctx.tenantId, salesOrderId }, select: { id: true } });
    if (existing) return null;
    const [customer, items] = await Promise.all([
      this.masterData.findCustomer(ctx.tenantId, order.customerCode),
      order.lines.length ? this.masterData.findItems(ctx.tenantId, [...new Set(order.lines.map((l) => l.itemCode))]) : Promise.resolve([]),
    ]);
    const lines = order.lines.map((l) => ({ itemCode: l.itemCode, itemName: items.find((i) => i.code === l.itemCode)?.name ?? l.itemCode, qty: l.qty, uomCode: l.uomCode }));
    return this.insert(tx, ctx, {
      jobType: 'INSTALLATION', branchCode: order.branchCode, customerCode: order.customerCode, customerName: order.customerName,
      contactName: order.contactName ?? customer?.contactName ?? null, phone: customer?.phone ?? null,
      siteAddress: order.deliveryAddress ?? customer?.deliveryAddress ?? null, area: customer?.area ?? null,
      source: 'SALES_ORDER', salesOrderId, salesOrderNo: order.soNo, preferredDate: order.preferredDate, afterStock: order.afterStock, note: null,
    }, lines, `Created from ${order.soNo}`);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateJobDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'edit', `${job.docNo} is ${JOB_STAGE_LABEL[job.stage as JobStage].toLowerCase()} and can no longer be changed.`);
    const preferredDate = dto.preferredDate === undefined ? undefined : dto.preferredDate || null;
    if (preferredDate && preferredDate < this.clock.today()) throw ValidationFailedError.field('preferredDate', 'The preferred date cannot be in the past.');
    if (dto.siteAddress !== undefined && !dto.siteAddress.trim()) throw ValidationFailedError.field('siteAddress', 'Type the address the installer goes to.');
    const data: Prisma.SvcJobUpdateManyMutationInput = {
      ...(dto.contactName !== undefined && { contactName: trimOrNull(dto.contactName) }),
      ...(dto.phone !== undefined && { phone: trimOrNull(dto.phone) }),
      ...(dto.siteAddress !== undefined && { siteAddress: dto.siteAddress.trim() }),
      ...(dto.area !== undefined && { area: trimOrNull(dto.area) }),
      ...(preferredDate !== undefined && { preferredDate: preferredDate ? day(preferredDate) : null, ...(preferredDate && { afterStock: false }) }),
      ...(dto.note !== undefined && { note: trimOrNull(dto.note) }),
    };
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, dto.version, data, ['NOT_BOOKED', 'BOOKED']);
      await this.log(tx, ctx, job.id, job.docNo, 'saved', `Saved by ${ctx.user.name}`);
    });
    return this.query.detail(ctx, id);
  }

  async cancel(ctx: RequestContext, id: string, dto: CancelJobDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'cancel', `${job.docNo} is ${JOB_STAGE_LABEL[job.stage as JobStage].toLowerCase()} and can no longer be cancelled.`);
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, dto.version, { stage: 'CANCELLED', cancelReason: reason, cancelledAt: this.clock.now(), ...FREE_SLOT }, ['NOT_BOOKED', 'BOOKED']);
      await this.log(tx, ctx, job.id, job.docNo, 'cancelled', `Cancelled by ${ctx.user.name}${job.personName ? `; ${job.personName}'s slot is free again` : ''}`, reason);
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.JOB_CANCELLED, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
        payload: { jobNo: job.docNo, jobType: job.jobType, customerCode: job.customerCode, salesOrderNo: job.salesOrderNo, reason },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  // ── Planning Board (F3 part 2) ────────────────────────────────────────────

  /**
   * Books a job, or moves a booked one: one person, one day, one slot of a slot group. The person's row is locked
   * while the booking is checked, so two bookings at the same moment can never overlap.
   */
  async book(ctx: RequestContext, id: string, dto: BookJobDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'book', `${job.docNo} is ${JOB_STAGE_LABEL[job.stage as JobStage].toLowerCase()} and cannot be booked.`);
    await this.settings.ensureSlotGroups(ctx);
    const [person, group] = await Promise.all([
      this.prisma.svcPerson.findFirst({ where: { tenantId: ctx.tenantId, id: dto.personId } }),
      this.prisma.svcSlotGroup.findFirst({ where: { tenantId: ctx.tenantId, code: dto.slotGroupCode } }),
    ]);
    if (!person) throw ValidationFailedError.field('personId', 'Pick a person from the list.');
    if (!group) throw ValidationFailedError.field('slotGroupCode', 'Pick a slot group from the list.');
    const moving = job.stage === 'BOOKED';

    await this.prisma.$transaction(async (tx) => {
      // Lock the person's row: bookings for the same person wait for each other.
      await tx.$queryRaw`SELECT id FROM svc_person WHERE id = ${person.id} FOR UPDATE`;
      const taken = await tx.svcJob.findMany({
        where: { tenantId: ctx.tenantId, personId: person.id, jobDate: day(dto.date), stage: { notIn: ['CANCELLED', 'NOT_BOOKED'] }, id: { not: job.id } },
        select: { docNo: true, slotStart: true, slotEnd: true },
      });
      const refusal = bookingRefusal({
        jobNo: job.docNo, jobType: job.jobType as JobType, date: dto.date, today: this.clock.today(), start: dto.start,
        person: { name: person.name, role: person.role, isActive: person.isActive },
        group,
        taken: taken.filter((t) => t.slotStart !== null && t.slotEnd !== null).map((t) => ({ docNo: t.docNo, start: t.slotStart!, end: t.slotEnd! })),
      });
      if (refusal) throw new BusinessRuleError('SLOT_NOT_FREE', refusal);
      const end = dto.start + group.slotMinutes;
      await this.bump(tx, ctx, job.id, dto.version, {
        stage: 'BOOKED', personId: person.id, personName: person.name, jobDate: day(dto.date), slotStart: dto.start, slotEnd: end,
        slotGroupCode: group.code, bookedAt: this.clock.now(),
      }, ['NOT_BOOKED', 'BOOKED']);
      await this.log(tx, ctx, job.id, job.docNo, moving ? 'moved' : 'booked', `${moving ? 'Moved to' : 'Booked for'} ${person.name}, ${shortDay(dto.date)}, ${slotLabel(dto.start, end)}`);
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.JOB_BOOKED, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
        payload: { jobNo: job.docNo, jobType: job.jobType, personId: person.id, personName: person.name, date: dto.date, start: dto.start, end, moved: moving },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  /** Takes a booked job off the board: it waits as Not booked again and the slot is free. */
  async unbook(ctx: RequestContext, id: string, dto: VersionDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'unbook', `${job.docNo} is not booked.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, dto.version, { stage: 'NOT_BOOKED', ...FREE_SLOT }, 'BOOKED');
      await this.log(tx, ctx, job.id, job.docNo, 'unbooked', `Taken off the board by ${ctx.user.name}; the slot of ${job.personName} is free again`);
    });
    return this.query.detail(ctx, id);
  }

  /**
   * What happened at the visit (F3 part 3). Complete or partly done: the job is Done, with at least one photo and
   * whether the customer paid. Postponed: the job waits as Not booked again, the slot is free, and the reason is kept.
   * The office records it for the installer until the phone app comes.
   */
  async record(ctx: RequestContext, id: string, dto: RecordVisitDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'record', `${job.docNo} must be booked before its visit is recorded.`);
    const photos = (await this.attachments.listFor(ctx.tenantId, SVC_ENTITY.JOB, job.id)).filter((a) => a.mimeType.startsWith('image/')).length;
    const errors = visitErrors(dto, photos);
    if (dto.nextDate && dto.nextDate < this.clock.today()) errors.push({ field: 'nextDate', message: 'The new date cannot be in the past.' });
    if (errors.length) throw new ValidationFailedError(errors);
    const by = job.personName && job.personName !== ctx.user.name ? `${ctx.user.name} for ${job.personName}` : ctx.user.name;
    const reason = dto.reason?.trim() || null;
    const text = visitText(dto);

    await this.prisma.$transaction(async (tx) => {
      if (dto.result === 'POSTPONED') {
        await this.bump(tx, ctx, job.id, dto.version, {
          stage: 'NOT_BOOKED', ...FREE_SLOT, result: 'POSTPONED', resultReason: reason, postponedCount: { increment: 1 },
          ...(dto.nextDate && { preferredDate: day(dto.nextDate), afterStock: false }),
        }, 'BOOKED');
        await this.log(tx, ctx, job.id, job.docNo, 'postponed', `Postponed, recorded by ${by}; waiting to be booked again${dto.nextDate ? `, the customer asks for ${shortDay(dto.nextDate)}` : ''}`, reason);
        return;
      }
      await this.bump(tx, ctx, job.id, dto.version, {
        stage: 'DONE', doneAt: this.clock.now(), doneNote: dto.note?.trim() || null,
        result: dto.result, resultReason: reason, arrivedAt: dto.arrivedAt || null, finishedAt: dto.finishedAt || null,
        paidStatus: dto.paidStatus ?? null, paidMethod: dto.paidStatus === 'PAID' ? (dto.paidMethod ?? null) : null,
        notPaidReason: dto.paidStatus === 'NOT_PAID' ? (dto.notPaidReason?.trim() ?? null) : null,
        recordedBy: by, recordedAt: this.clock.now(),
      }, 'BOOKED');
      await this.log(tx, ctx, job.id, job.docNo, 'done', `${text} · ${photos} photo${photos === 1 ? '' : 's'}, recorded by ${by}`, dto.note?.trim() || reason);
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.JOB_DONE, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
        payload: {
          jobNo: job.docNo, jobType: job.jobType, personId: job.personId, personName: job.personName, date: job.jobDate?.toISOString().slice(0, 10) ?? null,
          result: dto.result, paidStatus: dto.paidStatus, salesOrderNo: job.salesOrderNo, customerCode: job.customerCode,
        },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  /** A partly done job gets one follow-up job: same customer, site and items, Not booked, saying what is left. */
  async followUp(ctx: RequestContext, id: string) {
    const job = await this.query.load(ctx.tenantId, id);
    const exists = await this.prisma.svcJob.findFirst({ where: { tenantId: ctx.tenantId, followUpOfId: job.id }, select: { docNo: true } });
    if (exists) throw new BusinessRuleError('FOLLOW_UP_EXISTS', `${job.docNo} already has its follow-up job, ${exists.docNo}.`);
    if (job.stage !== 'DONE' || job.result !== 'PARTIAL') throw new BusinessRuleError('ACTION_NOT_ALLOWED', `Only a partly done job gets a follow-up job.`);
    const made = await this.prisma.$transaction(async (tx) => {
      const next = await this.insert(tx, ctx, {
        jobType: job.jobType as JobType, branchCode: job.branchCode, customerCode: job.customerCode, customerName: job.customerName,
        contactName: job.contactName, phone: job.phone, siteAddress: job.siteAddress, area: job.area, source: 'MANUAL',
        salesOrderId: undefined, salesOrderNo: job.salesOrderNo ?? undefined, preferredDate: null,
        note: `Follow-up of ${job.docNo}: ${job.resultReason ?? 'finish the work'}`, followUpOfId: job.id, followUpOfNo: job.docNo,
      }, job.items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, qty: i.qty.toString(), uomCode: i.uomCode })), `Follow-up of ${job.docNo}, added by ${ctx.user.name}`);
      await this.log(tx, ctx, job.id, job.docNo, 'follow_up', `Follow-up job ${next.docNo} added by ${ctx.user.name}`);
      return next;
    });
    return this.query.detail(ctx, made.id);
  }

  async close(ctx: RequestContext, id: string, dto: VersionDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'close', `${job.docNo} must be done before it is closed.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, dto.version, { stage: 'CLOSED', closedAt: this.clock.now() }, 'DONE');
      await this.log(tx, ctx, job.id, job.docNo, 'closed', `Closed by ${ctx.user.name}`);
    });
    return this.query.detail(ctx, id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async insert(
    tx: Tx,
    ctx: RequestContext,
    j: {
      jobType: JobType; branchCode: string; customerCode: string; customerName: string; contactName: string | null; phone: string | null;
      siteAddress: string | null; area: string | null; source: 'SALES_ORDER' | 'MANUAL'; salesOrderId?: string; salesOrderNo?: string;
      preferredDate: string | null; afterStock?: boolean; note: string | null; followUpOfId?: string; followUpOfNo?: string;
    },
    lines: { itemCode: string; itemName: string; qty: string; uomCode: string }[],
    message: string,
  ): Promise<{ id: string; docNo: string }> {
    await this.ensureSequences(tx, ctx.tenantId);
    const docNo = await this.numbering.next(tx, ctx.tenantId, SVC_DOC_TYPE.JOB, { date: this.clock.today(), branchCode: j.branchCode });
    const job = await tx.svcJob.create({
      data: {
        tenantId: ctx.tenantId, docNo, jobType: j.jobType, stage: 'NOT_BOOKED', branchCode: j.branchCode,
        customerCode: j.customerCode, customerName: j.customerName, contactName: j.contactName, phone: j.phone, siteAddress: j.siteAddress, area: j.area,
        source: j.source, salesOrderId: j.salesOrderId ?? null, salesOrderNo: j.salesOrderNo ?? null,
        preferredDate: j.preferredDate ? day(j.preferredDate) : null, afterStock: j.afterStock ?? false, note: j.note,
        followUpOfId: j.followUpOfId ?? null, followUpOfNo: j.followUpOfNo ?? null,
        createdBy: ctx.user.code, updatedBy: ctx.user.code,
        items: { create: lines.map((l, i) => ({ tenantId: ctx.tenantId, lineNo: i + 1, itemCode: l.itemCode, itemName: l.itemName, qty: dec(l.qty), uomCode: l.uomCode })) },
      },
    });
    await this.log(tx, ctx, job.id, docNo, 'created', message);
    await this.outbox.publish(tx, ctx, [{
      name: SVC_EVENT.JOB_CREATED, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
      payload: {
        jobNo: docNo, jobType: j.jobType, typeLabel: JOB_TYPE_LABEL[j.jobType], branchCode: j.branchCode, customerCode: j.customerCode,
        salesOrderNo: j.salesOrderNo ?? null, preferredDate: j.preferredDate, afterStock: j.afterStock ?? false,
      },
    }]);
    return { id: job.id, docNo };
  }

  /** The module's document numbers are made the first time they are needed, so turning the module on needs no set-up. */
  private async ensureSequences(tx: Tx, tenantId: string) {
    for (const s of SVC_SEQUENCES) {
      await tx.sysNumberSequence.upsert({
        where: { tenantId_docType: { tenantId, docType: s.docType } },
        update: {},
        create: { tenantId, module: 'service', docType: s.docType, name: s.name, prefix: s.prefix, digits: s.digits },
      });
    }
  }

  /** The controller already checked the permission; what is left is whether the job's stage allows the action. */
  private require(stage: JobStage, action: JobAction, message: string) {
    if (!allowedJobActions(stage, { edit: true, book: true, record: true }).includes(action)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', message);
  }

  /** Optimistic lock and stage guard: refuses if someone else changed the job meanwhile. */
  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SvcJobUpdateManyMutationInput, stage: JobStage | JobStage[]) {
    const result = await tx.svcJob.updateMany({ where: { id, tenantId: ctx.tenantId, version, stage: Array.isArray(stage) ? { in: stage } : stage }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string, comment?: string | null) {
    return this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: id, docNo, action, message, comment: comment ?? null });
  }
}
