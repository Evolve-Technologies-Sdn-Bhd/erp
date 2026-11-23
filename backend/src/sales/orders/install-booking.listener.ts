import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { SAL_ENTITY } from '../shared/sales.constants';

/** Service events Sales listens to (EVENTS.md). Names are Service's; Sales never imports Service code. */
export const SERVICE_EVENT = {
  JOB_BOOKED: 'service.job.booked',
  JOB_UNBOOKED: 'service.job.unbooked',
  JOB_CANCELLED: 'service.job.cancelled',
} as const;

export const INSTALL_LISTENER = {
  BOOKED: 'sales.install-booked',
  UNBOOKED: 'sales.install-unbooked',
  CANCELLED: 'sales.install-cancelled',
} as const;

const SYSTEM = { code: 'SYSTEM', name: 'System' } as const;

interface JobEvent {
  jobNo?: unknown;
  salesOrderId?: unknown;
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
  ) {}

  onModuleInit(): void {
    this.consumers.listen(SERVICE_EVENT.JOB_BOOKED, INSTALL_LISTENER.BOOKED, (e, tx) => this.onBooked(e, tx));
    this.consumers.listen(SERVICE_EVENT.JOB_UNBOOKED, INSTALL_LISTENER.UNBOOKED, (e, tx) => this.onOff(e, tx, 'unbooked'));
    this.consumers.listen(SERVICE_EVENT.JOB_CANCELLED, INSTALL_LISTENER.CANCELLED, (e, tx) => this.onOff(e, tx, 'cancelled'));
  }

  async onBooked(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as JobEvent;
    if (typeof p?.salesOrderId !== 'string' || typeof p.bookingText !== 'string') return;
    const order = await tx.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, select: { id: true, docNo: true } });
    if (!order) return;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { installBooking: p.bookingText.slice(0, 150), installBookedAt: event.occurredAt } });
    await this.log(tx, event, order, 'install_booked', `Installer ${p.moved === true ? 'moved' : 'booked'} by the office (${String(p.jobNo)}): ${p.bookingText}`);
  }

  async onOff(event: OutboxEnvelope, tx: Tx, kind: 'unbooked' | 'cancelled'): Promise<void> {
    const p = event.payload as JobEvent;
    if (typeof p?.salesOrderId !== 'string') return;
    const order = await tx.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, select: { id: true, docNo: true, installBooking: true } });
    if (!order) return;
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { installBooking: null, installBookedAt: null } });
    const reason = typeof p.reason === 'string' && p.reason ? p.reason : null;
    const message = kind === 'cancelled' ? `Installation job ${String(p.jobNo)} cancelled` : `Installer booking undone (${String(p.jobNo)})`;
    await this.log(tx, event, order, `install_${kind}`, reason ? `${message}: ${reason}` : message);
  }

  private log(tx: Tx, event: OutboxEnvelope, order: { id: string; docNo: string }, action: string, message: string) {
    const ctx: RequestContext = {
      tenantId: event.tenantId,
      branchCode: '',
      correlationId: event.correlationId,
      user: { id: SYSTEM.code, tenantId: event.tenantId, code: SYSTEM.code, name: SYSTEM.name, email: '', roles: [], branchCodes: [], department: null, jobTitle: null },
    };
    return this.activity.log(tx, ctx, { entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action, message });
  }
}
