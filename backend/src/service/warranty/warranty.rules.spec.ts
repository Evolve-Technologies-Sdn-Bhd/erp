import { assessErrors, claimRefusal, coveredUntil, partErrors, phoneDigits, suggestedAssessment, warrantiesFrom, warrantyState } from './warranty.rules';

const item = (itemCode: string, qty: string, warrantyMonths: number | null) => ({ itemCode, itemName: itemCode, qty, uomCode: 'PCS', serialNo: null, warrantyMonths });

describe('the warranty register', () => {
  it('covers from the installation to the day before the same day months later', () => {
    expect(coveredUntil('2026-10-01', 12)).toBe('2027-09-30');
    expect(coveredUntil('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('registers each item with a warranty once, waiting for payment until the order is fully paid', () => {
    const paid = warrantiesFrom({ doneOn: '2026-10-01', needsPayment: true, fullyPaid: true }, [item('A', '1', 12), item('B', '2', null), item('A', '2', 12)]);
    expect(paid).toEqual([{ itemCode: 'A', itemName: 'A', uomCode: 'PCS', qty: '3', serialNo: null, warrantyMonths: 12, startOn: '2026-10-01', endOn: '2027-09-30', status: 'ACTIVE' }]);
    expect(warrantiesFrom({ doneOn: '2026-10-01', needsPayment: true, fullyPaid: false }, [item('A', '1', 12)])[0]!.status).toBe('PENDING');
    expect(warrantiesFrom({ doneOn: '2026-10-01', needsPayment: false, fullyPaid: false }, [item('A', '1', 12)])[0]!.status).toBe('ACTIVE');
    expect(warrantiesFrom({ doneOn: '2026-10-01', needsPayment: false, fullyPaid: false }, [item('A', '1', 0)])).toEqual([]);
  });

  it('shows expired the day after the last day covered, and void whatever the date', () => {
    const w = { status: 'ACTIVE', endOn: '2027-09-30' };
    expect(warrantyState(w, '2027-09-30')).toBe('ACTIVE');
    expect(warrantyState(w, '2027-10-01')).toBe('EXPIRED');
    expect(warrantyState({ ...w, status: 'PENDING' }, '2027-01-01')).toBe('PENDING');
    expect(warrantyState({ ...w, status: 'VOID' }, '2027-01-01')).toBe('VOID');
  });

  it('finds a phone however it is typed', () => {
    expect(phoneDigits('+60 12-345 6789')).toBe('0123456789');
    expect(phoneDigits('012 345 6789')).toBe('0123456789');
    expect(phoneDigits(null)).toBe('');
  });

  it('takes a claim on any unit but a void one, and suggests covered only while active', () => {
    expect(claimRefusal({ status: 'VOID', itemCode: 'A' })).toContain('void');
    expect(claimRefusal({ status: 'PENDING', itemCode: 'A' })).toBeNull();
    expect(suggestedAssessment('ACTIVE')).toBe('COVERED');
    expect(suggestedAssessment('EXPIRED')).toBe('CHARGEABLE');
    expect(suggestedAssessment('PENDING')).toBe('CHARGEABLE');
  });

  it('needs a reason unless it is covered', () => {
    expect(assessErrors({ result: 'COVERED' })).toEqual([]);
    expect(assessErrors({ result: 'CHARGEABLE' })[0]).toMatchObject({ field: 'note' });
    expect(assessErrors({ result: 'REJECTED', note: 'Broken by the customer' })).toEqual([]);
    expect(assessErrors({ result: 'MAYBE' })[0]).toMatchObject({ field: 'result' });
  });

  it('takes known parts, each once, more than 0', () => {
    const known = new Set(['A', 'B']);
    expect(partErrors([{ itemCode: 'A', qty: '1' }, { itemCode: 'B', qty: '0.5' }], known)).toEqual([]);
    expect(partErrors([{ itemCode: 'X', qty: '1' }], known)[0]).toMatchObject({ field: 'parts[0].itemCode' });
    expect(partErrors([{ itemCode: 'A', qty: '0' }], known)[0]).toMatchObject({ field: 'parts[0].qty' });
    expect(partErrors([{ itemCode: 'A', qty: '1' }, { itemCode: 'A', qty: '1' }], known)[0]).toMatchObject({ field: 'parts' });
  });
});
