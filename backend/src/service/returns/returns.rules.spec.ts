import { receivedText, receiveErrors, returnErrors, unfinished } from './returns.rules';

const items = [{ itemCode: 'TB-DIN-06', qty: '1' }, { itemCode: 'CH-DIN-01', qty: '4' }, { itemCode: 'CH-DIN-01', qty: '2' }];

describe('returned parts', () => {
  it('come from the job, each item once, not more than it took', () => {
    expect(returnErrors([{ itemCode: 'CH-DIN-01', qty: '6' }], items)).toEqual([]);
    expect(returnErrors([{ itemCode: 'CH-DIN-01', qty: '7' }], items)).toEqual([{ field: 'returns[0].qty', message: 'Not more than the job took (6).' }]);
    expect(returnErrors([{ itemCode: 'ST-COF-03', qty: '1' }], items)[0]).toMatchObject({ message: 'ST-COF-03 is not on this job.' });
    expect(returnErrors([{ itemCode: 'CH-DIN-01', qty: 'x' }], items)[0]).toMatchObject({ message: 'Enter a quantity like 1.' });
    expect(returnErrors([{ itemCode: 'CH-DIN-01', qty: '1' }, { itemCode: 'CH-DIN-01', qty: '1' }], items)[0]).toMatchObject({ field: 'returns' });
  });

  it('are counted as good and damaged, and what is missing needs a note', () => {
    expect(receiveErrors({ goodQty: '1', damagedQty: '1' }, '2')).toEqual([]);
    expect(receiveErrors({ goodQty: '2', damagedQty: '1' }, '2')[0]).toMatchObject({ field: 'goodQty' });
    expect(receiveErrors({ goodQty: '1', damagedQty: '0' }, '2')).toEqual([{ field: 'note', message: '1 missing: say why.' }]);
    expect(receiveErrors({ goodQty: '1', damagedQty: '0', note: 'Left at the site' }, '2')).toEqual([]);
    expect(receiveErrors({ goodQty: '', damagedQty: '0' }, '2')[0]).toMatchObject({ field: 'goodQty' });
    expect(receivedText('3', '1', '1')).toBe('1 good, 1 damaged, 1 missing');
  });
});

describe('unfinished jobs', () => {
  const j = { stage: 'BOOKED', jobDate: '2026-09-28', deliveryNo: null, delivered: false };
  it('is a past visit not recorded, or a delivery order not signed', () => {
    expect(unfinished(j, '2026-09-29')).toBe('the visit is not recorded');
    expect(unfinished({ ...j, jobDate: '2026-09-29' }, '2026-09-29')).toBeNull();
    expect(unfinished({ ...j, stage: 'DONE' }, '2026-09-29')).toBeNull();
    expect(unfinished({ ...j, stage: 'DONE', deliveryNo: 'DO-0004' }, '2026-09-29')).toBe('DO-0004 is not signed');
    expect(unfinished({ ...j, stage: 'CLOSED', deliveryNo: 'DO-0004', delivered: true }, '2026-09-29')).toBeNull();
    expect(unfinished({ ...j, stage: 'NOT_BOOKED', jobDate: null }, '2026-09-29')).toBeNull();
  });
});
