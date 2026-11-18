import { addMonths, isTimeToMakeJob, reminderJobNote, remindersFrom } from './reminder.rules';

describe('addMonths', () => {
  it('keeps the day of the month, or the last day of a shorter month', () => {
    expect(addMonths('2026-09-29', 3)).toBe('2026-12-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', 12)).toBe('2027-10-15');
  });
});

describe('isTimeToMakeJob', () => {
  it('makes the job 14 days ahead, and for anything overdue', () => {
    expect(isTimeToMakeJob('2026-10-13', '2026-09-29')).toBe(true);
    expect(isTimeToMakeJob('2026-10-14', '2026-09-29')).toBe(false);
    expect(isTimeToMakeJob('2026-09-01', '2026-09-29')).toBe(true);
  });
});

describe('remindersFrom', () => {
  it('starts one reminder per item with a service interval', () => {
    const r = remindersFrom({ doneOn: '2026-09-29' }, [
      { itemCode: 'OCBK', itemName: 'Water filter, black', qty: '1', uomCode: 'UNIT', intervalMonths: null },
      { itemCode: '28FP', itemName: 'Filter cartridge', qty: '2', uomCode: 'PCS', intervalMonths: 3 },
      { itemCode: '28FP', itemName: 'Filter cartridge', qty: '1', uomCode: 'PCS', intervalMonths: 3 },
    ]);
    expect(r).toEqual([{ itemCode: '28FP', itemName: 'Filter cartridge', qty: '2', uomCode: 'PCS', intervalMonths: 3, lastDoneOn: '2026-09-29', dueOn: '2026-12-29' }]);
  });
});

describe('reminderJobNote', () => {
  it('tells the technician what is due and since when', () => {
    expect(reminderJobNote({ itemCode: '28FP', itemName: 'Filter cartridge', intervalMonths: 3, lastDoneOn: '2026-09-29', fromJobNo: 'JB-0001' }))
      .toBe('Service due for Filter cartridge (28FP), every 3 months; last done 2026-09-29 on JB-0001.');
  });
});
