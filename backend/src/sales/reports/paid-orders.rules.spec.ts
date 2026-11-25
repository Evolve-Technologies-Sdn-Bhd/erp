import { dec } from '../../platform/http/decimal';
import { paidOn, perAgent } from './paid-orders.rules';

describe('fully paid orders', () => {
  it('is fully paid on the day of the receipt that reaches the total', () => {
    const receipts = [{ amount: '1000.00', verifiedOn: '2026-11-20' }, { amount: '500.00', verifiedOn: '2026-11-03' }];
    expect(paidOn('1500.00', receipts)).toBe('2026-11-20');
    expect(paidOn('500.00', receipts)).toBe('2026-11-03');
    expect(paidOn('1500.01', receipts)).toBeNull();
    expect(paidOn('1500.00', [])).toBeNull();
    expect(paidOn('0.00', [])).toBeNull();
  });

  it('adds up per salesperson, the highest first', () => {
    const o = (agentCode: string, beforeTax: string) => ({ agentCode, agentName: agentCode, beforeTax: dec(beforeTax), total: dec(beforeTax).mul('1.1') });
    expect(perAgent([o('A', '100'), o('B', '300'), o('A', '150')]).map((x) => [x.agentCode, x.count, x.beforeTax.toFixed(2), x.total.toFixed(2)])).toEqual([
      ['B', 1, '300.00', '330.00'], ['A', 2, '250.00', '275.00'],
    ]);
  });
});
