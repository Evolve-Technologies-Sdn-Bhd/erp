import { allocate } from './allocation.rules';

const run = (receipts: [string, string][], invoices: [string, string][]) =>
  allocate(receipts.map(([id, left]) => ({ id, left })), invoices.map(([id, balance]) => ({ id, balance }))).map((a) => `${a.receiptId}→${a.invoiceId} ${a.amount.toFixed(2)}`);

describe('allocate', () => {
  it('pays the oldest invoice first, never more than its balance', () => {
    expect(run([['OR-1', '500']], [['IN-1', '300'], ['IN-2', '400']])).toEqual(['OR-1→IN-1 300.00', 'OR-1→IN-2 200.00']);
    expect(run([['OR-1', '500'], ['OR-2', '100']], [['IN-1', '550']])).toEqual(['OR-1→IN-1 500.00', 'OR-2→IN-1 50.00']);
  });

  it('leaves a deposit waiting when there is no invoice yet, or nothing owed', () => {
    expect(run([['OR-1', '500']], [])).toEqual([]);
    expect(run([['OR-1', '500']], [['IN-1', '0'], ['IN-2', '-5']])).toEqual([]);
    expect(run([['OR-1', '0']], [['IN-1', '10']])).toEqual([]);
  });

  it('adds sen exactly', () => {
    expect(run([['OR-1', '0.10'], ['OR-2', '0.20']], [['IN-1', '0.30']])).toEqual(['OR-1→IN-1 0.10', 'OR-2→IN-1 0.20']);
  });
});
