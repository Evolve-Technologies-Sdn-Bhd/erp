import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Env } from '../../config/env';
import { STOCK_PORT, type StockPort } from '../../integration/integration.ports';
import { JobStockService } from '../stock/job-stock.service';
import { notReady, shortText } from '../stock/stock.rules';
import { unfinished } from '../returns/returns.rules';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { slotLabel } from '../board/booking.rules';
import { SVC_ENTITY, SYSTEM_USER } from '../service.constants';
import { shortDay } from './jobs.rules';
import { JobsService } from './jobs.service';
import { dueForCheck, stockShort } from './stock-check.rules';
import { businessNow } from './timing.rules';

const INTERVAL_NAME = 'service-stock-check';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);
const addDays = (v: string, n: number) => iso(new Date(day(v).getTime() + n * 86_400_000));

/**
 * Stock not ready 24 hours before a booked installation (phase 5, stock-check.rules.ts): every hour on a server that
 * delivers events (never in the tests), and on demand (`POST /service/jobs/stock-check`). A job is marked At risk once,
 * with an alert to the office and the salesperson; it clears when the stock is there at a later check.
 */
@Injectable()
export class StockCheckService implements OnApplicationShutdown {
  private readonly logger = new Logger(StockCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly activity: ActivityService,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly jobStock: JobStockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
    @Inject(STOCK_PORT) private readonly stock: StockPort,
  ) {}

  /** Called by ServiceModule when the module is on. */
  schedule(): void {
    if (!this.config.get('OUTBOX_DISPATCH', { infer: true })) return;
    this.scheduler.addInterval(INTERVAL_NAME, setInterval(() => void this.runForAll(), 60 * 60 * 1000));
  }

  onApplicationShutdown(): void {
    if (this.scheduler.getIntervals().includes(INTERVAL_NAME)) this.scheduler.deleteInterval(INTERVAL_NAME);
  }

  async run(tenantId: string): Promise<{ atRisk: string[]; ready: string[]; deliveries?: string[] }> {
    return asSystem(async () => {
      const done = { atRisk: [] as string[], ready: [] as string[] };
      const today = this.clock.today();
      const now = businessNow(this.clock.now(), today);
      await this.tellUnfinished(tenantId, today);
      const booked = await this.prisma.svcJob.findMany({
        where: { tenantId, stage: 'BOOKED', jobType: 'INSTALLATION', salesOrderId: { not: null }, jobDate: { gte: day(today), lte: day(addDays(today, 1)) } },
        include: { items: true },
      });
      const due = booked.filter((j) => j.jobDate && j.slotStart !== null && (j.atRiskSince || dueForCheck({ jobDate: iso(j.jobDate), slotStart: j.slotStart }, now)));
      if (!due.length) return done;
      const codes = [...new Set(due.flatMap((j) => j.items.map((i) => i.itemCode)))];
      const [items, stock] = await Promise.all([this.masterData.findItems(tenantId, codes), this.stock.listStock(tenantId, codes)]);
      const ctx = await this.systemCtx(tenantId);
      // Where the warehouse confirms stock (phase 5), earlier jobs hold theirs first, a job it has not confirmed is at risk,
      // and a confirmed one asks Sales for its delivery order.
      const confirms = await this.jobStock.confirms(tenantId);
      const held = confirms ? await this.jobStock.stockOf(tenantId, due) : null;
      const asked: string[] = [];

      for (const j of due) {
        const onHand = (code: string) => stock.filter((s) => s.itemCode === code && (!j.warehouseCode || s.warehouseCode === j.warehouseCode)).reduce((sum, s) => sum + Number(s.onHand), 0);
        const short = held
          ? notReady({ confirms, confirmed: Boolean(j.stockConfirmedAt), short: shortText(held.get(j.id) ?? []) })
          : stockShort(j.items.map((i) => ({ itemCode: i.itemCode, qty: i.qty.toString(), onHand: String(onHand(i.itemCode)), isStock: items.find((x) => x.code === i.itemCode)?.type === 'STOCK' })));
        if (confirms && (await this.prisma.$transaction((tx) => this.jobStock.askForDelivery(tx, ctx, j)))) asked.push(j.docNo);
        const when = `${shortDay(iso(j.jobDate!))} · ${slotLabel(j.slotStart!, j.slotEnd!)}`;
        if (short && !j.atRiskSince) {
          await this.prisma.$transaction(async (tx) => {
            await tx.svcJob.update({ where: { id: j.id }, data: { atRiskSince: this.clock.now(), atRiskNote: short.slice(0, 300) } });
            await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: j.id, docNo: j.docNo, action: 'at_risk', message: `At risk: stock not ready 24 hours before the installation (${short})`, comment: null });
            await this.jobs.alert(tx, ctx, j, 'service.job.at_risk', `${j.docNo} at risk: stock not ready`,
              `${j.customerName}${j.salesOrderNo ? ` (${j.salesOrderNo})` : ''}, ${when} with ${j.personName}: ${short}.`);
          });
          done.atRisk.push(j.docNo);
        } else if (!short && j.atRiskSince) {
          await this.prisma.$transaction(async (tx) => {
            await tx.svcJob.update({ where: { id: j.id }, data: { atRiskSince: null, atRiskNote: null } });
            await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: j.id, docNo: j.docNo, action: 'stock_ready', message: 'Stock ready now: no longer at risk', comment: null });
          });
          done.ready.push(j.docNo);
        }
      }
      return confirms ? { ...done, deliveries: asked } : done;
    });
  }

  /** Jobs of a past day whose visit is not recorded or whose delivery order is not signed (phase 5): the office is told once. */
  private async tellUnfinished(tenantId: string, today: string): Promise<void> {
    const past = await this.prisma.svcJob.findMany({
      where: { tenantId, jobDate: { lt: day(today) }, unfinishedAt: null, OR: [{ stage: 'BOOKED' }, { stage: { in: ['DONE', 'CLOSED'] }, deliveryNo: { not: null }, deliveredAt: null }] },
    });
    if (!past.length) return;
    const ctx = await this.systemCtx(tenantId);
    for (const j of past) {
      const why = unfinished({ stage: j.stage, jobDate: iso(j.jobDate!), deliveryNo: j.deliveryNo, delivered: Boolean(j.deliveredAt) }, today);
      if (!why) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.svcJob.update({ where: { id: j.id }, data: { unfinishedAt: this.clock.now() } });
        await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: j.id, docNo: j.docNo, action: 'unfinished', message: `Unfinished: ${why} (${shortDay(iso(j.jobDate!))}, ${j.personName})`, comment: null });
        await this.jobs.alert(tx, ctx, { ...j, agentCode: null }, 'service.job.unfinished', `${j.personName} has an unfinished job: ${j.docNo}`, `${j.customerName}, ${shortDay(iso(j.jobDate!))}: ${why}. Finish it before giving ${j.personName} more jobs.`);
      });
    }
  }

  private async runForAll(): Promise<void> {
    try {
      const tenants = await asSystem(() => this.prisma.svcJob.findMany({ where: { stage: 'BOOKED', jobType: 'INSTALLATION' }, distinct: ['tenantId'], select: { tenantId: true } }));
      for (const { tenantId } of tenants) {
        const r = await this.run(tenantId);
        if (r.atRisk.length) this.logger.log(`At risk, stock not ready: ${r.atRisk.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(`Stock check failed: ${(error as Error).message}`);
    }
  }

  private async systemCtx(tenantId: string): Promise<RequestContext> {
    const branches = await this.masterData.listBranches(tenantId);
    return {
      tenantId, branchCode: branches[0]?.code ?? '', correlationId: `service-stock-check-${Date.now()}`,
      user: { id: SYSTEM_USER.code, tenantId, code: SYSTEM_USER.code, name: SYSTEM_USER.name, email: '', roles: [], branchCodes: branches.map((b) => b.code), department: null, jobTitle: null },
    };
  }
}
