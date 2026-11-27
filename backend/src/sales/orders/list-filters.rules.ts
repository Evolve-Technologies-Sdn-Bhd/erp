import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';

/**
 * Order list filters for the salesperson's home (phase 5): where an order's installation stands, from what Service told
 * Sales (installBooking, installBookedFor, installDoneAt), and how much of it is paid by verified official receipts.
 * Pure functions, tested in list-filters.rules.spec.ts.
 */

export const INSTALL_FILTERS = ['today', 'toBook', 'dateTbc', 'donePaymentPending'] as const;
export type InstallFilter = (typeof INSTALL_FILTERS)[number];

/** unpaid: nothing verified; partial: some; notPaid: either; paid: verified receipts reach the total. */
export const PAYMENT_FILTERS = ['unpaid', 'partial', 'notPaid', 'paid'] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

/** Orders that are out: released, part delivered or done (not drafts, not waiting for approval, not cancelled). */
const LIVE: Prisma.SalSalesOrderWhereInput = { status: { in: ['RELEASED', 'PARTIAL', 'DONE'] } };

/**
 * today: the installer is booked for today. toBook: an installation the office has not booked yet. dateTbc: of those,
 * the ones without the customer's preferred day. donePaymentPending: installed (complete), the order not fully paid
 * (the payment part is added with paymentWhere('notPaid')).
 */
export function installWhere(kind: InstallFilter, today: Date): Prisma.SalSalesOrderWhereInput {
  const notBooked: Prisma.SalSalesOrderWhereInput = { ...LIVE, installOption: 'INSTALLATION', installBooking: null, installDoneAt: null };
  switch (kind) {
    case 'today':
      return { ...LIVE, installBookedFor: today };
    case 'toBook':
      return notBooked;
    case 'dateTbc':
      return { ...notBooked, installDate: null };
    case 'donePaymentPending':
      return { ...LIVE, installDoneAt: { not: null } };
  }
}

/** Which orders are fully paid and which partly, from the verified receipts added up per order. */
export function paymentSets(verified: { salesOrderId: string; amount: DecimalInput }[], totals: Map<string, DecimalInput>) {
  const paid: string[] = [];
  const partial: string[] = [];
  for (const v of verified) {
    const total = totals.get(v.salesOrderId);
    if (total === undefined || !dec(v.amount).gt(0)) continue;
    if (dec(total).gt(0) && dec(v.amount).gte(dec(total))) paid.push(v.salesOrderId);
    else partial.push(v.salesOrderId);
  }
  return { paid, partial };
}

export function paymentWhere(kind: PaymentFilter, sets: { paid: string[]; partial: string[] }): Prisma.SalSalesOrderWhereInput {
  switch (kind) {
    case 'paid':
      return { ...LIVE, id: { in: sets.paid } };
    case 'partial':
      return { ...LIVE, id: { in: sets.partial } };
    case 'unpaid':
      return { ...LIVE, id: { notIn: [...sets.paid, ...sets.partial] } };
    case 'notPaid':
      return { ...LIVE, id: { notIn: sets.paid } };
  }
}
