import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Env } from '../../config/env';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { businessDate } from '../../platform/clock/clock.rules';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { CancelOrdersService } from '../cancel-orders/cancel-orders.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY } from '../shared/sales.constants';
import { lapseDates, lapseNote, lapseStep } from './lapse.rules';

const INTERVAL_NAME = 'sales-order-lapse';
const SYSTEM = { code: 'SYSTEM', name: 'System' } as const;
const dayText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * The automatic cancel (phase 5, lapse.rules.ts): every hour on a server that delivers events (OUTBOX_DISPATCH on, so
 * never in the tests), and on demand from Sales Flow (*Check now*). Safe to run any number of times: an order is warned
 * once and cancelled once.
 */
@Injectable()
export class OrderLapseService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OrderLapseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cancels: CancelOrdersService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('OUTBOX_DISPATCH', { infer: true })) return;
    this.scheduler.addInterval(INTERVAL_NAME, setInterval(() => void this.runForAll(), 60 * 60 * 1000));
  }

  onApplicationShutdown(): void {
    if (this.scheduler.getIntervals().includes(INTERVAL_NAME)) this.scheduler.deleteInterval(INTERVAL_NAME);
  }

  /** One company: warns the orders due in 7 days, cancels those due today. As the system, whoever asked. */
  async run(tenantId: string): Promise<{ warned: string[]; cancelled: { soNo: string; cancelNo: string }[] }> {
    return asSystem(async () => {
      const done = { warned: [] as string[], cancelled: [] as { soNo: string; cancelNo: string }[] };
      const s = await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { autoCancel: true, autoCancelDays: true, useReceipts: true } });
      if (!s?.autoCancel || !s.useReceipts) return done;
      const today = this.clock.today();
      const orders = await this.prisma.salSalesOrder.findMany({
        where: { tenantId, status: 'RELEASED', isPreOrder: false, isMigrated: false, lapsedAt: null, releasedAt: { not: null } },
        select: { id: true, docNo: true, branchCode: true, customerName: true, agentCode: true, releasedAt: true, lapseWarnedAt: true },
      });
      if (!orders.length) return done;
      const ids = orders.map((o) => o.id);
      const [receipts, deliveries, cancels] = await Promise.all([
        this.prisma.salReceipt.findMany({ where: { tenantId, salesOrderId: { in: ids }, status: { not: 'CANCELLED' } }, select: { salesOrderId: true } }),
        this.prisma.salDelivery.findMany({ where: { tenantId, salesOrderId: { in: ids } }, select: { salesOrderId: true } }),
        this.prisma.salCancelOrder.findMany({ where: { tenantId, salesOrderId: { in: ids } }, select: { salesOrderId: true } }),
      ]);
      const busy = new Set([...receipts, ...deliveries, ...cancels].map((r) => r.salesOrderId));
      const ctx = await this.systemCtx(tenantId);

      for (const o of orders.filter((x) => !busy.has(x.id))) {
        const releasedOn = businessDate(o.releasedAt!);
        const step = lapseStep({ releasedOn, warned: Boolean(o.lapseWarnedAt) }, s.autoCancelDays, today);
        if (!step) continue;
        const to = [o.agentCode, ...(await this.notifications.whoCan(tenantId, P.CANCEL_ORDER_RELEASE, o.branchCode))];
        const link = `/sales/orders/${o.id}`;
        if (step === 'WARN') {
          const on = dayText(lapseDates(releasedOn, s.autoCancelDays).cancelOn);
          await this.prisma.$transaction(async (tx) => {
            await tx.salSalesOrder.update({ where: { id: o.id }, data: { lapseWarnedAt: this.clock.now() } });
            await this.activity.log(tx, ctx, { entityType: SAL_ENTITY.ORDER, entityId: o.id, docNo: o.docNo, action: 'lapse_warning', message: `To be cancelled on ${on}: no official receipt and no delivery order yet`, comment: null });
            await this.notifications.send(tx, ctx, {
              to, kind: 'sales.order.lapsing', link, entityType: SAL_ENTITY.ORDER, entityId: o.id,
              title: `${o.docNo} will be cancelled on ${on}`,
              body: `${o.customerName}: no official receipt and no delivery order yet. Record a payment or make the delivery order to keep it.`,
            });
          });
          done.warned.push(o.docNo);
          continue;
        }
        const note = lapseNote(s.autoCancelDays);
        const cancelNo = await this.cancels.cancelBalanceForSystem(ctx, o.id, note);
        await this.prisma.$transaction(async (tx) => {
          await tx.salSalesOrder.update({ where: { id: o.id }, data: { lapsedAt: this.clock.now() } });
          await this.notifications.send(tx, ctx, {
            to, kind: 'sales.order.lapsed', link, entityType: SAL_ENTITY.ORDER, entityId: o.id,
            title: `${o.docNo} cancelled automatically`,
            body: `${o.customerName}: ${note.replace(' (cancelled automatically)', '')}. Cancel order ${cancelNo}.`,
          });
        });
        done.cancelled.push({ soNo: o.docNo, cancelNo });
      }
      return done;
    });
  }

  private async runForAll(): Promise<void> {
    try {
      const tenants = await asSystem(() => this.prisma.salSetting.findMany({ where: { autoCancel: true }, select: { tenantId: true } }));
      for (const { tenantId } of tenants) {
        const r = await this.run(tenantId);
        if (r.warned.length || r.cancelled.length) this.logger.log(`Orders warned: ${r.warned.join(', ') || 'none'}; cancelled: ${r.cancelled.map((c) => c.soNo).join(', ') || 'none'}`);
      }
    } catch (error) {
      this.logger.error(`Automatic order cancel failed: ${(error as Error).message}`);
    }
  }

  private async systemCtx(tenantId: string): Promise<RequestContext> {
    const branches = await this.masterData.listBranches(tenantId);
    return {
      tenantId, branchCode: branches[0]?.code ?? '', correlationId: `sales-order-lapse-${Date.now()}`,
      user: { id: SYSTEM.code, tenantId, code: SYSTEM.code, name: SYSTEM.name, email: '', roles: [], branchCodes: branches.map((b) => b.code), department: null, jobTitle: null },
    };
  }
}
