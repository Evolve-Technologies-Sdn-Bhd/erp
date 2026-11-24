import { Injectable } from '@nestjs/common';
import type { Prisma, SalInvoice } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toRmText } from '../../platform/http/decimal';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { allocate } from '../receipts/allocation.rules';
import { SAL_ENTITY } from './sales.constants';
import { invoiceBalance } from './totals.rules';

export interface InvoicePayment {
  receiptNo: string;
  date: Date;
  amount: Prisma.Decimal;
  method: string;
  note: string | null;
}

/**
 * What has been paid on invoices: the payments Finance recorded (fin_receipt_stub until Finance is connected) and, with
 * "Verified receipts pay the invoices of their order" on (phase 5), the official receipts Account verified. The one place
 * every screen, report and credit check reads, so an invoice never shows two balances. An allocation is kept once made:
 * turning the switch off only stops new ones.
 */
@Injectable()
export class InvoicePayments {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Paid per invoice number. */
  async paid(tenantId: string, docNos: string[]): Promise<Map<string, Prisma.Decimal>> {
    const map = new Map<string, Prisma.Decimal>();
    if (!docNos.length) return map;
    const [finance, receipts] = await Promise.all([
      this.prisma.finReceiptStub.groupBy({ by: ['appliesToNo'], where: { tenantId, appliesToType: 'INVOICE', appliesToNo: { in: docNos } }, _sum: { amount: true } }),
      this.prisma.salReceiptAllocation.groupBy({ by: ['invoiceNo'], where: { tenantId, invoiceNo: { in: docNos } }, _sum: { amount: true } }),
    ]);
    for (const r of finance) map.set(r.appliesToNo, dec(r._sum.amount));
    for (const r of receipts) map.set(r.invoiceNo, (map.get(r.invoiceNo) ?? dec(0)).add(dec(r._sum.amount)));
    return map;
  }

  async paidOne(tenantId: string, docNo: string): Promise<Prisma.Decimal> {
    return (await this.paid(tenantId, [docNo])).get(docNo) ?? dec(0);
  }

  /** The payments of one invoice, oldest first. */
  async list(tenantId: string, docNo: string): Promise<InvoicePayment[]> {
    const [finance, receipts] = await Promise.all([
      this.prisma.finReceiptStub.findMany({ where: { tenantId, appliesToType: 'INVOICE', appliesToNo: docNo }, orderBy: { receiptDate: 'asc' } }),
      this.prisma.salReceiptAllocation.findMany({ where: { tenantId, invoiceNo: docNo }, orderBy: { paidOn: 'asc' } }),
    ]);
    return [
      ...finance.map((r) => ({ receiptNo: r.receiptNo, date: r.receiptDate, amount: r.amount, method: r.method, note: r.note })),
      ...receipts.map((r) => ({ receiptNo: r.receiptNo, date: r.paidOn, amount: r.amount, method: r.method, note: null })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  balanceOf(inv: SalInvoice, paid: Prisma.Decimal): Prisma.Decimal {
    return invoiceBalance({ total: inv.total, debited: inv.debitedAmount, credited: inv.creditedAmount, deposit: inv.depositApplied, paid });
  }

  /**
   * Counts the order's verified receipts on its released invoices, in the caller's transaction: when a receipt is verified
   * and when an invoice is released. Safe to run again: only what is left is counted.
   */
  async allocateForOrder(tx: Tx, ctx: RequestContext, salesOrderId: string): Promise<void> {
    const on = (await tx.salSetting.findUnique({ where: { tenantId: ctx.tenantId }, select: { receiptsPayInvoices: true } }))?.receiptsPayInvoices;
    if (!on) return;
    await tx.$queryRaw`SELECT id FROM sal_sales_order WHERE id = ${salesOrderId} FOR UPDATE`;
    const [receipts, invoices] = await Promise.all([
      tx.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId, status: 'VERIFIED' }, orderBy: [{ docDate: 'asc' }, { docNo: 'asc' }] }),
      tx.salInvoice.findMany({ where: { tenantId: ctx.tenantId, salesOrderId, status: 'RELEASED', isMigrated: false }, orderBy: [{ docDate: 'asc' }, { docNo: 'asc' }] }),
    ]);
    if (!receipts.length || !invoices.length) return;
    const [used, finance] = await Promise.all([
      tx.salReceiptAllocation.findMany({ where: { tenantId: ctx.tenantId, receiptId: { in: receipts.map((r) => r.id) } } }),
      tx.finReceiptStub.groupBy({ by: ['appliesToNo'], where: { tenantId: ctx.tenantId, appliesToType: 'INVOICE', appliesToNo: { in: invoices.map((i) => i.docNo) } }, _sum: { amount: true } }),
    ]);
    const total = (rows: { amount: Prisma.Decimal }[]) => rows.reduce((s, r) => s.add(r.amount), dec(0));
    const made = allocate(
      receipts.map((r) => ({ id: r.id, left: r.amount.sub(total(used.filter((u) => u.receiptId === r.id))) })),
      invoices.map((i) => ({
        id: i.id, balance: this.balanceOf(i, dec(finance.find((f) => f.appliesToNo === i.docNo)?._sum.amount).add(total(used.filter((u) => u.invoiceId === i.id)))),
      })),
    );
    for (const a of made) {
      const r = receipts.find((x) => x.id === a.receiptId)!;
      const i = invoices.find((x) => x.id === a.invoiceId)!;
      await tx.salReceiptAllocation.upsert({
        where: { receiptId_invoiceId: { receiptId: r.id, invoiceId: i.id } },
        update: { amount: { increment: a.amount } },
        create: { tenantId: ctx.tenantId, receiptId: r.id, receiptNo: r.docNo, paidOn: r.docDate, method: r.method, invoiceId: i.id, invoiceNo: i.docNo, amount: a.amount, createdBy: ctx.user.code },
      });
      await this.activity.log(tx, ctx, { entityType: SAL_ENTITY.INVOICE, entityId: i.id, docNo: i.docNo, action: 'paid', message: `${r.docNo}: ${toRmText(a.amount)} of the verified receipt counted as paid`, comment: null, afterMs: 2 });
    }
  }
}
