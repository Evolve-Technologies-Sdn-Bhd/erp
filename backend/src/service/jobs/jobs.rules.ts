import type { FieldError } from '../../platform/http/errors';

/**
 * Job rules (CLAUDE.md → Phase 5 · Installation module; SvcJobs.html, SvcJob.html). Pure functions, tested in
 * jobs.rules.spec.ts. F3 part 1 makes and cancels jobs; booking (part 2) and the installer's part (part 3) add the
 * stages after Not booked.
 */

export const JOB_TYPES = ['INSTALLATION', 'SERVICE', 'WARRANTY', 'REPAIR'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABEL: Record<JobType, string> = { INSTALLATION: 'Installation', SERVICE: 'Service', WARRANTY: 'Warranty', REPAIR: 'Repair' };

/** In the order of the job's life (SvcJob.html stage bar), then Cancelled. */
export const JOB_STAGES = ['NOT_BOOKED', 'BOOKED', 'ACCEPTED', 'DONE', 'CHECKED', 'CLOSED', 'CANCELLED'] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  NOT_BOOKED: 'Not booked', BOOKED: 'Booked', ACCEPTED: 'Accepted', DONE: 'Done', CHECKED: 'Checked', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

export type JobAction = 'edit' | 'cancel' | 'book' | 'unbook' | 'extend' | 'record' | 'close' | 'followUp';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Thu, 1 Oct" */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * What the office may do with a job. Stages kept simple (user, 17 Nov 2026): Not booked → Booked → Done → Closed, or
 * Cancelled. Accepted and Checked stay unused until the phone app or an office check is asked for.
 * - Not booked: change, cancel, book.
 * - Booked: change, cancel, move to another slot, take off the board, extend the expected completion (F3 part 4),
 *   record the visit (F3 part 3).
 * - Done: close; a partly done job also offers one follow-up job. Closed and Cancelled are kept as they are.
 */
export function allowedJobActions(
  stage: JobStage,
  can: { edit: boolean; book: boolean; record?: boolean },
  job: { partial?: boolean; hasFollowUp?: boolean } = {},
): JobAction[] {
  const out: JobAction[] = [];
  if (stage === 'NOT_BOOKED' || stage === 'BOOKED') {
    if (can.edit) out.push('edit', 'cancel');
    if (can.book) out.push('book');
    if (can.book && stage === 'BOOKED') out.push('unbook', 'extend');
    if (can.record && stage === 'BOOKED') out.push('record');
  }
  if (stage === 'DONE' && can.book) out.push('close');
  if (stage === 'DONE' && can.edit && job.partial && !job.hasFollowUp) out.push('followUp');
  return out;
}

/** "Asks for Thu, 1 Oct", "After stock arrives" or "—": what the customer wants, for a job not booked yet (SvcJobs.html). */
export function waitingText(j: { preferredDate: string | null; afterStock: boolean }): string {
  if (j.preferredDate) return `Asks for ${shortDay(j.preferredDate)}`;
  return j.afterStock ? 'After stock arrives' : '—';
}

/**
 * What a released sales order says about installation (Sales' `sales.order.released`, F1 part 5). Only an order with
 * the Installation option makes a job; anything unreadable is ignored.
 */
export interface ReleasedOrder {
  soNo: string;
  branchCode: string;
  customerCode: string;
  customerName: string;
  contactName: string | null;
  deliveryAddress: string | null;
  postcode: string | null;
  state: string | null;
  preferredDate: string | null;
  afterStock: boolean;
  lines: { itemCode: string; uomCode: string; qty: string }[];
}

export function readReleasedOrder(payload: unknown): ReleasedOrder | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p.soNo !== 'string' || typeof p.customerCode !== 'string' || typeof p.branchCode !== 'string') return null;
  const inst = p.installation as { option?: unknown; preferredDate?: unknown; afterStock?: unknown } | null | undefined;
  if (!inst || inst.option !== 'INSTALLATION') return null;
  const lines = Array.isArray(p.lines) ? p.lines : [];
  return {
    soNo: p.soNo,
    branchCode: p.branchCode,
    customerCode: p.customerCode,
    customerName: typeof p.customerName === 'string' ? p.customerName : p.customerCode,
    contactName: typeof p.contactName === 'string' ? p.contactName : null,
    deliveryAddress: typeof p.deliveryAddress === 'string' ? p.deliveryAddress : null,
    postcode: typeof p.deliveryPostcode === 'string' && p.deliveryPostcode ? p.deliveryPostcode : null,
    state: typeof p.deliveryState === 'string' && p.deliveryState ? p.deliveryState : null,
    preferredDate: typeof inst.preferredDate === 'string' ? inst.preferredDate : null,
    afterStock: inst.afterStock === true,
    lines: lines
      .map((l) => l as { itemCode?: unknown; uomCode?: unknown; qty?: unknown })
      .filter((l) => typeof l.itemCode === 'string' && typeof l.qty === 'string')
      .map((l) => ({ itemCode: l.itemCode as string, uomCode: typeof l.uomCode === 'string' ? l.uomCode : '', qty: l.qty as string })),
  };
}

/** A job the office adds by hand: a type, a site to go to, and a preferred date not in the past. */
export function manualJobErrors(j: { jobType: string; siteAddress: string | null; preferredDate: string | null }, today: string): FieldError[] {
  const errors: FieldError[] = [];
  if (!(JOB_TYPES as readonly string[]).includes(j.jobType)) errors.push({ field: 'jobType', message: 'Pick installation, service, warranty or repair.' });
  if (!j.siteAddress?.trim()) errors.push({ field: 'siteAddress', message: 'Type the address the installer goes to.' });
  if (j.preferredDate && j.preferredDate < today) errors.push({ field: 'preferredDate', message: 'The preferred date cannot be in the past.' });
  return errors;
}

/**
 * What the office needs before booking a job: the customer's name, a contact number, the install address, its
 * postcode and its state. Missing ones are shown on the Planning Board and the job page; booking is never stopped
 * (a company's Sales Admin asked for a warning, not a block).
 */
export const BOOKING_NEEDS = [
  { key: 'customerName', label: 'customer name' },
  { key: 'phone', label: 'contact number' },
  { key: 'siteAddress', label: 'install address' },
  { key: 'postcode', label: 'postcode' },
  { key: 'state', label: 'state' },
] as const;

/** ["postcode", "state"]: what the job still lacks before booking, in the order the office fills it in. */
export function missingForBooking(j: Record<(typeof BOOKING_NEEDS)[number]['key'], string | null>): string[] {
  return BOOKING_NEEDS.filter((n) => !j[n.key]?.trim()).map((n) => n.label);
}

/** "Missing before booking: postcode and state." */
export function missingText(missing: string[]): string | null {
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `Missing before booking: ${list}.`;
}

/** What a job not booked yet, or booked, still lacks for the office; nothing once the visit is done. */
export function bookingNeeds(j: { stage: string } & Parameters<typeof missingForBooking>[0]): { missingForBooking: string[]; missingText: string | null } {
  const missing = j.stage === 'NOT_BOOKED' || j.stage === 'BOOKED' ? missingForBooking(j) : [];
  return { missingForBooking: missing, missingText: missingText(missing) };
}
