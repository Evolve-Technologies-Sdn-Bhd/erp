import {
  bookingRefusal, busyEnd, canTake, defaultGroupFor, goesTo, groupSuits, personErrors, slotGroupErrors, slotLabel, slotsOf, STARTER_SLOT_GROUPS, timeLabel, type BookingCheck,
} from './booking.rules';

const standard = { ...STARTER_SLOT_GROUPS[0], isActive: true };
const short = { ...STARTER_SLOT_GROUPS[2], isActive: true };
const hafiz = { name: 'Hafiz Rahman', role: 'INSTALLER', isActive: true, jobTypes: 'INSTALLATION', siteTypes: 'LANDED,CONDO,COMMERCIAL' };
const check = (over: Partial<BookingCheck> = {}): BookingCheck => ({
  jobNo: 'JB-0012', jobType: 'INSTALLATION', siteType: null, date: '2026-10-01', today: '2026-09-29',
  person: hafiz, group: standard, start: 720, taken: [], ...over,
});

describe('slotsOf (SvcSettings.html)', () => {
  it('gives the slots of a day', () => {
    expect(slotsOf(standard).map((s) => slotLabel(s.start, s.end))).toEqual(['10 AM – 12 PM', '12 PM – 2 PM', '2 PM – 4 PM', '4 PM – 6 PM']);
    expect(slotsOf(short)).toHaveLength(8);
    expect(slotsOf({ ...STARTER_SLOT_GROUPS[3] }).map((s) => slotLabel(s.start, s.end))).toEqual(['10 AM – 2 PM', '2 PM – 6 PM']);
  });
  it('writes times the way the board shows them', () => {
    expect([timeLabel(540), timeLabel(720), timeLabel(810), timeLabel(0), timeLabel(1440)]).toEqual(['9 AM', '12 PM', '1:30 PM', '12 AM', 'midnight']);
  });
});

describe('who takes which job, and where they go (F3 part 4)', () => {
  it('reads each person’s own job types, whatever their role', () => {
    expect(canTake('INSTALLATION', 'INSTALLATION')).toBe(true);
    expect(canTake('INSTALLATION', 'SERVICE')).toBe(false);
    // An installer who also takes warranty jobs; a technician who also installs.
    expect(canTake('INSTALLATION,WARRANTY', 'WARRANTY')).toBe(true);
    expect(canTake('INSTALLATION,SERVICE,REPAIR', 'INSTALLATION')).toBe(true);
    expect(canTake('', 'INSTALLATION')).toBe(false);
  });
  it('lets a job without a site type go to anyone, and one with a site type only to those who go there', () => {
    expect(goesTo('LANDED', null)).toBe(true);
    expect(goesTo('LANDED', 'LANDED')).toBe(true);
    expect(goesTo('LANDED', 'CONDO')).toBe(false);
  });
  it('needs at least one job type and one site type per person', () => {
    expect(personErrors({ jobTypes: ['INSTALLATION'], siteTypes: ['LANDED'] })).toEqual([]);
    expect(personErrors({ jobTypes: [], siteTypes: [] })).toEqual([
      { field: 'jobTypes', message: 'Pick the jobs this person takes.' },
      { field: 'siteTypes', message: 'Pick the sites this person goes to.' },
    ]);
  });
});

describe('default slot group per job type (F3 part 4)', () => {
  const groups = STARTER_SLOT_GROUPS.map((g) => ({ code: g.code, jobTypes: g.jobTypes.split(','), siteTypes: g.siteTypes.split(','), defaultFor: g.defaultFor.split(',').filter(Boolean) }));
  it('picks the group marked as the default, else the first that fits', () => {
    expect(defaultGroupFor(groups, 'INSTALLATION')?.code).toBe('STANDARD');
    expect(defaultGroupFor(groups, 'WARRANTY')?.code).toBe('SHORT');
    const noDefaults = groups.map((g) => ({ ...g, defaultFor: [] as string[] }));
    expect(defaultGroupFor(noDefaults, 'INSTALLATION')?.code).toBe('STANDARD');
    expect(defaultGroupFor(groups.filter((g) => g.code === 'LONG'), 'SERVICE')).toBeNull();
  });
  it('starts every group for every kind of site', () => {
    expect(STARTER_SLOT_GROUPS.map((g) => g.siteTypes)).toEqual(Array(4).fill('LANDED,CONDO,COMMERCIAL'));
  });
  it('is only the default for job types the group is used for', () => {
    expect(slotGroupErrors({ name: 'Long', slotMinutes: 240, firstStart: 600, lastEnd: 1080, jobTypes: ['INSTALLATION'], defaultFor: ['SERVICE'] })).toEqual([
      { field: 'defaultFor', message: 'A slot group can only be the default for job types it is used for.' },
    ]);
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
  it('keeps the person busy until an extended job is expected to finish', () => {
    expect(busyEnd({ slotEnd: 720, expectedEnd: 810 })).toBe(810);
    expect(busyEnd({ slotEnd: 720, expectedEnd: null })).toBe(720);
    const extended = { docNo: 'JB-0013', start: 600, end: busyEnd({ slotEnd: 720, expectedEnd: 810 }) };
    expect(bookingRefusal(check({ taken: [extended] }))).toBe('Hafiz Rahman already has JB-0013 at 10 AM – 1:30 PM that day.');
  });
  it('refuses someone who does not take the job or does not go to that kind of site', () => {
    expect(bookingRefusal(check({ person: { ...hafiz, name: 'Suresh Nair', role: 'TECHNICIAN', jobTypes: 'SERVICE,REPAIR' } }))).toBe('Suresh Nair does not take installation jobs.');
    expect(bookingRefusal(check({ siteType: 'CONDO', person: { ...hafiz, siteTypes: 'LANDED' } }))).toBe('Hafiz Rahman does not go to condo / apartment sites.');
    expect(bookingRefusal(check({ siteType: 'LANDED', person: { ...hafiz, siteTypes: 'LANDED' } }))).toBeNull();
  });
  it('refuses the wrong group, start time, a past day or someone no longer active', () => {
    expect(bookingRefusal(check({ group: short, start: 540 }))).toBe('The Short slot group is not for installation jobs.');
    expect(bookingRefusal(check({ start: 660 }))).toBe('11 AM is not a start time of the Standard slot group.');
    expect(bookingRefusal(check({ date: '2026-09-28' }))).toBe('A job cannot be booked on a day that has passed.');
    expect(bookingRefusal(check({ person: { ...hafiz, isActive: false } }))).toBe('Hafiz Rahman is no longer active in Service.');
  });
});

describe('slotGroupErrors', () => {
  it('needs a name, a length in half hours, a day that holds a slot, and job types', () => {
    expect(slotGroupErrors({ name: 'Standard', slotMinutes: 120, firstStart: 600, lastEnd: 1080, jobTypes: ['INSTALLATION'] })).toEqual([]);
    expect(slotGroupErrors({ name: ' ', slotMinutes: 45, firstStart: 600, lastEnd: 630, jobTypes: [] }).map((e) => e.field)).toEqual(['name', 'slotMinutes', 'lastEnd', 'jobTypes']);
  });
});

describe('job categories by site type: a slot group for some sites only', () => {
  // A company's categories: installation 2 h (the default), combo 3 h, and hacking or ceiling work 4 h, never at a landed house.
  const categories = [
    { code: 'INSTALL', jobTypes: ['INSTALLATION'], siteTypes: ['LANDED', 'CONDO', 'COMMERCIAL'], defaultFor: ['INSTALLATION'] },
    { code: 'COMBO', jobTypes: ['INSTALLATION'], siteTypes: ['LANDED', 'CONDO', 'COMMERCIAL'], defaultFor: [] },
    { code: 'HACKING', jobTypes: ['INSTALLATION'], siteTypes: ['CONDO', 'COMMERCIAL'], defaultFor: [] },
  ];
  it('offers a group only for a job of its type at a site it is for; a job without a site type gets every group of its type', () => {
    expect(categories.filter((g) => groupSuits(g, 'INSTALLATION', 'LANDED')).map((g) => g.code)).toEqual(['INSTALL', 'COMBO']);
    expect(categories.filter((g) => groupSuits(g, 'INSTALLATION', 'CONDO')).map((g) => g.code)).toEqual(['INSTALL', 'COMBO', 'HACKING']);
    expect(categories.filter((g) => groupSuits(g, 'INSTALLATION', null)).map((g) => g.code)).toEqual(['INSTALL', 'COMBO', 'HACKING']);
    expect(categories.filter((g) => groupSuits(g, 'SERVICE', 'CONDO'))).toEqual([]);
  });
  it('picks the default only when it suits the site, else the first that does', () => {
    expect(defaultGroupFor(categories, 'INSTALLATION', 'CONDO')?.code).toBe('INSTALL');
    const hackingFirst = categories.map((g) => ({ ...g, defaultFor: g.code === 'HACKING' ? ['INSTALLATION'] : [] }));
    expect(defaultGroupFor(hackingFirst, 'INSTALLATION', 'CONDO')?.code).toBe('HACKING');
    expect(defaultGroupFor(hackingFirst, 'INSTALLATION', 'LANDED')?.code).toBe('INSTALL');
  });
  it('refuses to book a job into a group that is not for its site', () => {
    const hacking = { ...standard, name: 'Hacking / ceiling', slotMinutes: 240, siteTypes: 'CONDO,COMMERCIAL' };
    expect(bookingRefusal(check({ group: hacking, start: 600, siteType: 'LANDED' }))).toBe('The Hacking / ceiling slot group is not for landed house sites.');
    expect(bookingRefusal(check({ group: hacking, start: 600, siteType: 'CONDO' }))).toBeNull();
    expect(bookingRefusal(check({ group: hacking, start: 600, siteType: null }))).toBeNull();
  });
  it('needs at least one site per group', () => {
    expect(slotGroupErrors({ name: 'Combo', slotMinutes: 180, firstStart: 540, lastEnd: 1080, jobTypes: ['INSTALLATION'], siteTypes: [] })).toEqual([
      { field: 'siteTypes', message: 'Pick the sites this slot group is for.' },
    ]);
  });
});
