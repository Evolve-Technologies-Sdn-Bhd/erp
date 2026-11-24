import type { FieldError } from '../../platform/http/errors';
import type { DeliveryAction } from './delivery.rules';

/**
 * The signed delivery order (phase 5): with "The customer signs the delivery order" on, a delivery order of an order with
 * installation is first collected from the store, then delivered when the customer signs. A customer who refuses needs a
 * reason and a photo, and Management accepts it unsigned or sends it back. Goods of a postponed job are checked back in
 * and collected again later on the same delivery order. Pure functions, tested in signed-delivery.rules.spec.ts.
 */

export type SignState = 'TO_COLLECT' | 'COLLECTED' | 'REFUSED' | 'DELIVERED';

export interface Signable {
  status: 'DRAFT' | 'CONFIRMED';
  isMigrated: boolean;
  collectedAt: Date | null;
  refusedAt: Date | null;
  signedAt: Date | null;
  unsignedByName: string | null;
}

/** Whether the delivery order follows the signature steps: the switch, and an order with installation. */
export const needsSignature = (switchOn: boolean, installOption: string | null | undefined): boolean => switchOn && installOption === 'INSTALLATION';

export function signState(d: Signable): SignState {
  if (d.status === 'CONFIRMED') return 'DELIVERED';
  if (d.refusedAt) return 'REFUSED';
  return d.collectedAt ? 'COLLECTED' : 'TO_COLLECT';
}

/** The chip while the signature steps apply; null keeps the standard one. */
export function signLabel(d: Signable): string | null {
  if (d.status === 'CONFIRMED') return d.unsignedByName ? 'Delivered, not signed' : null;
  if (d.refusedAt) return 'Not signed';
  return d.collectedAt ? 'Collected' : null;
}

/** What the steps allow now, on top of the standard actions, which lose Confirm, and Edit and Delete once collected. */
export function signActions(
  d: Signable,
  base: DeliveryAction[],
  may: { store: boolean; sign: boolean; manage: boolean; isRefuser: boolean },
): DeliveryAction[] {
  if (d.isMigrated || d.status === 'CONFIRMED') return base;
  const state = signState(d);
  const out = base.filter((a) => a !== 'confirm' && (state === 'TO_COLLECT' || (a !== 'edit' && a !== 'delete' && a !== 'requestApproval')));
  if (state === 'TO_COLLECT' && may.store && base.includes('confirm')) out.push('collect');
  if (state === 'COLLECTED' && may.store) out.push('checkIn');
  if (state !== 'TO_COLLECT' && may.sign) out.push('sign');
  if (state === 'COLLECTED' && may.sign) out.push('refuse');
  if (state === 'REFUSED' && may.manage && !may.isRefuser) out.push('acceptUnsigned', 'returnRefusal');
  if ((state === 'COLLECTED' || state === 'REFUSED') && (may.sign || may.store) && !out.includes('attach')) out.push('attach');
  return out;
}

/** The signature: who signed, and the signed delivery order (a photo or PDF, or the app's image). */
export function signErrors(s: { signerName?: string | null; files: number }): FieldError[] {
  const errors: FieldError[] = [];
  if (!s.signerName?.trim()) errors.push({ field: 'signerName', message: 'Type who signed.' });
  if (s.files < 1) errors.push({ field: 'fileIds', message: 'Add the signed delivery order: a photo or a PDF.' });
  return errors;
}

export function refuseErrors(s: { reason?: string | null; files: number }): FieldError[] {
  const errors: FieldError[] = [];
  if (!s.reason?.trim()) errors.push({ field: 'reason', message: 'Type why the customer did not sign.' });
  if (s.files < 1) errors.push({ field: 'fileIds', message: 'Add a photo as proof.' });
  return errors;
}

/** Cancelling an order that has a delivery order not delivered yet: Management only, and never while collected. */
export function cancelAfterDelivery(drafts: { docNo: string; collected: boolean }[], canManage: boolean, soNo: string): { code: string; message: string } | null {
  if (!drafts.length) return null;
  const collected = drafts.find((d) => d.collected);
  if (collected) return { code: 'GOODS_COLLECTED', message: `The goods of ${collected.docNo} are with the installer. Check them back in before ${soNo} is cancelled.` };
  if (!canManage) return { code: 'MANAGEMENT_NEEDED', message: `${soNo} already has its delivery order ${drafts[0]!.docNo}: cancelling after that needs Management.` };
  return null;
}
