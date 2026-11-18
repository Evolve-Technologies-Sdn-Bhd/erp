import { expectedEndOf, extendErrors, isLate, minutesOfDay, momentAt, momentText, overdueOf, parseTime, runsInto, stickyOverdue, type JobTiming } from './timing.rules';

/** A job booked on Thu 1 Oct, 12 PM – 2 PM (F3 part 4). */
const booked = (over: Partial<JobTiming> = {}): JobTiming => ({ stage: 'BOOKED', jobDate: '2026-10-01', slotEnd: 840, expectedEnd: 840, overdueSince: null, ...over });
const at = (date: string, minutes: number) => ({ date, minutes });

describe('the business clock', () => {
  it('reads minutes from midnight in Kuala Lumpur', () => {
    expect(minutesOfDay(new Date('2026-09-29T06:30:00Z'))).toBe(870);
    expect(minutesOfDay(new Date('2026-09-28T17:30:00Z'))).toBe(90);
  });
  it('turns a business date and a time back into the moment', () => {
    expect(momentAt('2026-10-01', 840).toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(momentText(momentAt('2026-10-01', 840))).toBe('Thu, 1 Oct, 2 PM');
  });
  it('reads times typed as 16:30', () => {
    expect([parseTime('16:30'), parseTime('09:05'), parseTime('24:00'), parseTime('4pm'), parseTime('')]).toEqual([990, 545, null, null, null]);
  });
});

describe('expected completion and overdue', () => {
  it('expects a booked job at the end of its slot, or later when extended', () => {
    expect(expectedEndOf(booked())).toBe(840);
    expect(expectedEndOf(booked({ expectedEnd: 990 }))).toBe(990);
    expect(expectedEndOf(booked({ expectedEnd: null }))).toBe(840);
  });
  it('is late once the expected completion has passed, that day or a day before', () => {
    expect(isLate(booked(), at('2026-10-01', 839))).toBe(false);
    expect(isLate(booked(), at('2026-10-01', 840))).toBe(true);
    expect(isLate(booked(), at('2026-10-02', 0))).toBe(true);
    expect(isLate(booked(), at('2026-09-30', 1000))).toBe(false);
    expect(isLate(booked({ expectedEnd: 990 }), at('2026-10-01', 900))).toBe(false);
    expect(isLate(booked({ stage: 'DONE' }), at('2026-10-02', 0))).toBe(false);
  });
  it('says since when a job is overdue', () => {
    expect(overdueOf(booked(), at('2026-10-01', 900))).toEqual({ overdue: true, since: new Date('2026-10-01T06:00:00.000Z') });
    expect(overdueOf(booked(), at('2026-10-01', 800))).toEqual({ overdue: false, since: null });
  });
  it('keeps a job overdue until its visit is recorded, however it is extended, moved or taken off the board', () => {
    const since = new Date('2026-10-01T06:00:00.000Z');
    // Extended to 4:30 PM after it became overdue: still overdue at 3 PM.
    expect(overdueOf(booked({ expectedEnd: 990, overdueSince: since }), at('2026-10-01', 900)).overdue).toBe(true);
    // Moved to the next day, or taken off the board: still overdue.
    expect(overdueOf(booked({ jobDate: '2026-10-05', overdueSince: since }), at('2026-10-01', 900)).overdue).toBe(true);
    expect(overdueOf({ stage: 'NOT_BOOKED', jobDate: null, slotEnd: null, expectedEnd: null, overdueSince: since }, at('2026-10-01', 900)).overdue).toBe(true);
    // Done: no longer overdue, but it keeps when it became so.
    expect(overdueOf(booked({ stage: 'DONE', overdueSince: since }), at('2026-10-01', 900))).toEqual({ overdue: false, since });
    expect(overdueOf(booked({ stage: 'CANCELLED', overdueSince: null }), at('2026-10-02', 0)).overdue).toBe(false);
  });
  it('gives what to keep before the times change, so the flag is never lost', () => {
    expect(stickyOverdue(booked(), at('2026-10-01', 900))).toEqual(new Date('2026-10-01T06:00:00.000Z'));
    expect(stickyOverdue(booked(), at('2026-10-01', 800))).toBeNull();
    const since = new Date('2026-10-01T06:00:00.000Z');
    expect(stickyOverdue(booked({ jobDate: '2026-10-05', overdueSince: since }), at('2026-10-01', 900))).toBe(since);
  });
});

describe('extending a job', () => {
  it('needs a later time that day and a reason', () => {
    expect(extendErrors({ until: '16:30', reason: 'Wall needed hacking' }, 840)).toEqual([]);
    expect(extendErrors({ until: '14:00', reason: '' }, 840)).toEqual([
      { field: 'until', message: 'Pick a time after 2 PM, the expected completion now.' },
      { field: 'reason', message: 'Type why the job needs longer.' },
    ]);
    expect(extendErrors({ until: '4.30', reason: 'x' }, 840)).toEqual([{ field: 'until', message: 'Times look like 16:30.' }]);
  });
  it('names the later jobs it now runs into', () => {
    const others = [{ docNo: 'JB-0014', start: 960, end: 1080 }, { docNo: 'JB-0013', start: 840, end: 960 }, { docNo: 'JB-0010', start: 600, end: 720 }];
    expect(runsInto({ start: 720, end: 990 }, others).map((o) => o.docNo)).toEqual(['JB-0013', 'JB-0014']);
    expect(runsInto({ start: 720, end: 900 }, others).map((o) => o.docNo)).toEqual(['JB-0013']);
    expect(runsInto({ start: 720, end: 840 }, others)).toEqual([]);
  });
});
