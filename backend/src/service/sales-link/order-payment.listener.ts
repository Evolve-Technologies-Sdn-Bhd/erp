import { Injectable } from '@nestjs/common';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec } from '../../platform/http/decimal';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { WarrantyService } from '../warranty/warranty.service';
import { SVC_ENTITY, SYSTEM_USER } from '../service.constants';

/** The Sales event: Account verified an official receipt (EVENTS.md → Service listens to). */
export const SALES_RECEIPT_VERIFIED = 'sales.receipt.verified';
const HANDLER = 'service.job-payment';
const PAYMENTS = ['UNPAID', 'DEPOSIT', 'FULLY_PAID'];
const LABEL: Record<string, string> = { UNPAID: 'Unpaid', DEPOSIT: 'Deposit paid', FULLY_PAID: 'Fully paid' };

/** What the event says about the order, or null when it cannot be read. */
export function readOrderPayment(payload: unknown): { salesOrderId: string; salesOrderNo: string; orNo: string; status: string; verified: string; total: string } | null {
  const p = payload as { salesOrderId?: unknown; salesOrderNo?: unknown; orNo?: unknown; order?: { status?: unknown; verified?: unknown; total?: unknown } } | null;
  const o = p?.order;
  if (!p || typeof p.salesOrderId !== 'string' || !o || typeof o.status !== 'string' || !PAYMENTS.includes(o.status)) return null;
  if (typeof o.verified !== 'string' || typeof o.total !== 'string') return null;
  return { salesOrderId: p.salesOrderId, salesOrderNo: String(p.salesOrderNo ?? ''), orNo: String(p.orNo ?? ''), status: o.status, verified: o.verified, total: o.total };
}

/**
 * Service listens to `sales.receipt.verified` (phase 5): the jobs of that order keep where its payment stands, so the
 * office sees it on the job without Service reading Sales' tables. Fully paid decides installer claims later (F5).
 */
@Injectable()
export class OrderPaymentListener {
  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly activity: ActivityService,
    private readonly warranties: WarrantyService,
  ) {}

  /** Called by ServiceModule only when the module is turned on. */
  register(): void {
    this.consumers.listen(SALES_RECEIPT_VERIFIED, HANDLER, (event, tx) => this.onReceiptVerified(event, tx));
  }

  async onReceiptVerified(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const pay = readOrderPayment(event.payload);
    if (!pay) return;
    const jobs = await tx.svcJob.findMany({ where: { tenantId: event.tenantId, salesOrderId: pay.salesOrderId }, select: { id: true, docNo: true, branchCode: true } });
    if (!jobs.length) return;
    await tx.svcJob.updateMany({
      where: { tenantId: event.tenantId, salesOrderId: pay.salesOrderId },
      data: { orderPayment: pay.status, orderPaid: dec(pay.verified), orderTotal: dec(pay.total) },
    });
    // Fully paid: the order's warranties become active (phase 5).
    const active = pay.status === 'FULLY_PAID' ? await this.warranties.activateForOrder(tx, event.tenantId, pay.salesOrderId, SYSTEM_USER.code) : 0;
    for (const j of jobs) {
      const ctx: RequestContext = {
        tenantId: event.tenantId, branchCode: j.branchCode, correlationId: event.correlationId,
        user: { id: SYSTEM_USER.code, tenantId: event.tenantId, code: SYSTEM_USER.code, name: SYSTEM_USER.name, email: '', roles: [], branchCodes: [j.branchCode], department: null, jobTitle: null },
      };
      await this.activity.log(tx, ctx, {
        entityType: SVC_ENTITY.JOB, entityId: j.id, docNo: j.docNo, action: 'order_payment',
        message: `${pay.salesOrderNo} payment ${pay.orNo} verified: ${LABEL[pay.status]}, RM ${dec(pay.verified).toFixed(2)} of RM ${dec(pay.total).toFixed(2)}${active ? '; warranty active' : ''}`, comment: null,
      });
    }
  }
}
