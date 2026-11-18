import { BUSINESS_TIMEZONE, businessDate } from '../../platform/clock/clock.rules';
import type { FieldError } from '../../platform/http/errors';
import { timeLabel } from '../board/booking.rules';
import { shortDay, type JobStage } from './jobs.rules';

/**
 * When a booked job should be finished, and when it is overdue (F3 part 4; the Sales Admin diagram: "admin confirms
 * the expected completion", "can extend it with a reason", "the overdue flag stays until done"). Pure functions,
 * tested in timing.rules.spec.ts.
 *
 * - The expected completion starts at the end of the booked slot. The office can extend it to later that day, with a
 *   reason; the person stays busy until then on the Planning Board.
 * - A job is overdue once its expected completion has passed and its visit is not recorded. It then stays overdue,
 *   whether it is extended, moved or taken off the board, until the visit is recorded (complete, partly done or
 *   postponed) or the job is cancelled.
 */

/** Where the business clock is: the business date and the minutes since midnight. */
export interface BusinessNow {
  date: string;
  minutes: number;
}

/** Minutes from midnight of a moment, in the business timezone: 2026-09-29T06:30Z → 870 (2:30 PM in Kuala Lumpur). */
export function minutesOfDay(moment: Date, timeZone = BUSINESS_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(moment);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export const businessNow = (moment: Date, today: string): BusinessNow => ({ date: today, minutes: minutesOfDay(moment) });

/** The timezone's offset from UTC at a moment, in milliseconds. */
function offsetMs(moment: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(moment));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - moment;
}

/** The moment a business date and a time of day stand for: ("2026-10-01", 840) → 2 PM on 1 Oct in Kuala Lumpur. */
export function momentAt(isoDate: string, minutes: number, timeZone = BUSINESS_TIMEZONE): Date {
  const naive = Date.parse(`${isoDate}T00:00:00Z`) + minutes * 60_000;
  return new Date(naive - offsetMs(naive, timeZone));
}

/** "Thu, 1 Oct, 2 PM" */
export function momentText(moment: Date, timeZone = BUSINESS_TIMEZONE): string {
  return `${shortDay(businessDate(moment, timeZone))}, ${timeLabel(minutesOfDay(moment, timeZone))}`;
}

export interface JobTiming {
  stage: JobStage | string;
  jobDate: string | null;
  slotEnd: number | null;
  /** Null for a job booked before F3 part 4 was installed: the slot end then. */
  expectedEnd: number | null;
  overdueSince: Date | null;
}

/** The stages before the visit is recorded. */
const BEFORE_VISIT = ['NOT_BOOKED', 'BOOKED', 'ACCEPTED'];
const BOOKED = ['BOOKED', 'ACCEPTED'];

export const expectedEndOf = (j: Pick<JobTiming, 'slotEnd' | 'expectedEnd'>): number | null => j.expectedEnd ?? j.slotEnd;

/** A booked job whose expected completion has passed. */
export function isLate(j: JobTiming, now: BusinessNow): boolean {
  const end = expectedEndOf(j);
  if (!BOOKED.includes(j.stage) || !j.jobDate || end === null) return false;
  return j.jobDate < now.date || (j.jobDate === now.date && now.minutes >= end);
}

/**
 * Whether the job is overdue now, and since when. A job that is no longer waiting for its visit is not overdue, but
 * keeps `since` when it was late, so its page can say it was done late.
 */
export function overdueOf(j: JobTiming, now: BusinessNow, timeZone = BUSINESS_TIMEZONE): { overdue: boolean; since: Date | null } {
  if (!BEFORE_VISIT.includes(j.stage)) return { overdue: false, since: j.overdueSince };
  if (j.overdueSince) return { overdue: true, since: j.overdueSince };
  if (isLate(j, now)) return { overdue: true, since: momentAt(j.jobDate!, expectedEndOf(j)!, timeZone) };
  return { overdue: false, since: null };
}

/** What to keep in `overdueSince` before a change that moves the job's times, so the flag is never lost. */
export const stickyOverdue = (j: JobTiming, now: BusinessNow, timeZone = BUSINESS_TIMEZONE): Date | null => {
  const o = overdueOf(j, now, timeZone);
  return o.overdue ? o.since : j.overdueSince;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "16:30" → 990, or null. */
export function parseTime(t: string | null | undefined): number | null {
  if (!t || !TIME.test(t)) return null;
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** An extension needs a reason and a time later that day than the expected completion now. */
export function extendErrors(e: { until: string; reason: string }, currentEnd: number): FieldError[] {
  const errors: FieldError[] = [];
  const until = parseTime(e.until);
  if (until === null) errors.push({ field: 'until', message: 'Times look like 16:30.' });
  else if (until <= currentEnd) errors.push({ field: 'until', message: `Pick a time after ${timeLabel(currentEnd)}, the expected completion now.` });
  if (!e.reason.trim()) errors.push({ field: 'reason', message: 'Type why the job needs longer.' });
  return errors;
}

/** The person's later jobs that day that an extended job now runs into: they will start late. */
export function runsInto(job: { start: number; end: number }, others: { docNo: string; start: number; end: number }[]): { docNo: string; start: number; end: number }[] {
  return others.filter((o) => o.start >= job.start && o.start < job.end).sort((a, b) => a.start - b.start);
}
