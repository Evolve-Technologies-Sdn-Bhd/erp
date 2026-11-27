/**
 * Customer rules (CLAUDE.md → Phase 3 · decisions 2, 7, 9 and Core business rules 2–5, 9). Pure functions; the service
 * loads the data and turns the answers into 400 / 403 / 409 responses.
 */
import { dec, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/** Tab order on C04: All, Active, Prospect, Blocked. */
export const CUSTOMER_STATUSES = ['ACTIVE', 'PROSPECT', 'BLOCKED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export const STATUS_LABEL: Record<CustomerStatus, string> = { ACTIVE: 'Active', PROSPECT: 'Prospect', BLOCKED: 'Blocked' };

/** e-Invoice identity types (SRS FR-MST-042, Appendix E). */
export const ID_TYPES = ['BRN', 'NRIC', 'PASSPORT', 'ARMY'] as const;
export type IdType = (typeof ID_TYPES)[number];
export const ID_TYPE_LABEL: Record<IdType, string> = { BRN: 'BRN · business registration', NRIC: 'NRIC · identity card', PASSPORT: 'Passport', ARMY: 'Army number' };

export const CREDIT_SCOPES = ['GROUP', 'BRANCH'] as const;
export const TAX_MODES = ['EXCLUSIVE', 'INCLUSIVE'] as const;

/** EQ-2609-0010: an enquiry number as Sales gives it. */
export const ENQUIRY_NO = /^EQ-\d{4}-\d{4,}$/;

/** Field labels for the before-and-after audit, in the order the form shows them. */
export const CUSTOMER_LABELS: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  area: 'Area',
  branchCode: 'Branch',
  defaultAgentCode: 'Sales agent',
  billingAddress: 'Billing address',
  deliveryAddress: 'Delivery address',
  contactName: 'Contact',
  email: 'Email',
  phone: 'Phone',
  tin: 'TIN',
  idType: 'ID type',
  idNumber: 'ID number',
  salesTaxNo: 'Sales tax no',
  serviceTaxNo: 'Service tax no',
  einvoiceEmail: 'e-Invoice email',
  taxMode: 'Tax mode',
  creditTermDays: 'Credit term',
  creditLimit: 'Credit limit',
  overdueLimit: 'Overdue limit',
  creditScope: 'Credit checked',
  priceListCode: 'Price list',
  visibleToAllBranches: 'Visible to all branches',
};

/** The credit fields: only `core.customer.credit` changes them (decision 2, rule 9). */
export const CREDIT_FIELDS: readonly string[] = ['creditTermDays', 'creditLimit', 'overdueLimit', 'creditScope'];

/** Which permissions a set of changed fields needs: credit fields need the credit permission, the rest the edit one. */
export function permissionsNeeded(changedFields: string[]): { credit: boolean; details: boolean } {
  return {
    credit: changedFields.some((f) => CREDIT_FIELDS.includes(f)),
    details: changedFields.some((f) => !CREDIT_FIELDS.includes(f)),
  };
}

export interface CustomerFields {
  name: string;
  branchCode: string;
  priceListCode: string;
  creditTermDays: number | null;
}

/** What a customer needs before it can be active (rule 5). Empty = ready. */
export function activationGaps(c: CustomerFields): FieldError[] {
  const gaps: FieldError[] = [];
  if (!c.name?.trim()) gaps.push({ field: 'name', message: 'Give the customer a name.' });
  if (!c.branchCode) gaps.push({ field: 'branchCode', message: 'Pick the branch.' });
  if (!c.priceListCode) gaps.push({ field: 'priceListCode', message: 'Pick the price list.' });
  if (c.creditTermDays === null || c.creditTermDays === undefined) gaps.push({ field: 'creditTermDays', message: 'Pick the credit term.' });
  return gaps;
}

/** Credit limits are 0 or more, or empty for no limit (rule 9). */
export function limitError(value: DecimalInput | null | undefined, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return dec(value).lt(0) ? `${label} cannot be below 0. Leave it empty for no limit.` : null;
}

export type CustomerAction = 'edit' | 'editCredit' | 'block' | 'activate' | 'delete' | 'complete';

/** Which status actions the status allows, before the usage check. A prospect becomes a customer by Activate. */
export function statusActions(status: CustomerStatus): ('block' | 'activate')[] {
  if (status === 'ACTIVE') return ['block'];
  if (status === 'BLOCKED') return ['activate'];
  return ['activate', 'block'];
}

/** The warning on the tax identity card when e-Invoices would miss something (decision 9). Never blocks a save. */
export function eInvoiceGap(c: { isCash: boolean; tin: string | null; idNumber: string | null }): string | null {
  if (c.isCash) return null;
  const noTin = !c.tin?.trim();
  const noId = !c.idNumber?.trim();
  if (noTin && noId) return 'No TIN or ID number yet. e-Invoices with this customer need both.';
  if (noId) return 'No ID number yet. e-Invoices need it with the TIN.';
  if (noTin) return 'No TIN yet. e-Invoices need it with the ID number.';
  return null;
}

/** "Cash" for 0 days, else "30 days". */
export function creditTermText(days: number): string {
  return days === 0 ? 'Cash' : `${days} days`;
}

/** The stored customer as plain values, for the audit and the mdm.customer.* event payload. */
export interface CustomerRecord {
  code: string;
  name: string;
  category: string | null;
  area: string | null;
  branchCode: string;
  defaultAgentCode: string | null;
  billingAddress: string | null;
  deliveryAddress: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  tin: string | null;
  idType: string | null;
  idNumber: string | null;
  salesTaxNo: string | null;
  serviceTaxNo: string | null;
  einvoiceEmail: string | null;
  taxMode: string;
  creditTermDays: number;
  creditLimit: DecimalInput | null;
  overdueLimit: DecimalInput | null;
  creditScope: string | null;
  priceListCode: string;
  visibleToAllBranches: boolean;
  isCash: boolean;
  status: string;
}

const money = (v: DecimalInput | null) => (v === null || v === undefined ? null : dec(v).toFixed(2));

/** What the audit compares: money at 2 places, the credit term in words. */
export function customerAudit(c: CustomerRecord): Record<string, unknown> {
  return { ...c, creditLimit: money(c.creditLimit), overdueLimit: money(c.overdueLimit), creditTermDays: creditTermText(c.creditTermDays) };
}

/** The customer after a change, as mdm.customer.* events carry it (codes and plain values). */
export function customerSnapshot(c: CustomerRecord) {
  return { ...c, creditLimit: money(c.creditLimit), overdueLimit: money(c.overdueLimit) };
}

// ── Customers added by salespeople from an order (phase 5, Sales Flow switch) ──

/** Fewer digits than this cannot tell one phone from another. */
export const PHONE_DIGITS_MIN = 7;

/**
 * A phone as digits only, Malaysian style, so the same number typed two ways matches: "+60 12-345 6789",
 * "6012 3456789" and "012-345 6789" all give "0123456789".
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.startsWith('60') ? `0${digits.slice(2)}` : digits;
}

/** Households are known by their phone: one already on file is picked on the order, not added again. */
export function phoneInUseMessage(code: string): string {
  return `${code} already has this phone number. Pick that customer on the order, or ask the office if it is someone else.`;
}

/** What a salesperson types for a new household customer. Core fills in the rest. */
export interface OrderCustomerInput {
  name: string;
  phone: string;
  address: string;
  email: string | null;
  idNumber: string | null;
  branchCode: string;
  agentCode: string | null;
}

/**
 * The customer Core makes from it: active at once so the order can use it, cash terms (0 days) and no credit limit,
 * the cash customer's price list, before-tax pricing like every sales order, and one address for billing and
 * delivery. The office completes the rest (category, area, tax identity) in Core.
 */
export function customerFromOrder(input: OrderCustomerInput, cash: { priceListCode: string }) {
  const name = input.name.trim();
  const address = input.address.trim();
  return {
    name,
    category: null,
    area: null,
    branchCode: input.branchCode,
    defaultAgentCode: input.agentCode,
    billingAddress: address,
    deliveryAddress: address,
    contactName: name.slice(0, 100),
    email: input.email?.trim() || null,
    phone: input.phone.trim(),
    tin: null,
    idType: input.idNumber ? ('NRIC' as const) : null,
    idNumber: input.idNumber?.trim().toUpperCase() || null,
    salesTaxNo: null,
    serviceTaxNo: null,
    einvoiceEmail: null,
    taxMode: 'EXCLUSIVE' as const,
    creditTermDays: 0,
    creditLimit: null,
    overdueLimit: null,
    creditScope: null,
    priceListCode: cash.priceListCode,
  };
}

/** The activity line when a salesperson adds a customer from an order. */
export function addedFromOrderMessage(code: string, userName: string): string {
  return `Customer ${code} added by ${userName} from a sales order, to be completed by the office`;
}

/** The refusal when Core is not set up for it (no cash term, an inactive price list …): the office has to fix Core. */
export function setupProblemMessage(problems: string[]): string {
  return `This customer cannot be added from an order yet: ${problems.join(' ')} Ask the office to check Core.`;
}

// ── Duplicate customers and taking one over (phase 5, the user's rule of 27 Nov 2026) ──
// A salesperson sees only their own customers, so a household may already be someone else's. Before one is added,
// every customer is checked on the phone, the name and the address together. The phone, or the name with the address,
// is the same customer: it is not added again, and the salesperson picks it (theirs) or asks to take it over (someone
// else's). The name alone or the address alone may be someone else (a namesake, a family member): it is shown, and the
// salesperson confirms before adding.

export type DuplicateReason = 'PHONE' | 'NAME' | 'ADDRESS';

const TITLE = /^(mr|mrs|ms|mdm|madam|miss|dr|encik|en|puan|pn|cik|tuan|tn|dato|datin|datuk|tan sri|puan sri)\b\.?\s*/;

/** "Mr. Tan  Ah-Kow" → "tan ah kow": the name without its title, case and punctuation. */
export function nameKey(name: string | null | undefined): string {
  let n = (name ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3 && TITLE.test(n); i++) n = n.replace(TITLE, '').trim();
  return n;
}

const SAME_WORD: Record<string, string> = { jln: 'jalan', tmn: 'taman', lrg: 'lorong', bdr: 'bandar', kg: 'kampung', kpg: 'kampung', apt: 'apartment' };
const NOISE = new Set(['no', 'lot', 'unit', 'blk', 'block', 'malaysia', 'and', 'the']);

/** The address as its words, one spelling each ("Jln" is "jalan"), without "No.", "Lot" and "Malaysia". */
export function addressWords(address: string | null | undefined): string[] {
  const words = (address ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return [...new Set(words.map((w) => SAME_WORD[w] ?? w).filter((w) => !NOISE.has(w)))];
}

export const postcodeOf = (address: string | null | undefined) => /\b(\d{5})\b/.exec(address ?? '')?.[1] ?? null;

/**
 * The same address typed two ways: most of the shorter one's words are in the other (house number, street, area), and
 * where both have a postcode it is the same one.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = postcodeOf(a);
  const pb = postcodeOf(b);
  if (pa && pb && pa !== pb) return false;
  const wa = addressWords(a);
  const wb = addressWords(b);
  if (wa.length < 3 || wb.length < 3) return false;
  const [short, long] = wa.length <= wb.length ? [wa, new Set(wb)] : [wb, new Set(wa)];
  return short.filter((w) => long.has(w)).length / short.length >= 0.8;
}

/** How a customer on file matches what the salesperson typed. */
export function duplicateReasons(
  typed: { name: string; phone: string; address: string },
  c: { name: string; phone: string | null; deliveryAddress: string | null; billingAddress: string | null },
): DuplicateReason[] {
  const out: DuplicateReason[] = [];
  const key = phoneKey(typed.phone);
  if (key.length >= PHONE_DIGITS_MIN && phoneKey(c.phone) === key) out.push('PHONE');
  const name = nameKey(typed.name);
  if (name.length >= 3 && nameKey(c.name) === name) out.push('NAME');
  if (sameAddress(typed.address, c.deliveryAddress) || sameAddress(typed.address, c.billingAddress)) out.push('ADDRESS');
  return out;
}

/** The phone, or the name with the address: the same customer, never added again. */
export const isSameCustomer = (reasons: DuplicateReason[]) => reasons.includes('PHONE') || (reasons.includes('NAME') && reasons.includes('ADDRESS'));

export function reasonsText(reasons: DuplicateReason[]): string {
  const words = { PHONE: 'phone number', NAME: 'name', ADDRESS: 'address' } as const;
  const list = reasons.map((r) => words[r]);
  return `same ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}`;
}

/** Why a customer cannot be added: who has it, and what the salesperson does instead. */
export function sameCustomerMessage(c: { code: string; name: string; agentName: string | null; mine: boolean }, reasons: DuplicateReason[]): string {
  const whose = c.mine ? 'already your customer' : c.agentName ? `already a customer of ${c.agentName}` : 'already a customer';
  const next = c.mine ? 'Pick them on the order instead.' : 'Ask to take them over, or ask the office if it is someone else.';
  return `${c.name} (${c.code}) is ${whose}: ${reasonsText(reasons)}. ${next}`;
}

export const TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { PENDING: 'Waiting for the office', APPROVED: 'Approved', REJECTED: 'Rejected' };

/** What the duplicate check reads from a customer form: the phone, the name, and the delivery (else billing) address. */
export function lookalikeInput(c: { name?: string | null; phone?: string | null; deliveryAddress?: string | null; billingAddress?: string | null }) {
  return { name: c.name ?? '', phone: c.phone ?? '', address: c.deliveryAddress || c.billingAddress || '' };
}

/** "C-0012 Tan Ah Kow (same phone number); C-0040 Tan A. K. (same name)" */
export const looksText = (looks: { code: string; name: string; reasonText: string }[]) => looks.map((m) => `${m.code} ${m.name} (${m.reasonText})`).join('; ');

/** For the office: what it looks like; it may still add it after checking. */
export function officeDuplicateMessage(looks: { code: string; name: string; reasonText: string; same: boolean }[]): string {
  const head = looks.some((m) => m.same) ? 'This customer seems to be on file already' : 'This customer may be on file already';
  return `${head}: ${looksText(looks)}. Open them to check; if it is someone else, add it anyway.`;
}
