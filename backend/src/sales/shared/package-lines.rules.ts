import { Prisma } from '@prisma/client';
import type { MdPackage } from '../../master-data/master-data.port';
import { packageRunsOn, spreadPrice } from '../../master-data/package-price.rules';
import type { FieldError } from '../../platform/http/errors';

/**
 * Package lines on a sales order (phase 5, F1 part 3). A package goes on the order as one line, and is kept as its
 * items priced from the package (FIELD_SALES_SEED_DATA.md choice 4) plus its free gifts at 0.00 (choice 3), so
 * delivery, invoice, returns and stock work on real items. Pure functions, tested in package-lines.rules.spec.ts.
 */

export type LineKind = 'ITEM' | 'PACKAGE' | 'GIFT';

/** What a package line on the order asks for: the package, how many sets, and the gift the customer chose. */
export interface PackageRequest {
  index: number;
  packageCode: string;
  qty: string;
  giftItemCode?: string | null;
}

/** The package fields every line of one package carries. */
export interface PackageMeta {
  lineKind: LineKind;
  packageGroup: number | null;
  packageCode: string | null;
  packageName: string | null;
  packageQty: Prisma.Decimal | null;
  packagePrice: Prisma.Decimal | null;
  packageUomCode: string | null;
}

export const ITEM_META: PackageMeta = { lineKind: 'ITEM', packageGroup: null, packageCode: null, packageName: null, packageQty: null, packagePrice: null, packageUomCode: null };

/** One line of the order the package becomes. */
export interface ExpandedLine {
  itemCode: string;
  qty: string;
  unitPrice: string;
  /** Sold under the package's tax code; the list price kept is the package's price for the item, so no price check trips. */
  taxCode: string;
  listPrice: string | null;
  meta: PackageMeta;
}

const D = (v: string | number) => new Prisma.Decimal(v);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "1 Dec 2026" */
export const dayText = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const plainQty = (v: Prisma.Decimal) => (v.isInteger() ? v.toFixed(0) : v.toString());

/** Why the package cannot be sold on that date, or null. */
export function notRunningReason(p: Pick<MdPackage, 'code' | 'runsFrom' | 'runsUntil' | 'endedOn'>, date: string): string | null {
  if (packageRunsOn(p, date)) return null;
  if (p.runsFrom > date) return `${p.code} starts on ${dayText(p.runsFrom)}, so it cannot be sold yet.`;
  const last = p.endedOn && (!p.runsUntil || p.endedOn < p.runsUntil) ? p.endedOn : p.runsUntil!;
  return `${p.code} ended on ${dayText(last)}, so it cannot be sold.`;
}

/**
 * Turns one package request into its order lines. `prices` holds the list prices on the package's price list on the
 * order date (key `item|unit`); `salesUnits` the unit Sales sells each item in. The spread is worked out once per
 * set, and the items' quantities are the package's quantities × sets.
 */
export function expandPackage(
  req: PackageRequest,
  pkg: MdPackage | null,
  ctx: { docDate: string; group: number; prices: Map<string, string>; salesUnits: Map<string, string> },
): { lines: ExpandedLine[]; errors: FieldError[] } {
  const at = `lines[${req.index}]`;
  const errors: FieldError[] = [];
  if (!pkg) return { lines: [], errors: [{ field: `${at}.packageCode`, message: 'Pick a package from Core.' }] };
  const notRunning = notRunningReason(pkg, ctx.docDate);
  if (notRunning) errors.push({ field: `${at}.packageCode`, message: notRunning });
  const sets = /^\d+(\.\d+)?$/.test(req.qty) ? D(req.qty) : D(0);
  if (!sets.isInteger() || sets.lte(0)) errors.push({ field: `${at}.qty`, message: 'Packages are sold in whole sets.' });

  for (const l of [...pkg.items, ...pkg.gifts]) {
    const unit = ctx.salesUnits.get(l.itemCode);
    if (unit && unit !== l.uomCode) {
      errors.push({ field: `${at}.packageCode`, message: `${pkg.code} has ${l.itemCode} in ${l.uomCode}, but Sales sells ${l.itemCode} in ${unit}. Change the package in Core.` });
    }
  }

  const spread = spreadPrice(D(pkg.packagePrice), pkg.items.map((i) => {
    const price = ctx.prices.get(`${i.itemCode}|${i.uomCode}`);
    return { itemCode: i.itemCode, qty: D(i.qty), uomCode: i.uomCode, listPrice: price ? D(price) : null };
  }));
  if (spread.missing.length) {
    errors.push({ field: `${at}.packageCode`, message: `${pkg.code}: ${pkg.priceListCode} has no price for ${spread.missing.join(', ')}, so the package price cannot be spread over its items. Add the price in Core.` });
  }

  const gift = (req.giftItemCode ?? '').trim();
  let gifts = pkg.gifts;
  if (pkg.giftRule === 'NONE') {
    if (gift) errors.push({ field: `${at}.giftItemCode`, message: `${pkg.code} has no free gift.` });
    gifts = [];
  } else if (pkg.giftRule === 'CHOOSE_ONE') {
    if (!gift) errors.push({ field: `${at}.giftItemCode`, message: `Pick the free gift for ${pkg.code}.` });
    else if (!pkg.gifts.some((g) => g.itemCode === gift)) errors.push({ field: `${at}.giftItemCode`, message: `${gift} is not one of the gifts of ${pkg.code}.` });
    gifts = pkg.gifts.filter((g) => g.itemCode === gift);
  }
  if (errors.length) return { lines: [], errors };

  const meta = (lineKind: LineKind): PackageMeta => ({
    lineKind, packageGroup: ctx.group, packageCode: pkg.code, packageName: pkg.name, packageQty: sets, packagePrice: D(pkg.packagePrice), packageUomCode: pkg.uomCode,
  });
  const items: ExpandedLine[] = pkg.items.map((i, n) => {
    const unitPrice = spread.lines[n]!.unitPrice.toFixed(4);
    return { itemCode: i.itemCode, qty: plainQty(D(i.qty).mul(sets)), unitPrice, taxCode: pkg.salesTaxCode, listPrice: unitPrice, meta: meta('PACKAGE') };
  });
  const free: ExpandedLine[] = gifts.map((g) => ({ itemCode: g.itemCode, qty: plainQty(D(g.qty).mul(sets)), unitPrice: '0', taxCode: pkg.salesTaxCode, listPrice: null, meta: meta('GIFT') }));
  return { lines: [...items, ...free], errors: [] };
}

/** Field errors of the built lines point at the line the user typed, not at the item lines a package became. */
export function toEnteredLine(errors: FieldError[], origin: number[]): FieldError[] {
  return errors.map((e) => {
    const m = /^lines\[(\d+)\](.*)$/.exec(e.field);
    if (!m) return e;
    const at = origin[Number(m[1])];
    return at === undefined ? e : { ...e, field: `lines[${at}]${m[2]}` };
  });
}
