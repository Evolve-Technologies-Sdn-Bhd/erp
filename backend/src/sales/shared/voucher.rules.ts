import { Prisma } from '@prisma/client';
import { dec, roundMoney, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';
import { roundTo5Sen, saleTotals, type SaleLineTotals, type SaleTotals } from './totals.rules';

/**
 * Vouchers on a sales order (phase 5, F1 part 4). A voucher is a number the agent types (CV-2609-0031) and an amount
 * off. It lowers the amount tax is charged on (FIELD_SALES_SEED_DATA.md choice 2, to be confirmed by the client's
 * accountant): its tax is round(amount × rate, 2) at the rate of the items it lowers. It is kept beside the order's
 * lines, not as one, so it never reaches a delivery order or the warehouse; the order's first invoice that can take
 * it uses it. Pure functions, tested in voucher.rules.spec.ts.
 */

export interface VoucherInput {
  voucherNo: string;
  amount: DecimalInput;
  description?: string | null;
  /** Which tax the voucher lowers. Needed only when the document has items under more than one tax code. */
  taxCode?: string | null;
}

/** A voucher ready to keep: its tax code and rate, and the tax it takes off. */
export interface PricedVoucher {
  voucherNo: string;
  description: string;
  amount: Prisma.Decimal;
  taxCode: string;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}

export interface TaxedLine extends SaleLineTotals {
  taxCode: string;
  taxRate: Prisma.Decimal;
}

export interface VoucherTotals extends SaleTotals {
  voucherTotal: Prisma.Decimal;
}

export const DEFAULT_VOUCHER_DESCRIPTION = 'Voucher';
const money = (v: Prisma.Decimal) => v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Amount before tax under each tax code, with its rate: what vouchers may lower. */
export function netByTax(lines: TaxedLine[]): Map<string, { rate: Prisma.Decimal; amount: Prisma.Decimal }> {
  const out = new Map<string, { rate: Prisma.Decimal; amount: Prisma.Decimal }>();
  for (const l of lines) {
    const entry = out.get(l.taxCode) ?? { rate: l.taxRate, amount: dec(0) };
    entry.amount = entry.amount.add(l.amount);
    out.set(l.taxCode, entry);
  }
  return out;
}

/**
 * Checks the vouchers against the document's lines and prices them. A voucher needs a number (not twice on one
 * document) and an amount above 0; it lowers one tax code's items, and together the vouchers on a tax code cannot
 * be more than those items before tax. Errors use `vouchers[i].field`.
 */
export function priceVouchers(input: VoucherInput[], lines: TaxedLine[], taxNames: Map<string, string> = new Map()): { vouchers: PricedVoucher[]; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const net = netByTax(lines);
  const codes = [...net.keys()];
  const seen = new Set<string>();
  const used = new Map<string, Prisma.Decimal>();
  const vouchers: PricedVoucher[] = [];
  input.forEach((v, i) => {
    const at = `vouchers[${i}]`;
    const no = v.voucherNo.trim().toUpperCase();
    if (!no) errors.push({ field: `${at}.voucherNo`, message: 'Type the voucher number.' });
    else if (seen.has(no)) errors.push({ field: `${at}.voucherNo`, message: `Voucher ${no} is on this order twice.` });
    seen.add(no);
    const amount = dec(v.amount);
    if (amount.lte(0)) errors.push({ field: `${at}.amount`, message: 'The voucher amount must be more than 0.' });
    const asked = v.taxCode?.trim() || null;
    let taxCode: string | null = asked;
    if (!codes.length) errors.push({ field: `${at}.amount`, message: 'Add the items before the voucher.' });
    else if (asked && !net.has(asked)) errors.push({ field: `${at}.taxCode`, message: `No item on this order is under ${asked}. Pick ${codes.join(' or ')}.` });
    else if (!asked && codes.length > 1) errors.push({ field: `${at}.taxCode`, message: `Pick which tax the voucher lowers: ${codes.join(' or ')}.` });
    else taxCode = asked ?? codes[0]!;
    if (!taxCode || !net.has(taxCode) || amount.lte(0)) return;
    const { rate, amount: base } = net.get(taxCode)!;
    const total = (used.get(taxCode) ?? dec(0)).add(amount);
    used.set(taxCode, total);
    if (total.gt(base)) {
      errors.push({ field: `${at}.amount`, message: `Vouchers cannot be more than the ${taxNames.get(taxCode) ?? taxCode} items before tax (${money(base)}).` });
      return;
    }
    vouchers.push({
      voucherNo: no, description: v.description?.trim() || DEFAULT_VOUCHER_DESCRIPTION, amount: roundMoney(amount), taxCode, taxRate: rate,
      taxAmount: roundMoney(roundMoney(amount).mul(rate)),
    });
  });
  return { vouchers: errors.length ? [] : vouchers, errors };
}

/**
 * Header totals with vouchers: the lines as rule 14 adds them, less the vouchers and the tax they take off, then the
 * 5-sen rounding on what is left. With no vouchers this is exactly saleTotals.
 */
export function totalsWithVouchers(lines: SaleLineTotals[], vouchers: Pick<PricedVoucher, 'amount' | 'taxAmount'>[], roundTo5: boolean): VoucherTotals {
  const base = saleTotals(lines, 'EXCLUSIVE', false);
  const voucherTotal = vouchers.reduce((s, v) => s.add(v.amount), dec(0));
  const voucherTax = vouchers.reduce((s, v) => s.add(v.taxAmount), dec(0));
  const taxTotal = base.taxTotal.sub(voucherTax);
  const beforeRounding = base.total.sub(voucherTotal).sub(voucherTax);
  const total = roundTo5 ? roundTo5Sen(beforeRounding) : beforeRounding;
  return { subtotal: base.subtotal, discountTotal: base.discountTotal, voucherTotal, taxTotal, rounding: total.sub(beforeRounding), total };
}

/** Tax per code for the totals box, less what the vouchers take off. */
export function taxLinesWithVouchers(lines: { taxCode: string; taxAmount: Prisma.Decimal }[], vouchers: { taxCode: string; taxAmount: Prisma.Decimal }[]): { code: string; amount: Prisma.Decimal }[] {
  return [...new Set(lines.map((l) => l.taxCode))].map((code) => ({
    code,
    amount: lines.filter((l) => l.taxCode === code).reduce((s, l) => s.add(l.taxAmount), dec(0))
      .sub(vouchers.filter((v) => v.taxCode === code).reduce((s, v) => s.add(v.taxAmount), dec(0))),
  }));
}

/**
 * Which of an order's unused vouchers an invoice takes: each in turn, while the invoice's items under its tax code
 * still cover it. One that does not fit waits for the order's next invoice.
 */
export function vouchersForInvoice<V extends { id: string; amount: Prisma.Decimal; taxCode: string }>(available: V[], invoiceLines: TaxedLine[]): V[] {
  const room = new Map([...netByTax(invoiceLines)].map(([code, v]) => [code, v.amount]));
  const taken: V[] = [];
  for (const v of available) {
    const left = room.get(v.taxCode);
    if (!left || left.lt(v.amount)) continue;
    room.set(v.taxCode, left.sub(v.amount));
    taken.push(v);
  }
  return taken;
}
