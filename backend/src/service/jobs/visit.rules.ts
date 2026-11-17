import type { FieldError } from '../../platform/http/errors';

/**
 * What the installer records at the end of a visit (F3 part 3; CLAUDE.md → Installation module, "Installer's part").
 * Kept simple (user, 17 Nov 2026): a result, a photo, paid or not paid. Payments themselves are out of scope
 * (decision 5): "paid on site" is the installer's note for the office. Pure functions, tested in visit.rules.spec.ts.
 */

export const RESULTS = ['COMPLETE', 'PARTIAL', 'POSTPONED'] as const;
export type VisitResult = (typeof RESULTS)[number];
export const RESULT_LABEL: Record<VisitResult, string> = { COMPLETE: 'Complete', PARTIAL: 'Partly done', POSTPONED: 'Postponed' };

export const PAID_STATUSES = ['PAID', 'NOT_PAID', 'NO_CHARGE'] as const;
export type PaidStatus = (typeof PAID_STATUSES)[number];
export const PAID_LABEL: Record<PaidStatus, string> = { PAID: 'Paid on site', NOT_PAID: 'Not paid', NO_CHARGE: 'No charge' };

export const PAID_METHODS = ['CASH', 'TRANSFER', 'CARD', 'CHEQUE'] as const;
export type PaidMethod = (typeof PAID_METHODS)[number];
export const METHOD_LABEL: Record<PaidMethod, string> = { CASH: 'cash', TRANSFER: 'bank transfer', CARD: 'card', CHEQUE: 'cheque' };

export interface VisitInput {
  result: VisitResult;
  reason?: string | null;
  arrivedAt?: string | null;
  finishedAt?: string | null;
  paidStatus?: PaidStatus | null;
  paidMethod?: PaidMethod | null;
  notPaidReason?: string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A visit that happened needs at least one photo and whether the customer paid (with why not); partly done needs
 * the reason; postponed needs the reason and nothing else. Times are optional, and the finish is after the arrival.
 */
export function visitErrors(v: VisitInput, photos: number): FieldError[] {
  const errors: FieldError[] = [];
  const reason = v.reason?.trim();
  if (v.result !== 'COMPLETE' && !reason) {
    errors.push({ field: 'reason', message: v.result === 'POSTPONED' ? 'Type why the visit is postponed.' : 'Type what is left to do.' });
  }
  for (const key of ['arrivedAt', 'finishedAt'] as const) {
    const t = v[key];
    if (t && !TIME.test(t)) errors.push({ field: key, message: 'Times look like 10:06.' });
  }
  if (v.arrivedAt && v.finishedAt && TIME.test(v.arrivedAt) && TIME.test(v.finishedAt) && v.finishedAt <= v.arrivedAt) {
    errors.push({ field: 'finishedAt', message: 'The finish is after the arrival.' });
  }
  if (v.result === 'POSTPONED') return errors;
  if (photos < 1) errors.push({ field: 'photos', message: 'Add at least one photo of the work.' });
  if (!v.paidStatus) errors.push({ field: 'paidStatus', message: 'Say whether the customer paid on site.' });
  if (v.paidStatus === 'NOT_PAID' && !v.notPaidReason?.trim()) errors.push({ field: 'notPaidReason', message: 'Type why the customer did not pay.' });
  return errors;
}

/** "Complete · paid on site by bank transfer", "Partly done · not paid: will pay next visit", "Postponed: customer not in". */
export function visitText(v: { result: VisitResult; reason?: string | null; paidStatus?: PaidStatus | null; paidMethod?: PaidMethod | null; notPaidReason?: string | null }): string {
  const head = RESULT_LABEL[v.result];
  if (v.result === 'POSTPONED') return `${head}: ${v.reason?.trim() ?? ''}`;
  const paid = v.paidStatus === 'PAID'
    ? `paid on site${v.paidMethod ? ` by ${METHOD_LABEL[v.paidMethod]}` : ''}`
    : v.paidStatus === 'NOT_PAID' ? `not paid: ${v.notPaidReason?.trim() ?? ''}` : 'no charge';
  return `${head} · ${paid}`;
}
