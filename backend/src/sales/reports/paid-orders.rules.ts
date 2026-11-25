import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';

/**
 * Fully paid orders (S05, phase 5; the Sales Support answer: only a fully paid sales order earns commission). An order is
 * fully paid once its verified official receipts reach its total, on the day the receipt that reaches it was verified.
 * The company's commission rates are its own; this is what they are worked out from. Pure functions.
 */
export interface VerifiedReceipt {
  amount: DecimalInput;
  /** The day Account verified it, YYYY-MM-DD. */
  verifiedOn: string;
}

/** The day the order became fully paid, or null while it is not. */
export function paidOn(total: DecimalInput, receipts: VerifiedReceipt[]): string | null {
  const t = dec(total);
  if (t.lte(0)) return null;
  let paid = dec(0);
  for (const r of [...receipts].sort((a, b) => a.verifiedOn.localeCompare(b.verifiedOn))) {
    paid = paid.add(dec(r.amount));
    if (paid.gte(t)) return r.verifiedOn;
  }
  return null;
}

export interface PaidOrder {
  agentCode: string;
  agentName: string;
  beforeTax: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** Orders and amounts per salesperson, the highest first. */
export function perAgent<T extends PaidOrder>(orders: T[]): { agentCode: string; agentName: string; count: number; beforeTax: Prisma.Decimal; total: Prisma.Decimal }[] {
  const out = new Map<string, { agentCode: string; agentName: string; count: number; beforeTax: Prisma.Decimal; total: Prisma.Decimal }>();
  for (const o of orders) {
    const e = out.get(o.agentCode) ?? { agentCode: o.agentCode, agentName: o.agentName, count: 0, beforeTax: dec(0), total: dec(0) };
    e.count += 1;
    e.beforeTax = e.beforeTax.add(o.beforeTax);
    e.total = e.total.add(o.total);
    out.set(o.agentCode, e);
  }
  return [...out.values()].sort((a, b) => b.beforeTax.comparedTo(a.beforeTax) || a.agentName.localeCompare(b.agentName));
}
