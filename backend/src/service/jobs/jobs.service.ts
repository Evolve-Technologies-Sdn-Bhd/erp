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
import type { CancelJobDto, CreateJobDto, UpdateJobDto } from './dto/job.dto';
import { allowedJobActions, JOB_TYPE_LABEL, manualJobErrors, type JobStage, type JobType, type ReleasedOrder } from './jobs.rules';
import { JobsQuery } from './jobs.query';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
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
    this.require(job.stage as JobStage, 'edit', `${job.docNo} is ${job.stage === 'CANCELLED' ? 'cancelled' : 'booked'} and can no longer be changed here.`);
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
      await this.bump(tx, ctx, job.id, dto.version, data, 'NOT_BOOKED');
      await this.log(tx, ctx, job.id, job.docNo, 'saved', `Saved by ${ctx.user.name}`);
    });
    return this.query.detail(ctx, id);
  }

  async cancel(ctx: RequestContext, id: string, dto: CancelJobDto) {
    const job = await this.query.load(ctx.tenantId, id);
    this.require(job.stage as JobStage, 'cancel', job.stage === 'CANCELLED' ? `${job.docNo} is cancelled already.` : `${job.docNo} is booked. Cancelling a booked job comes with the planning board.`);
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, dto.version, { stage: 'CANCELLED', cancelReason: reason, cancelledAt: this.clock.now() }, 'NOT_BOOKED');
      await this.log(tx, ctx, job.id, job.docNo, 'cancelled', `Cancelled by ${ctx.user.name}`, reason);
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.JOB_CANCELLED, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
        payload: { jobNo: job.docNo, jobType: job.jobType, customerCode: job.customerCode, salesOrderNo: job.salesOrderNo, reason },
      }]);
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
      preferredDate: string | null; afterStock?: boolean; note: string | null;
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
  private require(stage: JobStage, action: 'edit' | 'cancel', message: string) {
    if (!allowedJobActions(stage, true).includes(action)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', message);
  }

  /** Optimistic lock and stage guard: refuses if someone else changed the job meanwhile. */
  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SvcJobUpdateManyMutationInput, stage: JobStage) {
    const result = await tx.svcJob.updateMany({ where: { id, tenantId: ctx.tenantId, version, stage }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string, comment?: string | null) {
    return this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: id, docNo, action, message, comment: comment ?? null });
  }
}
