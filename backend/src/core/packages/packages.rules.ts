import { Prisma } from '@prisma/client';
import type { FieldError } from '../../platform/http/errors';

/** Package rules (C15, C16; CLAUDE.md → Phase 5). Pure functions, tested in packages.rules.spec.ts. */

export const PACKAGE_CODE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export const GIFT_RULES = ['NONE', 'ALWAYS', 'CHOOSE_ONE'] as const;
export type GiftRule = (typeof GIFT_RULES)[number];
export const GIFT_RULE_LABEL: Record<GiftRule, string> = { NONE: 'No gift', ALWAYS: 'These gifts, always', CHOOSE_ONE: 'Customer chooses 1' };

export type PackageStatus = 'SCHEDULED' | 'RUNNING' | 'ENDED';
export const PACKAGE_STATUSES: readonly PackageStatus[] = ['RUNNING', 'SCHEDULED', 'ENDED'];
export const STATUS_LABEL: Record<PackageStatus, string> = { SCHEDULED: 'Scheduled', RUNNING: 'Running', ENDED: 'Ended' };

export type PackageAction = 'edit' | 'end' | 'delete';

/** Scheduled before its first day, ended after its last day (or once ended early), running in between. */
export function packageStatus(p: { runsFrom: string; runsUntil: string | null; endedOn: string | null }, today: string): PackageStatus {
  if (p.endedOn && p.endedOn < today) return 'ENDED';
  if (p.runsUntil && p.runsUntil < today) return 'ENDED';
  if (p.runsFrom > today) return 'SCHEDULED';
  return 'RUNNING';
}

/** End now only stops a package that is running: it runs through today and is ended from tomorrow. */
export function endRefusal(code: string, status: PackageStatus, endedOn: string | null = null): string | null {
  if (status === 'RUNNING') return endedOn ? `${code} was ended already. Today is its last day.` : null;
  return status === 'SCHEDULED' ? `${code} has not started yet. Change its dates or delete it instead.` : `${code} has already ended.`;
}

export interface PackageLine {
  itemCode: string;
  qty: Prisma.Decimal;
  uomCode: string;
}

/** What the form knows about an item that can go into a package or be given away. */
export interface LineItem {
  name: string;
  status: string;
  isSellable: boolean;
  units: string[];
}

/** The package's own fields: a name, dates in order, a price above 0, and a gift rule that matches its gifts. */
export function headerErrors(p: { runsFrom: string; runsUntil: string | null; packagePrice: Prisma.Decimal; giftRule: GiftRule; giftCount: number }): FieldError[] {
  const errors: FieldError[] = [];
  if (p.runsUntil && p.runsUntil < p.runsFrom) errors.push({ field: 'runsUntil', message: 'Runs until cannot be before Runs from.' });
  if (p.packagePrice.lte(0)) errors.push({ field: 'packagePrice', message: 'The package price must be more than 0.' });
  if (p.giftRule === 'NONE' && p.giftCount > 0) errors.push({ field: 'gifts', message: 'Remove the gifts, or choose how they are given.' });
  if (p.giftRule === 'ALWAYS' && p.giftCount < 1) errors.push({ field: 'gifts', message: 'Add the gift, or choose No gift.' });
  if (p.giftRule === 'CHOOSE_ONE' && p.giftCount < 2) errors.push({ field: 'gifts', message: 'Add at least 2 gifts for the customer to choose from.' });
  return errors;
}

/**
 * Items and gifts: at least one item; each line an active item in one of its units, with a quantity above 0, and no
 * item twice in the same list. Package items must be for sale; a gift only has to be active, since a gift item is
 * often not sold on its own.
 */
export function lineErrors(list: 'items' | 'gifts', lines: PackageLine[], items: Map<string, LineItem>): FieldError[] {
  const errors: FieldError[] = [];
  if (list === 'items' && lines.length === 0) errors.push({ field: 'items', message: 'Add at least one item to the package.' });
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const at = `${list}[${i}]`;
    const item = items.get(l.itemCode);
    if (!item) errors.push({ field: `${at}.itemCode`, message: `${l.itemCode} is not an item in Core.` });
    else if (item.status !== 'ACTIVE') errors.push({ field: `${at}.itemCode`, message: `${l.itemCode} is ${item.status.toLowerCase()}, so it cannot be used.` });
    else if (list === 'items' && !item.isSellable) errors.push({ field: `${at}.itemCode`, message: `${l.itemCode} is not for sale.` });
    else if (!item.units.includes(l.uomCode)) errors.push({ field: `${at}.uomCode`, message: `${l.itemCode} is not kept in ${l.uomCode}. Use ${item.units.join(' or ')}.` });
    if (seen.has(l.itemCode)) errors.push({ field: `${at}.itemCode`, message: `${l.itemCode} is in the list twice. Change the quantity instead.` });
    seen.add(l.itemCode);
    if (l.qty.lte(0)) errors.push({ field: `${at}.qty`, message: 'The quantity must be more than 0.' });
  });
  return errors;
}

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

/** A package price above the items' normal value is allowed, but the form says so. */
export function priceWarning(spread: SpreadResult): string | null {
  if (spread.missing.length) return `No list price today for ${spread.missing.join(', ')} on this price list, so the saving cannot be worked out.`;
  if (spread.saves.lt(0)) return `The package costs ${spread.saves.neg().toFixed(2)} more than its items on their own.`;
  return null;
}

/** Lines as text for the audit trail and the event: "1 × TB-DIN-06 PCS, 6 × CH-DIN-01 PCS". */
export function linesText(lines: PackageLine[]): string {
  return lines.map((l) => `${l.qty.toString()} × ${l.itemCode} ${l.uomCode}`).join(', ') || '—';
}
