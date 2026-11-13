import type { MdPackage } from '../../master-data/master-data.port';
import { dayText, expandPackage, notRunningReason, toEnteredLine } from './package-lines.rules';

// PK-DIN-06 from FIELD_SALES_SEED_DATA.md, with two gifts to choose from.
const dining: MdPackage = {
  code: 'PK-DIN-06', name: 'Dining set, 6-seater', uomCode: 'SET', salesTaxCode: 'SST10', priceListCode: 'STD-2026', packagePrice: '2700.00',
  giftRule: 'CHOOSE_ONE', runsFrom: '2026-09-01', runsUntil: '2026-12-31', endedOn: null,
  items: [{ itemCode: 'TB-DIN-06', qty: '1.0000', uomCode: 'PCS' }, { itemCode: 'CH-DIN-01', qty: '6.0000', uomCode: 'PCS' }],
  gifts: [{ itemCode: 'GF-CUSH-04', qty: '1.0000', uomCode: 'SET' }, { itemCode: 'GF-RUN-01', qty: '1.0000', uomCode: 'PCS' }],
};
const ctx = {
  docDate: '2026-09-29',
  group: 1,
  prices: new Map([['TB-DIN-06|PCS', '1450.0000'], ['CH-DIN-01|PCS', '250.0000']]),
  salesUnits: new Map([['TB-DIN-06', 'PCS'], ['CH-DIN-01', 'PCS'], ['GF-CUSH-04', 'SET'], ['GF-RUN-01', 'PCS']]),
};
const req = (over: Partial<Parameters<typeof expandPackage>[0]> = {}) => ({ index: 0, packageCode: 'PK-DIN-06', qty: '1', giftItemCode: 'GF-CUSH-04', ...over });

describe('expandPackage', () => {
  it('turns one set into its items priced from the package and the chosen gift at 0.00', () => {
    const { lines, errors } = expandPackage(req(), dining, ctx);
    expect(errors).toEqual([]);
    expect(lines.map((l) => [l.itemCode, l.qty, l.unitPrice, l.listPrice, l.taxCode, l.meta.lineKind])).toEqual([
      ['TB-DIN-06', '1', '1327.1200', '1327.1200', 'SST10', 'PACKAGE'],
      ['CH-DIN-01', '6', '228.8133', '228.8133', 'SST10', 'PACKAGE'],
      ['GF-CUSH-04', '1', '0', null, 'SST10', 'GIFT'],
    ]);
    expect(lines[0]!.meta).toMatchObject({ packageGroup: 1, packageCode: 'PK-DIN-06', packageName: 'Dining set, 6-seater', packageUomCode: 'SET' });
    expect(lines[0]!.meta.packagePrice?.toFixed(2)).toBe('2700.00');
  });

  it('multiplies the items and gifts by the number of sets, at the same unit prices', () => {
    const { lines } = expandPackage(req({ qty: '2' }), dining, ctx);
    expect(lines.map((l) => `${l.qty} ${l.itemCode} @ ${l.unitPrice}`)).toEqual(['2 TB-DIN-06 @ 1327.1200', '12 CH-DIN-01 @ 228.8133', '2 GF-CUSH-04 @ 0']);
    expect(lines[0]!.meta.packageQty?.toString()).toBe('2');
  });

  it('adds every gift when the package always gives them, and none when it has none', () => {
    expect(expandPackage(req({ giftItemCode: null }), { ...dining, giftRule: 'ALWAYS' }, ctx).lines.filter((l) => l.meta.lineKind === 'GIFT').map((l) => l.itemCode)).toEqual(['GF-CUSH-04', 'GF-RUN-01']);
    expect(expandPackage(req({ giftItemCode: null }), { ...dining, giftRule: 'NONE', gifts: [] }, ctx).lines).toHaveLength(2);
  });

  it('asks for the gift, and refuses one that is not the package’s', () => {
    expect(expandPackage(req({ giftItemCode: '' }), dining, ctx).errors).toEqual([{ field: 'lines[0].giftItemCode', message: 'Pick the free gift for PK-DIN-06.' }]);
    expect(expandPackage(req({ giftItemCode: 'CH-KID-01' }), dining, ctx).errors).toEqual([{ field: 'lines[0].giftItemCode', message: 'CH-KID-01 is not one of the gifts of PK-DIN-06.' }]);
    expect(expandPackage(req({ index: 2 }), { ...dining, giftRule: 'NONE', gifts: [] }, ctx).errors).toEqual([{ field: 'lines[2].giftItemCode', message: 'PK-DIN-06 has no free gift.' }]);
  });

  it('sells only whole sets, of a package running on the order date', () => {
    expect(expandPackage(req({ qty: '1.5' }), dining, ctx).errors).toEqual([{ field: 'lines[0].qty', message: 'Packages are sold in whole sets.' }]);
    expect(expandPackage(req(), { ...dining, runsFrom: '2026-12-01' }, ctx).errors[0]!.message).toBe('PK-DIN-06 starts on 1 Dec 2026, so it cannot be sold yet.');
    expect(expandPackage(req(), null, ctx).errors).toEqual([{ field: 'lines[0].packageCode', message: 'Pick a package from Core.' }]);
  });

  it('refuses a package whose price cannot be spread, or whose unit Sales does not sell in', () => {
    const noPrice = expandPackage(req(), dining, { ...ctx, prices: new Map([['TB-DIN-06|PCS', '1450.0000']]) });
    expect(noPrice.errors).toEqual([{ field: 'lines[0].packageCode', message: 'PK-DIN-06: STD-2026 has no price for CH-DIN-01, so the package price cannot be spread over its items. Add the price in Core.' }]);
    const box = expandPackage(req(), { ...dining, items: [{ itemCode: 'TB-DIN-06', qty: '1', uomCode: 'BOX' }] }, ctx);
    expect(box.errors[0]!.message).toBe('PK-DIN-06 has TB-DIN-06 in BOX, but Sales sells TB-DIN-06 in PCS. Change the package in Core.');
  });
});

describe('notRunningReason', () => {
  it('names the first or last day', () => {
    expect(notRunningReason(dining, '2026-09-29')).toBeNull();
    expect(notRunningReason(dining, '2027-01-02')).toBe('PK-DIN-06 ended on 31 Dec 2026, so it cannot be sold.');
    expect(notRunningReason({ ...dining, endedOn: '2026-10-05' }, '2026-10-06')).toBe('PK-DIN-06 ended on 5 Oct 2026, so it cannot be sold.');
    expect(notRunningReason({ ...dining, endedOn: '2026-10-05' }, '2026-10-05')).toBeNull();
  });
});

describe('toEnteredLine', () => {
  it('points an error on a built line back at the line the user typed', () => {
    expect(toEnteredLine([{ field: 'lines[3].itemCode', message: 'x' }, { field: 'customerCode', message: 'y' }], [0, 1, 1, 1, 2])).toEqual([
      { field: 'lines[1].itemCode', message: 'x' },
      { field: 'customerCode', message: 'y' },
    ]);
  });
});

describe('dayText', () => {
  it('writes a date the way messages do', () => expect(dayText('2026-10-01')).toBe('1 Oct 2026'));
});
