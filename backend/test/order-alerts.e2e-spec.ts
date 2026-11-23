// The Service module is on, for the job alerts. Set before the app loads.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Notes { unread: number; items: { id: string; kind: string; title: string; body: string; link: string | null; read: boolean }[] }
interface Order { id: string; docNo: string; version: number; status: string; statusLabel: string; warehouseCode: string }
interface Job { id: string; docNo: string; version: number; stage: string; atRisk: boolean; atRiskNote: string | null; salesOrderNo: string | null }

/**
 * The automatic cancel and the alerts (phase 5): an order with no official receipt and no delivery order is warned 7
 * days before and cancelled 60 days after release by a system cancel order; pre-orders are left out. The salesperson
 * and the office are alerted under the bell when a job is postponed or rescheduled, and when its stock is not ready
 * 24 hours before the installation. Today is Tue 29 Sep 2026; passing time is simulated by moving dates back.
 */
describe('Automatic cancel and alerts (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true };
  const notes = (user: string) => api.get<Notes>('me/notifications', user);
  const released = async (lines: { itemCode: string; qty: string; unitPrice: string }[], extra: Record<string, unknown> = {}) => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines, ...extra });
    expect(o.status).toBe(201);
    const r = await api.call<Order>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    expect(r.body.status).toBe('RELEASED');
    return r.body;
  };
  const releasedOn = (id: string, date: string) => api.prisma.salSalesOrder.update({ where: { id }, data: { releasedAt: new Date(`${date}T03:00:00.000Z`) } });
  const inStock = [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }];

  it('needs official receipts on before orders are cancelled automatically', async () => {
    expect(await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, autoCancel: true })).toMatchObject({
      status: 400, body: { errors: [{ field: 'autoCancel', message: 'Turn on official receipts first: without them every order not delivered would count as unpaid.' }] },
    });
    const r = await api.call<{ saved: string[]; autoCancelDays: number }>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, useReceipts: true, autoCancel: true, preOrders: true, autoCancelDays: 60 });
    expect(r.status).toBe(200);
    expect(r.body.autoCancelDays).toBe(60);
    expect((await notes('AR')).unread).toBe(0);
  });

  it('warns 7 days before, cancels on the day, and leaves out orders with a delivery order and pre-orders', async () => {
    const lapsed = await released(inStock, { installOption: 'DELIVERY' });
    const warned = await released(inStock, { installOption: 'DELIVERY' });
    const delivered = await released(inStock, { installOption: 'DELIVERY' });
    const pre = await released([{ itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }], { installOption: 'DELIVERY' });
    await releasedOn(lapsed.id, '2026-07-25'); // 66 days ago
    await releasedOn(warned.id, '2026-08-05'); // 55 days ago: cancelled on 4 Oct
    await releasedOn(delivered.id, '2026-07-25');
    await releasedOn(pre.id, '2026-07-25');
    expect((await api.call('POST', 'sales/deliveries', 'AR', { salesOrderId: delivered.id })).status).toBe(201);

    const run = await api.call<{ warned: string[]; cancelled: { soNo: string; cancelNo: string }[] }>('POST', 'sales/orders/lapse-check', 'ADM');
    expect(run.body.warned).toEqual([warned.docNo]);
    expect(run.body.cancelled.map((c) => c.soNo)).toEqual([lapsed.docNo]);
    const cancelNo = run.body.cancelled[0]!.cancelNo;

    const order = await api.get<Order>(`sales/orders/${lapsed.id}`, 'AR');
    expect(order).toMatchObject({ status: 'DONE', statusLabel: 'Balance cancelled' });
    const co = await api.prisma.salCancelOrder.findFirstOrThrow({ where: { docNo: cancelNo } });
    expect(co).toMatchObject({ status: 'RELEASED', releasedByCode: 'SYSTEM', note: 'No official receipt and no delivery order 60 days after release (cancelled automatically)' });
    expect((await api.get<Order>(`sales/orders/${pre.id}`, 'AR')).status).toBe('RELEASED');

    const ar = await notes('AR');
    expect(ar.items.map((n) => n.title).sort()).toEqual([`${lapsed.docNo} cancelled automatically`, `${warned.docNo} will be cancelled on 4 Oct 2026`].sort());
    expect(ar.items.find((n) => n.kind === 'sales.order.lapsed')).toMatchObject({ link: `/sales/orders/${lapsed.id}`, read: false });
    // The people who release cancellations hear of it too.
    expect((await notes('NA')).items.map((n) => n.kind).sort()).toEqual(['sales.order.lapsed', 'sales.order.lapsing']);

    // Running again changes nothing.
    expect((await api.call('POST', 'sales/orders/lapse-check', 'ADM')).body).toEqual({ warned: [], cancelled: [] });
  });

  it('lets each person read their own alerts', async () => {
    const first = (await notes('AR')).items[0]!;
    expect((await api.call<Notes>('POST', `me/notifications/${first.id}/read`, 'AR')).body.unread).toBe(1);
    expect((await api.call('POST', `me/notifications/${first.id}/read`, 'NA')).status).toBe(404);
    expect((await api.call<Notes>('POST', 'me/notifications/read-all', 'AR')).body.unread).toBe(0);
  });

  it('marks an installation at risk when its stock is not ready 24 hours before, and tells the office and the salesperson', async () => {
    const so = await released([{ itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }]);
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${so.docNo}`)).items.find((j) => j.salesOrderNo === so.docNo));
    const people = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER' });
    const hafiz = people.body.people.find((p) => p.name === 'Hafiz Rahman')!.id;
    const job = await api.get<Job>(`service/jobs/${row.id}`);
    expect((await api.call('POST', `service/jobs/${job.id}/book`, 'ADM', { version: job.version, personId: hafiz, date: '2026-10-01', slotGroupCode: 'STANDARD', start: 600 })).status).toBe(201);

    // Two hours from now, on the business clock: within the 24 hours.
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
    const soon = Math.ceil((h! * 60 + m! + 120) / 30) * 30;
    const date = soon >= 1440 ? '2026-09-30' : '2026-09-29';
    const start = soon % 1440;
    await api.prisma.svcJob.update({ where: { id: job.id }, data: { jobDate: new Date(`${date}T00:00:00.000Z`), slotStart: start, slotEnd: Math.min(start + 120, 1440), expectedEnd: Math.min(start + 120, 1440) } });

    const run = await api.call<{ atRisk: string[]; ready: string[] }>('POST', 'service/jobs/stock-check', 'ADM');
    expect(run.body).toEqual({ atRisk: [job.docNo], ready: [] });
    expect(await api.get<Job>(`service/jobs/${job.id}`)).toMatchObject({ atRisk: true, atRiskNote: 'CH-DIN-01: 0 in stock, 2 needed' });
    expect((await notes('AR')).items[0]).toMatchObject({ kind: 'service.job.at_risk', title: `${job.docNo} at risk: stock not ready`, link: `/sales/orders/${so.id}` });
    expect((await notes('ADM')).items[0]).toMatchObject({ kind: 'service.job.at_risk', link: `/service/jobs/${job.id}` });
    expect((await api.call<{ atRisk: string[] }>('POST', 'service/jobs/stock-check', 'ADM')).body.atRisk).toEqual([]);

    // The stock arrives: no longer at risk.
    const tenant = await api.prisma.sysTenant.findFirstOrThrow();
    await api.prisma.invStockSnapshot.upsert({
      where: { tenantId_warehouseCode_itemCode: { tenantId: tenant.id, warehouseCode: so.warehouseCode, itemCode: 'CH-DIN-01' } },
      create: { tenantId: tenant.id, warehouseCode: so.warehouseCode, itemCode: 'CH-DIN-01', onHand: 5, asOf: new Date() },
      update: { onHand: 5 },
    });
    expect((await api.call<{ ready: string[] }>('POST', 'service/jobs/stock-check', 'ADM')).body.ready).toEqual([job.docNo]);
    expect((await api.get<Job>(`service/jobs/${job.id}`)).atRisk).toBe(false);
  });

  it('tells the salesperson when the installation is rescheduled or postponed', async () => {
    const so = await released(inStock, { installDate: '2026-10-01' });
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${so.docNo}`)).items.find((j) => j.salesOrderNo === so.docNo));
    const hafiz = (await api.get<{ people: { id: string; name: string }[] }>('service/settings')).people.find((p) => p.name === 'Hafiz Rahman')!.id;
    const book = async (date: string, start: number) => {
      const j = await api.get<Job>(`service/jobs/${row.id}`);
      return api.call('POST', `service/jobs/${row.id}/book`, 'ADM', { version: j.version, personId: hafiz, date, slotGroupCode: 'STANDARD', start });
    };
    expect((await book('2026-10-02', 600)).status).toBe(201);
    expect((await notes('AR')).items[0]!.kind).not.toBe('service.job.moved'); // a first booking is no news
    expect((await book('2026-10-02', 840)).status).toBe(201);
    expect((await notes('AR')).items[0]).toMatchObject({
      kind: 'service.job.moved', title: `${row.docNo} rescheduled`, body: `Villa Damai Resort (${so.docNo}): now Fri, 2 Oct · 2 PM – 4 PM · Hafiz Rahman. Please let the customer know.`,
    });

    const j = await api.get<Job>(`service/jobs/${row.id}`);
    expect((await api.call('POST', `service/jobs/${row.id}/record`, 'ADM', { version: j.version, result: 'POSTPONED', reason: 'Customer not in' })).status).toBe(201);
    expect((await notes('AR')).items[0]).toMatchObject({
      kind: 'service.job.postponed', title: `${row.docNo} postponed`, body: `Villa Damai Resort (${so.docNo}): Customer not in. It waits to be booked again.`,
    });
  });
});
