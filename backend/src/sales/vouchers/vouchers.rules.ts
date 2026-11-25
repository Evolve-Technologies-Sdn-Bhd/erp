import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/**
 * The voucher list (phase 5, the Sales Support answer): Sales Support sets up each voucher with its amount, its dates and
 * how many orders may use it; salespeople pick one on the order and never type an amount. On with the Sales Flow switch
 * "Vouchers come from the voucher list". Pure functions, tested in vouchers.rules.spec.ts.
 */
export type VoucherStatus = 'SCHEDULED' | 'RUNNING' | 'USED_UP' | 'ENDED';
export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = { SCHEDULED: 'Scheduled', RUNNING: 'Running', USED_UP: 'Used up', ENDED: 'Ended' };

export interface VoucherDates {
  validFrom: string;
  validUntil: string | null;
  maxUses: number | null;
}

/** Where a voucher stands on a day, with how many orders use it. Used up is said before ended. */
export function voucherStatus(v: VoucherDates, uses: number, on: string): VoucherStatus {
  if (v.validUntil && v.validUntil < on) return 'ENDED';
  if (v.maxUses !== null && uses >= v.maxUses) return 'USED_UP';
  return v.validFrom > on ? 'SCHEDULED' : 'RUNNING';
}

const NO = /^[A-Z0-9][A-Z0-9@._-]{1,29}$/;
const MONEY = /^\d{1,15}(\.\d{1,2})?$/;

export interface VoucherFields {
  voucherNo: string;
  description: string;
  amount: string;
  validFrom: string;
  validUntil: string | null;
  maxUses: number | null;
}

export const cleanVoucherNo = (v: string) => v.trim().toUpperCase();

/** What a voucher needs. `used`: orders use it, so its number and amount stay and its uses cannot go below them. */
export function voucherErrors(v: VoucherFields, used: { uses: number; voucherNo: string; amount: DecimalInput } | null = null): FieldError[] {
  const errors: FieldError[] = [];
  if (!NO.test(cleanVoucherNo(v.voucherNo))) errors.push({ field: 'voucherNo', message: 'A voucher number has 2 to 30 letters, digits, @ . _ or -.' });
  if (!v.description.trim()) errors.push({ field: 'description', message: 'Say what the voucher is for, like Cash voucher RM 50.' });
  if (!MONEY.test(v.amount.trim()) || dec(v.amount.trim()).lte(0)) errors.push({ field: 'amount', message: 'Amount more than 0, like 50.00.' });
  if (v.validUntil && v.validUntil < v.validFrom) errors.push({ field: 'validUntil', message: 'The last day cannot be before the first.' });
  if (v.maxUses !== null && (!Number.isInteger(v.maxUses) || v.maxUses < 1)) errors.push({ field: 'maxUses', message: 'A whole number of 1 or more, or leave it empty for no limit.' });
  if (used && used.uses > 0) {
    const orders = `${used.uses} ${used.uses === 1 ? 'order uses' : 'orders use'} it`;
    if (cleanVoucherNo(v.voucherNo) !== used.voucherNo) errors.push({ field: 'voucherNo', message: `${orders}: its number stays.` });
    if (MONEY.test(v.amount.trim()) && !dec(v.amount.trim()).eq(dec(used.amount))) errors.push({ field: 'amount', message: `${orders}: its amount stays. End it and add a new voucher.` });
    if (v.maxUses !== null && v.maxUses < used.uses) errors.push({ field: 'maxUses', message: `${orders} already.` });
  }
  return errors;
}

/** Why an order of this date cannot take a voucher, or null. */
export function cannotUse(no: string, v: (VoucherDates & { uses: number }) | null, orderDate: string): string | null {
  if (!v) return `${no} is not on the voucher list. Pick one from the list.`;
  const status = voucherStatus(v, v.uses, orderDate);
  if (status === 'SCHEDULED') return `${no} starts on ${v.validFrom}.`;
  if (status === 'ENDED') return `${no} ended on ${v.validUntil}.`;
  if (status === 'USED_UP') return `${no} is used up: ${v.uses} of ${v.maxUses} orders.`;
  return null;
}

/** "2 of 50", "2", for the list. */
export const usesText = (uses: number, maxUses: number | null) => (maxUses === null ? String(uses) : `${uses} of ${maxUses}`);

export interface ListedVoucher extends VoucherDates {
  voucherNo: string;
  description: string;
  amount: Prisma.Decimal;
  uses: number;
}

/**
 * The order's vouchers as the list has them: number, name and amount from the list, the tax they lower as asked. One
 * the order already has stays as it is, even when it has ended since.
 */
export function fromList<V extends { voucherNo: string; amount: DecimalInput; description?: string | null; taxCode?: string | null }>(
  asked: V[], listed: ListedVoucher[], kept: { voucherNo: string; amount: DecimalInput; description: string }[], orderDate: string,
): { vouchers: V[]; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const vouchers = asked.map((v, i) => {
    const no = cleanVoucherNo(v.voucherNo);
    const had = kept.find((k) => k.voucherNo === no);
    if (had) return { ...v, voucherNo: no, amount: had.amount, description: had.description };
    const row = listed.find((x) => x.voucherNo === no) ?? null;
    const why = no ? cannotUse(no, row, orderDate) : 'Pick a voucher from the list.';
    if (why) errors.push({ field: `vouchers[${i}].voucherNo`, message: why });
    return row ? { ...v, voucherNo: no, amount: row.amount, description: row.description } : v;
  });
  return { vouchers, errors };
}
