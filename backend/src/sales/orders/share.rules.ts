import { dec } from '../../platform/http/decimal';
import { dayText } from '../shared/package-lines.rules';
import { rm } from './revision.rules';

/**
 * Share the sales order on WhatsApp (phase 5): with the Sales Flow switch on, whoever keys orders opens a WhatsApp chat
 * with the customer, the order's summary already written. The ERP sends nothing itself and keeps no copy: the person
 * reads the message and presses Send in WhatsApp. WhatsApp's link carries text only, so the A4 order is attached by
 * hand. Pure functions, tested in share.rules.spec.ts.
 */

/**
 * The number as WhatsApp wants it: digits with the country code. A number typed without one is Malaysian
 * ("012-345 6789" → 60123456789). Two numbers in one field: the first. Null when it cannot be a phone number.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const first = (phone ?? '').split(/[/;,|]| or /i)[0]!.trim();
  const international = first.startsWith('+') || first.startsWith('00');
  let digits = first.replace(/\D/g, '').replace(/^00/, '');
  if (!international && digits.startsWith('0')) digits = `60${digits.replace(/^0+/, '')}`;
  else if (!international && !digits.startsWith('60') && !digits.startsWith('65')) return null;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export interface ShareLine {
  itemName: string;
  uomCode: string;
  qty: string;
  lineKind: string;
  package: { group: number | string | null; name: string | null; uomCode: string | null; qty: string | null } | null;
}

export interface ShareOrder {
  company: string;
  contactName: string | null;
  customerName: string;
  docNo: string;
  revisionNo: number;
  docDate: string;
  lines: ShareLine[];
  total: string;
  installOption: string | null;
  installDate: string | null;
  afterStock: boolean;
}

const qtyText = (qty: string, uomCode: string) => `${dec(qty).toString()} ${uomCode}`;

/** A package is one line with its free gift under it, as on the order; its items are not listed one by one. */
function itemLines(lines: ShareLine[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.package) {
      out.push(`• ${l.itemName} × ${qtyText(l.qty, l.uomCode)}`);
      continue;
    }
    const group = String(l.package.group);
    if (seen.has(group)) continue;
    seen.add(group);
    out.push(`• ${l.package.name} × ${qtyText(l.package.qty ?? '1', l.package.uomCode ?? 'SET')}`);
    for (const g of lines.filter((x) => x.lineKind === 'GIFT' && String(x.package?.group) === group)) out.push(`   Free: ${g.itemName} × ${qtyText(g.qty, g.uomCode)}`);
  }
  return out;
}

function installLines(o: ShareOrder): string[] {
  if (o.installOption === 'DELIVERY') return ['Delivery only'];
  if (o.installOption === 'COLLECT') return ['To be collected'];
  if (o.installOption !== 'INSTALLATION') return [];
  const when = o.installDate ? dayText(o.installDate) : o.afterStock ? 'after the stock arrives' : null;
  return [...(when ? [`Preferred installation: ${when}`] : []), 'Our office will contact you to confirm the installation.'];
}

/** The message, ready for the person to read and send. */
export function orderShareText(o: ShareOrder): string {
  const order = o.revisionNo > 1 ? `${o.docNo} (revision ${o.revisionNo})` : o.docNo;
  const install = installLines(o);
  return [
    `Hello ${o.contactName?.trim() || o.customerName},`,
    '',
    `Thank you for your order with ${o.company}.`,
    '',
    `Sales order: ${order}`,
    `Date: ${dayText(o.docDate)}`,
    '',
    ...itemLines(o.lines),
    '',
    `Total: RM ${rm(o.total)}`,
    ...(install.length ? ['', ...install] : []),
  ].join('\n');
}

/** Only a released order is shared, by whoever keys orders, while the company uses it. */
export function mayShare(o: { switchOn: boolean; status: string; canEdit: boolean }): boolean {
  return o.switchOn && o.canEdit && (o.status === 'RELEASED' || o.status === 'PARTIAL' || o.status === 'DONE');
}
