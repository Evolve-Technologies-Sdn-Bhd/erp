import { dec } from '../../platform/http/decimal';

/**
 * Sales order revisions (phase 5): with "Salespeople revise a released order until it is delivered" on (S34), a
 * released order with nothing delivered, invoiced or cancelled goes back to draft as the next revision. It keeps its
 * number, customer and links; the earlier revision is kept read-only (SRS *Revise*, BR-STA-003). Releasing a revision
 * made after the installer was booked, or one that changes a price, needs the Sales Manager. Pure functions, tested
 * in revision.rules.spec.ts.
 */

export const REVISIONS_OFF_MESSAGE =
  'Orders are not revised in this company. Turn on "Salespeople revise a released order until it is delivered" in Operation Policies › Sales Flow, or cancel the undelivered balance.';

/** What stops an order from being revised: anything that already acted on it. */
export interface RevisableCheck {
  docNo: string;
  status: string;
  isMigrated: boolean;
  /** Something delivered, invoiced or cancelled on any line. */
  moved: boolean;
  /** Documents made from the order: delivery orders, invoices, cancel orders, proformas not cancelled. */
  documents: { kind: string; docNo: string }[];
  /** A buy-to-order line already on a purchase order. */
  purchaseOrderNo: string | null;
}

/** Why the order cannot be revised now, or null. Each message says what to do instead. */
export function reviseRefusal(c: RevisableCheck): string | null {
  if (c.isMigrated) return 'Migrated orders cannot be revised.';
  if (c.status !== 'RELEASED' || c.moved) return `Only a released order with nothing delivered can be revised. Cancel the undelivered balance of ${c.docNo} instead.`;
  const doc = c.documents[0];
  if (doc) return `${c.docNo} already has a ${doc.kind} (${doc.docNo}), so it can no longer be revised. Cancel the undelivered balance instead.`;
  if (c.purchaseOrderNo) return `${c.docNo} has a buy-to-order line already on ${c.purchaseOrderNo}, so it can no longer be revised. Cancel the undelivered balance instead.`;
  return null;
}

/** An order as a revision compares it: the fields a salesperson may change, and the lines and vouchers. */
export interface RevisionContent {
  contactName: string | null;
  deliveryAddress: string | null;
  deliveryPostcode: string | null;
  deliveryState: string | null;
  deliveryWantedBy: string | null;
  customerPoRef: string | null;
  project: string | null;
  remarks: string | null;
  installOption: string | null;
  installDate: string | null;
  total: string;
  lines: { itemCode: string; lineKind: string; packageCode: string | null; packageQty: string | null; qty: string; unitPrice: string; discountPct: string }[];
  vouchers: { voucherNo: string; amount: string }[];
}

const HEADER: [keyof RevisionContent, string][] = [
  ['contactName', 'Contact'], ['deliveryAddress', 'Delivery address'], ['deliveryPostcode', 'Postcode'], ['deliveryState', 'State'],
  ['deliveryWantedBy', 'Delivery wanted by'], ['installOption', 'Installation'], ['installDate', 'Preferred date'],
  ['customerPoRef', 'Customer PO ref'], ['project', 'Project'], ['remarks', 'Remarks'],
];

/** "1,450.00" */
export const rm = (v: string) => dec(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const qty = (v: string) => dec(v).toString();
const pct = (v: string) => `${dec(v).toString()}%`;

export interface RevisionChanges {
  /** In plain words, in the order of the form: header fields, then lines, vouchers and the total. */
  changes: string[];
  /** A price, a discount or a voucher changed: the Sales Manager approves. */
  priceChanged: boolean;
  /** The price changes alone, for the approval reason. */
  priceChanges: string[];
}

/**
 * What a revision changed. Items are matched by item code (the second line of the same item by its second
 * occurrence); a package is one entry with its sets, its items and gifts follow it. Adding an item at its price is
 * not a price change; changing a price, a discount or a voucher is.
 */
export function revisionChanges(before: RevisionContent, after: RevisionContent): RevisionChanges {
  const changes: string[] = [];
  const priceChanges: string[] = [];
  for (const [key, label] of HEADER) {
    if ((before[key] ?? '') !== (after[key] ?? '')) changes.push(`${label} changed`);
  }

  const keyed = (lines: RevisionContent['lines']) => {
    const seen = new Map<string, number>();
    const out = new Map<string, RevisionContent['lines'][number] & { label: string }>();
    for (const l of lines) {
      if (l.packageCode && l.lineKind !== 'PACKAGE' && l.lineKind !== 'GIFT') continue;
      if (l.lineKind === 'PACKAGE') {
        // A package is one entry: the first of its item lines stands for it.
        const k = `PKG:${l.packageCode}`;
        if (!out.has(k)) out.set(k, { ...l, qty: l.packageQty ?? l.qty, label: `package ${l.packageCode}` });
        continue;
      }
      const base = `${l.lineKind === 'GIFT' ? 'GIFT' : 'ITEM'}:${l.itemCode}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.set(`${base}#${n}`, { ...l, label: l.lineKind === 'GIFT' ? `free gift ${l.itemCode}` : l.itemCode });
    }
    return out;
  };
  const was = keyed(before.lines);
  const now = keyed(after.lines);
  for (const [k, l] of now) {
    const old = was.get(k);
    if (!old) {
      changes.push(`Added ${l.label} × ${qty(l.qty)}`);
      continue;
    }
    if (!dec(old.qty).eq(dec(l.qty))) changes.push(`${cap(l.label)} quantity ${qty(old.qty)} → ${qty(l.qty)}`);
    if (l.lineKind === 'PACKAGE' || l.lineKind === 'GIFT') continue; // priced by Core, not by the salesperson
    if (!dec(old.unitPrice).eq(dec(l.unitPrice))) {
      const text = `${cap(l.label)} price ${rm(old.unitPrice)} → ${rm(l.unitPrice)}`;
      changes.push(text);
      priceChanges.push(text);
    }
    if (!dec(old.discountPct).eq(dec(l.discountPct))) {
      const text = `${cap(l.label)} discount ${pct(old.discountPct)} → ${pct(l.discountPct)}`;
      changes.push(text);
      priceChanges.push(text);
    }
  }
  for (const [k, l] of was) if (!now.has(k)) changes.push(`Removed ${l.label}`);

  const vWas = new Map(before.vouchers.map((v) => [v.voucherNo, v.amount]));
  const vNow = new Map(after.vouchers.map((v) => [v.voucherNo, v.amount]));
  for (const [no, amount] of vNow) {
    const old = vWas.get(no);
    const text = old === undefined ? `Voucher ${no} added (${rm(amount)} off)` : !dec(old).eq(dec(amount)) ? `Voucher ${no} ${rm(old)} → ${rm(amount)} off` : null;
    if (text) {
      changes.push(text);
      priceChanges.push(text);
    }
  }
  for (const no of vWas.keys()) {
    if (vNow.has(no)) continue;
    const text = `Voucher ${no} removed`;
    changes.push(text);
    priceChanges.push(text);
  }
  if (changes.length && !dec(before.total).eq(dec(after.total))) changes.push(`Total ${rm(before.total)} → ${rm(after.total)}`);
  return { changes, priceChanged: priceChanges.length > 0, priceChanges };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Whether releasing the revision needs the Sales Manager, and why: a change after the installer was booked, or a
 * price change. A revision that changes nothing goes out again without approval.
 */
export function revisionApproval(revisionNo: number, c: RevisionChanges, booking: string | null): { needs: boolean; reason: string | null } {
  if (!c.changes.length) return { needs: false, reason: null };
  const why: string[] = [];
  if (booking) why.push(`made after the installer was booked (${booking})`);
  if (c.priceChanged) why.push(`changes prices (${c.priceChanges.join('; ')})`);
  if (!why.length) return { needs: false, reason: null };
  return { needs: true, reason: `Revision ${revisionNo} ${why.join(' and ')}` };
}
