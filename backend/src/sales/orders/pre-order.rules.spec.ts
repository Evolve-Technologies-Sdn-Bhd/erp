import { preOrderActivity, preOrderAtRelease, preOrderState } from './pre-order.rules';

describe('pre-orders: short stock makes the whole order a pre-order', () => {
  it('marks the order at release only while the company asks for it and something is short', () => {
    expect(preOrderAtRelease(true, 'CH-DIN-01: 0 in stock, 2 short')).toEqual({ isPreOrder: true, note: 'CH-DIN-01: 0 in stock, 2 short' });
    expect(preOrderAtRelease(true, null)).toEqual({ isPreOrder: false, note: null });
    expect(preOrderAtRelease(false, 'CH-DIN-01: 0 in stock, 2 short')).toEqual({ isPreOrder: false, note: null });
    expect(preOrderActivity('CH-DIN-01: 0 in stock, 2 short')).toBe('Released as a pre-order: CH-DIN-01: 0 in stock, 2 short. The whole order waits for stock.');
  });

  it('waits for stock, then says the stock arrived; nobody releases it again', () => {
    expect(preOrderState({ isPreOrder: true, status: 'RELEASED' }, 'CH-DIN-01: 0 in stock, 2 short')).toEqual({ label: 'Pre-order · waiting for stock', stockArrived: false });
    expect(preOrderState({ isPreOrder: true, status: 'RELEASED' }, null)).toEqual({ label: 'Pre-order · stock arrived', stockArrived: true });
    expect(preOrderState({ isPreOrder: true, status: 'DONE' }, null)).toEqual({ label: 'Pre-order', stockArrived: false });
    expect(preOrderState({ isPreOrder: false, status: 'RELEASED' }, 'short')).toBeNull();
  });
});
