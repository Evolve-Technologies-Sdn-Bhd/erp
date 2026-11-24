import { Injectable } from '@nestjs/common';
import type { Prisma, SalReceipt } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError, type FieldError } from '../../platform/http/errors';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { InvoicePayments } from '../shared/invoice-payments.service';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SAL_DOC_TYPE, SAL_ENTITY, SAL_EVENT } from '../shared/sales.constants';
import type { CreateReceiptDto, ReceiptReasonDto, UpdateReceiptDto, VerifyReceiptDto } from './dto/receipt.dto';
import { orderPayment, proofError, receiptErrors, receiptText, RECEIPTS_OFF_MESSAGE, type ReceiptAction, type ReceiptStatus } from './receipt.rules';
import { ReceiptsQuery } from './receipts.query';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateText = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/**
 * Official receipt commands (phase 5). Every change runs in one transaction: the receipt, its activity, a line on the
 * order's activity, and on verification the event `sales.receipt.verified`. The order's row is locked while a receipt
 * is recorded or changed, so two receipts at the same moment can never take the order past its total.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: InvoicePayments,
    private readonly query: ReceiptsQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly attachments: AttachmentsService,
  ) {}

  async create(ctx: RequestContext, dto: CreateReceiptDto) {
    await this.requireOn(ctx.tenantId);
    const order = await this.prisma.salSalesOrder.findFirst({ where: { tenantId: ctx.tenantId, id: dto.salesOrderId } });
    if (!order) throw ValidationFailedError.field('salesOrderId', 'Pick the sales order the payment is for.');
    if (!['RELEASED', 'PARTIAL', 'DONE'].includes(order.status)) {
      throw new BusinessRuleError('ORDER_NOT_RELEASED', `${order.docNo} is not released. Payments are recorded on a released order.`);
    }
    const problems = await this.proofProblems(ctx.tenantId, dto.proofIds, null);
    const today = this.clock.today();

    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sal_sales_order WHERE id = ${order.id} FOR UPDATE`;
      const others = await tx.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: order.id }, select: { status: true, amount: true } });
      this.check(dto, dto.proofIds.length, orderPayment(order.total, others).open, today, problems);
      await this.ensureSequence(tx, ctx.tenantId);
      const docNo = await this.numbering.next(tx, ctx.tenantId, SAL_DOC_TYPE.RECEIPT, { date: today, branchCode: order.branchCode });
      const r = await tx.salReceipt.create({
        data: {
          tenantId: ctx.tenantId, docNo, docDate: day(dto.docDate), status: 'WAITING', branchCode: order.branchCode,
          salesOrderId: order.id, salesOrderNo: order.docNo, customerCode: order.customerCode, customerName: order.customerName,
          kind: dto.kind, method: dto.method, amount: dec(dto.amount.trim()), payerRef: dto.payerRef?.trim() || null, note: dto.note?.trim() || null,
          recordedByCode: ctx.user.code, recordedByName: ctx.user.name, createdBy: ctx.user.code, updatedBy: ctx.user.code,
        },
      });
      await this.attachments.attach(tx, ctx, dto.proofIds, SAL_ENTITY.RECEIPT, r.id);
      const what = `${receiptText(r)}, received ${dateText(dto.docDate)}`;
      await this.log(tx, ctx, SAL_ENTITY.RECEIPT, r.id, docNo, 'recorded', `Recorded by ${ctx.user.name}: ${what} · waiting for Account`, r.note);
      await this.log(tx, ctx, SAL_ENTITY.ORDER, order.id, order.docNo, 'payment_recorded', `${docNo} recorded: ${what} · waiting for Account`);
      return r.id;
    });
    return this.query.detail(ctx, id);
  }

  /** A waiting receipt corrected, or one Account sent back corrected and sent again. New proofs are added to it. */
  async update(ctx: RequestContext, id: string, dto: UpdateReceiptDto) {
    await this.requireOn(ctx.tenantId);
    const r = await this.query.load(ctx.tenantId, id);
    this.require(ctx, r, 'edit', `${r.docNo} is ${r.status === 'VERIFIED' ? 'verified' : 'cancelled'} and can no longer be changed.`);
    const order = await this.prisma.salSalesOrder.findFirstOrThrow({ where: { tenantId: ctx.tenantId, id: r.salesOrderId } });
    const problems = await this.proofProblems(ctx.tenantId, dto.proofIds, r.id);
    const kept = (await this.attachments.listFor(ctx.tenantId, SAL_ENTITY.RECEIPT, r.id)).length;
    const today = this.clock.today();
    const again = r.status === 'RETURNED';

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sal_sales_order WHERE id = ${order.id} FOR UPDATE`;
      const others = await tx.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: order.id, id: { not: r.id } }, select: { status: true, amount: true } });
      this.check(dto, kept + new Set(dto.proofIds).size, orderPayment(order.total, others).open, today, problems);
      await this.bump(tx, ctx, r.id, dto.version, {
        status: 'WAITING', docDate: day(dto.docDate), kind: dto.kind, method: dto.method, amount: dec(dto.amount.trim()),
        payerRef: dto.payerRef?.trim() || null, note: dto.note?.trim() || null, ...(again && { returnReason: null }),
      }, ['WAITING', 'RETURNED']);
      await this.attachments.attach(tx, ctx, dto.proofIds, SAL_ENTITY.RECEIPT, r.id);
      const what = `${receiptText({ kind: dto.kind, amount: dto.amount.trim(), method: dto.method })}, received ${dateText(dto.docDate)}`;
      await this.log(tx, ctx, SAL_ENTITY.RECEIPT, r.id, r.docNo, again ? 'sent_again' : 'saved', `${again ? 'Corrected and sent again' : 'Changed'} by ${ctx.user.name}: ${what}`);
    });
    return this.query.detail(ctx, id);
  }

  async cancel(ctx: RequestContext, id: string, dto: ReceiptReasonDto) {
    const r = await this.query.load(ctx.tenantId, id);
    this.require(ctx, r, 'cancel', `${r.docNo} is ${r.status === 'VERIFIED' ? 'verified' : 'cancelled'} and can no longer be cancelled.`);
    const reason = dto.reason.trim();
    if (!reason) throw ValidationFailedError.field('reason', 'Type why the receipt is cancelled.');
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, r.id, dto.version, { status: 'CANCELLED', cancelReason: reason }, ['WAITING', 'RETURNED']);
      await this.log(tx, ctx, SAL_ENTITY.RECEIPT, r.id, r.docNo, 'cancelled', `Cancelled by ${ctx.user.name}`, reason);
      await this.log(tx, ctx, SAL_ENTITY.ORDER, r.salesOrderId, r.salesOrderNo, 'payment_cancelled', `${r.docNo} cancelled: ${receiptText(r)}`, reason);
    });
    return this.query.detail(ctx, id);
  }

  /** Account: the receipt matches a bank transaction or a card settlement slip. It now counts as paid. */
  async verify(ctx: RequestContext, id: string, dto: VerifyReceiptDto) {
    const r = await this.query.load(ctx.tenantId, id);
    if (r.status === 'WAITING' && r.recordedByCode === ctx.user.code) {
      throw new BusinessRuleError('OWN_RECEIPT', `You recorded ${r.docNo} yourself, so someone else in Account verifies it.`);
    }
    this.require(ctx, r, 'verify', r.status === 'RETURNED' ? `${r.docNo} was sent back and waits to be corrected.` : `${r.docNo} is ${r.status.toLowerCase()} and is not waiting to be verified.`);
    const reference = dto.reference.trim();
    if (!reference) throw ValidationFailedError.field('reference', 'Type the bank transaction or card settlement reference it matches.');
    const order = await this.prisma.salSalesOrder.findFirstOrThrow({ where: { tenantId: ctx.tenantId, id: r.salesOrderId }, select: { id: true, docNo: true, total: true } });

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, r.id, dto.version, { status: 'VERIFIED', verifiedRef: reference, verifiedAt: this.clock.now(), verifiedByCode: ctx.user.code, verifiedByName: ctx.user.name }, ['WAITING']);
      const all = await tx.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: order.id }, select: { status: true, amount: true } });
      const pay = orderPayment(order.total, all);
      await this.payments.allocateForOrder(tx, ctx, order.id);
      await this.log(tx, ctx, SAL_ENTITY.RECEIPT, r.id, r.docNo, 'verified', `Verified by ${ctx.user.name} against ${reference}`);
      await this.log(tx, ctx, SAL_ENTITY.ORDER, order.id, order.docNo, 'payment_verified',
        `${r.docNo} verified: ${receiptText(r)} · ${pay.label}, ${toRm(pay.verified)} of ${toRm(order.total)}`);
      await this.outbox.publish(tx, ctx, [{
        name: SAL_EVENT.RECEIPT_VERIFIED, aggregateType: SAL_ENTITY.RECEIPT, aggregateId: r.id,
        payload: {
          orNo: r.docNo, receivedOn: r.docDate.toISOString().slice(0, 10), kind: r.kind, method: r.method, amount: toMoney(r.amount), verifiedRef: reference,
          salesOrderId: order.id, salesOrderNo: order.docNo, customerCode: r.customerCode, branchCode: r.branchCode,
          order: { total: toMoney(order.total), verified: toMoney(pay.verified), status: pay.status },
        },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  /** Account: something does not match. It goes back to whoever records receipts, with the reason. */
  async sendBack(ctx: RequestContext, id: string, dto: ReceiptReasonDto) {
    const r = await this.query.load(ctx.tenantId, id);
    this.require(ctx, r, 'sendBack', `${r.docNo} is not waiting to be verified.`);
    const reason = dto.reason.trim();
    if (!reason) throw ValidationFailedError.field('reason', 'Type what is wrong, for the person who recorded it.');
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, r.id, dto.version, { status: 'RETURNED', returnReason: reason }, ['WAITING']);
      await this.log(tx, ctx, SAL_ENTITY.RECEIPT, r.id, r.docNo, 'sent_back', `Sent back by ${ctx.user.name}`, reason);
      await this.log(tx, ctx, SAL_ENTITY.ORDER, r.salesOrderId, r.salesOrderNo, 'payment_sent_back', `${r.docNo} sent back by Account`, reason);
    });
    return this.query.detail(ctx, id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireOn(tenantId: string) {
    if (!(await this.query.isOn(tenantId))) throw new BusinessRuleError('RECEIPTS_OFF', RECEIPTS_OFF_MESSAGE);
  }

  /** The proofs' own problems, as field errors, before the transaction. */
  private async proofProblems(tenantId: string, ids: string[], receiptId: string | null): Promise<FieldError[]> {
    if (!ids.length) return [];
    const files = await this.prisma.sysAttachment.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, mimeType: true, entityType: true, entityId: true } });
    const problem = ids.map((fid) => proofError(files.find((f) => f.id === fid) ?? null, SAL_ENTITY.RECEIPT, receiptId)).find(Boolean);
    return problem ? [{ field: 'proofIds', message: problem }] : [];
  }

  private check(dto: { docDate: string; amount: string }, proofs: number, open: Prisma.Decimal, today: string, problems: FieldError[]) {
    const errors = [...receiptErrors({ docDate: dto.docDate, amount: dto.amount, proofs }, { today, open }), ...problems];
    const seen = new Set<string>();
    const unique = errors.filter((e) => (seen.has(e.field) ? false : (seen.add(e.field), true)));
    if (unique.length) throw new ValidationFailedError(unique);
  }

  /** The OR numbers are made the first time a receipt is recorded, so turning the switch on needs no set-up. */
  private async ensureSequence(tx: Tx, tenantId: string) {
    await tx.sysNumberSequence.upsert({
      where: { tenantId_docType: { tenantId, docType: SAL_DOC_TYPE.RECEIPT } },
      update: {},
      create: { tenantId, module: 'sales', docType: SAL_DOC_TYPE.RECEIPT, name: 'Official receipt', prefix: 'OR-', digits: 4, format: 'OR-{YYMM}-{####}', resetEvery: 'MONTH', printTemplate: 'Standard' },
    });
  }

  private require(ctx: RequestContext, r: SalReceipt, action: ReceiptAction, message: string) {
    if (!this.query.actions(ctx, r).includes(action)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', message);
  }

  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SalReceiptUpdateManyMutationInput, statuses: ReceiptStatus[]) {
    const result = await tx.salReceipt.updateMany({ where: { id, tenantId: ctx.tenantId, version, status: { in: statuses } }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, entityType: string, id: string, docNo: string, action: string, message: string, comment?: string | null) {
    return this.activity.log(tx, ctx, { entityType, entityId: id, docNo, action, message, comment: comment ?? null });
  }
}

const toRm = (v: Prisma.Decimal | string) => `RM ${dec(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
