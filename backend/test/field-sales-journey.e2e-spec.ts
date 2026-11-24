// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Order { id: string; docNo: string; status: string; version: number; totals: { total: string }; payments: { status: string } | null; revisions: { notRevisable: string | null }; share: { text: string } | null }
interface Job { id: string; docNo: string; stage: string; version: number; salesOrderNo: string | null; delivery: { id: string; docNo: string; delivered: boolean } | null; orderPayment: { status: string } | null; warranty: { suggested: string } | null }
interface Delivery { id: string; docNo: string; status: string; statusLabel: string; version: number }

/**
 * The whole field-sales profile in one journey (F7): every switch on, each step by whoever does it. A household order
 * goes from the salesperson to the receipt, the board, the warehouse, the delivery order, the signature, the visit, the
 * returned part, the invoice, the warranty, the installer's claim and a warranty claim. Today is Tue 29 Sep 2026.
 */
describe('The field-sales journey, every switch on (end to end)', () => {
  let api: Api;
  let hafiz = '';
  let order: Order;
  let jobId = '';
  let deliveryId = '';
  let n = 0;

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const people = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER' });
    hafiz = people.body.people.find((p) => p.name === 'Hafiz Rahman')!.id;
    await api.prisma.mdmItem.updateMany({ where: { code: 'TB-DIN-06' }, data: { warrantyMonths: 12 } });
    expect((await api.call('PUT', 'service/settings/general', 'ADM', { warehouseConfirms: true })).status).toBe(200);
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', {
      useEnquiries: false, officeDraftsQuotations: false, askInstallation: true, agentsAddCustomers: true, priceRange: true, useReceipts: true, reviseOrders: true, preOrders: true,
      autoCancel: true, shareWhatsapp: true, holdStock: true, autoDelivery: true, signedDelivery: true, autoInvoice: true, receiptsPayInvoices: true,
    })).status).toBe(200);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const job = () => api.get<Job>(`service/jobs/${jobId}`);
  const so = () => api.get<Order>(`sales/orders/${order.id}`, 'AR');
  const file = async (kind: string, entityType?: string, entityId?: string) => {
    n += 1;
    const tenantId = (await api.prisma.sysTenant.findFirstOrThrow()).id;
    return (await api.prisma.sysAttachment.create({ data: { tenantId, fileName: `f${n}.png`, mimeType: 'image/png', sizeBytes: 10, storageKey: `test/fs-${n}-${Date.now()}.png`, kind, entityType, entityId, uploadedByCode: 'ADM' } })).id;
  };

  it('1 · the salesperson makes the order and records the deposit with its proof', async () => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', installDate: '2026-09-30', deliveryPostcode: '81100', deliveryState: 'Johor', lines: [{ itemCode: 'TB-DIN-06', qty: '2', unitPrice: '1450' }] });
    expect(o.status).toBe(201);
    const r = await api.call<Order>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    expect(r.body).toMatchObject({ status: 'RELEASED', payments: { status: 'UNPAID' } });
    order = r.body;
    expect(order.share!.text).toContain(`Sales order: ${order.docNo}`);
    const or = await api.call<{ id: string; version: number }>('POST', 'sales/receipts', 'AR', { salesOrderId: order.id, docDate: '2026-09-28', kind: 'DEPOSIT', method: 'TRANSFER', amount: '1000.00', proofIds: [await file('PAYMENT_PROOF')] });
    expect((await api.call('POST', `sales/receipts/${or.body.id}/verify`, 'AR', { version: or.body.version, reference: 'x' })).status).toBe(403);
    expect((await api.call('POST', `sales/receipts/${or.body.id}/verify`, 'RI', { version: or.body.version, reference: 'MBB 1' })).status).toBe(201);
    expect((await so()).payments!.status).toBe('DEPOSIT');
  });

  it('2 · the office books the installer: the stock is held for other orders', async () => {
    jobId = (await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${order.docNo}`)).items.find((j) => j.salesOrderNo === order.docNo))).id;
    expect((await api.call('POST', `service/jobs/${jobId}/book`, 'ADM', { version: (await job()).version, personId: hafiz, date: '2026-10-01', slotGroupCode: 'STANDARD', start: 600 })).status).toBe(201);
    await api.until('the booking', async () => (await api.prisma.salSalesOrder.findUnique({ where: { id: order.id } }))?.installBookedAt);
    const items = await api.get<{ items: { inStock: string; heldQty: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=TB-DIN-06', 'AR');
    expect(items.items[0]).toMatchObject({ inStock: '2.0000', heldQty: '2.0000' });
  });

  it('3 · the warehouse confirms the stock, and the delivery order is made 24 hours before', async () => {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
    const at = Math.ceil((h! * 60 + m! + 120) / 30) * 30;
    await api.prisma.svcJob.update({ where: { id: jobId }, data: { jobDate: new Date(`${at >= 1440 ? '2026-09-30' : '2026-09-29'}T00:00:00.000Z`), slotStart: at % 1440, slotEnd: Math.min((at % 1440) + 120, 1440), expectedEnd: Math.min((at % 1440) + 120, 1440) } });
    expect((await api.call('POST', `service/stock/${jobId}/confirm`, 'ADM', { version: (await job()).version })).status).toBe(201);
    const j = await api.until('the delivery order', async () => {
      const x = await job();
      return x.delivery ? x : null;
    });
    deliveryId = j.delivery!.id;
    expect((await so()).revisions.notRevisable).toContain(j.delivery!.docNo);
  });

  it('4 · the store marks it collected, and it is delivered when the customer signs', async () => {
    const d = await api.get<Delivery>(`sales/deliveries/${deliveryId}`);
    const c = await api.call<Delivery>('POST', `sales/deliveries/${d.id}/collect`, 'AR', { version: d.version });
    expect(c.body.statusLabel).toBe('Collected');
    const s = await api.call<Delivery>('POST', `sales/deliveries/${d.id}/sign`, 'ADM', { version: c.body.version, signerName: 'Puan Salmah', fileIds: [await file('SIGNED_DO')] });
    expect(s.body).toMatchObject({ status: 'CONFIRMED', statusLabel: 'Delivered' });
    await api.until('the delivered job', async () => (await job()).delivery?.delivered);
    expect((await so()).status).toBe('DONE');
  });

  it('5 · the visit is recorded, with the part that comes back; the warranty waits for full payment', async () => {
    await file('JOB_PHOTO', 'SVC_JOB', jobId);
    const v = await api.call<Job>('POST', `service/jobs/${jobId}/record`, 'ADM', { version: (await job()).version, result: 'COMPLETE', paidStatus: 'NOT_PAID', notPaidReason: 'Will transfer tonight', returns: [{ itemCode: 'TB-DIN-06', qty: '1' }] });
    expect(v.body.stage).toBe('DONE');
    const back = await api.get<{ items: { id: string; version: number }[] }>('service/returns?status=expected');
    expect((await api.call('POST', `service/returns/${back.items[0]!.id}/receive`, 'ADM', { version: back.items[0]!.version, goodQty: '1', damagedQty: '0' })).status).toBe(201);
    expect((await api.get<{ statusCounts: Record<string, number> }>('service/warranties')).statusCounts).toMatchObject({ all: 1, pending: 1, active: 0 });
  });

  it('6 · billing releases the drafted invoice; receipts pay it; the warranty becomes active', async () => {
    const inv = await api.until('the drafted invoice', async () => api.prisma.salInvoice.findFirst({ where: { salesOrderId: order.id } }));
    expect((await api.call('POST', `sales/invoices/${inv.id}/release`, 'AR', { version: inv.version })).status).toBe(201);
    const listed = async () => (await api.get<{ items: { docNo: string; balance: string }[] }>(`sales/invoices?q=${inv.docNo}`)).items[0]!.balance;
    expect(Number(await listed())).toBeCloseTo(Number(order.totals.total) - 1000, 2);
    const or = await api.call<{ id: string; version: number }>('POST', 'sales/receipts', 'AR', { salesOrderId: order.id, docDate: '2026-09-29', kind: 'BALANCE', method: 'CASH', amount: (Number(order.totals.total) - 1000).toFixed(2), proofIds: [await file('PAYMENT_PROOF')] });
    expect((await api.call('POST', `sales/receipts/${or.body.id}/verify`, 'RI', { version: or.body.version, reference: 'MBB 2' })).status).toBe(201);
    expect(await listed()).toBe('0.00');
    await api.until('the paid job', async () => (await job()).orderPayment?.status === 'FULLY_PAID');
    expect((await api.get<{ statusCounts: Record<string, number> }>('service/warranties')).statusCounts).toMatchObject({ pending: 0, active: 1 });
  });

  it('7 · the installer claims the job, and a warranty claim on the unit is covered', async () => {
    const day = (await api.prisma.svcJob.findUniqueOrThrow({ where: { id: jobId } })).jobDate!.toISOString().slice(0, 10);
    const e = await api.get<{ jobs: { id: string; claimable: boolean }[] }>(`service/claims/eligible?personId=${hafiz}&day=${day}`);
    expect(e.jobs).toEqual([expect.objectContaining({ id: jobId, claimable: true })]);
    const unit = (await api.get<{ items: { id: string }[] }>('service/warranties')).items[0]!;
    const w = await api.call<Job>('POST', `service/warranties/${unit.id}/job`, 'ADM', { problem: 'One leg is loose' });
    expect(w.body.warranty).toMatchObject({ suggested: 'COVERED' });
    // Nothing of the order is held any more, and the hourly checks find nothing to do.
    const items = await api.get<{ items: { heldQty: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=TB-DIN-06', 'AR');
    expect(items.items[0]!.heldQty).toBeNull();
    expect((await api.call<{ atRisk: string[]; deliveries: string[] }>('POST', 'service/jobs/stock-check', 'ADM')).body).toEqual({ atRisk: [], ready: [], deliveries: [] });
    expect((await api.call('POST', 'sales/orders/lapse-check', 'ADM')).body).toEqual({ warned: [], cancelled: [] });
  });
});
