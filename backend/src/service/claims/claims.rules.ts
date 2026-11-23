import { dec } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';
import { momentAt } from '../jobs/timing.rules';

/**
 * Installer claims (F5; the client's Account Manager, 18 Nov 2026): installers bill per job with their own company
 * invoice (or a self-billed one Account makes); technicians do not claim. Only complete jobs whose order is fully paid
 * are claimed, each once. A job the installer did not update within 72 hours of its expected finish gets no fee by
 * rule. Two claim periods a month: the 1st to the 15th, paid on the 25th; the 16th to the month end, paid on the 10th
 * of the next month. Account checks and approves; whoever submitted a claim never approves it. The fee per job comes
 * from its category (slot group) until the client gives its rates; another amount needs a reason. Pure functions,
 * tested in claims.rules.spec.ts.
 */

export const LATE_HOURS = 72;

export const CLAIM_STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'PAID', 'CANCELLED'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Waiting for Account', RETURNED: 'Sent back', APPROVED: 'Approved', PAID: 'Paid', CANCELLED: 'Cancelled',
};

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** The claim period a day falls in, and its pay day: 1–15 paid on the 25th; 16–end paid on the 10th of next month. */
export function claimPeriod(day: string): { start: string; end: string; payOn: string } {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  if (d <= 15) return { start: iso(y, m - 1, 1), end: iso(y, m - 1, 15), payOn: iso(y, m - 1, 25) };
  return { start: iso(y, m - 1, 16), end: iso(y, m - 1, lastDay(y, m - 1)), payOn: iso(y, m, 10) };
}

/** "1–15 Oct 2026" */
export function periodText(p: { start: string; end: string }): string {
  const s = new Date(`${p.start}T00:00:00Z`);
  const e = new Date(`${p.end}T00:00:00Z`);
  const month = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${s.getUTCDate()}–${e.getUTCDate()} ${month}`;
}

/** Updated more than 72 hours after the expected finish (the slot end, or later when extended). */
export function updatedLate(j: { jobDate: string; expectedEnd: number }, recordedAt: Date): boolean {
  return recordedAt.getTime() - momentAt(j.jobDate, j.expectedEnd).getTime() > LATE_HOURS * 3_600_000;
}

/** A job as a claim looks at it. */
export interface ClaimableJob {
  docNo: string;
  stage: string;
  result: string | null;
  personId: string | null;
  jobDate: string | null;
  /** From the order's verified receipts; null for a job without an order. */
  orderPayment: string | null;
  salesOrderNo: string | null;
  /** Already on another claim that is not cancelled. */
  claimedOn: string | null;
}

/** Why the job cannot go on this person's claim for this period, or null. */
export function claimRefusal(j: ClaimableJob, personId: string, period: { start: string; end: string }): string | null {
  if (j.personId !== personId) return `${j.docNo} was not done by this person.`;
  if (j.stage !== 'DONE' && j.stage !== 'CLOSED') return `${j.docNo} is not done yet.`;
  if (j.result !== 'COMPLETE') return `${j.docNo} was not completed (only complete jobs are claimed).`;
  if (!j.jobDate || j.jobDate < period.start || j.jobDate > period.end) return `${j.docNo} was not done in this claim period.`;
  if (j.salesOrderNo && j.orderPayment !== 'FULLY_PAID') return `${j.docNo}: ${j.salesOrderNo} is not fully paid yet (verified receipts).`;
  if (j.claimedOn) return `${j.docNo} is already on ${j.claimedOn}.`;
  return null;
}

/** The fee by rule: the category's fee, or nothing when updated late or no fee is set. */
export function referenceFee(categoryFee: string | null, late: boolean): string {
  return late || !categoryFee ? '0.00' : dec(categoryFee).toFixed(2);
}

/** Each line: an amount of 0 or more; one different from the fee by rule needs a reason. */
export function lineErrors(lines: { amount: string; referenceAmount: string; reason?: string | null }[]): FieldError[] {
  const errors: FieldError[] = [];
  lines.forEach((l, i) => {
    if (!/^\d{1,14}(\.\d{1,2})?$/.test(l.amount)) errors.push({ field: `lines[${i}].amount`, message: 'Type an amount like 120.00.' });
    else if (!dec(l.amount).eq(dec(l.referenceAmount)) && !l.reason?.trim()) {
      errors.push({ field: `lines[${i}].reason`, message: `Say why the amount is not ${dec(l.referenceAmount).toFixed(2)}, the fee by rule.` });
    }
  });
  return errors;
}

/** To submit: at least one job, and the installer's invoice number and PDF unless Account bills for them. */
export function submitErrors(c: { lines: number; invoiceNo: string | null; selfBilled: boolean; invoiceFiles: number }): FieldError[] {
  const errors: FieldError[] = [];
  if (!c.lines) errors.push({ field: 'jobIds', message: 'Pick at least one job to claim.' });
  if (!c.selfBilled && !c.invoiceNo?.trim()) errors.push({ field: 'invoiceNo', message: "Type the installer's invoice number, or tick Self-billed." });
  if (!c.selfBilled && !c.invoiceFiles) errors.push({ field: 'invoiceFileIds', message: "Add the installer's invoice (PDF or photo), or tick Self-billed." });
  return errors;
}

export type ClaimAction = 'edit' | 'submit' | 'cancel' | 'approve' | 'return' | 'pay';

/** Who may do what with a claim now. Whoever submitted a claim never approves it. */
export function allowedClaimActions(status: ClaimStatus, can: { edit: boolean; approve: boolean }, submittedByMe: boolean): ClaimAction[] {
  const out: ClaimAction[] = [];
  if ((status === 'DRAFT' || status === 'RETURNED') && can.edit) out.push('edit', 'submit', 'cancel');
  if (status === 'SUBMITTED' && can.approve && !submittedByMe) out.push('approve', 'return');
  if (status === 'APPROVED' && can.approve) out.push('pay');
  return out;
}

/** A file kept as the installer's invoice: a PDF or a photo, not already kept on another document. */
export function invoiceFileError(f: { mimeType: string; entityType: string | null; entityId: string | null } | null, claimId: string | null): string | null {
  if (!f) return 'The invoice file was not found. Add it again.';
  if (f.mimeType !== 'application/pdf' && !f.mimeType.startsWith('image/')) return 'The invoice must be a PDF or a photo.';
  if (f.entityId && !(f.entityType === 'SVC_CLAIM' && f.entityId === claimId)) return 'This file is already kept on another document.';
  return null;
}
