import type { FieldError } from '../../platform/http/errors';
import { dec } from '../../platform/http/decimal';
import { addDays, addMonths } from '../reminders/reminder.rules';

/**
 * The warranty register (phase 5): a complete installation registers each of its items that has a warranty in Core, from
 * the installation day, for that many months. It is active once the order is fully paid (verified receipts), or at once
 * for a job without an order. A claim is a warranty job on the unit; the office decides covered, chargeable or rejected.
 * Pure functions, tested in warranty.rules.spec.ts.
 */

export const WARRANTY_STATUSES = ['PENDING', 'ACTIVE', 'VOID'] as const;
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];
/** What a warranty shows today: expired is worked out, not stored. */
export type WarrantyState = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'VOID';
export const WARRANTY_STATE_LABEL: Record<WarrantyState, string> = { PENDING: 'Waiting for payment', ACTIVE: 'Active', EXPIRED: 'Expired', VOID: 'Void' };

export const ASSESSMENTS = ['COVERED', 'CHARGEABLE', 'REJECTED'] as const;
export type Assessment = (typeof ASSESSMENTS)[number];
export const ASSESSMENT_LABEL: Record<Assessment, string> = { COVERED: 'Covered', CHARGEABLE: 'Chargeable', REJECTED: 'Rejected' };

/** The last day covered: 12 months from 1 Oct 2026 is 30 Sep 2027. */
export const coveredUntil = (startOn: string, months: number): string => addDays(addMonths(startOn, months), -1);

export function warrantyState(w: { status: string; endOn: string }, today: string): WarrantyState {
  if (w.status === 'VOID') return 'VOID';
  if (w.endOn < today) return 'EXPIRED';
  return w.status === 'PENDING' ? 'PENDING' : 'ACTIVE';
}

/** The units a complete installation registers: each item once, with its quantities added up. */
export function warrantiesFrom(
  visit: { doneOn: string; needsPayment: boolean; fullyPaid: boolean },
  items: { itemCode: string; itemName: string; qty: string; uomCode: string; serialNo: string | null; warrantyMonths: number | null }[],
): { itemCode: string; itemName: string; uomCode: string; qty: string; serialNo: string | null; warrantyMonths: number; startOn: string; endOn: string; status: 'PENDING' | 'ACTIVE' }[] {
  const out = new Map<string, ReturnType<typeof warrantiesFrom>[number]>();
  for (const i of items) {
    if (!i.warrantyMonths || i.warrantyMonths < 1) continue;
    const before = out.get(i.itemCode);
    out.set(i.itemCode, {
      itemCode: i.itemCode, itemName: i.itemName, uomCode: i.uomCode, qty: dec(before?.qty ?? 0).add(dec(i.qty)).toString(), serialNo: before?.serialNo ?? i.serialNo,
      warrantyMonths: i.warrantyMonths, startOn: visit.doneOn, endOn: coveredUntil(visit.doneOn, i.warrantyMonths),
      status: visit.needsPayment && !visit.fullyPaid ? 'PENDING' : 'ACTIVE',
    });
  }
  return [...out.values()];
}

/** Digits only, Malaysian country code as a leading 0: how a phone is found however it is typed. */
export function phoneDigits(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.startsWith('60') ? `0${d.slice(2)}` : d;
}

/** Why a claim cannot be made on the unit, or null. An expired or unpaid one can: the office decides. */
export function claimRefusal(w: { status: string; itemCode: string }): string | null {
  return w.status === 'VOID' ? `The warranty of ${w.itemCode} is void.` : null;
}

/** The decision starts as covered only for an active warranty. */
export const suggestedAssessment = (state: WarrantyState): Assessment => (state === 'ACTIVE' ? 'COVERED' : 'CHARGEABLE');

export function assessErrors(a: { result?: string | null; note?: string | null }): FieldError[] {
  const errors: FieldError[] = [];
  if (!(ASSESSMENTS as readonly string[]).includes(a.result ?? '')) errors.push({ field: 'result', message: 'Pick covered, chargeable or rejected.' });
  else if (a.result !== 'COVERED' && !a.note?.trim()) errors.push({ field: 'note', message: a.result === 'REJECTED' ? 'Type why it is rejected.' : 'Type why it is charged.' });
  return errors;
}

export interface PartLine {
  itemCode: string;
  qty: string;
}

/** Parts used: known items, each once, more than 0. */
export function partErrors(lines: PartLine[], known: Set<string>): FieldError[] {
  const errors: FieldError[] = [];
  lines.forEach((l, i) => {
    if (!known.has(l.itemCode)) errors.push({ field: `parts[${i}].itemCode`, message: `Pick an item from the list (${l.itemCode || 'none'}).` });
    else if (!/^\d{1,14}(\.\d{1,4})?$/.test(l.qty.trim()) || dec(l.qty).lte(0)) errors.push({ field: `parts[${i}].qty`, message: 'Enter a quantity like 1.' });
  });
  if (new Set(lines.map((l) => l.itemCode)).size !== lines.length) errors.push({ field: 'parts', message: 'Each part once.' });
  return errors;
}
