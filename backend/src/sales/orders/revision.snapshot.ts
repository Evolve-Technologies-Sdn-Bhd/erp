import type { Prisma, SalOrderVoucher, SalSalesOrder, SalSalesOrderLine } from '@prisma/client';
import type { RevisionContent } from './revision.rules';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** The header fields a revision may change, and that discarding a revision puts back. */
const HEADER_FIELDS = [
  'contactName', 'deliveryAddress', 'deliveryPostcode', 'deliveryState', 'deliveryWantedBy', 'customerPoRef', 'project', 'remarks',
  'installOption', 'installDate', 'installAfterStock', 'orderTypeCode', 'warehouseCode',
  'subtotal', 'discountTotal', 'voucherTotal', 'taxTotal', 'rounding', 'total', 'creditResult', 'creditSnapshot', 'approvalRequired', 'approvedAt',
] as const satisfies readonly (keyof SalSalesOrder)[];

type Order = SalSalesOrder & { lines: SalSalesOrderLine[]; vouchers: SalOrderVoucher[] };

/** What sal_order_revision keeps: the content a later revision is compared with, and the rows to put back. */
export interface RevisionSnapshot {
  content: RevisionContent;
  header: Record<(typeof HEADER_FIELDS)[number], unknown>;
  lines: Record<string, unknown>[];
  vouchers: Record<string, unknown>[];
}

/** The order as a revision compares it. */
export function revisionContent(o: Order): RevisionContent {
  return {
    contactName: o.contactName, deliveryAddress: o.deliveryAddress, deliveryPostcode: o.deliveryPostcode, deliveryState: o.deliveryState,
    deliveryWantedBy: iso(o.deliveryWantedBy), customerPoRef: o.customerPoRef, project: o.project, remarks: o.remarks,
    installOption: o.installOption, installDate: iso(o.installDate), total: o.total.toString(),
    lines: o.lines.map((l) => ({
      itemCode: l.itemCode, lineKind: l.lineKind, packageCode: l.packageCode, packageQty: l.packageQty?.toString() ?? null,
      qty: l.orderedQty.toString(), unitPrice: l.unitPrice.toString(), discountPct: l.discountPct.toString(),
    })),
    vouchers: o.vouchers.map((v) => ({ voucherNo: v.voucherNo, amount: v.amount.toString() })),
  };
}

/** A plain JSON copy of the order as it is now. Decimals become strings and dates ISO strings, which Prisma takes back. */
export function snapshotOf(o: Order): RevisionSnapshot {
  const plain = <T>(v: T) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  const header = Object.fromEntries(HEADER_FIELDS.map((f) => [f, o[f]])) as RevisionSnapshot['header'];
  return {
    content: revisionContent(o),
    header: plain(header) as RevisionSnapshot['header'],
    lines: o.lines.map(({ salesOrderId: _o, ...l }) => plain(l)),
    vouchers: o.vouchers.map(({ salesOrderId: _o, ...v }) => plain(v)),
  };
}

/** The header of a snapshot, ready to write back (a JSON null stays a database null). */
export function headerData(s: RevisionSnapshot): Prisma.SalSalesOrderUpdateManyMutationInput {
  const h = s.header as Record<string, unknown>;
  return { ...h, creditSnapshot: (h.creditSnapshot ?? undefined) as Prisma.InputJsonValue | undefined } as Prisma.SalSalesOrderUpdateManyMutationInput;
}
