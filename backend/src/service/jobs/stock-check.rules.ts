import { dec } from '../../platform/http/decimal';
import type { BusinessNow } from './timing.rules';

/**
 * Stock not ready 24 hours before a booked installation (phase 5; a company's Sales Admin asked for an alert to them
 * and the salesperson): the job is marked At risk and they are told. It clears when the stock is there at a later
 * check, or the job is moved off the board or done. Stock is read, not reserved. Pure functions, tested in
 * stock-check.rules.spec.ts.
 */

export const CHECK_HOURS = 24;

/** Hours from now until the slot starts, in the business timezone. */
export function hoursUntil(j: { jobDate: string; slotStart: number }, now: BusinessNow): number {
  const days = (Date.parse(`${j.jobDate}T00:00:00Z`) - Date.parse(`${now.date}T00:00:00Z`)) / 86_400_000;
  return (days * 1440 + j.slotStart - now.minutes) / 60;
}

/** A booked job is checked from 24 hours before its slot until it starts. */
export function dueForCheck(j: { jobDate: string; slotStart: number }, now: BusinessNow): boolean {
  const h = hoursUntil(j, now);
  return h > 0 && h <= CHECK_HOURS;
}

/** "CH-DIN-01: 0 in stock, 2 needed": the stock items short, quantities added up per item. Null when all are there. */
export function stockShort(items: { itemCode: string; qty: string; onHand: string; isStock: boolean }[]): string | null {
  const need = new Map<string, { qty: ReturnType<typeof dec>; onHand: ReturnType<typeof dec> }>();
  for (const i of items.filter((x) => x.isStock)) {
    const n = need.get(i.itemCode);
    need.set(i.itemCode, { qty: (n?.qty ?? dec(0)).add(dec(i.qty)), onHand: dec(i.onHand) });
  }
  const short = [...need].filter(([, n]) => n.onHand.lt(n.qty)).map(([code, n]) => `${code}: ${n.onHand.toString()} in stock, ${n.qty.toString()} needed`);
  return short.length ? short.join('; ') : null;
}
