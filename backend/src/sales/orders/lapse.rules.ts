import type { FieldError } from '../../platform/http/errors';

/**
 * The automatic cancel (phase 5): with "Cancel an order with no receipt and no delivery after a number of days" on
 * (S34), a released order with no official receipt and no delivery order is cancelled that many days after its first
 * release, through a cancel order made by the system; its salesperson and the people who release cancellations are
 * warned 7 days before and told when it happens. Pre-orders are left out (the user's choice): their stock is late,
 * not the customer. It needs official receipts on, or every order not delivered would count as unpaid. Pure functions,
 * tested in lapse.rules.spec.ts.
 */

export const WARN_DAYS = 7;
export const DEFAULT_DAYS = 60;

/** "2026-11-28" + 2 → "2026-11-30" */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** When the order is warned and when it is cancelled, from the day it was first released. */
export function lapseDates(releasedOn: string, days: number): { warnOn: string; cancelOn: string } {
  return { warnOn: addDays(releasedOn, Math.max(0, days - WARN_DAYS)), cancelOn: addDays(releasedOn, days) };
}

/** What the daily check does with one order that has no receipt and no delivery order: cancel it, warn, or nothing. */
export function lapseStep(o: { releasedOn: string; warned: boolean }, days: number, today: string): 'CANCEL' | 'WARN' | null {
  const { warnOn, cancelOn } = lapseDates(o.releasedOn, days);
  if (today >= cancelOn) return 'CANCEL';
  if (today >= warnOn && !o.warned) return 'WARN';
  return null;
}

/** The reason kept on the cancel order and in the alerts. */
export const lapseNote = (days: number) => `No official receipt and no delivery order ${days} days after release (cancelled automatically)`;

/** The days are a whole number from 1 to 365; the switch needs official receipts on. */
export function autoCancelErrors(s: { autoCancel: boolean; days: number; useReceipts: boolean }): FieldError[] {
  const errors: FieldError[] = [];
  if (!Number.isInteger(s.days) || s.days < 1 || s.days > 365) errors.push({ field: 'autoCancelDays', message: 'Type a number of days from 1 to 365.' });
  if (s.autoCancel && !s.useReceipts) {
    errors.push({ field: 'autoCancel', message: 'Turn on official receipts first: without them every order not delivered would count as unpaid.' });
  }
  return errors;
}
