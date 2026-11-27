import type { FieldError } from '../../platform/http/errors';

/**
 * What the company shows in the phone app (phase 5, the client's "CMS from admin"): its own DuitNow QR picture and the
 * name customers see, the contacts on the Help page and the office hours. Kept by admin in Configuration › Phone App
 * (one sys_setting row); read by every signed-in phone. Nothing is shown that admin did not set: no sample QR.
 * Pure functions, tested in app-content.rules.spec.ts.
 */

export const APP_CONTENT_KEY = 'app.content';
export const MAX_CONTACTS = 10;

export interface AppContent {
  /** The QR picture, an attachment (kind APP_DUITNOW_QR). Null: no QR is shown on the phones. */
  duitNowFileId: string | null;
  /** The name the customer's banking app shows when they scan, so the salesperson can check it. */
  duitNowName: string | null;
  contacts: { label: string; phone: string }[];
  officeHours: string | null;
}

export const EMPTY_APP_CONTENT: AppContent = { duitNowFileId: null, duitNowName: null, contacts: [], officeHours: null };

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** The stored row as content; anything malformed is left out rather than shown. */
export function readAppContent(value: unknown): AppContent {
  const v = (value ?? {}) as Record<string, unknown>;
  const contacts = Array.isArray(v.contacts)
    ? v.contacts.flatMap((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        const label = text(x.label, 60);
        const phone = text(x.phone, 30);
        return label && phone ? [{ label, phone }] : [];
      })
    : [];
  return { duitNowFileId: text(v.duitNowFileId, 36), duitNowName: text(v.duitNowName, 100), contacts: contacts.slice(0, MAX_CONTACTS), officeHours: text(v.officeHours, 100) };
}

/** A QR needs the name customers will see; each contact a label and a phone number. */
export function appContentErrors(c: AppContent): FieldError[] {
  const errors: FieldError[] = [];
  if (c.duitNowFileId && !c.duitNowName) errors.push({ field: 'duitNowName', message: 'Type the name customers see when they scan, e.g. the company name.' });
  if (c.contacts.length > MAX_CONTACTS) errors.push({ field: 'contacts', message: `At most ${MAX_CONTACTS} contacts.` });
  c.contacts.forEach((x, i) => {
    if (!x.label.trim()) errors.push({ field: `contacts[${i}].label`, message: 'Who to call, e.g. Sales Admin.' });
    if ((x.phone.match(/\d/g) ?? []).length < 7) errors.push({ field: `contacts[${i}].phone`, message: 'Type the phone number.' });
  });
  return errors;
}

/** Activity lines for a save, in plain words. */
export function appContentChanges(before: AppContent, after: AppContent): string[] {
  const out: string[] = [];
  if (before.duitNowFileId !== after.duitNowFileId) out.push(after.duitNowFileId ? (before.duitNowFileId ? 'DuitNow QR replaced' : 'DuitNow QR added') : 'DuitNow QR removed');
  if (before.duitNowName !== after.duitNowName) out.push(`DuitNow name: ${before.duitNowName ?? 'none'} → ${after.duitNowName ?? 'none'}`);
  const list = (c: AppContent) => c.contacts.map((x) => `${x.label} ${x.phone}`).join(', ') || 'none';
  if (list(before) !== list(after)) out.push(`Contacts: ${list(before)} → ${list(after)}`);
  if (before.officeHours !== after.officeHours) out.push(`Office hours: ${before.officeHours ?? 'none'} → ${after.officeHours ?? 'none'}`);
  return out;
}
