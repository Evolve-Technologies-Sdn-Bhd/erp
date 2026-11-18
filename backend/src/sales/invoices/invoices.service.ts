import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SalOrderVoucher, SalSalesOrderLine } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort, type MdCustomer } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ApprovalsService } from '../../platform/approvals/approvals.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney, toQty, toRmText } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { breachText, creditActivityText } from '../shared/credit.rules';
import { CreditService, type CreditOutcome } from '../shared/credit.service';
import { DepositsService } from '../shared/deposits.service';
import { totalsWithVouchers, vouchersForInvoice } from '../shared/voucher.rules';
import { depositToUse } from '../proformas/proforma.rules';
import { SalesDocumentLines } from '../shared/document-lines.service';
import { mailDate, SalesMailService } from '../shared/sales-mail.service';
import { CREDIT_DOC, SAL_DOC_TYPE, SAL_ENTITY, SAL_EVENT, SAL_LINK, SAL_ROLE } from '../shared/sales.constants';
import { saleLineTotals } from '../shared/totals.rules';
import type { CreateDirectInvoiceDto, CreateFromOrderDto, InvoiceApprovalDto, UpdateInvoiceDto } from './dto/invoice.dto';
import { allocateToDeliveries, dueDateFor, INV_LOCKED_MESSAGE, invoiceQtyProblems, priceReason, type InvoiceAction } from './invoice.rules';
import { InvoicesQuery, type InvoiceWithLines } from './invoices.query';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const qtyText = (v: Prisma.Decimal) => toQty(v).replace(/\.0+$/, '');
/** The shared credit wording names an order; on an invoice it names the invoice. */
const invoiceCreditText = (c: CreditOutcome) => creditActivityText(c.input, c.check).replace(/this order/g, 'this invoice').replace(/the order/g, 'the invoice');

type BuiltLine = {
  soLineId: string | null; itemId: string; itemCode: string; itemName: string; uomCode: string; taxCode: string; taxRate: Prisma.Decimal; qty: Prisma.Decimal;
  listPrice: Prisma.Decimal | null; unitPrice: Prisma.Decimal; discountPct: Prisma.Decimal; grossAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; amount: Prisma.Decimal; taxAmount: Prisma.Decimal;
};

/**
 * Invoice commands (FlowS3). From an order, only delivered quantity can be invoiced; the order's invoiced quantity
 * and the delivery lines are updated on release, in one transaction with the activity and the outbox event.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: InvoicesQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
    private readonly outbox: OutboxWriter,
    private readonly credit: CreditService,
    private readonly docs: SalesDocumentLines,
    private readonly mail: SalesMailService,
    private readonly deposits: DepositsService,
    private readonly clock: ClockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  // ── Create (S18 from an order, or a blank direct invoice) ─────────────────

  async createFromOrder(ctx: RequestContext, dto: CreateFromOrderDto) {
    const order = await this.prisma.salSalesOrder.findFirst({ where: { id: dto.salesOrderId, tenantId: ctx.tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } } });
    if (!order) throw ValidationFailedError.field('salesOrderId', 'Pick a sales order with something to invoice.');
    if (order.isMigrated || !['RELEASED', 'PARTIAL', 'DONE'].includes(order.status)) {
      throw new BusinessRuleError('ORDER_NOT_INVOICEABLE', `${order.docNo} is not released. Only delivered quantity of released orders can be invoiced.`);
    }
    const customer = await this.docs.activeCustomer(ctx, order.customerCode, 'an invoice');
    const docDate = dto.docDate ?? this.clock.today();
    const lines = await this.orderLines(ctx, customer, order.lines, dto.lines.map((l) => ({ soLineId: l.soLineId, qty: l.qty })), docDate);
    const vouchers = await this.vouchersFor(ctx.tenantId, order.id, lines);
    const totals = await this.totalsOf(ctx.tenantId, lines, vouchers);
    const credit = await this.credit.check(ctx.tenantId, { customer, docType: CREDIT_DOC.INVOICE, thisDocument: toMoney(totals.total), branchCode: order.branchCode, excludeOrderId: order.id });
    const deliveries = await this.deliveriesFor(ctx.tenantId, lines.map((l) => l.soLineId!));

    const { id } = await this.prisma.$transaction(async (tx) => {
      const docNo = await this.numbering.next(tx, ctx.tenantId, SAL_DOC_TYPE.INVOICE, { date: docDate, branchCode: order.branchCode });
      const row = await tx.salInvoice.create({
        data: {
          tenantId: ctx.tenantId, docNo, docDate: day(docDate), status: 'DRAFT', kind: 'FROM_ORDER', branchCode: order.branchCode,
          customerId: customer.id, customerCode: customer.code, customerName: customer.name, billTo: customer.billingAddress, contactName: order.contactName,
          agentCode: order.agentCode, agentName: order.agentName, creditTermDays: order.creditTermDays, dueDate: day(dueDateFor(docDate, order.creditTermDays)),
          currency: order.currency, taxMode: order.taxMode, salesOrderId: order.id, salesOrderNo: order.docNo, deliveryNos: deliveries.map((d) => d.docNo).join(', ') || null,
          customerPoRef: dto.customerPoRef?.trim() || order.customerPoRef, note: dto.note?.trim() || null, ...totals, creditSnapshot: credit.snapshot,
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
          lines: { create: lines.map((l, i) => ({ ...l, tenantId: ctx.tenantId, lineNo: i + 1 })) },
        },
      });
      for (const d of deliveries) {
        await tx.sysDocLink.create({ data: { tenantId: ctx.tenantId, fromType: SAL_ENTITY.DELIVERY, fromId: d.id, fromNo: d.docNo, toType: SAL_ENTITY.INVOICE, toId: row.id, toNo: docNo, linkType: SAL_LINK.INVOICED } });
      }
      if (!deliveries.length) {
        await tx.sysDocLink.create({ data: { tenantId: ctx.tenantId, fromType: SAL_ENTITY.ORDER, fromId: order.id, fromNo: order.docNo, toType: SAL_ENTITY.INVOICE, toId: row.id, toNo: docNo, linkType: SAL_LINK.INVOICED } });
      }
      await this.takeVouchers(tx, ctx, row.id, docNo, vouchers);
      await this.log(tx, ctx, row.id, docNo, 'created', `Created from ${order.docNo} by ${ctx.user.name}`);
      await this.log(tx, ctx, row.id, docNo, 'credit_check', invoiceCreditText(credit), null, 1);
      return row;
    });
    return this.query.detail(ctx, id);
  }

  async createDirect(ctx: RequestContext, dto: CreateDirectInvoiceDto) {
    const customer = await this.docs.activeCustomer(ctx, dto.customerCode, 'an invoice');
    const docDate = dto.docDate ?? this.clock.today();
    const branchCode = this.docs.branchFor(ctx, customer);
    const built = await this.docs.buildLines(ctx, customer, branchCode, docDate, dto.lines);
    const agent = await this.docs.agentFor(ctx, customer);
    const credit = await this.credit.check(ctx.tenantId, { customer, docType: CREDIT_DOC.INVOICE, thisDocument: toMoney(built.totals.total), branchCode });

    const { id } = await this.prisma.$transaction(async (tx) => {
      const docNo = await this.numbering.next(tx, ctx.tenantId, SAL_DOC_TYPE.INVOICE, { date: docDate, branchCode });
      const row = await tx.salInvoice.create({
        data: {
          tenantId: ctx.tenantId, docNo, docDate: day(docDate), status: 'DRAFT', kind: 'DIRECT', branchCode,
          customerId: customer.id, customerCode: customer.code, customerName: customer.name, billTo: customer.billingAddress, contactName: customer.contactName,
          agentCode: agent.code, agentName: agent.name, creditTermDays: customer.creditTermDays, dueDate: day(dueDateFor(docDate, customer.creditTermDays)),
          customerPoRef: dto.customerPoRef?.trim() || null, note: dto.note?.trim() || null, ...built.totals, creditSnapshot: credit.snapshot,
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
          lines: { create: built.lines.map(({ isBuyToOrder: _b, unitCost: _c, ...l }, i) => ({ ...l, tenantId: ctx.tenantId, lineNo: i + 1 })) },
        },
      });
      await this.log(tx, ctx, row.id, docNo, 'created', `Created as a direct invoice by ${ctx.user.name}`);
      await this.log(tx, ctx, row.id, docNo, 'credit_check', invoiceCreditText(credit), null, 1);
      return row;
    });
    return this.query.detail(ctx, id);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateInvoiceDto) {
    const inv = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, inv, 'edit', this.lockedMessage(inv));
    const docDate = dto.docDate ?? iso(inv.docDate);
    let lines: BuiltLine[] | null = null;
    let customer: MdCustomer | null = null;
    let vouchers: SalOrderVoucher[] | null = null;

    if (inv.kind === 'FROM_ORDER' && dto.quantities) {
      const order = await this.prisma.salSalesOrder.findFirst({ where: { id: inv.salesOrderId ?? '' }, include: { lines: true } });
      if (!order) throw new NotFoundError('Sales order');
      customer = await this.docs.activeCustomer(ctx, inv.customerCode, 'an invoice');
      const wanted = inv.lines.map((l) => ({ soLineId: l.soLineId!, qty: dto.quantities!.find((q) => q.lineNo === l.lineNo)?.qty ?? toQty(l.qty) }));
      lines = await this.orderLines(ctx, customer, order.lines, wanted, docDate, inv.id);
      vouchers = await this.vouchersFor(ctx.tenantId, order.id, lines, inv.id);
    } else if (inv.kind === 'DIRECT' && (dto.lines || dto.customerCode)) {
      customer = await this.docs.activeCustomer(ctx, dto.customerCode ?? inv.customerCode, 'an invoice');
      const input = dto.lines ?? inv.lines.map((l) => ({ itemCode: l.itemCode, qty: toQty(l.qty), unitPrice: l.unitPrice.toString(), discountPct: l.discountPct.toString() }));
      const built = await this.docs.buildLines(ctx, customer, inv.branchCode, docDate, input);
      lines = built.lines.map(({ isBuyToOrder: _b, unitCost: _c, ...l }) => ({ ...l, soLineId: null }));
    }
    const totals = lines ? await this.totalsOf(ctx.tenantId, lines, vouchers ?? []) : null;
    const customerChanged = Boolean(customer && customer.code !== inv.customerCode);
    const clearApproval = Boolean(inv.approvedAt) && (customerChanged || (totals !== null && !totals.total.eq(inv.total)));
    const term = customerChanged ? customer!.creditTermDays : inv.creditTermDays;

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, inv.id, dto.version, {
        docDate: day(docDate),
        dueDate: day(dueDateFor(docDate, term)),
        ...(dto.customerPoRef !== undefined && { customerPoRef: dto.customerPoRef.trim() || null }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
        ...(customerChanged && {
          customerId: customer!.id, customerCode: customer!.code, customerName: customer!.name, billTo: customer!.billingAddress,
          contactName: customer!.contactName, creditTermDays: customer!.creditTermDays,
        }),
        ...(totals && totals),
        ...(clearApproval && { approvedAt: null }),
      }, 'DRAFT');
      if (lines) {
        await tx.salInvoiceLine.deleteMany({ where: { invoiceId: inv.id } });
        await tx.salInvoiceLine.createMany({ data: lines.map((l, i) => ({ ...l, tenantId: ctx.tenantId, invoiceId: inv.id, lineNo: i + 1 })) });
      }
      if (vouchers) {
        await tx.salOrderVoucher.updateMany({ where: { tenantId: ctx.tenantId, invoiceId: inv.id }, data: { invoiceId: null, invoiceNo: null } });
        await this.takeVouchers(tx, ctx, inv.id, inv.docNo, vouchers, true);
      }
      await this.log(tx, ctx, inv.id, inv.docNo, 'saved', `Saved by ${ctx.user.name}`);
      if (clearApproval) await this.log(tx, ctx, inv.id, inv.docNo, 'approval_cleared', 'Approval cleared: the invoice changed after it was approved', null, 1);
    });
    return this.query.detail(ctx, id);
  }

  async remove(ctx: RequestContext, id: string, version: number) {
    const inv = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, inv, 'delete', this.lockedMessage(inv));
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.salInvoice.deleteMany({ where: { id, tenantId: ctx.tenantId, version, status: 'DRAFT' } });
      if (deleted.count === 0) throw new StaleVersionError();
      await tx.sysDocLink.deleteMany({ where: { tenantId: ctx.tenantId, toType: SAL_ENTITY.INVOICE, toId: id } });
      // Its order vouchers wait for the order's next invoice.
      await tx.salOrderVoucher.updateMany({ where: { tenantId: ctx.tenantId, invoiceId: id }, data: { invoiceId: null, invoiceNo: null } });
      await this.approvals.cancelPending(tx, ctx, SAL_ENTITY.INVOICE, id);
      await this.log(tx, ctx, id, inv.docNo, 'deleted', `Draft deleted by ${ctx.user.name}. ${inv.docNo} will not be used again.`);
    });
    return { deleted: true, docNo: inv.docNo };
  }

  // ── Approval (price → Sales Manager, credit → Finance Manager) ────────────

  async requestApproval(ctx: RequestContext, id: string, dto: InvoiceApprovalDto) {
    const inv = await this.query.load(ctx.tenantId, id);
    const credit = await this.query.liveCredit(ctx, inv);
    const needs = this.query.approvalNeeds(inv, credit, await this.query.approvedRoles(ctx.tenantId, inv), await this.query.priceCheck(ctx.tenantId, inv));
    if (needs.blocked) throw new BusinessRuleError('CREDIT_BLOCKED', `The credit check blocks this invoice: ${breachText(credit!.check)}. It cannot be approved.`);
    if (!needs.price && !needs.credit) throw new BusinessRuleError('APPROVAL_NOT_NEEDED', 'Prices and credit are within the rules. Release the invoice directly.');
    await this.requireAction(ctx, inv, 'requestApproval', this.lockedMessage(inv));

    const steps: Awaited<ReturnType<SalesDocumentLines['approver']>>[] = [];
    const reasons: string[] = [];
    if (needs.price) {
      steps.push(await this.docs.approver(ctx, SAL_ROLE.MANAGER, inv.branchCode));
      reasons.push(needs.priceReason!);
    }
    if (needs.credit) {
      steps.push(await this.docs.approver(ctx, credit!.approverRole ?? SAL_ROLE.FINANCE_MANAGER, inv.branchCode));
      reasons.push(breachText(credit!.check));
    }
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, inv.id, dto.version, { status: 'PENDING_APPROVAL', approvalRequired: true, ...(credit && { creditSnapshot: credit.snapshot }) }, 'DRAFT');
      await this.approvals.create(tx, ctx, {
        entityType: SAL_ENTITY.INVOICE, entityId: inv.id, docNo: inv.docNo, amount: inv.total, title: `${inv.docNo} · ${inv.customerName}`,
        reason: reasons.join(' · '), requesterNote: dto.reason, steps,
      });
      await this.log(tx, ctx, inv.id, inv.docNo, 'approval_requested', `${reasons.join(' · ')} · sent for approval to ${steps.map((s) => s.approverName).join(', then ')}`, dto.reason.trim());
    });
    return this.query.detail(ctx, id);
  }

  // ── Release (FlowS3 step 4) ───────────────────────────────────────────────

  async release(ctx: RequestContext, id: string, version: number) {
    const inv = await this.query.load(ctx.tenantId, id);
    const credit = await this.query.liveCredit(ctx, inv);
    const needs = this.query.approvalNeeds(inv, credit, await this.query.approvedRoles(ctx.tenantId, inv), await this.query.priceCheck(ctx.tenantId, inv));
    if (inv.status === 'DRAFT') {
      if (needs.blocked) throw new BusinessRuleError('CREDIT_BLOCKED', `${invoiceCreditText(credit!)}. The invoice cannot be released.`);
      if (needs.price || needs.credit) {
        const why = [needs.price && needs.priceReason, needs.credit && breachText(credit!.check)].filter(Boolean).join(' · ');
        throw new BusinessRuleError('APPROVAL_REQUIRED', `${why}. Type a reason and request approval before releasing.`);
      }
    }
    await this.requireAction(ctx, inv, 'release', this.lockedMessage(inv));
    await this.docs.checkStillSellable(ctx, inv.branchCode, inv.lines.map((l) => l.itemCode), await this.giftOnly(ctx.tenantId, inv.lines));
    const customer = await this.masterData.findCustomer(ctx.tenantId, inv.customerCode);
    const now = this.clock.now();
    const docDate = iso(inv.docDate);
    const dueDate = dueDateFor(docDate, inv.creditTermDays);
    const proforma = inv.kind === 'FROM_ORDER' && inv.salesOrderId ? await this.deposits.paidUnusedForOrder(ctx.tenantId, inv.salesOrderId) : null;
    const deposit = depositToUse(inv.total, proforma ? { amount: proforma.proforma.amount, received: proforma.received } : null);

    await this.prisma.$transaction(async (tx) => {
      if (inv.kind === 'FROM_ORDER' && inv.salesOrderId) await this.applyToOrder(tx, ctx, inv);
      await this.bump(tx, ctx, inv.id, version, {
        status: 'RELEASED', releasedAt: now, releasedByCode: ctx.user.code, dueDate: day(dueDate),
        ...(credit && !inv.approvedAt && { creditSnapshot: credit.snapshot }),
        ...(proforma && deposit.gt(0) && { depositApplied: deposit, proformaNo: proforma.proforma.docNo }),
      }, 'DRAFT');
      if (proforma && deposit.gt(0)) await this.useDeposit(tx, ctx, inv, proforma.proforma.id, proforma.proforma.docNo, deposit, now);
      await this.log(tx, ctx, inv.id, inv.docNo, 'released', `Released by ${ctx.user.name} · posting and e-Invoice queued`, null, 1);
      await this.outbox.publish(tx, ctx, [{
        name: SAL_EVENT.INVOICE_RELEASED, aggregateType: SAL_ENTITY.INVOICE, aggregateId: inv.id,
        payload: {
          invoiceNo: inv.docNo, docDate, dueDate, branchCode: inv.branchCode, customerCode: inv.customerCode, customerName: inv.customerName, customerTin: customer?.tin ?? null,
          currency: inv.currency, subtotal: toMoney(inv.subtotal), discountTotal: toMoney(inv.discountTotal), voucherTotal: toMoney(inv.voucherTotal), taxTotal: toMoney(inv.taxTotal), rounding: toMoney(inv.rounding), total: toMoney(inv.total),
          salesOrderNo: inv.salesOrderNo, deliveryNos: inv.deliveryNos, depositApplied: toMoney(deposit), proformaNo: proforma && deposit.gt(0) ? proforma.proforma.docNo : null,
          lines: inv.lines.map((l) => ({ lineNo: l.lineNo, itemCode: l.itemCode, uomCode: l.uomCode, qty: toQty(l.qty), unitPrice: l.unitPrice.toString(), taxCode: l.taxCode, amount: toMoney(l.amount), taxAmount: toMoney(l.taxAmount) })),
        },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  /**
   * Locks the order, re-checks delivered − invoiced with fresh numbers, raises the order's invoiced quantity and
   * spreads the invoiced quantity over the confirmed delivery lines, oldest first.
   */
  private async applyToOrder(tx: Tx, ctx: RequestContext, inv: InvoiceWithLines) {
    await tx.$queryRaw`SELECT id FROM sal_sales_order WHERE id = ${inv.salesOrderId} FOR UPDATE`;
    const order = await tx.salSalesOrder.findUniqueOrThrow({ where: { id: inv.salesOrderId! }, include: { lines: true } });
    const problems = invoiceQtyProblems(inv.lines.map((l) => {
      const so = order.lines.find((x) => x.id === l.soLineId);
      return { qty: l.qty, canInvoice: so ? so.deliveredQty.sub(so.invoicedQty) : dec(0) };
    }));
    if (problems.length) throw new ValidationFailedError(problems, 'Something was invoiced meanwhile. Check the quantities.');
    for (const l of inv.lines) {
      await tx.salSalesOrderLine.update({ where: { id: l.soLineId! }, data: { invoicedQty: { increment: l.qty } } });
      const doLines = await tx.salDeliveryLine.findMany({
        where: { tenantId: ctx.tenantId, soLineId: l.soLineId, delivery: { status: 'CONFIRMED' } },
        include: { delivery: { select: { docNo: true } } },
        orderBy: { delivery: { docNo: 'asc' } },
      });
      const split = allocateToDeliveries(l.qty, doLines.map((d) => ({ id: d.id, open: d.qty.sub(d.invoicedQty) })));
      for (const s of split) await tx.salDeliveryLine.update({ where: { id: s.id }, data: { invoicedQty: { increment: s.qty } } });
      if (split[0]) await tx.salInvoiceLine.update({ where: { id: l.id }, data: { deliveryLineId: split[0].id } });
    }
    const qty = inv.lines.reduce((s, l) => s.add(l.qty), dec(0));
    await tx.salSalesOrder.update({ where: { id: order.id }, data: { version: { increment: 1 }, updatedBy: ctx.user.code } });
    await this.activity.log(tx, ctx, {
      entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action: 'invoiced',
      message: `${inv.docNo} released: ${qtyText(qty)} invoiced, ${toRmText(inv.total)}`, comment: null,
    });
  }

  /** The proforma's deposit is used once (rule 9): the proforma becomes "Used on INV-…" in the same transaction. */
  private async useDeposit(tx: Tx, ctx: RequestContext, inv: InvoiceWithLines, proformaId: string, proformaNo: string, amount: Prisma.Decimal, now: Date) {
    const used = await tx.salProforma.updateMany({
      where: { id: proformaId, tenantId: ctx.tenantId, status: { in: ['SENT', 'PAID'] }, usedOnInvoice: null },
      data: { status: 'USED', usedOnInvoice: inv.docNo, usedAt: now, version: { increment: 1 }, updatedBy: ctx.user.code },
    });
    if (used.count === 0) throw new BusinessRuleError('DEPOSIT_ALREADY_USED', `The deposit on ${proformaNo} was used meanwhile. Open the invoice again and release it.`);
    await tx.sysDocLink.create({ data: { tenantId: ctx.tenantId, fromType: SAL_ENTITY.PROFORMA, fromId: proformaId, fromNo: proformaNo, toType: SAL_ENTITY.INVOICE, toId: inv.id, toNo: inv.docNo, linkType: SAL_LINK.DEPOSIT_USED } });
    await this.activity.log(tx, ctx, { entityType: SAL_ENTITY.PROFORMA, entityId: proformaId, docNo: proformaNo, action: 'used', message: `Used on ${inv.docNo}: ${toRmText(amount)} knocked off`, comment: null });
    await this.log(tx, ctx, inv.id, inv.docNo, 'deposit_used', `Deposit ${proformaNo} used: ${toRmText(amount)} taken off the balance`);
  }

  async email(ctx: RequestContext, id: string) {
    const inv = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, inv, 'email', 'Release the invoice before emailing it.');
    const customer = await this.masterData.findCustomer(ctx.tenantId, inv.customerCode);
    if (!customer?.email) throw new BusinessRuleError('NO_EMAIL', `${inv.customerName} has no email address in Master Data.`);
    const agent = (await this.masterData.listUsers(ctx.tenantId)).find((u) => u.code === inv.agentCode);
    await this.prisma.$transaction(async (tx) => {
      await this.mail.send(tx, ctx, {
        templateKey: 'INVOICE', entityType: SAL_ENTITY.INVOICE, entityId: inv.id, docNo: inv.docNo, to: customer.email!, agentEmail: agent?.email,
        vars: {
          'contact.name': inv.contactName ?? customer.contactName ?? customer.name, 'document.number': inv.docNo, 'document.total': toRmText(inv.total),
          'document.due_date': mailDate(inv.dueDate), 'document.customer_ref': inv.customerPoRef ?? '—',
        },
      });
      await tx.salInvoice.update({ where: { id: inv.id }, data: { emailedAt: this.clock.now() } });
      await this.log(tx, ctx, inv.id, inv.docNo, 'emailed', `Emailed to ${customer.email}`);
    });
    return { sentTo: customer.email };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Invoice lines from order lines: the order's price, discount and tax; the price list of today for the strict-price check. */
  private async orderLines(ctx: RequestContext, customer: MdCustomer, soLines: SalSalesOrderLine[], wanted: { soLineId: string; qty: string }[], docDate: string, excludeInvoiceId?: string): Promise<BuiltLine[]> {
    const can = await this.query.canInvoice(ctx.tenantId, soLines, excludeInvoiceId);
    const picked = wanted.map((w, index) => {
      const so = soLines.find((l) => l.id === w.soLineId);
      if (!so) throw ValidationFailedError.field(`lines[${index}].soLineId`, 'This line is not on the sales order.');
      return { so, qty: dec(w.qty) };
    });
    const problems = invoiceQtyProblems(picked.map((p) => ({ qty: p.qty, canInvoice: can.get(p.so.id) ?? dec(0) })));
    if (problems.length) throw new ValidationFailedError(problems, 'Check the quantities to invoice.');
    const prices = await this.masterData.listPrices(ctx.tenantId, { priceListCode: customer.priceListCode, itemCodes: picked.map((p) => p.so.itemCode), onDate: docDate });
    return picked.map(({ so, qty }) => {
      const t = saleLineTotals({ qty, unitPrice: so.unitPrice, discountPct: so.discountPct, taxRate: so.taxRate });
      const list = prices.find((p) => p.itemCode === so.itemCode);
      return {
        soLineId: so.id, itemId: so.itemId, itemCode: so.itemCode, itemName: so.itemName, uomCode: so.uomCode, taxCode: so.taxCode, taxRate: so.taxRate, qty,
        // A package's items and gifts are priced from the package (phase 5): compare with that, not the price list.
        listPrice: so.lineKind !== 'ITEM' ? so.listPrice : list ? dec(list.unitPrice) : so.listPrice, unitPrice: so.unitPrice, discountPct: so.discountPct,
        grossAmount: t.grossAmount, discountAmount: t.discountAmount, amount: t.amount, taxAmount: t.taxAmount,
      };
    });
  }

  /** Items that are only free gifts of a package on this invoice (phase 5): a gift need not be for sale on its own. */
  private async giftOnly(tenantId: string, lines: { itemCode: string; soLineId: string | null }[]): Promise<string[]> {
    const ids = lines.map((l) => l.soLineId).filter((id): id is string => Boolean(id));
    if (!ids.length) return [];
    const gifts = new Set((await this.prisma.salSalesOrderLine.findMany({ where: { tenantId, id: { in: ids }, lineKind: 'GIFT' }, select: { id: true } })).map((l) => l.id));
    return lines.filter((l) => l.soLineId && gifts.has(l.soLineId) && !lines.some((o) => o.itemCode === l.itemCode && !(o.soLineId && gifts.has(o.soLineId)))).map((l) => l.itemCode);
  }

  /** Totals by rule 14, less the order vouchers the invoice uses (phase 5); with none, exactly rule 14. */
  private async totalsOf(tenantId: string, lines: BuiltLine[], vouchers: SalOrderVoucher[] = []) {
    const setting = await this.prisma.salSetting.findUnique({ where: { tenantId } });
    const t = totalsWithVouchers(lines, vouchers, setting?.roundTo5Sen ?? true);
    return { subtotal: t.subtotal, discountTotal: t.discountTotal, voucherTotal: t.voucherTotal, taxTotal: t.taxTotal, rounding: t.rounding, total: t.total };
  }

  /** The order's vouchers no other invoice has taken that these lines can cover (phase 5, F1 part 4). */
  private async vouchersFor(tenantId: string, salesOrderId: string, lines: BuiltLine[], invoiceId?: string): Promise<SalOrderVoucher[]> {
    const available = await this.prisma.salOrderVoucher.findMany({
      where: { tenantId, salesOrderId, OR: [{ invoiceId: null }, ...(invoiceId ? [{ invoiceId }] : [])] },
      orderBy: { sortOrder: 'asc' },
    });
    return vouchersForInvoice(available, lines);
  }

  /** Marks the vouchers as used on this invoice; refuses if another invoice took one meanwhile. */
  private async takeVouchers(tx: Tx, ctx: RequestContext, invoiceId: string, docNo: string, vouchers: SalOrderVoucher[], quiet = false) {
    if (!vouchers.length) return;
    const taken = await tx.salOrderVoucher.updateMany({ where: { tenantId: ctx.tenantId, id: { in: vouchers.map((v) => v.id) }, invoiceId: null }, data: { invoiceId, invoiceNo: docNo } });
    if (taken.count !== vouchers.length) throw new BusinessRuleError('VOUCHER_TAKEN', 'Another invoice used a voucher of this order meanwhile. Open the order again and make the invoice.');
    if (!quiet) await this.log(tx, ctx, invoiceId, docNo, 'vouchers', `Order vouchers used: ${vouchers.map((v) => `${v.voucherNo} ${toRmText(v.amount)}`).join(', ')} off before tax`, null, 1);
  }

  /** Confirmed delivery orders that still have something to invoice on these order lines. */
  private async deliveriesFor(tenantId: string, soLineIds: string[]) {
    const lines = await this.prisma.salDeliveryLine.findMany({
      where: { tenantId, soLineId: { in: soLineIds }, delivery: { status: 'CONFIRMED', isMigrated: false } },
      include: { delivery: { select: { id: true, docNo: true } } },
    });
    const open = lines.filter((l) => l.qty.gt(l.invoicedQty));
    return [...new Map(open.map((l) => [l.delivery.id, l.delivery])).values()].sort((a, b) => a.docNo.localeCompare(b.docNo));
  }

  private lockedMessage(inv: InvoiceWithLines): string {
    if (inv.isMigrated) return 'Migrated invoices cannot be changed.';
    if (inv.status === 'PENDING_APPROVAL') return `${inv.docNo} is waiting for approval and is locked.`;
    return INV_LOCKED_MESSAGE;
  }

  private async requireAction(ctx: RequestContext, inv: InvoiceWithLines, action: InvoiceAction, message: string) {
    const credit: CreditOutcome | null = await this.query.liveCredit(ctx, inv);
    const approved = await this.query.approvedRoles(ctx.tenantId, inv);
    if (!this.query.actions(ctx, inv, credit, inv.total, approved, await this.query.priceCheck(ctx.tenantId, inv)).includes(action)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', message);
  }

  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SalInvoiceUpdateManyMutationInput, status?: 'DRAFT') {
    const result = await tx.salInvoice.updateMany({ where: { id, tenantId: ctx.tenantId, version, ...(status && { status }) }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string, comment?: string | null, afterMs = 0) {
    return this.activity.log(tx, ctx, { entityType: SAL_ENTITY.INVOICE, entityId: id, docNo, action, message, comment: comment ?? null, afterMs });
  }
}

