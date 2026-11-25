import { fixedPriceErrors } from './fixed-prices.rules';

const line = (over: Partial<Parameters<typeof fixedPriceErrors>[0][number]> = {}) => ({ itemCode: 'CH-DIN-01', unitPrice: '89.00', discountPct: '0', listPrice: '89.00', ...over });

describe('fixed prices', () => {
  it('takes the list price and nothing else', () => {
    expect(fixedPriceErrors([line(), line({ unitPrice: '89', listPrice: '89.0000' })])).toEqual([]);
    expect(fixedPriceErrors([line(), line({ unitPrice: '85.00' })])).toEqual([{ field: 'lines[1].unitPrice', message: 'The price comes from the price list (RM 89.00). Use a voucher to lower it.' }]);
    expect(fixedPriceErrors([line({ unitPrice: '95.00' })])).toHaveLength(1);
  });

  it('takes no discount', () => {
    expect(fixedPriceErrors([line({ discountPct: '5' })])).toHaveLength(1);
  });

  it('needs a price on the list', () => {
    expect(fixedPriceErrors([line({ listPrice: null })])).toEqual([{ field: 'lines[0].unitPrice', message: "CH-DIN-01 has no price on the customer's price list. Ask the office to add one in Core." }]);
  });

  it('leaves package items and gifts to their package', () => {
    expect(fixedPriceErrors([line({ unitPrice: '80', lineKind: 'PACKAGE' }), line({ unitPrice: '0', listPrice: null, lineKind: 'GIFT' })])).toEqual([]);
  });

  it('keeps the price a line already had, for the same item', () => {
    expect(fixedPriceErrors([line({ unitPrice: '80.00' })], [{ itemCode: 'CH-DIN-01', unitPrice: '80', discountPct: '0' }])).toEqual([]);
    expect(fixedPriceErrors([line({ unitPrice: '80.00' })], [{ itemCode: 'TB-DIN-06', unitPrice: '80', discountPct: '0' }])).toHaveLength(1);
    expect(fixedPriceErrors([line({ unitPrice: '80.00', discountPct: '10' })], [{ itemCode: 'CH-DIN-01', unitPrice: '80', discountPct: '0' }])).toHaveLength(1);
  });
});
