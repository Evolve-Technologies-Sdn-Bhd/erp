/**
 * Service reminders (F6; CLAUDE.md → Phase 5 decision 8): an item with a service interval, set in Core, is due for
 * service that many months after it was installed or last serviced. 14 days before it is due, Service makes a service
 * job for it (Not booked, asking for the due date); completing that job starts the next reminder. Pure functions,
 * tested in reminder.rules.spec.ts.
 */

/** How far ahead a reminder becomes a job: the office books it in time. */
export const LEAD_DAYS = 14;

export const REMINDER_STATUSES = ['UPCOMING', 'JOB_MADE', 'DISMISSED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
export const REMINDER_STATUS_LABEL: Record<ReminderStatus, string> = { UPCOMING: 'Upcoming', JOB_MADE: 'Job made', DISMISSED: 'Dismissed' };

/**
 * The day a service is due: so many months after the last one, on the same day of the month, or the month's last day
 * when it has fewer days (31 Jan + 1 month = 28 Feb).
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A reminder is made into a job once it is due within the lead time (or already overdue). */
export const isTimeToMakeJob = (dueOn: string, today: string, leadDays = LEAD_DAYS) => dueOn <= addDays(today, leadDays);

/**
 * The reminders a completed visit starts: one per item with a service interval. Installation jobs list the items they
 * installed; a service job made from a reminder carries that one item on.
 */
export function remindersFrom(
  visit: { doneOn: string },
  items: { itemCode: string; itemName: string; qty: string; uomCode: string; intervalMonths: number | null }[],
): { itemCode: string; itemName: string; qty: string; uomCode: string; intervalMonths: number; lastDoneOn: string; dueOn: string }[] {
  const seen = new Set<string>();
  return items
    .filter((i) => i.intervalMonths !== null && i.intervalMonths > 0 && !seen.has(i.itemCode) && seen.add(i.itemCode))
    .map((i) => ({ ...i, intervalMonths: i.intervalMonths!, lastDoneOn: visit.doneOn, dueOn: addMonths(visit.doneOn, i.intervalMonths!) }));
}

/** The note on the service job a reminder makes. */
export function reminderJobNote(r: { itemCode: string; itemName: string; intervalMonths: number; lastDoneOn: string; fromJobNo: string }): string {
  return `Service due for ${r.itemName} (${r.itemCode}), every ${r.intervalMonths} month${r.intervalMonths === 1 ? '' : 's'}; last done ${r.lastDoneOn} on ${r.fromJobNo}.`;
}
