import { DEFAULT_RANGE, netUnitPrice, outsideRange, rangeErrors, rangeReason, rangeText } from './price-range.rules';

const line = (unitPrice: string, listPrice: string | null, over: Record<string, unknown> = {}) => ({ unitPrice, discountPct: '0', listPrice, ...over });

describe('price range (phase 5, decision 11)', () => {
  it('works out the net price after the line discount', () => {
    expect(netUnitPrice({ unitPrice: '1000', discountPct: '15' }).toString()).toBe('850');
  });

  it('lets prices from 10% below to 20% above the list through, edges included', () => {
    expect(outsideRange([line('900', '1000'), line('1200', '1000'), line('1000', '1000')], DEFAULT_RANGE).count).toBe(0);
    expect(outsideRange([line('1000', '1000', { discountPct: '10' })], DEFAULT_RANGE).count).toBe(0);
  });

  it('flags a price further below or above, and says how far', () => {
    const below = outsideRange([line('880', '1000'), line('1000', '1000')], DEFAULT_RANGE);
    expect(below).toEqual({ count: 1, lowestPct: -12, highestPct: null, lines: [0] });
    expect(rangeReason(below, DEFAULT_RANGE)).toBe('Price 12% below the price list on 1 line (allowed: 10% below to 20% above)');

    const above = outsideRange([line('1250', '1000')], DEFAULT_RANGE);
    expect(rangeReason(above, DEFAULT_RANGE)).toBe('Price 25% above the price list on 1 line (allowed: 10% below to 20% above)');

    const mixed = outsideRange([line('880', '1000'), line('1250', '1000'), line('850', '1000')], DEFAULT_RANGE);
    expect(mixed).toMatchObject({ count: 3, lowestPct: -15, highestPct: 25, lines: [0, 1, 2] });
    expect(rangeReason(mixed, DEFAULT_RANGE)).toBe('Prices outside the allowed range on 3 lines: 15% below to 25% above the price list (allowed: 10% below to 20% above)');

    // A discount counts: 1,000 less 12.5% is 875.
    expect(outsideRange([line('1000', '1000', { discountPct: '12.5' })], DEFAULT_RANGE).lowestPct).toBe(-12.5);
  });

  it('leaves out lines with no list price, package items, gifts, and a price already checked upstream', () => {
    expect(outsideRange([
      line('10', null),
      line('500', '1000', { lineKind: 'PACKAGE' }),
      line('0', '50', { lineKind: 'GIFT' }),
      line('800', '1000', { approvedNet: '800' }),
      line('0', '0'),
    ], DEFAULT_RANGE).count).toBe(0);
    // Changed after it was checked: counted again.
    expect(outsideRange([line('780', '1000', { approvedNet: '800' })], DEFAULT_RANGE).count).toBe(1);
  });

  it('follows the company’s own percentages', () => {
    const tight = { belowPct: '0', abovePct: '0' };
    expect(outsideRange([line('999', '1000')], tight).count).toBe(1);
    expect(rangeText({ belowPct: '5', abovePct: '12.5' })).toBe('5% below to 12.5% above the price list');
  });

  it('checks the two percentages', () => {
    expect(rangeErrors({ belowPct: '10', abovePct: '20' })).toEqual([]);
    expect(rangeErrors({ belowPct: '120', abovePct: 'x' })).toEqual([
      { field: 'priceBelowPct', message: 'Type a percentage from 0 to 100.' },
      { field: 'priceAbovePct', message: 'Type a percentage from 0 to 1,000.' },
    ]);
  });
});
