import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/**
 * The price range (phase 5, F1; decision 11, from the field-sales app design): with the Sales Flow switch on, a
 * salesperson may set a price between a set percentage below and above the customer's price list; outside it the
 * Sales Manager approves before release. It replaces the quotation's discount limit and also applies to sales orders,
 * where field salespeople key orders straight away. Off, the standard rules stand (discount limit on quotations, strict
 * price list on invoices). Pure functions, tested in price-range.rules.spec.ts.
 */

export interface PriceRange {
  belowPct: DecimalInput;
  abovePct: DecimalInput;
}

/** The company's price rule: the range when it is on (null when off), and the quotation's discount limit. */
export interface PriceRule {
  range: { belowPct: string; abovePct: string } | null;
  discountPct: string;
}

/** The range the field-sales design asks for: 10% below to 20% above the price list. */
export const DEFAULT_RANGE = { belowPct: '10', abovePct: '20' } as const;

export interface RangeLine {
  unitPrice: DecimalInput;
  discountPct: DecimalInput;
  /** The customer's price-list price when the line was added; null when the item has none. */
  listPrice: DecimalInput | null;
  /** ITEM, PACKAGE (priced by its package) or GIFT. */
  lineKind?: string;
  /** The net price already checked on the document this line came from (quotation → order → invoice), if any. */
  approvedNet?: DecimalInput | null;
}

/** What the customer pays per unit: the unit price less the line discount. */
export const netUnitPrice = (l: { unitPrice: DecimalInput; discountPct: DecimalInput }): Prisma.Decimal =>
  dec(l.unitPrice).mul(dec(100).sub(dec(l.discountPct))).div(100);

/** How far a net price is from the list, in percent: −12 below, 25 above. */
const offBy = (net: Prisma.Decimal, list: Prisma.Decimal): Prisma.Decimal => net.sub(list).div(list).mul(100);

export interface RangeResult {
  /** Lines outside the range. */
  count: number;
  /** The furthest below (negative) and above (positive) the list, in whole percent or one decimal; null when none. */
  lowestPct: number | null;
  highestPct: number | null;
  /** Indexes of the lines outside, in the order given. */
  lines: number[];
}

/**
 * Lines priced outside the range. Left out: lines without a list price, package items and gifts (priced by the
 * package), and a line whose net price was already checked on the document it came from.
 */
export function outsideRange(lines: RangeLine[], range: PriceRange): RangeResult {
  const low = dec(100).sub(dec(range.belowPct)).div(100);
  const high = dec(100).add(dec(range.abovePct)).div(100);
  const out: RangeResult = { count: 0, lowestPct: null, highestPct: null, lines: [] };
  lines.forEach((l, i) => {
    if (l.listPrice === null || l.listPrice === undefined || (l.lineKind && l.lineKind !== 'ITEM')) return;
    const list = dec(l.listPrice);
    if (list.lte(0)) return;
    const net = netUnitPrice(l);
    if (l.approvedNet !== null && l.approvedNet !== undefined && dec(l.approvedNet).eq(net)) return;
    if (net.gte(list.mul(low)) && net.lte(list.mul(high))) return;
    const pct = Number(offBy(net, list).toDecimalPlaces(1));
    out.count += 1;
    out.lines.push(i);
    if (pct < 0) out.lowestPct = out.lowestPct === null ? pct : Math.min(out.lowestPct, pct);
    else out.highestPct = out.highestPct === null ? pct : Math.max(out.highestPct, pct);
  });
  return out;
}

const pctText = (v: DecimalInput) => `${dec(v).toDecimalPlaces(2).toString()}%`;

/** "10% below to 20% above the price list" */
export const rangeText = (range: PriceRange) => `${pctText(range.belowPct)} below to ${pctText(range.abovePct)} above the price list`;

/**
 * "Price 12% below the price list on 1 line (allowed: 10% below to 20% above)", or for a mix:
 * "Prices outside the allowed range on 2 lines: 12% below to 25% above the price list (allowed: …)".
 */
export function rangeReason(r: RangeResult, range: PriceRange): string {
  const lines = `${r.count} ${r.count === 1 ? 'line' : 'lines'}`;
  const allowed = `(allowed: ${pctText(range.belowPct)} below to ${pctText(range.abovePct)} above)`;
  if (r.lowestPct !== null && r.highestPct !== null) {
    return `Prices outside the allowed range on ${lines}: ${Math.abs(r.lowestPct)}% below to ${r.highestPct}% above the price list ${allowed}`;
  }
  if (r.lowestPct !== null) return `Price ${Math.abs(r.lowestPct)}% below the price list on ${lines} ${allowed}`;
  return `Price ${r.highestPct}% above the price list on ${lines} ${allowed}`;
}

/** The two percentages: below from 0 to 100, above from 0 to 1,000, at most two decimals. */
export function rangeErrors(range: { belowPct: string; abovePct: string }): FieldError[] {
  const errors: FieldError[] = [];
  const NUM = /^\d+(\.\d{1,2})?$/;
  if (!NUM.test(range.belowPct.trim()) || dec(range.belowPct.trim()).gt(100)) errors.push({ field: 'priceBelowPct', message: 'Type a percentage from 0 to 100.' });
  if (!NUM.test(range.abovePct.trim()) || dec(range.abovePct.trim()).gt(1000)) errors.push({ field: 'priceAbovePct', message: 'Type a percentage from 0 to 1,000.' });
  return errors;
}
