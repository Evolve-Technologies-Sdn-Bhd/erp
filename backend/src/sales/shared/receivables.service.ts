import { Injectable } from '@nestjs/common';
import type { Prisma, SalInvoice } from '@prisma/client';
import { dec } from '../../platform/http/decimal';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { InvoicePayments } from './invoice-payments.service';
import { invoiceBalance } from './totals.rules';

export interface OpenInvoice {
  invoice: SalInvoice;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal;
  overdue: boolean;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * What customers owe: released invoices with a balance, after returns, debit notes, deposits and the payments
 * on them (InvoicePayments: Finance's, and verified official receipts). Sales never changes a balance by hand.
 */
@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: InvoicePayments,
  ) {}

  /** Released invoices that still have a balance, optionally for some customers only. */
  async openInvoices(tenantId: string, today: string, customerCodes?: string[]): Promise<OpenInvoice[]> {
    const invoices = await this.prisma.salInvoice.findMany({
      where: { tenantId, status: 'RELEASED', ...(customerCodes && { customerCode: { in: customerCodes } }) },
    });
    return (await this.withBalances(tenantId, invoices, today)).filter((x) => x.balance.gt(0));
  }

  /** The balance of each of these released invoices, paid ones included. */
  async withBalances(tenantId: string, invoices: SalInvoice[], today: string): Promise<OpenInvoice[]> {
    const receipts = await this.payments.paid(tenantId, invoices.map((v) => v.docNo));
    return invoices.map((invoice) => {
      const paid = receipts.get(invoice.docNo) ?? dec(0);
      const balance = invoiceBalance({ total: invoice.total, debited: invoice.debitedAmount, credited: invoice.creditedAmount, deposit: invoice.depositApplied, paid });
      return { invoice, paid: dec(paid), balance, overdue: Boolean(invoice.dueDate && iso(invoice.dueDate)! < today) };
    });
  }
}
