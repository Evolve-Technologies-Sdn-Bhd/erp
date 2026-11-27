import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { SAL_ENTITY } from '../shared/sales.constants';
import { InstallDeliveryListener } from '../deliveries/install-delivery.listener';

/** Service events Sales listens to (EVENTS.md). Names are Service's; Sales never imports Service code. */
export const SERVICE_EVENT = {
  JOB_BOOKED: 'service.job.booked',
  JOB_UNBOOKED: 'service.job.unbooked',
  JOB_CANCELLED: 'service.job.cancelled',
  /** A visit recorded complete or partly done (Sales keeps when an installation was completed). */
  JOB_DONE: 'service.job.done',
} as const;

export const INSTALL_LISTENER = {
  BOOKED: 'sales.install-booked',
  UNBOOKED: 'sales.install-unbooked',
  CANCELLED: 'sales.install-cancelled',
  DONE: 'sales.install-done',
} as const;

const SYSTEM = { code: 'SYSTEM', name: 'System' } as const;

interface JobEvent {
  jobNo?: unknown;
  jobType?: unknown;
  result?: unknown;
  date?: unknown;
  salesOrderId?: unknown;
  salesOrderNo?: unknown;
  bookingText?: unknown;
  moved?: unknown;
  reason?: unknown;
}

/**
 * The installer's booking on the sales order (phase 5): Service says when the order's job is booked, moved, taken off
 * the board, postponed or cancelled, and Sales keeps the booking on the order (installBooking) with a line in its
 * activity. A revision after booking needs the Sales Manager. These are Service's facts, so the order's version is
 * not bumped.
 */
@Injectable()
export class SalesInstallBookingListener implements OnModuleInit {
  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly activity: ActivityService,
    private readonly deliveries: InstallDeliveryListener,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.consumers.listen(SERVICE_EVENT.JOB_BOOKED, INSTALL_LISTENER.BOOKED, (e, tx) => this.onBooked(e, tx));
    this.consumers.listen(SERVICE_EVENT.JOB_UNBOOKED, INSTALL_LISTENER.UNBOOKED, (e, tx) => this.onOff(e, tx, 'unbooked'));
    this.consumers.listen(SERVICE_EVENT.JOB_CANCELLED, INSTALL_LISTENER.CANCELLED, (e, tx) => this.onOff(e, tx, 'cancelled'));
    this.consumers.listen(SERVICE_EVENT.JOB_DONE, INSTALL_LISTENER.DONE, (e, tx) => this.onDone(e, tx));
  }

  async onBooked(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as JobEvent;
    if (typeof p?.salesOrderId !== 'string' || typeof p.bookingText !== 'string') return;
    const order = await tx.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, select: { id: true, docNo: true } });
    if (!order) return;
    const bookedFor = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? new Date(`${p.date}T00:00:00.000Z`) : null;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { installBooking: p.bookingText.slice(0, 150), installBookedAt: event.occurredAt, installBookedFor: bookedFor } });
    await this.log(tx, event, order, 'install_booked', `Installer ${p.moved === true ? 'moved' : 'booked'} by the office (${String(p.jobNo)}): ${p.bookingText}`);
    await this.deliveries.moved(event, tx, order.id);
  }

  async onOff(event: OutboxEnvelope, tx: Tx, kind: 'unbooked' | 'cancelled'): Promise<void> {
    const p = event.payload as JobEvent;
    if (typeof p?.salesOrderId !== 'string') return;
    const order = await tx.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, select: { id: true, docNo: true, installBooking: true } });
    if (!order) return;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { installBooking: null, installBookedAt: null, installBookedFor: null } });
    const reason = typeof p.reason === 'string' && p.reason ? p.reason : null;
    const message = kind === 'cancelled' ? `Installation job ${String(p.jobNo)} cancelled` : `Installer booking undone (${String(p.jobNo)})`;
    await this.log(tx, event, order, `install_${kind}`, reason ? `${message}: ${reason}` : message);
    await this.deliveries.waiting(event, tx, order.id, message);
  }

  /**
   * An installation visit recorded complete: the order is installed (the salesperson's home lists the ones still to be
   * paid). A follow-up job carries the order's number only, so the order is found by it when there is no id.
   */
  async onDone(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as JobEvent;
    if (p?.jobType !== 'INSTALLATION' || p.result !== 'COMPLETE') return;
    const where =
      typeof p.salesOrderId === 'string' ? { tenantId: event.tenantId, id: p.salesOrderId }
      : typeof p.salesOrderNo === 'string' ? { tenantId: event.tenantId, docNo: p.salesOrderNo, revision: 0 }
      : null;
    if (!where) return;
    const order = await tx.salSalesOrder.findFirst({ where, select: { id: true, docNo: true, installDoneAt: true, agentCode: true, customerName: true } });
    if (!order || order.installDoneAt) return;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { installDoneAt: event.occurredAt } });
    await this.log(tx, event, order, 'install_done', `Installation completed (${String(p.jobNo)})`);
    await this.notifications.send(tx, this.ctx(event), {
      to: [order.agentCode], kind: 'sales.install.done', title: `${order.docNo}: installed`,
      body: `${order.customerName}: the installation is complete. Collect what is still owed.`, link: `/sales/orders/${order.id}`, entityType: SAL_ENTITY.ORDER, entityId: order.id,
    });
  }

  private ctx(event: OutboxEnvelope): RequestContext {
    return {
      tenantId: event.tenantId,
      branchCode: '',
      correlationId: event.correlationId,
      user: { id: SYSTEM.code, tenantId: event.tenantId, code: SYSTEM.code, name: SYSTEM.name, email: '', roles: [], branchCodes: [], department: null, jobTitle: null },
    };
  }

  private log(tx: Tx, event: OutboxEnvelope, order: { id: string; docNo: string }, action: string, message: string) {
    return this.activity.log(tx, this.ctx(event), { entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action, message });
  }
}
