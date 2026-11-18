import type { JobType } from '../jobs/jobs.rules';

/**
 * Booking rules for the Planning Board (F3 part 2; SvcBoard.html, SvcSettings.html). Kept simple on purpose (user,
 * 17 Nov 2026): fixed slots per slot group, the job types and site types each person takes (F3 part 4), and no
 * overlap for one person on one day. No working hours, skills or travel. Pure functions, tested in booking.rules.spec.ts.
 */

export const PERSON_ROLES = ['INSTALLER', 'TECHNICIAN', 'WARRANTY'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];
export const PERSON_ROLE_LABEL: Record<PersonRole, string> = { INSTALLER: 'Installer', TECHNICIAN: 'Technician', WARRANTY: 'Warranty' };

/**
 * The job types a new person starts with, from their role. Since F3 part 4 each person keeps their own list, because
 * installers also take some warranty jobs and technicians some installations: after that the role is only a label.
 */
export const ROLE_JOB_TYPES: Record<PersonRole, JobType[]> = {
  INSTALLER: ['INSTALLATION'],
  TECHNICIAN: ['SERVICE', 'REPAIR'],
  WARRANTY: ['WARRANTY'],
};

/** The kind of site a job is at, so the office books someone who suits it (F3 part 4). A fixed list for now. */
export const SITE_TYPES = ['LANDED', 'CONDO', 'COMMERCIAL'] as const;
export type SiteType = (typeof SITE_TYPES)[number];
export const SITE_TYPE_LABEL: Record<SiteType, string> = { LANDED: 'Landed house', CONDO: 'Condo / apartment', COMMERCIAL: 'Shop / office' };

/** A comma list kept in a column ("INSTALLATION,WARRANTY"), as a list. */
export const listOf = (v: string | null | undefined): string[] => (v ?? '').split(',').filter(Boolean);

/** Whether a person takes a job type, from their own list. */
export const canTake = (personJobTypes: string, jobType: JobType): boolean => listOf(personJobTypes).includes(jobType);

/** Whether a person goes to a site of this type. A job whose site type is not set suits everyone. */
export const goesTo = (personSiteTypes: string, siteType: string | null): boolean => !siteType || listOf(personSiteTypes).includes(siteType);

/** What a person takes and where they go: at least one of each. */
export function personErrors(p: { jobTypes: string[]; siteTypes: string[] }): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (!p.jobTypes.length) errors.push({ field: 'jobTypes', message: 'Pick the jobs this person takes.' });
  if (!p.siteTypes.length) errors.push({ field: 'siteTypes', message: 'Pick the sites this person goes to.' });
  return errors;
}

/**
 * The slot groups a company starts with (SvcSettings.html), made the first time Service needs them. `defaultFor` is
 * the job types the board picks the group for first (F3 part 4).
 */
export const STARTER_SLOT_GROUPS = [
  { code: 'STANDARD', name: 'Standard', slotMinutes: 120, firstStart: 600, lastEnd: 1080, jobTypes: 'INSTALLATION', defaultFor: 'INSTALLATION', sortOrder: 1 },
  { code: 'EARLY', name: 'Early', slotMinutes: 120, firstStart: 540, lastEnd: 1020, jobTypes: 'INSTALLATION', defaultFor: '', sortOrder: 2 },
  { code: 'SHORT', name: 'Short', slotMinutes: 60, firstStart: 540, lastEnd: 1020, jobTypes: 'SERVICE,WARRANTY,REPAIR', defaultFor: 'SERVICE,WARRANTY,REPAIR', sortOrder: 3 },
  { code: 'LONG', name: 'Long', slotMinutes: 240, firstStart: 600, lastEnd: 1080, jobTypes: 'INSTALLATION', defaultFor: '', sortOrder: 4 },
] as const;

export interface SlotGroupDef {
  code: string;
  slotMinutes: number;
  firstStart: number;
  lastEnd: number;
}

/** "10 AM", "12:30 PM" */
export function timeLabel(minutes: number): string {
  if (minutes >= 24 * 60) return 'midnight';
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

/** Until when a booked job keeps its person busy: the end of its slot, or later when the office extended it. */
export const busyEnd = (j: { slotEnd: number; expectedEnd: number | null }) => Math.max(j.slotEnd, j.expectedEnd ?? j.slotEnd);

/** The slot group the board picks first for a job type: the one marked as its default, else the first that fits. */
export function defaultGroupFor<G extends { jobTypes: string[]; defaultFor: string[] }>(groups: G[], jobType: string): G | null {
  const fits = groups.filter((g) => g.jobTypes.includes(jobType));
  return fits.find((g) => g.defaultFor.includes(jobType)) ?? fits[0] ?? null;
}

/** A slot group's own fields: a name, a length, a day that holds at least one slot, and defaults it is used for. */
export function slotGroupErrors(g: { name: string; slotMinutes: number; firstStart: number; lastEnd: number; jobTypes: string[]; defaultFor?: string[] }): { field: string; message: string }[] {
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
  else if ((g.defaultFor ?? []).some((t) => !g.jobTypes.includes(t))) {
    errors.push({ field: 'defaultFor', message: 'A slot group can only be the default for job types it is used for.' });
  }
  return errors;
}

export interface BookingCheck {
  jobNo: string;
  jobType: JobType;
  /** The job's site type, or null while the office has not set it. */
  siteType: string | null;
  date: string;
  today: string;
  person: { name: string; role: string; isActive: boolean; jobTypes: string; siteTypes: string };
  group: SlotGroupDef & { name: string; jobTypes: string; isActive: boolean };
  start: number;
  /** The person's other jobs that day (not cancelled), the job being moved left out. `end` is their busyEnd. */
  taken: { docNo: string; start: number; end: number }[];
}

/** Why the booking cannot be made, or null. Messages name what is in the way. */
export function bookingRefusal(b: BookingCheck): string | null {
  if (b.date < b.today) return 'A job cannot be booked on a day that has passed.';
  if (!b.person.isActive) return `${b.person.name} is no longer active in Service.`;
  if (!canTake(b.person.jobTypes, b.jobType)) return `${b.person.name} does not take ${b.jobType.toLowerCase()} jobs.`;
  if (!goesTo(b.person.siteTypes, b.siteType)) return `${b.person.name} does not go to ${SITE_TYPE_LABEL[b.siteType as SiteType]?.toLowerCase() ?? b.siteType} sites.`;
  if (!b.group.isActive) return `The ${b.group.name} slot group is not in use.`;
  if (!b.group.jobTypes.split(',').includes(b.jobType)) return `The ${b.group.name} slot group is not for ${b.jobType.toLowerCase()} jobs.`;
  const slot = slotsOf(b.group).find((s) => s.start === b.start);
  if (!slot) return `${timeLabel(b.start)} is not a start time of the ${b.group.name} slot group.`;
  const clash = b.taken.find((t) => overlaps(t, slot));
  if (clash) return `${b.person.name} already has ${clash.docNo} at ${slotLabel(clash.start, clash.end)} that day.`;
  return null;
}
