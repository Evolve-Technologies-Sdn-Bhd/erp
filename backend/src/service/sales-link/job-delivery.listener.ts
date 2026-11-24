import { Injectable } from '@nestjs/common';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { SVC_ENTITY, SYSTEM_USER } from '../service.constants';

/** Sales events about a delivery order of an order with installation (EVENTS.md → Service listens to). */
export const SALES_DELIVERY_DRAFTED = 'sales.delivery.drafted';
export const SALES_DELIVERY_REMOVED = 'sales.delivery.removed';
export const SALES_DELIVERY_DELIVERED = 'sales.delivery.delivered';
export const SALES_BALANCE_CANCELLED = 'sales.order.balance_cancelled';

/** What the event says, or null when it cannot be read. */
export function readDelivery(payload: unknown): { doId: string; doNo: string; salesOrderId: string } | null {
  const p = payload as { doId?: unknown; doNo?: unknown; salesOrderId?: unknown } | null;
  if (!p || typeof p.doId !== 'string' || typeof p.doNo !== 'string' || typeof p.salesOrderId !== 'string') return null;
  return { doId: p.doId, doNo: p.doNo, salesOrderId: p.salesOrderId };
}

/** The job keeps its order's delivery order (phase 5), so the office sees it and Service stops asking for one. */
@Injectable()
export class JobDeliveryListener {
  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly activity: ActivityService,
    private readonly jobs: JobsService,
  ) {}

  /** Called by ServiceModule only when the module is turned on. */
  register(): void {
    this.consumers.listen(SALES_DELIVERY_DRAFTED, 'service.job-delivery', (e, tx) => this.on(e, tx, true));
    this.consumers.listen(SALES_DELIVERY_REMOVED, 'service.job-delivery-removed', (e, tx) => this.on(e, tx, false));
    this.consumers.listen(SALES_DELIVERY_DELIVERED, 'service.job-delivered', (e, tx) => this.onDelivered(e, tx));
    this.consumers.listen(SALES_BALANCE_CANCELLED, 'service.job-order-closed', (e, tx) => this.onCancelled(e, tx));
  }

  /** Signed by the customer, accepted unsigned by Management, or confirmed by the store. */
  async onDelivered(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const d = readDelivery(event.payload);
    if (!d) return;
    const job = await tx.svcJob.findFirst({ where: { tenantId: event.tenantId, salesOrderId: d.salesOrderId }, select: { id: true, docNo: true, branchCode: true, deliveredAt: true } });
    if (!job || job.deliveredAt) return;
    const p = event.payload as { how?: unknown; signerName?: unknown };
    await tx.svcJob.update({ where: { id: job.id }, data: { deliveredAt: event.occurredAt, deliveryId: d.doId, deliveryNo: d.doNo } });
    const how = p.how === 'SIGNED' ? `signed by ${String(p.signerName ?? 'the customer')}` : p.how === 'UNSIGNED' ? 'accepted without a signature by Management' : 'delivered';
    await this.activity.log(tx, this.ctx(event, job.branchCode), { entityType: SVC_ENTITY.JOB, entityId: job.id, docNo: job.docNo, action: 'delivered', message: `Delivery order ${d.doNo} ${how}`, comment: null });
  }

  /** The order's whole balance was cancelled: its job, not done yet, is cancelled too. */
  async onCancelled(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as { salesOrderId?: unknown; orderClosed?: unknown; cancelNo?: unknown; branchCode?: unknown };
    if (typeof p?.salesOrderId !== 'string' || p.orderClosed !== true) return;
    await this.jobs.cancelForOrder(tx, this.ctx(event, String(p.branchCode ?? '')), p.salesOrderId, `the order was cancelled (${String(p.cancelNo ?? '')})`);
  }

  private ctx(event: OutboxEnvelope, branchCode: string): RequestContext {
    return {
      tenantId: event.tenantId, branchCode, correlationId: event.correlationId,
      user: { id: SYSTEM_USER.code, tenantId: event.tenantId, code: SYSTEM_USER.code, name: SYSTEM_USER.name, email: '', roles: [], branchCodes: [branchCode], department: null, jobTitle: null },
    };
  }

  async on(event: OutboxEnvelope, tx: Tx, made: boolean): Promise<void> {
    const d = readDelivery(event.payload);
    if (!d) return;
    const job = await tx.svcJob.findFirst({ where: { tenantId: event.tenantId, salesOrderId: d.salesOrderId }, select: { id: true, docNo: true, branchCode: true, deliveryId: true } });
    if (!job || job.deliveryId === (made ? d.doId : null) || (!made && job.deliveryId !== d.doId)) return;
    await tx.svcJob.update({ where: { id: job.id }, data: made ? { deliveryId: d.doId, deliveryNo: d.doNo } : { deliveryId: null, deliveryNo: null } });
    await this.activity.log(tx, this.ctx(event, job.branchCode), {
      entityType: SVC_ENTITY.JOB, entityId: job.id, docNo: job.docNo, action: made ? 'delivery_made' : 'delivery_removed',
      message: made ? `Delivery order ${d.doNo} made for this job` : `Delivery order ${d.doNo} was deleted`, comment: null,
    });
  }
}
