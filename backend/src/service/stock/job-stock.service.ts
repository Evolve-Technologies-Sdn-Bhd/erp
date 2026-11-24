import { Inject, Injectable } from '@nestjs/common';
import type { SvcJob, SvcJobItem } from '@prisma/client';
import { STOCK_PORT, type StockPort } from '../../integration/integration.ports';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { BusinessRuleError, NotFoundError, StaleVersionError } from '../../platform/http/errors';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { slotLabel } from '../board/booking.rules';
import { JOB_STAGE_LABEL, JOB_TYPE_LABEL, shortDay, type JobStage, type JobType } from '../jobs/jobs.rules';
import { dueForCheck } from '../jobs/stock-check.rules';
import { businessNow } from '../jobs/timing.rules';
import { SVC_ENTITY, SVC_EVENT } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { deliveryDue, itemStock, shortText, type BookedJob, type ItemStock } from './stock.rules';

type Job = SvcJob & { items: SvcJobItem[] };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

const toBooked = (j: Job): BookedJob => ({
  id: j.id, docNo: j.docNo, jobDate: iso(j.jobDate!), slotStart: j.slotStart!, warehouseCode: j.warehouseCode,
  items: j.items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, qty: i.qty.toString(), uomCode: i.uomCode })),
});

/**
 * V09 · Stock for Jobs (phase 5): the stock of a day's booked jobs, and the warehouse's confirmation of each. A
 * confirmed job within 24 hours asks Sales for its delivery order (service.job.delivery_due). Stock is held by the
 * booking, the earlier slot first; it is counted, never blocked.
 */
@Injectable()
export class JobStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
    @Inject(STOCK_PORT) private readonly stock: StockPort,
  ) {}

  async confirms(tenantId: string): Promise<boolean> {
    return Boolean((await this.prisma.svcSetting.findUnique({ where: { tenantId }, select: { warehouseConfirms: true } }))?.warehouseConfirms);
  }

  /** The stock of each of these booked jobs, counted against every branch's earlier jobs from the same warehouse. */
  async stockOf(tenantId: string, jobs: Job[]): Promise<Map<string, ItemStock[]>> {
    const out = new Map<string, ItemStock[]>();
    const booked = jobs.filter((j) => j.jobDate && j.slotStart !== null);
    if (!booked.length) return out;
    const codes = [...new Set(booked.flatMap((j) => j.items.map((i) => i.itemCode)))];
    if (!codes.length) return out;
    const last = booked.reduce((d, j) => (j.jobDate! > d ? j.jobDate! : d), booked[0]!.jobDate!);
    const [items, stock, others] = await Promise.all([
      this.masterData.findItems(tenantId, codes),
      this.stock.listStock(tenantId, codes),
      asSystem(() => this.prisma.svcJob.findMany({
        where: { tenantId, stage: 'BOOKED', jobDate: { gte: day(this.clock.today()), lte: last }, items: { some: { itemCode: { in: codes } } } }, include: { items: true },
      })),
    ]);
    const before = others.filter((j) => j.jobDate && j.slotStart !== null).map(toBooked);
    const onHand = (code: string, wh: string | null) =>
      String(stock.filter((s) => s.itemCode === code && (!wh || s.warehouseCode === wh)).reduce((sum, s) => sum + Number(s.onHand), 0));
    for (const j of booked) out.set(j.id, itemStock(toBooked(j), before, onHand, (c) => items.find((i) => i.code === c)?.type === 'STOCK'));
    return out;
  }

  /** V09: a day's booked jobs that need stock, tomorrow unless another day is picked. */
  async list(ctx: RequestContext, date?: string) {
    const today = this.clock.today();
    const on = date ?? iso(new Date(day(today).getTime() + 86_400_000));
    const jobs = await this.prisma.svcJob.findMany({
      where: { tenantId: ctx.tenantId, stage: 'BOOKED', jobDate: day(on), items: { some: {} } }, include: { items: { orderBy: { lineNo: 'asc' } } }, orderBy: [{ slotStart: 'asc' }, { docNo: 'asc' }],
    });
    const [confirms, stock] = await Promise.all([this.confirms(ctx.tenantId), this.stockOf(ctx.tenantId, jobs)]);
    const canConfirm = confirms && this.permissions.has(ctx.user.roles, P.STOCK_CONFIRM);
    const rows = jobs
      .map((j) => ({ j, items: stock.get(j.id) ?? [] }))
      .filter((x) => x.items.length)
      .map(({ j, items }) => ({
        id: j.id, docNo: j.docNo, typeLabel: JOB_TYPE_LABEL[j.jobType as JobType], branchCode: j.branchCode, customerName: j.customerName, salesOrderNo: j.salesOrderNo,
        personName: j.personName, slotText: slotLabel(j.slotStart!, j.slotEnd!), warehouseCode: j.warehouseCode,
        items, shortText: shortText(items), atRisk: Boolean(j.atRiskSince), atRiskNote: j.atRiskNote,
        confirmedAt: j.stockConfirmedAt?.toISOString() ?? null, confirmedBy: j.stockConfirmedBy,
        deliveryId: j.deliveryId, deliveryNo: j.deliveryNo, version: j.version,
        canConfirm: canConfirm && !j.stockConfirmedAt, canUndo: canConfirm && Boolean(j.stockConfirmedAt) && !j.deliveryNo,
      }));
    return {
      date: on, dateText: shortDay(on), today, on: confirms, stockConnected: this.stock.connected,
      counts: { jobs: rows.length, confirmed: rows.filter((r) => r.confirmedAt).length, short: rows.filter((r) => r.shortText).length },
      jobs: rows,
    };
  }

  async confirm(ctx: RequestContext, id: string, version: number) {
    const job = await this.load(ctx, id);
    if (!(await this.confirms(ctx.tenantId))) throw new BusinessRuleError('STOCK_CONFIRM_OFF', 'The warehouse does not confirm stock in this company. Turn it on in Service › Slots and Stages.');
    if (job.stage !== 'BOOKED') throw new BusinessRuleError('ACTION_NOT_ALLOWED', `${job.docNo} is ${JOB_STAGE_LABEL[job.stage as JobStage].toLowerCase()}: only a booked job's stock is confirmed.`);
    if (job.stockConfirmedAt) throw new BusinessRuleError('ACTION_NOT_ALLOWED', `${job.docNo}'s stock was already confirmed by ${job.stockConfirmedBy}.`);
    const short = shortText((await this.stockOf(ctx.tenantId, [job])).get(job.id) ?? []);
    await this.prisma.$transaction(async (tx) => {
      const cleared = job.atRiskSince ? { atRiskSince: null, atRiskNote: null } : {};
      await this.bump(tx, ctx, job.id, version, { stockConfirmedAt: this.clock.now(), stockConfirmedBy: ctx.user.name, ...cleared });
      await this.activity.log(tx, ctx, {
        entityType: SVC_ENTITY.JOB, entityId: job.id, docNo: job.docNo, action: 'stock_confirmed',
        message: `Stock confirmed by ${ctx.user.name}${short ? `, although the figures say ${short}` : ''}${job.atRiskSince ? '; no longer at risk' : ''}`, comment: null,
      });
      const now = businessNow(this.clock.now(), this.clock.today());
      if (dueForCheck({ jobDate: iso(job.jobDate!), slotStart: job.slotStart! }, now)) await this.askForDelivery(tx, ctx, { ...job, stockConfirmedAt: this.clock.now() });
    });
    return this.list(ctx, iso(job.jobDate!));
  }

  async undo(ctx: RequestContext, id: string, version: number) {
    const job = await this.load(ctx, id);
    if (!job.stockConfirmedAt || job.stage !== 'BOOKED') throw new BusinessRuleError('ACTION_NOT_ALLOWED', `${job.docNo}'s stock is not confirmed.`);
    if (job.deliveryNo) throw new BusinessRuleError('DELIVERY_MADE', `${job.deliveryNo} was already made for ${job.docNo}. Change it on the delivery order.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, job.id, version, { stockConfirmedAt: null, stockConfirmedBy: null });
      await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: job.id, docNo: job.docNo, action: 'stock_unconfirmed', message: `Stock confirmation taken back by ${ctx.user.name}`, comment: null });
    });
    return this.list(ctx, iso(job.jobDate!));
  }

  /** Tells Sales the job is due for its delivery order, if it has none. Asked again each hour until Sales answers. */
  async askForDelivery(tx: Tx, ctx: RequestContext, job: SvcJob): Promise<boolean> {
    if (!deliveryDue({ confirms: true, confirmed: Boolean(job.stockConfirmedAt), salesOrderId: job.salesOrderId, deliveryNo: job.deliveryNo })) return false;
    await this.outbox.publish(tx, ctx, [{
      name: SVC_EVENT.JOB_DELIVERY_DUE, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
      payload: {
        jobNo: job.docNo, salesOrderId: job.salesOrderId, salesOrderNo: job.salesOrderNo, date: iso(job.jobDate!), start: job.slotStart, end: job.slotEnd,
        personName: job.personName, bookingText: `${shortDay(iso(job.jobDate!))} · ${slotLabel(job.slotStart!, job.slotEnd!)} · ${job.personName}`,
      },
    }]);
    return true;
  }

  private async load(ctx: RequestContext, id: string): Promise<Job> {
    const job = await this.prisma.svcJob.findFirst({ where: { tenantId: ctx.tenantId, id }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    if (!job) throw new NotFoundError('Job');
    return job;
  }

  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: { stockConfirmedAt: Date | null; stockConfirmedBy: string | null; atRiskSince?: null; atRiskNote?: null }) {
    const r = await tx.svcJob.updateMany({ where: { id, tenantId: ctx.tenantId, version, stage: 'BOOKED' }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (r.count === 0) throw new StaleVersionError();
  }
}
