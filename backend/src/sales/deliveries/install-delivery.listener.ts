import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY } from '../shared/sales.constants';
import { DeliveriesService } from './deliveries.service';
import { openToDeliver } from './delivery.rules';

/** The Service event: a booked installation is within 24 hours and its stock is confirmed, or its goods are picked and signed (EVENTS.md). */
export const DELIVERY_DUE = 'service.job.delivery_due';
/** The Service event: the picked goods of a postponed job are all back at the store. */
export const GOODS_BACK = 'service.job.goods_back';
const HANDLER = 'sales.install-delivery';
const BACK_HANDLER = 'sales.install-goods-back';
const SYSTEM = { code: 'SYSTEM', name: 'System' } as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface DueEvent {
  jobNo?: unknown;
  salesOrderId?: unknown;
  date?: unknown;
  personName?: unknown;
  bookingText?: unknown;
  picked?: unknown;
  receivedBy?: unknown;
}

/**
 * The delivery order of a booked installation (phase 5). Service says when its goods are picked and signed, or 24 hours
 * before once its stock is confirmed; with "Make the delivery order for the installation" on, Sales drafts the delivery order for
 * what the order still has to deliver. From then on the order can no longer be revised (revision.rules.ts). Safe to be
 * asked again: an order that has a draft delivery order keeps it. The same delivery order follows the job when it is
 * moved, postponed or booked again. An order being revised gets none: the store and the salesperson are told once.
 */
@Injectable()
export class InstallDeliveryListener implements OnModuleInit {
  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly deliveries: DeliveriesService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  onModuleInit(): void {
    this.consumers.listen(DELIVERY_DUE, HANDLER, (e, tx) => this.onDue(e, tx));
    this.consumers.listen(GOODS_BACK, BACK_HANDLER, (e, tx) => this.onGoodsBack(e, tx));
  }

  async onDue(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as DueEvent;
    if (typeof p?.salesOrderId !== 'string') return;
    if (!(await this.on(event, tx))) return;
    const order = await tx.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, include: { lines: { orderBy: { lineNo: 'asc' } } } });
    if (!order || order.isMigrated) return;
    const ctx = this.ctx(event, order.branchCode);
    const existing = await tx.salDelivery.findFirst({ where: { tenantId: event.tenantId, salesOrderId: order.id, status: 'DRAFT', isMigrated: false }, orderBy: { docNo: 'asc' } });
    if (existing) {
      await this.deliveries.publishDrafted(tx, ctx, order, existing);
      return;
    }
    if (order.revisingSince) {
      await this.blocked(tx, ctx, order, p, `${order.docNo} is being revised, so its delivery order was not made`);
      return;
    }
    if (!['RELEASED', 'PARTIAL'].includes(order.status) || !order.lines.some((l) => openToDeliver(l).gt(0))) return;
    const how = p.picked === true ? 'when the warehouse picked and signed' : '24 hours before the installation';
    const made = await this.deliveries.draft(
      tx, ctx, order, this.dateOf(p), `Made by the system ${how} (${String(p.jobNo ?? '')}: ${String(p.bookingText ?? '')})`,
      { driver: typeof p.personName === 'string' ? p.personName.slice(0, 60) : null },
    );
    await this.activity.log(tx, ctx, {
      entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action: 'auto_delivery',
      message: `${made.docNo} made ${how}; the order can no longer be revised`, comment: null,
    });
    await this.notifications.send(tx, ctx, {
      to: await this.notifications.whoCan(event.tenantId, P.DELIVERY_EDIT, order.branchCode), kind: 'sales.delivery.auto', link: `/sales/deliveries/${made.id}`,
      title: `${made.docNo} made for ${String(p.bookingText ?? 'the installation')}`, body: `${order.customerName} (${order.docNo}): prepare the goods for the installer.`,
      entityType: SAL_ENTITY.DELIVERY, entityId: made.id,
    });
  }

  /** A postponed job's goods were all received at the store: its collected delivery order is checked back in. */
  async onGoodsBack(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as DueEvent;
    if (typeof p?.salesOrderId !== 'string') return;
    const d = await this.draftOf(event, tx, p.salesOrderId);
    if (!d?.collectedAt || d.refusedAt) return;
    await tx.salDelivery.update({ where: { id: d.id }, data: { collectedAt: null, collectedByName: null, version: { increment: 1 }, updatedBy: SYSTEM.code } });
    await this.logDelivery(tx, event, d, 'checked_in', `Goods checked back in: received at the store by ${String(p.receivedBy ?? 'the store')} (${String(p.jobNo ?? '')} postponed)`);
  }

  /** The job was booked again or moved: the draft delivery order takes the new day and installer. */
  async moved(event: OutboxEnvelope, tx: Tx, orderId: string): Promise<void> {
    if (!(await this.on(event, tx))) return;
    const p = event.payload as DueEvent;
    const d = await this.draftOf(event, tx, orderId);
    if (!d || typeof p.date !== 'string' || !DAY.test(p.date)) return;
    const driver = typeof p.personName === 'string' ? p.personName.slice(0, 60) : d.driver;
    if (d.docDate.toISOString().slice(0, 10) === p.date && d.driver === driver) return;
    await tx.salDelivery.update({ where: { id: d.id }, data: { docDate: new Date(`${p.date}T00:00:00.000Z`), driver, version: { increment: 1 }, updatedBy: SYSTEM.code } });
    await this.logDelivery(tx, event, d, 'install_moved', `Moved with the installation: ${String(p.bookingText ?? p.date)}`);
  }

  /** The job was taken off the board, postponed or cancelled: the delivery order stays and waits. */
  async waiting(event: OutboxEnvelope, tx: Tx, orderId: string, message: string): Promise<void> {
    if (!(await this.on(event, tx))) return;
    const d = await this.draftOf(event, tx, orderId);
    if (d) await this.logDelivery(tx, event, d, 'install_waiting', `${message}; this delivery order waits for the new date`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async on(event: OutboxEnvelope, tx: Tx): Promise<boolean> {
    return Boolean((await tx.salSetting.findUnique({ where: { tenantId: event.tenantId }, select: { autoDelivery: true } }))?.autoDelivery);
  }

  private draftOf(event: OutboxEnvelope, tx: Tx, orderId: string) {
    return tx.salDelivery.findFirst({ where: { tenantId: event.tenantId, salesOrderId: orderId, status: 'DRAFT', isMigrated: false }, orderBy: { docNo: 'asc' } });
  }

  private dateOf(p: DueEvent): string {
    return typeof p.date === 'string' && DAY.test(p.date) ? p.date : this.clock.today();
  }

  /** Once per order: the note is cleared when the delivery order is made. */
  private async blocked(tx: Tx, ctx: RequestContext, order: { id: string; docNo: string; branchCode: string; agentCode: string; autoDoNote: string | null; customerName: string }, p: DueEvent, why: string) {
    if (order.autoDoNote === why) return;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { autoDoNote: why } });
    await this.activity.log(tx, ctx, { entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action: 'auto_delivery_blocked', message: `${why} (${String(p.jobNo ?? '')}). Release or discard the revision.`, comment: null });
    const store = await this.notifications.whoCan(ctx.tenantId, P.DELIVERY_EDIT, order.branchCode);
    await this.notifications.send(tx, ctx, {
      to: [...store, order.agentCode], kind: 'sales.delivery.blocked', link: `/sales/orders/${order.id}`, title: `${order.docNo}: no delivery order yet`,
      body: `${order.customerName}: ${why}. ${p.picked === true ? 'The goods are picked and signed' : 'The installation is within 24 hours'}; release or discard the revision.`, entityType: SAL_ENTITY.ORDER, entityId: order.id,
    });
  }

  private logDelivery(tx: Tx, event: OutboxEnvelope, d: { id: string; docNo: string; branchCode: string }, action: string, message: string) {
    return this.activity.log(tx, this.ctx(event, d.branchCode), { entityType: SAL_ENTITY.DELIVERY, entityId: d.id, docNo: d.docNo, action, message, comment: null });
  }

  private ctx(event: OutboxEnvelope, branchCode: string): RequestContext {
    return {
      tenantId: event.tenantId, branchCode, correlationId: event.correlationId,
      user: { id: SYSTEM.code, tenantId: event.tenantId, code: SYSTEM.code, name: SYSTEM.name, email: '', roles: [], branchCodes: [], department: null, jobTitle: null },
    };
  }
}
