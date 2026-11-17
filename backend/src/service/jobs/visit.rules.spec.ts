import { visitErrors, visitText } from './visit.rules';

describe('visitErrors', () => {
  it('needs a photo and whether the customer paid when the work was done', () => {
    expect(visitErrors({ result: 'COMPLETE', paidStatus: 'PAID', paidMethod: 'TRANSFER' }, 1)).toEqual([]);
    expect(visitErrors({ result: 'COMPLETE' }, 0)).toEqual([
      { field: 'photos', message: 'Add at least one photo of the work.' },
      { field: 'paidStatus', message: 'Say whether the customer paid on site.' },
    ]);
  });

  it('needs the reason when not paid, partly done or postponed', () => {
    expect(visitErrors({ result: 'COMPLETE', paidStatus: 'NOT_PAID' }, 1)).toEqual([{ field: 'notPaidReason', message: 'Type why the customer did not pay.' }]);
    expect(visitErrors({ result: 'PARTIAL', paidStatus: 'NO_CHARGE' }, 2)).toEqual([{ field: 'reason', message: 'Type what is left to do.' }]);
    expect(visitErrors({ result: 'POSTPONED' }, 0)).toEqual([{ field: 'reason', message: 'Type why the visit is postponed.' }]);
  });

  it('asks nothing else for a postponed visit', () => {
    expect(visitErrors({ result: 'POSTPONED', reason: 'Customer not at home' }, 0)).toEqual([]);
  });

  it('checks the times when given', () => {
    expect(visitErrors({ result: 'POSTPONED', reason: 'x', arrivedAt: '9:5' }, 0)).toEqual([{ field: 'arrivedAt', message: 'Times look like 10:06.' }]);
    expect(visitErrors({ result: 'POSTPONED', reason: 'x', arrivedAt: '11:00', finishedAt: '10:30' }, 0)).toEqual([{ field: 'finishedAt', message: 'The finish is after the arrival.' }]);
  });
});

describe('visitText', () => {
  it('reads the way the job and the activity say it', () => {
    expect(visitText({ result: 'COMPLETE', paidStatus: 'PAID', paidMethod: 'TRANSFER' })).toBe('Complete · paid on site by bank transfer');
    expect(visitText({ result: 'PARTIAL', reason: 'Bracket missing', paidStatus: 'NOT_PAID', notPaidReason: 'Pays when finished' })).toBe('Partly done · not paid: Pays when finished');
    expect(visitText({ result: 'COMPLETE', paidStatus: 'NO_CHARGE' })).toBe('Complete · no charge');
    expect(visitText({ result: 'POSTPONED', reason: 'Customer not at home' })).toBe('Postponed: Customer not at home');
  });
});
