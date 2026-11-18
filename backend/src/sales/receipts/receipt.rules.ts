import type { Prisma } from '@prisma/client';
import { dec, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/**
 * Official receipts (phase 5; the client's Account answers of 18 Nov 2026). A salesperson, or an installer who banked in
 * cash or swiped a card, records the payment on a released sales order with its proof. Account checks it against the
 * day's bank transactions or the card settlement slip and verifies it, or sends it back with a reason. Only verified
 * receipts count as paid. Pure functions, tested in receipt.rules.spec.ts.
 */

export const RECEIPT_STATUSES = ['WAITING', 'VERIFIED', 'RETURNED', 'CANCELLED'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = { WAITING: 'Waiting to verify', VERIFIED: 'Verified', RETURNED: 'Sent back', CANCELLED: 'Cancelled' };

/** Each payment is a deposit or the balance (Account Q6). */
export const RECEIPT_KINDS = ['DEPOSIT', 'BALANCE'] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];
export const RECEIPT_KIND_LABEL: Record<ReceiptKind, string> = { DEPOSIT: 'Deposit', BALANCE: 'Balance' };

/** How the money came in. Instalments are by card only (card EPP): the bank runs them. */
export const RECEIPT_METHODS = ['CASH', 'TRANSFER', 'CARD', 'CARD_EPP', 'CHEQUE'] as const;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];
export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  CASH: 'Cash', TRANSFER: 'Bank transfer', CARD: 'Card', CARD_EPP: 'Card instalment (EPP)', CHEQUE: 'Cheque',
};

/** The proof is a photo or a PDF of the slip. */
export const PROOF_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export type ReceiptAction = 'edit' | 'cancel' | 'verify' | 'sendBack';

/**
 * What a person may do with a receipt. Waiting: Account verifies or sends it back; whoever records receipts may still
 * correct or cancel it. Sent back: corrected and sent again, or cancelled. Verified and cancelled receipts are kept as
 * they are. Whoever recorded a receipt never verifies it themselves.
 */
export function allowedReceiptActions(status: ReceiptStatus, can: { edit: boolean; verify: boolean }, isRecorder: boolean): ReceiptAction[] {
  const out: ReceiptAction[] = [];
  if (status === 'WAITING' || status === 'RETURNED') {
    if (can.edit) out.push('edit', 'cancel');
    if (status === 'WAITING' && can.verify && !isRecorder) out.push('verify', 'sendBack');
  }
  return out;
}

export const ORDER_PAYMENTS = ['UNPAID', 'DEPOSIT', 'FULLY_PAID'] as const;
export type OrderPayment = (typeof ORDER_PAYMENTS)[number];
export const ORDER_PAYMENT_LABEL: Record<OrderPayment, string> = { UNPAID: 'Unpaid', DEPOSIT: 'Deposit paid', FULLY_PAID: 'Fully paid' };

/**
 * Where an order stands from its receipts: only verified ones count as paid; those waiting for Account are shown apart.
 * `open` is what may still be recorded: the total less what is verified and what waits.
 */
export function orderPayment(total: DecimalInput, receipts: { status: string; amount: DecimalInput }[]) {
  const sum = (status: string) => receipts.filter((r) => r.status === status).reduce((s, r) => s.add(dec(r.amount)), dec(0));
  const verified = sum('VERIFIED');
  const waiting = sum('WAITING');
  const t = dec(total);
  const status: OrderPayment = t.gt(0) && verified.gte(t) ? 'FULLY_PAID' : verified.gt(0) ? 'DEPOSIT' : 'UNPAID';
  const open = t.sub(verified).sub(waiting);
  return { status, label: ORDER_PAYMENT_LABEL[status], verified, waiting, open: open.gt(0) ? open : dec(0) };
}

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const RM = (v: Prisma.Decimal) => `RM ${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

export interface ReceiptInput {
  docDate: string;
  amount: string;
  proofs: number;
}

/**
 * A receipt needs the day the money came in (not in the future), an amount above 0 that the order still owes (its total
 * less what is verified or waiting), and at least one proof.
 */
export function receiptErrors(r: ReceiptInput, ctx: { today: string; open: DecimalInput }): FieldError[] {
  const errors: FieldError[] = [];
  if (r.docDate > ctx.today) errors.push({ field: 'docDate', message: 'The day the money was received cannot be in the future.' });
  const amount = r.amount.trim();
  if (!AMOUNT.test(amount) || !dec(amount).gt(0)) errors.push({ field: 'amount', message: 'Type the amount received, more than 0, like 500.00.' });
  else if (dec(amount).gt(dec(ctx.open))) errors.push({ field: 'amount', message: `More than the order still owes (${RM(dec(ctx.open))}).` });
  if (r.proofs < 1) errors.push({ field: 'proofIds', message: 'Add the payment proof: a photo or PDF of the slip.' });
  return errors;
}

/** Why an uploaded file cannot be this receipt's proof, or null. A new receipt has no id yet. */
export function proofError(file: { mimeType: string; entityType: string | null; entityId: string | null } | null, entityType: string, entityId: string | null): string | null {
  if (!file) return 'The proof was not found. Upload it again.';
  if (!PROOF_TYPES.includes(file.mimeType)) return 'The proof must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.';
  if (file.entityId && (file.entityType !== entityType || file.entityId !== entityId)) return 'This file belongs to another document. Upload it again.';
  return null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Deposit RM 500.00 by bank transfer" for the activity lines. */
export function receiptText(r: { kind: string; amount: DecimalInput; method: string }): string {
  return `${RECEIPT_KIND_LABEL[r.kind as ReceiptKind] ?? r.kind} ${RM(dec(r.amount))} by ${lowerFirst(RECEIPT_METHOD_LABEL[r.method as ReceiptMethod] ?? r.method)}`;
}

export const RECEIPTS_OFF_MESSAGE =
  'Official receipts are turned off for this company. Turn on "Salespeople record payments as official receipts" in Operation Policies › Sales Flow.';
