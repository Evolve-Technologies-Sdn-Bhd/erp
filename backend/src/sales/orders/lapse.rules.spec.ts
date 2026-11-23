import { autoCancelErrors, lapseDates, lapseNote, lapseStep } from './lapse.rules';

describe('the automatic cancel: no receipt and no delivery order after a number of days', () => {
  it('warns 7 days before and cancels on the day, counted from the first release', () => {
    expect(lapseDates('2026-09-29', 60)).toEqual({ warnOn: '2026-11-21', cancelOn: '2026-11-28' });
    const o = { releasedOn: '2026-09-29', warned: false };
    expect(lapseStep(o, 60, '2026-11-20')).toBeNull();
    expect(lapseStep(o, 60, '2026-11-21')).toBe('WARN');
    expect(lapseStep({ ...o, warned: true }, 60, '2026-11-25')).toBeNull();
    expect(lapseStep({ ...o, warned: true }, 60, '2026-11-28')).toBe('CANCEL');
    // Never warned (the switch was turned on late): it is cancelled on the day all the same.
    expect(lapseStep(o, 60, '2026-12-05')).toBe('CANCEL');
    expect(lapseNote(60)).toBe('No official receipt and no delivery order 60 days after release (cancelled automatically)');
  });

  it('needs whole days and official receipts on', () => {
    expect(autoCancelErrors({ autoCancel: true, days: 60, useReceipts: true })).toEqual([]);
    expect(autoCancelErrors({ autoCancel: false, days: 60, useReceipts: false })).toEqual([]);
    expect(autoCancelErrors({ autoCancel: true, days: 0, useReceipts: false }).map((e) => e.field)).toEqual(['autoCancelDays', 'autoCancel']);
  });
});
