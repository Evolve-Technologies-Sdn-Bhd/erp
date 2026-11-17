import type { JobType } from '../jobs/jobs.rules';

/**
 * Booking rules for the Planning Board (F3 part 2; SvcBoard.html, SvcSettings.html). Kept simple on purpose (user,
 * 17 Nov 2026): fixed slots per slot group, a role per person that decides the job types they take, and no overlap
 * for one person on one day. No working hours, skills or travel. Pure functions, tested in booking.rules.spec.ts.
 */

export const PERSON_ROLES = ['INSTALLER', 'TECHNICIAN', 'WARRANTY'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];
export const PERSON_ROLE_LABEL: Record<PersonRole, string> = { INSTALLER: 'Installer', TECHNICIAN: 'Technician', WARRANTY: 'Warranty' };

/** Who takes which job (SvcSettings.html, "Who takes which job"). */
export const ROLE_JOB_TYPES: Record<PersonRole, JobType[]> = {
  INSTALLER: ['INSTALLATION'],
  TECHNICIAN: ['SERVICE', 'REPAIR'],
  WARRANTY: ['WARRANTY'],
};

export const canTake = (role: string, jobType: JobType): boolean => (ROLE_JOB_TYPES[role as PersonRole] ?? []).includes(jobType);

/** The slot groups a company starts with (SvcSettings.html), made the first time Service needs them. */
export const STARTER_SLOT_GROUPS = [
  { code: 'STANDARD', name: 'Standard', slotMinutes: 120, firstStart: 600, lastEnd: 1080, jobTypes: 'INSTALLATION', sortOrder: 1 },
  { code: 'EARLY', name: 'Early', slotMinutes: 120, firstStart: 540, lastEnd: 1020, jobTypes: 'INSTALLATION', sortOrder: 2 },
  { code: 'SHORT', name: 'Short', slotMinutes: 60, firstStart: 540, lastEnd: 1020, jobTypes: 'SERVICE,WARRANTY,REPAIR', sortOrder: 3 },
  { code: 'LONG', name: 'Long', slotMinutes: 240, firstStart: 600, lastEnd: 1080, jobTypes: 'INSTALLATION', sortOrder: 4 },
] as const;

export interface SlotGroupDef {
  code: string;
  slotMinutes: number;
  firstStart: number;
  lastEnd: number;
}

/** "10 AM", "12:30 PM" */
export function timeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "10 AM – 12 PM" */
export const slotLabel = (start: number, end: number) => `${timeLabel(start)} – ${timeLabel(end)}`;

/** The slots of a group in a day: 10–12 · 12–2 · 2–4 · 4–6 for Standard. */
export function slotsOf(g: SlotGroupDef): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (g.slotMinutes <= 0) return out;
  for (let start = g.firstStart; start + g.slotMinutes <= g.lastEnd; start += g.slotMinutes) out.push({ start, end: start + g.slotMinutes });
  return out;
}

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** A slot group's own fields: a name, a length, and a day that holds at least one slot. */
export function slotGroupErrors(g: { name: string; slotMinutes: number; firstStart: number; lastEnd: number; jobTypes: string[] }): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (!g.name.trim()) errors.push({ field: 'name', message: 'Type a name for the slot group.' });
  if (!Number.isInteger(g.slotMinutes) || g.slotMinutes < 30 || g.slotMinutes > 600 || g.slotMinutes % 30 !== 0) {
    errors.push({ field: 'slotMinutes', message: 'A slot is 30 minutes to 10 hours, in steps of 30 minutes.' });
  }
  if (g.firstStart < 0 || g.lastEnd > 24 * 60 || g.firstStart % 30 !== 0 || g.lastEnd % 30 !== 0) {
    errors.push({ field: 'firstStart', message: 'Times are on the hour or half hour.' });
  } else if (g.lastEnd - g.firstStart < g.slotMinutes) {
    errors.push({ field: 'lastEnd', message: 'The day must hold at least one slot.' });
  }
  if (!g.jobTypes.length) errors.push({ field: 'jobTypes', message: 'Pick the job types this slot group is for.' });
  return errors;
}

export interface BookingCheck {
  jobNo: string;
  jobType: JobType;
  date: string;
  today: string;
  person: { name: string; role: string; isActive: boolean };
  group: SlotGroupDef & { name: string; jobTypes: string; isActive: boolean };
  start: number;
  /** The person's other jobs that day (not cancelled), the job being moved left out. */
  taken: { docNo: string; start: number; end: number }[];
}

/** Why the booking cannot be made, or null. Messages name what is in the way. */
export function bookingRefusal(b: BookingCheck): string | null {
  if (b.date < b.today) return 'A job cannot be booked on a day that has passed.';
  if (!b.person.isActive) return `${b.person.name} is no longer active in Service.`;
  if (!canTake(b.person.role, b.jobType)) {
    return `${b.person.name} is ${PERSON_ROLE_LABEL[b.person.role as PersonRole] ?? b.person.role} and does not take ${b.jobType.toLowerCase()} jobs.`;
  }
  if (!b.group.isActive) return `The ${b.group.name} slot group is not in use.`;
  if (!b.group.jobTypes.split(',').includes(b.jobType)) return `The ${b.group.name} slot group is not for ${b.jobType.toLowerCase()} jobs.`;
  const slot = slotsOf(b.group).find((s) => s.start === b.start);
  if (!slot) return `${timeLabel(b.start)} is not a start time of the ${b.group.name} slot group.`;
  const clash = b.taken.find((t) => overlaps(t, slot));
  if (clash) return `${b.person.name} already has ${clash.docNo} at ${slotLabel(clash.start, clash.end)} that day.`;
  return null;
}
