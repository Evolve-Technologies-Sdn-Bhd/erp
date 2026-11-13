import { Prisma } from '@prisma/client';

/**
 * Package prices, shared by Core (C16 shows the spread) and Sales (an order line of a package is priced from it).
 * Read side of master data: pure functions, no writes. Tested in package-price.rules.spec.ts.
 */

export interface SpreadLine {
  itemCode: string;
  qty: Prisma.Decimal;
  uomCode: string;
  /** The item's price on the package's price list for that unit today, or null when it has none. */
  listPrice: Prisma.Decimal | null;
}

export interface SpreadResult {
  normalValue: Prisma.Decimal;
  saves: Prisma.Decimal;
  lines: { itemCode: string; listValue: Prisma.Decimal; amount: Prisma.Decimal; unitPrice: Prisma.Decimal }[];
  /** Items without a list price: then nothing can be spread. */
  missing: string[];
}

/**
 * The package price spread over its items by their list value (FIELD_SALES_SEED_DATA.md choice 4): each line's
 * amount is round(price × its value ÷ total value, 2), the last line takes what is left so the lines add up to the
 * package price exactly, and its unit price is round(amount ÷ qty, 4). Each item then has a real price for delivery,
 * invoice and returns.
 */
export function spreadPrice(packagePrice: Prisma.Decimal, lines: SpreadLine[]): SpreadResult {
  const missing = lines.filter((l) => !l.listPrice).map((l) => l.itemCode);
  const values = lines.map((l) => (l.listPrice ? l.qty.mul(l.listPrice).toDecimalPlaces(2) : new Prisma.Decimal(0)));
  const normalValue = values.reduce((a, v) => a.add(v), new Prisma.Decimal(0));
  if (missing.length || normalValue.lte(0)) {
    return { normalValue, saves: new Prisma.Decimal(0), lines: lines.map((l, i) => ({ itemCode: l.itemCode, listValue: values[i]!, amount: new Prisma.Decimal(0), unitPrice: new Prisma.Decimal(0) })), missing };
  }
  let given = new Prisma.Decimal(0);
  const out = lines.map((l, i) => {
    const last = i === lines.length - 1;
    const amount = last ? packagePrice.sub(given) : packagePrice.mul(values[i]!).div(normalValue).toDecimalPlaces(2);
    given = given.add(amount);
    return { itemCode: l.itemCode, listValue: values[i]!, amount, unitPrice: amount.div(l.qty).toDecimalPlaces(4) };
  });
  return { normalValue, saves: normalValue.sub(packagePrice), lines: out, missing };
}

/** A package can be sold on a date from its first day through its last day, and through the day it was ended early. */
export function packageRunsOn(p: { runsFrom: string; runsUntil: string | null; endedOn: string | null }, date: string): boolean {
  return p.runsFrom <= date && (!p.runsUntil || p.runsUntil >= date) && (!p.endedOn || p.endedOn >= date);
}
