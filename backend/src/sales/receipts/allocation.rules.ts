import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';

/**
 * Verified official receipts pay their order's released invoices (phase 5): the oldest receipt first, on the oldest
 * invoice first, never more than the invoice's balance or what is left of the receipt. What an order has paid beyond its
 * invoices so far (a deposit before delivery) waits for the next one. Pure function, tested in allocation.rules.spec.ts.
 */
export function allocate(
  receipts: { id: string; left: DecimalInput }[],
  invoices: { id: string; balance: DecimalInput }[],
): { receiptId: string; invoiceId: string; amount: Prisma.Decimal }[] {
  const out: { receiptId: string; invoiceId: string; amount: Prisma.Decimal }[] = [];
  const owed = invoices.map((i) => ({ id: i.id, balance: dec(i.balance) }));
  for (const r of receipts) {
    let left = dec(r.left);
    for (const i of owed) {
      if (left.lte(0)) break;
      if (i.balance.lte(0)) continue;
      const amount = left.lt(i.balance) ? left : i.balance;
      out.push({ receiptId: r.id, invoiceId: i.id, amount });
      left = left.sub(amount);
      i.balance = i.balance.sub(amount);
    }
  }
  return out;
}
