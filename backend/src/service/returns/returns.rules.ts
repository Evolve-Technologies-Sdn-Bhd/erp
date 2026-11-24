import { dec } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/**
 * Parts an installer brings back (phase 5): listed when the visit is recorded, from the job's own items, then received by
 * the store as good or damaged. Stock is not moved by the ERP: the WMS counts it when it is scanned. Pure functions.
 */

export interface ReturnLine {
  itemCode: string;
  qty: string;
}

const QTY = /^\d{1,14}(\.\d{1,4})?$/;

/** Each line: an item of the job, more than 0, and not more than the job took. Lines of 0 are left out. */
export function returnErrors(lines: ReturnLine[], items: { itemCode: string; qty: string }[]): FieldError[] {
  const errors: FieldError[] = [];
  lines.forEach((l, i) => {
    const field = `returns[${i}].qty`;
    const took = items.filter((x) => x.itemCode === l.itemCode).reduce((s, x) => s.add(dec(x.qty)), dec(0));
    if (!QTY.test(l.qty.trim())) errors.push({ field, message: 'Enter a quantity like 1.' });
    else if (took.eq(0)) errors.push({ field, message: `${l.itemCode} is not on this job.` });
    else if (dec(l.qty).gt(took)) errors.push({ field, message: `Not more than the job took (${took.toString()}).` });
  });
  if (new Set(lines.map((l) => l.itemCode)).size !== lines.length) errors.push({ field: 'returns', message: 'Each item once.' });
  return errors;
}

/** What the store counted: good and damaged, together not more than what was said to come back. */
export function receiveErrors(r: { goodQty: string; damagedQty: string; note?: string | null }, qty: string): FieldError[] {
  const errors: FieldError[] = [];
  for (const k of ['goodQty', 'damagedQty'] as const) if (!QTY.test(r[k].trim())) errors.push({ field: k, message: 'Enter a quantity like 1.' });
  if (errors.length) return errors;
  const total = dec(r.goodQty).add(dec(r.damagedQty));
  if (total.gt(dec(qty))) errors.push({ field: 'goodQty', message: `Good and damaged together cannot be more than ${dec(qty).toString()}.` });
  else if (total.lt(dec(qty)) && !r.note?.trim()) errors.push({ field: 'note', message: `${dec(qty).sub(total).toString()} missing: say why.` });
  return errors;
}

/** "1 good, 1 damaged, 1 missing" */
export function receivedText(qty: string, good: string, damaged: string): string {
  const missing = dec(qty).sub(dec(good)).sub(dec(damaged));
  return [dec(good).gt(0) && `${dec(good).toString()} good`, dec(damaged).gt(0) && `${dec(damaged).toString()} damaged`, missing.gt(0) && `${missing.toString()} missing`].filter(Boolean).join(', ') || 'nothing';
}

/** Why a job of a past day is unfinished, or null: its visit not recorded, or its delivery order not signed. */
export function unfinished(j: { stage: string; jobDate: string | null; deliveryNo: string | null; delivered: boolean }, today: string): string | null {
  if (!j.jobDate || j.jobDate >= today) return null;
  if (j.stage === 'BOOKED') return 'the visit is not recorded';
  if ((j.stage === 'DONE' || j.stage === 'CLOSED') && j.deliveryNo && !j.delivered) return `${j.deliveryNo} is not signed`;
  return null;
}
