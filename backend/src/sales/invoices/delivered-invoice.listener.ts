import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { dec, toQty } from '../../platform/http/decimal';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { BusinessRuleError, ValidationFailedError } from '../../platform/http/errors';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY, SAL_EVENT } from '../shared/sales.constants';
import { InvoicesService } from './invoices.service';

const HANDLER = 'sales.invoice-delivered';
const SYSTEM = { code: 'SYSTEM', name: 'System' } as const;

/**
 * The invoice of a delivered installation (phase 5): with "Draft the invoice when the installation is delivered" on, a
 * delivered delivery order of an order with installation drafts an invoice for what it delivered, and billing checks and
 * releases it. Once per delivery order; what is already invoiced is left out. An invoice that cannot be drafted (such as
 * a blocked customer) is said so on the order, and billing makes it by hand.
 */
@Injectable()
export class DeliveredInvoiceListener implements OnModuleInit {
  private readonly logger = new Logger(DeliveredInvoiceListener.name);

  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.consumers.listen(SAL_EVENT.DELIVERY_DELIVERED, HANDLER, (e, tx) => this.onDelivered(e, tx));
  }

  async onDelivered(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const p = event.payload as { doId?: unknown; doNo?: unknown; salesOrderId?: unknown };
    if (typeof p?.doId !== 'string' || typeof p.salesOrderId !== 'string') return;
    const on = (await tx.salSetting.findUnique({ where: { tenantId: event.tenantId }, select: { autoInvoice: true } }))?.autoInvoice;
    if (!on) return;
    const made = await this.prisma.sysDocLink.findFirst({ where: { tenantId: event.tenantId, fromType: SAL_ENTITY.DELIVERY, fromId: p.doId, toType: SAL_ENTITY.INVOICE }, select: { id: true } });
    if (made) return;
    const [order, lines] = await Promise.all([
      this.prisma.salSalesOrder.findFirst({ where: { tenantId: event.tenantId, id: p.salesOrderId }, include: { lines: true } }),
      this.prisma.salDeliveryLine.findMany({ where: { tenantId: event.tenantId, deliveryId: p.doId } }),
    ]);
    if (!order) return;
    const wanted = lines
      .map((l) => {
        const so = order.lines.find((x) => x.id === l.soLineId);
        const left = so ? so.deliveredQty.sub(so.invoicedQty) : dec(0);
        return { soLineId: l.soLineId!, qty: left.lt(l.qty) ? left : l.qty };
      })
      .filter((l) => l.soLineId && l.qty.gt(0));
    if (!wanted.length) return;
    const ctx = this.ctx(event, order.branchCode);
    try {
      const inv = await this.invoices.createFromOrder(ctx, { salesOrderId: order.id, lines: wanted.map((l) => ({ soLineId: l.soLineId, qty: toQty(l.qty) })) }, `Drafted by the system when ${String(p.doNo)} was delivered`);
      await this.notifications.send(tx, ctx, {
        to: await this.notifications.whoCan(event.tenantId, P.INVOICE_RELEASE, order.branchCode), kind: 'sales.invoice.drafted', link: `/sales/invoices/${inv.id}`,
        title: `${inv.docNo} to check and release`, body: `${order.customerName} (${order.docNo}): ${String(p.doNo)} was delivered.`, entityType: SAL_ENTITY.INVOICE, entityId: inv.id,
      });
    } catch (error) {
      if (!(error instanceof BusinessRuleError || error instanceof ValidationFailedError)) throw error;
      this.logger.warn(`${order.docNo}: no invoice drafted for ${String(p.doNo)}: ${error.message}`);
      await this.activity.log(tx, ctx, { entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action: 'auto_invoice_failed', message: `No invoice drafted for ${String(p.doNo)}: ${error.message}`.slice(0, 500), comment: null });
    }
  }

  private ctx(event: OutboxEnvelope, branchCode: string): RequestContext {
    return {
      tenantId: event.tenantId, branchCode, correlationId: event.correlationId,
      user: { id: SYSTEM.code, tenantId: event.tenantId, code: SYSTEM.code, name: SYSTEM.name, email: '', roles: [], branchCodes: [branchCode], department: null, jobTitle: null },
    };
  }
}
