import { dec } from '../../platform/http/decimal';
import { cannotUse, fromList, usesText, voucherErrors, voucherStatus, type VoucherFields } from './vouchers.rules';

const fields = (over: Partial<VoucherFields> = {}): VoucherFields => ({ voucherNo: 'CV-50', description: 'Cash voucher RM 50', amount: '50.00', validFrom: '2026-10-01', validUntil: '2026-10-31', maxUses: 2, ...over });
const listed = { voucherNo: 'CV-50', description: 'Cash voucher RM 50', amount: dec('50'), validFrom: '2026-10-01', validUntil: '2026-10-31', maxUses: 2, uses: 0 };

describe('the voucher list', () => {
  it('says where a voucher stands on a day', () => {
    const v = { validFrom: '2026-10-01', validUntil: '2026-10-31', maxUses: 2 };
    expect(['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01'].map((d) => voucherStatus(v, 0, d))).toEqual(['SCHEDULED', 'RUNNING', 'RUNNING', 'ENDED']);
    expect(voucherStatus(v, 2, '2026-10-05')).toBe('USED_UP');
    expect(voucherStatus({ ...v, validUntil: null, maxUses: null }, 900, '2030-01-01')).toBe('RUNNING');
  });

  it('checks what a voucher needs', () => {
    expect(voucherErrors(fields())).toEqual([]);
    expect(voucherErrors(fields({ maxUses: null, validUntil: null }))).toEqual([]);
    expect(voucherErrors(fields({ voucherNo: ' ', description: ' ', amount: '0', validUntil: '2026-09-01', maxUses: 0 })).map((e) => e.field)).toEqual(['voucherNo', 'description', 'amount', 'validUntil', 'maxUses']);
  });

  it('keeps the number and amount of a voucher orders use', () => {
    const used = { uses: 2, voucherNo: 'CV-50', amount: '50.0000' };
    expect(voucherErrors(fields({ validUntil: '2026-12-31', maxUses: 5 }), used)).toEqual([]);
    expect(voucherErrors(fields({ voucherNo: 'CV-51', amount: '60', maxUses: 1 }), used).map((e) => e.message)).toEqual([
      '2 orders use it: its number stays.', '2 orders use it: its amount stays. End it and add a new voucher.', '2 orders use it already.',
    ]);
  });

  it('says why an order cannot take one', () => {
    expect(cannotUse('CV-50', null, '2026-10-05')).toBe('CV-50 is not on the voucher list. Pick one from the list.');
    expect(cannotUse('CV-50', listed, '2026-09-30')).toBe('CV-50 starts on 2026-10-01.');
    expect(cannotUse('CV-50', listed, '2026-11-01')).toBe('CV-50 ended on 2026-10-31.');
    expect(cannotUse('CV-50', { ...listed, uses: 2 }, '2026-10-05')).toBe('CV-50 is used up: 2 of 2 orders.');
    expect(cannotUse('CV-50', listed, '2026-10-05')).toBeNull();
    expect([usesText(2, 50), usesText(2, null)]).toEqual(['2 of 50', '2']);
  });

  it('takes the name and amount from the list, not from what was typed', () => {
    expect(fromList([{ voucherNo: 'cv-50', amount: '999', description: 'Mine', taxCode: 'SST10' }], [listed], [], '2026-10-05')).toEqual({
      vouchers: [{ voucherNo: 'CV-50', amount: dec('50'), description: 'Cash voucher RM 50', taxCode: 'SST10' }], errors: [],
    });
    expect(fromList([{ voucherNo: 'X-1', amount: '10' }], [listed], [], '2026-10-05').errors).toEqual([{ field: 'vouchers[0].voucherNo', message: 'X-1 is not on the voucher list. Pick one from the list.' }]);
  });

  it('keeps one the order already has, even when it has ended', () => {
    const kept = [{ voucherNo: 'OLD-1', amount: '30.00', description: 'Old voucher' }];
    expect(fromList([{ voucherNo: 'OLD-1', amount: '999' }], [listed], kept, '2026-12-01')).toEqual({ vouchers: [{ voucherNo: 'OLD-1', amount: '30.00', description: 'Old voucher' }], errors: [] });
  });
});
