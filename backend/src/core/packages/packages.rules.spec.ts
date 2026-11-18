import { Prisma } from '@prisma/client';
import { endRefusal, headerErrors, lineErrors, linesText, PACKAGE_CODE, packageStatus, priceWarning, spreadPrice, type LineItem } from './packages.rules';

const d = (v: string | number) => new Prisma.Decimal(v);

describe('package rules (C15, C16)', () => {
  it('works the status out from the dates', () => {
    const p = { runsFrom: '2026-09-01', runsUntil: '2026-12-31', endedOn: null };
    expect(packageStatus(p, '2026-08-31')).toBe('SCHEDULED');
    expect(packageStatus(p, '2026-09-01')).toBe('RUNNING');
    expect(packageStatus(p, '2026-12-31')).toBe('RUNNING');
    expect(packageStatus(p, '2027-01-01')).toBe('ENDED');
    expect(packageStatus({ ...p, runsUntil: null }, '2030-01-01')).toBe('RUNNING');
    // Ended early on 29 Sep: it still runs that day and is ended from the next.
    expect(packageStatus({ ...p, endedOn: '2026-09-29' }, '2026-09-29')).toBe('RUNNING');
    expect(packageStatus({ ...p, endedOn: '2026-09-29' }, '2026-09-30')).toBe('ENDED');
  });

  it('ends only a running package', () => {
    expect(endRefusal('PK-1', 'RUNNING')).toBeNull();
    expect(endRefusal('PK-1', 'SCHEDULED')).toBe('PK-1 has not started yet. Change its dates or delete it instead.');
    expect(endRefusal('PK-1', 'ENDED')).toBe('PK-1 has already ended.');
    expect(endRefusal('PK-1', 'RUNNING', '2026-09-29')).toBe('PK-1 was ended already. Today is its last day.');
  });

  it('spreads the package price by list value, the last line taking the remainder (seed PK-DIN-06)', () => {
    const s = spreadPrice(d('2700.00'), [
      { itemCode: 'TB-DIN-06', qty: d(1), uomCode: 'PCS', listPrice: d('1450.00') },
      { itemCode: 'CH-DIN-01', qty: d(6), uomCode: 'PCS', listPrice: d('250.00') },
    ]);
    expect(s.normalValue.toFixed(2)).toBe('2950.00');
    expect(s.saves.toFixed(2)).toBe('250.00');
    expect(s.lines.map((l) => [l.itemCode, l.amount.toFixed(2), l.unitPrice.toFixed(4)])).toEqual([
      ['TB-DIN-06', '1327.12', '1327.1200'],
      ['CH-DIN-01', '1372.88', '228.8133'],
    ]);
    expect(s.lines.reduce((a, l) => a.add(l.amount), d(0)).toFixed(2)).toBe('2700.00');
    expect(s.missing).toEqual([]);
    expect(priceWarning(s)).toBeNull();
  });

  it('cannot spread when an item has no list price, and says which', () => {
    const s = spreadPrice(d('100'), [{ itemCode: 'X-1', qty: d(1), uomCode: 'PCS', listPrice: null }]);
    expect(s.missing).toEqual(['X-1']);
    expect(priceWarning(s)).toBe('No list price today for X-1 on this price list, so the saving cannot be worked out.');
  });

  it('warns when the package costs more than its items', () => {
    const s = spreadPrice(d('120.00'), [{ itemCode: 'A', qty: d(1), uomCode: 'PCS', listPrice: d('100.00') }]);
    expect(priceWarning(s)).toBe('The package costs 20.00 more than its items on their own.');
  });

  it('checks the dates, the price and that the gift rule matches the gifts', () => {
    const ok = { runsFrom: '2026-09-01', runsUntil: '2026-12-31', packagePrice: d(10), giftRule: 'NONE' as const, giftCount: 0 };
    expect(headerErrors(ok)).toEqual([]);
    expect(headerErrors({ ...ok, runsUntil: '2026-08-01' })).toEqual([{ field: 'runsUntil', message: 'Runs until cannot be before Runs from.' }]);
    expect(headerErrors({ ...ok, packagePrice: d(0) })).toEqual([{ field: 'packagePrice', message: 'The package price must be more than 0.' }]);
    expect(headerErrors({ ...ok, giftCount: 1 })[0]!.field).toBe('gifts');
    expect(headerErrors({ ...ok, giftRule: 'ALWAYS' })[0]!.message).toBe('Add the gift, or choose No gift.');
    expect(headerErrors({ ...ok, giftRule: 'CHOOSE_ONE', giftCount: 1 })[0]!.message).toBe('Add at least 2 gifts for the customer to choose from.');
    expect(headerErrors({ ...ok, giftRule: 'CHOOSE_ONE', giftCount: 2 })).toEqual([]);
  });

  it('checks each item and gift', () => {
    const items = new Map<string, LineItem>([
      ['TB', { name: 'Table', status: 'ACTIVE', isSellable: true, units: ['PCS'] }],
      ['GIFT', { name: 'Cushion', status: 'ACTIVE', isSellable: false, units: ['SET'] }],
      ['OLD', { name: 'Old', status: 'DISCONTINUED', isSellable: true, units: ['PCS'] }],
    ]);
    expect(lineErrors('items', [], items)).toEqual([{ field: 'items', message: 'Add at least one item to the package.' }]);
    expect(lineErrors('items', [{ itemCode: 'TB', qty: d(1), uomCode: 'PCS' }], items)).toEqual([]);
    expect(lineErrors('items', [{ itemCode: 'GIFT', qty: d(1), uomCode: 'SET' }], items)[0]!.message).toBe('GIFT is not for sale.');
    // A gift item need not be for sale on its own.
    expect(lineErrors('gifts', [{ itemCode: 'GIFT', qty: d(1), uomCode: 'SET' }], items)).toEqual([]);
    expect(lineErrors('gifts', [], items)).toEqual([]);
    expect(lineErrors('items', [{ itemCode: 'OLD', qty: d(1), uomCode: 'PCS' }], items)[0]!.message).toBe('OLD is discontinued, so it cannot be used.');
    expect(lineErrors('items', [{ itemCode: 'NOPE', qty: d(1), uomCode: 'PCS' }], items)[0]!.message).toBe('NOPE is not an item in Core.');
    expect(lineErrors('items', [{ itemCode: 'TB', qty: d(1), uomCode: 'BOX' }], items)).toEqual([{ field: 'items[0].uomCode', message: 'TB is not kept in BOX. Use PCS.' }]);
    expect(lineErrors('items', [{ itemCode: 'TB', qty: d(0), uomCode: 'PCS' }], items)).toEqual([{ field: 'items[0].qty', message: 'The quantity must be more than 0.' }]);
    expect(lineErrors('items', [{ itemCode: 'TB', qty: d(1), uomCode: 'PCS' }, { itemCode: 'TB', qty: d(2), uomCode: 'PCS' }], items)).toEqual([
      { field: 'items[1].itemCode', message: 'TB is in the list twice. Change the quantity instead.' },
    ]);
  });

  it('writes the lines as text for the audit trail', () => {
    expect(linesText([{ itemCode: 'TB-DIN-06', qty: d(1), uomCode: 'PCS' }, { itemCode: 'CH-DIN-01', qty: d(6), uomCode: 'PCS' }])).toBe('1 × TB-DIN-06 PCS, 6 × CH-DIN-01 PCS');
    expect(linesText([])).toBe('—');
  });
});

describe('package codes', () => {
  it('takes capitals, digits, dashes and @, up to 30, as codes kept from another system have them', () => {
    for (const ok of ['PK-DIN-06', 'SET@2Y@FG', 'M3399', 'AB', 'A'.repeat(30)]) expect(PACKAGE_CODE.test(ok)).toBe(true);
    for (const bad of ['A', '@SET', '-PK', 'pk-din', 'PK DIN', 'PK_DIN', 'A'.repeat(31)]) expect(PACKAGE_CODE.test(bad)).toBe(false);
  });
});
