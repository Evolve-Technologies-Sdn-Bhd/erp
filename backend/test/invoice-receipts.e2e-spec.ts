// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Order { id: string; docNo: string; status: string; version: number; totals: { total: string } }
interface Delivery { id: string; docNo: string; version: number; status: string }
interface Invoice { id: string; docNo: string; status: string; version: number; total: string; balance: string; payments: { receiptNo: string; amount: string }[]; activity: { action: string; message: string }[] }
interface Receipt { id: string; docNo: string; version: number }

/**
 * The invoice drafted when an installation is delivered, and verified receipts paying the invoices of their order (phase
 * 5, build 4). Both off by default: an invoice's balance then comes from Finance only, as before.
 */
describe('Invoices and official receipts (end to end)', () => {
  let api: Api;
  let n = 0;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true, useReceipts: true };
  const invoice = (id: string) => api.get<Invoice & { totals?: { total: string } }>(`sales/invoices/${id}`);
  const row = (id: string) => api.prisma.salInvoice.findUniqueOrThrow({ where: { id } });
  const balance = async (docNo: string) => (await api.get<{ items: { docNo: string; balance: string; statusLabel?: string }[] }>(`sales/invoices?q=${docNo}`)).items.find((i) => i.docNo === docNo)!.balance;
  const released = async (installOption = 'INSTALLATION') => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption, ...(installOption === 'INSTALLATION' && { installDate: '2026-10-01' }), lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    const r = await api.call<Order>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    expect(r.body.status).toBe('RELEASED');
    return r.body;
  };
  const deliver = async (orderId: string) => {
    const d = await api.call<Delivery>('POST', 'sales/deliveries', 'AR', { salesOrderId: orderId });
    const c = await api.call<Delivery>('POST', `sales/deliveries/${d.body.id}/confirm`, 'AR', { version: d.body.version });
    expect(c.body.status).toBe('CONFIRMED');
    return c.body;
  };
  const pay = async (salesOrderId: string, amount: string) => {
    n += 1;
    const proof = (await api.prisma.sysAttachment.create({ data: { tenantId: (await api.prisma.sysTenant.findFirstOrThrow()).id, fileName: `slip${n}.png`, mimeType: 'image/png', sizeBytes: 10, storageKey: `test/slip-${n}-${Date.now()}.png`, kind: 'PAYMENT_PROOF', uploadedByCode: 'AR' } })).id;
    const r = await api.call<Receipt>('POST', 'sales/receipts', 'AR', { salesOrderId, docDate: '2026-09-28', kind: 'DEPOSIT', method: 'TRANSFER', amount, proofIds: [proof] });
    expect(r.status).toBe(201);
    return r.body;
  };
  const verify = async (r: Receipt) => expect((await api.call('POST', `sales/receipts/${r.id}/verify`, 'RI', { version: r.version, reference: 'MBB 1' })).status).toBe(201);
  const drafted = (orderId: string) => api.until('the drafted invoice', async () => api.prisma.salInvoice.findFirst({ where: { salesOrderId: orderId } }));

  it('drafts nothing and counts no receipt on an invoice while the switches are off', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', FLOW)).status).toBe(200);
    const o = await released();
    const r = await pay(o.id, '500.00');
    await verify(r);
    await deliver(o.id);
    const other = await released('DELIVERY');
    await deliver(other.id);
    const line = await api.prisma.salSalesOrderLine.findFirstOrThrow({ where: { salesOrderId: o.id } });
    const inv = await api.call<Invoice>('POST', 'sales/invoices/from-order', 'AR', { salesOrderId: o.id, lines: [{ soLineId: line.id, qty: '1' }] });
    expect(inv.status).toBe(201);
    expect((await api.call('POST', `sales/invoices/${inv.body.id}/release`, 'AR', { version: inv.body.version })).status).toBe(201);
    expect(await balance(inv.body.docNo)).toBe(o.totals.total);
    expect(await api.prisma.salReceiptAllocation.count()).toBe(0);
    expect(await api.prisma.salInvoice.count({ where: { salesOrderId: other.id } })).toBe(0);
  });

  it('drafts the invoice when the installation is delivered, once, for billing to release', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, autoInvoice: true, receiptsPayInvoices: true })).status).toBe(200);
    const plain = await released('DELIVERY');
    await deliver(plain.id);
    const o = await released();
    const d = await deliver(o.id);
    const inv = await drafted(o.id);
    expect(inv).toMatchObject({ status: 'DRAFT', deliveryNos: d.docNo, createdBy: 'SYSTEM' });
    expect((await invoice(inv.id)).activity.some((a) => a.message === `Drafted by the system when ${d.docNo} was delivered`)).toBe(true);
    expect(await api.prisma.sysNotification.count({ where: { kind: 'sales.invoice.drafted', entityId: inv.id } })).toBeGreaterThan(0);
    // Not an installation: none.
    expect(await api.prisma.salInvoice.count({ where: { salesOrderId: plain.id } })).toBe(0);
    expect(await api.prisma.salInvoice.count({ where: { salesOrderId: o.id } })).toBe(1);
  });

  it('counts a deposit on the invoice when it is released, and later receipts as they are verified', async () => {
    const o = await released();
    const total = Number(o.totals.total);
    const deposit = await pay(o.id, '500.00');
    await verify(deposit);
    const waiting = await pay(o.id, '100.00'); // not verified: never counts
    await deliver(o.id);
    const inv = await drafted(o.id);
    expect(await api.prisma.salReceiptAllocation.count({ where: { invoiceId: inv.id } })).toBe(0);
    expect((await api.call('POST', `sales/invoices/${inv.id}/release`, 'AR', { version: (await row(inv.id)).version })).status).toBe(201);
    expect(Number(await balance(inv.docNo))).toBeCloseTo(total - 500, 2);
    const seen = await invoice(inv.id);
    expect(seen.payments).toEqual([expect.objectContaining({ receiptNo: deposit.docNo, amount: '500.00' })]);
    expect(seen.activity.some((a) => a.message === `${deposit.docNo}: RM 500.00 of the verified receipt counted as paid`)).toBe(true);

    await verify(waiting);
    const rest = await pay(o.id, (total - 600).toFixed(2));
    await verify(rest);
    expect(await balance(inv.docNo)).toBe('0.00');
    const sum = await api.prisma.salReceiptAllocation.aggregate({ where: { invoiceId: inv.id }, _sum: { amount: true } });
    expect(Number(sum._sum.amount)).toBeCloseTo(total, 2);
    // What the customer owes follows: the same balance the aging report reads.
    const open = await api.get<{ items: { docNo: string }[] }>('sales/invoices?status=unpaid');
    expect(open.items.map((i) => i.docNo)).not.toContain(inv.docNo);
  });

  it('keeps what was counted when the switch is turned off again, and counts nothing more', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, autoInvoice: true, receiptsPayInvoices: false })).status).toBe(200);
    const before = await api.prisma.salReceiptAllocation.count();
    const o = await released();
    await verify(await pay(o.id, '300.00'));
    await deliver(o.id);
    const inv = await drafted(o.id);
    await api.call('POST', `sales/invoices/${inv.id}/release`, 'AR', { version: (await row(inv.id)).version });
    expect(await balance(inv.docNo)).toBe(o.totals.total);
    expect(await api.prisma.salReceiptAllocation.count()).toBe(before);
  });
});
