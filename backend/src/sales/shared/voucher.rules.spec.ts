import { Prisma } from '@prisma/client';
import { saleLineTotals, saleTotals } from './totals.rules';
import { priceVouchers, taxLinesWithVouchers, totalsWithVouchers, vouchersForInvoice, type TaxedLine } from './voucher.rules';

const D = (v: string) => new Prisma.Decimal(v);
const line = (qty: string, price: string, taxCode = 'SST10', rate = '0.1'): TaxedLine => ({ ...saleLineTotals({ qty, unitPrice: price, taxRate: rate }), taxCode, taxRate: D(rate) });
// SO-0009 in FIELD_SALES_SEED_DATA.md: PK-DIN-06 as its items, the free gift, and voucher CV-2609-0031.
const dining = [line('1', '1327.12'), line('6', '228.8133'), line('1', '0')];

describe('priceVouchers', () => {
  it('takes the tax of the items it lowers, at their rate', () => {
    const { vouchers, errors } = priceVouchers([{ voucherNo: 'cv-2609-0031', amount: '50', description: 'Cash voucher RM 50' }], dining);
    expect(errors).toEqual([]);
    expect(vouchers.map((v) => [v.voucherNo, v.description, v.amount.toFixed(2), v.taxCode, v.taxAmount.toFixed(2)])).toEqual([['CV-2609-0031', 'Cash voucher RM 50', '50.00', 'SST10', '5.00']]);
  });

  it('asks which tax it lowers when the order has two', () => {
    const mixed = [...dining, line('1', '300', 'SV6', '0.06')];
    expect(priceVouchers([{ voucherNo: 'CV-1', amount: '50' }], mixed).errors).toEqual([{ field: 'vouchers[0].taxCode', message: 'Pick which tax the voucher lowers: SST10 or SV6.' }]);
    expect(priceVouchers([{ voucherNo: 'CV-1', amount: '50', taxCode: 'SV6' }], mixed).vouchers[0]!.taxAmount.toFixed(2)).toBe('3.00');
    expect(priceVouchers([{ voucherNo: 'CV-1', amount: '50', taxCode: 'SST0' }], mixed).errors[0]!.message).toBe('No item on this order is under SST0. Pick SST10 or SV6.');
  });

  it('needs a number once and an amount above 0, and never more than the items before tax', () => {
    const r = priceVouchers([{ voucherNo: ' ', amount: '0' }, { voucherNo: 'CV-1', amount: '10' }, { voucherNo: 'cv-1', amount: '10' }], dining);
    expect(r.errors).toEqual([
      { field: 'vouchers[0].voucherNo', message: 'Type the voucher number.' },
      { field: 'vouchers[0].amount', message: 'The voucher amount must be more than 0.' },
      { field: 'vouchers[2].voucherNo', message: 'Voucher CV-1 is on this order twice.' },
    ]);
    const tooMuch = priceVouchers([{ voucherNo: 'CV-1', amount: '2000' }, { voucherNo: 'CV-2', amount: '700.01' }], dining, new Map([['SST10', 'SST 10%']]));
    expect(tooMuch.errors).toEqual([{ field: 'vouchers[1].amount', message: 'Vouchers cannot be more than the SST 10% items before tax (2,700.00).' }]);
  });
});

describe('totalsWithVouchers', () => {
  it('gives SO-0009: 2,700.00 less 50.00, tax 10% of 2,650.00, total 2,915.00', () => {
    const { vouchers } = priceVouchers([{ voucherNo: 'CV-2609-0031', amount: '50' }], dining);
    const t = totalsWithVouchers(dining, vouchers, true);
    expect([t.subtotal, t.voucherTotal, t.taxTotal, t.rounding, t.total].map((v) => v.toFixed(2))).toEqual(['2700.00', '50.00', '265.00', '0.00', '2915.00']);
  });

  it('is saleTotals when there is no voucher, and rounds to 5 sen after the voucher', () => {
    const lines = [line('3', '33.33')];
    const plain = saleTotals(lines, 'EXCLUSIVE', true);
    expect(totalsWithVouchers(lines, [], true)).toMatchObject({ total: plain.total, rounding: plain.rounding, taxTotal: plain.taxTotal });
    const t = totalsWithVouchers(lines, [{ amount: D('10.01'), taxAmount: D('1.00') }], true);
    // 99.99 + 10.00 − 10.01 − 1.00 = 98.98 → 99.00
    expect([t.total.toFixed(2), t.rounding.toFixed(2)]).toEqual(['99.00', '0.02']);
  });
});

describe('taxLinesWithVouchers', () => {
  it('shows each tax less what its vouchers take off', () => {
    const lines = [{ taxCode: 'SST10', taxAmount: D('270.00') }, { taxCode: 'SV6', taxAmount: D('18.00') }];
    expect(taxLinesWithVouchers(lines, [{ taxCode: 'SST10', taxAmount: D('5.00') }]).map((t) => `${t.code} ${t.amount.toFixed(2)}`)).toEqual(['SST10 265.00', 'SV6 18.00']);
  });
});

describe('vouchersForInvoice', () => {
  const v = (id: string, amount: string, taxCode = 'SST10') => ({ id, amount: D(amount), taxCode });
  it('takes the vouchers the invoice can cover, and leaves the rest for the next invoice', () => {
    const partial = [line('1', '1327.12')];
    expect(vouchersForInvoice([v('a', '50'), v('b', '1300'), v('c', '20')], partial).map((x) => x.id)).toEqual(['a', 'c']);
    expect(vouchersForInvoice([v('a', '50', 'SV6')], partial)).toEqual([]);
  });
});
