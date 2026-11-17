import { bookingRefusal, canTake, slotGroupErrors, slotLabel, slotsOf, STARTER_SLOT_GROUPS, timeLabel, type BookingCheck } from './booking.rules';

const standard = { ...STARTER_SLOT_GROUPS[0], isActive: true };
const short = { ...STARTER_SLOT_GROUPS[2], isActive: true };
const check = (over: Partial<BookingCheck> = {}): BookingCheck => ({
  jobNo: 'JB-0012', jobType: 'INSTALLATION', date: '2026-10-01', today: '2026-09-29',
  person: { name: 'Hafiz Rahman', role: 'INSTALLER', isActive: true }, group: standard, start: 720, taken: [], ...over,
});

describe('slotsOf (SvcSettings.html)', () => {
  it('gives the slots of a day', () => {
    expect(slotsOf(standard).map((s) => slotLabel(s.start, s.end))).toEqual(['10 AM – 12 PM', '12 PM – 2 PM', '2 PM – 4 PM', '4 PM – 6 PM']);
    expect(slotsOf(short)).toHaveLength(8);
    expect(slotsOf({ ...STARTER_SLOT_GROUPS[3] }).map((s) => slotLabel(s.start, s.end))).toEqual(['10 AM – 2 PM', '2 PM – 6 PM']);
  });
  it('writes times the way the board shows them', () => {
    expect([timeLabel(540), timeLabel(720), timeLabel(810), timeLabel(0)]).toEqual(['9 AM', '12 PM', '1:30 PM', '12 AM']);
  });
});

describe('canTake (who takes which job)', () => {
  it('matches the role to the job type', () => {
    expect(canTake('INSTALLER', 'INSTALLATION')).toBe(true);
    expect(canTake('INSTALLER', 'SERVICE')).toBe(false);
    expect(canTake('TECHNICIAN', 'REPAIR')).toBe(true);
    expect(canTake('WARRANTY', 'WARRANTY')).toBe(true);
  });
});

describe('bookingRefusal', () => {
  it('books a free slot of the right group for someone who takes the job', () => {
    expect(bookingRefusal(check())).toBeNull();
  });
  it('never lets two jobs overlap for one person', () => {
    expect(bookingRefusal(check({ taken: [{ docNo: 'JB-0013', start: 600, end: 840 }] }))).toBe('Hafiz Rahman already has JB-0013 at 10 AM – 2 PM that day.');
    expect(bookingRefusal(check({ taken: [{ docNo: 'JB-0013', start: 600, end: 720 }] }))).toBeNull();
  });
  it('refuses the wrong person, group, start time or a past day', () => {
    expect(bookingRefusal(check({ person: { name: 'Suresh Nair', role: 'TECHNICIAN', isActive: true } }))).toBe('Suresh Nair is Technician and does not take installation jobs.');
    expect(bookingRefusal(check({ group: short, start: 540 }))).toBe('The Short slot group is not for installation jobs.');
    expect(bookingRefusal(check({ start: 660 }))).toBe('11 AM is not a start time of the Standard slot group.');
    expect(bookingRefusal(check({ date: '2026-09-28' }))).toBe('A job cannot be booked on a day that has passed.');
    expect(bookingRefusal(check({ person: { name: 'Hafiz Rahman', role: 'INSTALLER', isActive: false } }))).toBe('Hafiz Rahman is no longer active in Service.');
  });
});

describe('slotGroupErrors', () => {
  it('needs a name, a length in half hours, a day that holds a slot, and job types', () => {
    expect(slotGroupErrors({ name: 'Standard', slotMinutes: 120, firstStart: 600, lastEnd: 1080, jobTypes: ['INSTALLATION'] })).toEqual([]);
    expect(slotGroupErrors({ name: ' ', slotMinutes: 45, firstStart: 600, lastEnd: 630, jobTypes: [] }).map((e) => e.field)).toEqual(['name', 'slotMinutes', 'lastEnd', 'jobTypes']);
  });
});
