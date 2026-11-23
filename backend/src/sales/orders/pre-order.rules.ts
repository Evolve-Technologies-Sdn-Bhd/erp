/**
 * Pre-orders (phase 5): with "Short stock makes the order a pre-order" on (S34), an order released with any stock item
 * short is a pre-order as a whole, not split (a company's Sales Admin asked for this; it may stay a special case). It
 * stays marked, and shows "Stock arrived" once its open quantities are in stock; the office then carries on as usual,
 * nobody releases it again (the user's choice, 23 Nov 2026). Stock is not reserved yet, so "short" is against what is on
 * hand. Pure functions, tested in pre-order.rules.spec.ts.
 */

/** At release: short stock makes the whole order a pre-order while the company asks for it. */
export function preOrderAtRelease(switchOn: boolean, shortfall: string | null): { isPreOrder: boolean; note: string | null } {
  if (!switchOn || !shortfall) return { isPreOrder: false, note: null };
  return { isPreOrder: true, note: shortfall.slice(0, 300) };
}

/** The line in the order's activity when it goes out as a pre-order. */
export const preOrderActivity = (shortfall: string) => `Released as a pre-order: ${shortfall}. The whole order waits for stock.`;

/**
 * Where a pre-order stands: waiting for stock while any open quantity is short, then "Stock arrived". A pre-order that
 * is done or cancelled just says Pre-order. Null for an order that is not one.
 */
export function preOrderState(o: { isPreOrder: boolean; status: string }, shortNow: string | null): { label: string; stockArrived: boolean } | null {
  if (!o.isPreOrder) return null;
  if (o.status !== 'RELEASED' && o.status !== 'PARTIAL') return { label: 'Pre-order', stockArrived: false };
  return shortNow ? { label: 'Pre-order · waiting for stock', stockArrived: false } : { label: 'Pre-order · stock arrived', stockArrived: true };
}
