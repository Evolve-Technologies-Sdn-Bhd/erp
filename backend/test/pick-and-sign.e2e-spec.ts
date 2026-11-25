// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Item { itemCode: string; needed: string; free: string; short: boolean; counted: boolean }
interface StockJob { id: string; docNo: string; items: Item[]; extras: { id: string; itemCode: string; qty: string }[]; pickSignedBy: string | null; canChangeParts: boolean; deliveryNo: string | null; version: number }
interface StockDay { pickAndSign: boolean; days: { date: string; jobs: number; toDo: number }[]; jobs: StockJob[] }
interface Returned { id: string; itemCode: string; qty: string; reason: string; location: string | null; grnNo: string | null; version: number; receivedText: string | null }
interface Job {
  id: string; docNo: string; stage: string; version: number; salesOrderNo: string | null; items: { itemCode: string; extra: boolean }[]; returns: Returned[]; delivery: { id: string; docNo: string } | null;
  stock: { pickAndSign: boolean; signedBy: string | null; confirmedBy: string | null }; warranty: { exchange: boolean; canExchange: boolean } | null; activity: { action: string; message: string }[];
}
interface Order { id: string; docNo: string; status: string; version: number; stock: { draftWarning: string | null }; revisions: { notRevisable: string | null } }
interface Delivery { id: string; docNo: string; version: number; docDate: string; signature: { state: string } | null; activity: { message: string }[] }

/**
 * The warehouse picks and signs (phase 5, a company's Logistic Manager): the delivery order is made then, parts can be
 * added before it, a postponed job's goods come back to be received, items without an RFID tag are never short, and a
 * covered claim can be a one-to-one exchange. Off by default. HQ-MAIN holds 4 of TB-DIN-06.
 */
describe('Service: pick and sign, goods back, and the one-to-one exchange (end to end)', () => {
  let api: Api;
  const people: Record<string, string> = {};
  let n = 0;
  let order: Order;
  let jobId = '';

  beforeAll(async () => {
    reseed();
    api = await startApi();
    for (const [key, name, role] of [['hafiz', 'Hafiz Rahman', 'INSTALLER'], ['aisyah', 'Nor Aisyah', 'WARRANTY']] as const) {
      const r = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name, role });
      people[key] = r.body.people.find((p) => p.name === name)!.id;
    }
    await api.prisma.mdmItem.updateMany({ where: { code: 'TB-DIN-06' }, data: { warrantyMonths: 12 } });
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true, autoDelivery: true, signedDelivery: true, reviseOrders: true })).status).toBe(200);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const job = (id: string) => api.get<Job>(`service/jobs/${id}`);
  const day = (date: string) => api.get<StockDay>(`service/stock?date=${date}`);
  const delivery = (id: string) => api.get<Delivery>(`sales/deliveries/${id}`);
  const draft = async (lines: { itemCode: string; qty: string; unitPrice: string }[]) => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', installDate: '2026-10-01', lines });
    expect(o.status).toBe(201);
    return o.body;
  };
  const book = async (id: string, date: string, person = 'hafiz', group = 'STANDARD') => {
    const r = await api.call<Job>('POST', `service/jobs/${id}/book`, 'ADM', { version: (await job(id)).version, personId: people[person], date, slotGroupCode: group, start: 600 });
    expect(r.status).toBe(201);
  };
  const record = async (id: string, body: Record<string, unknown>) => {
    n += 1;
    await api.prisma.sysAttachment.create({ data: { tenantId: (await api.prisma.sysTenant.findFirstOrThrow()).id, fileName: `p${n}.jpg`, mimeType: 'image/jpeg', sizeBytes: 10, storageKey: `test/ps-${n}-${Date.now()}.jpg`, kind: 'JOB_PHOTO', entityType: 'SVC_JOB', entityId: id, uploadedByCode: 'ADM' } });
    const r = await api.call<Job>('POST', `service/jobs/${id}/record`, 'ADM', { version: (await job(id)).version, ...body });
    expect(r.status).toBe(201);
    return r.body;
  };
  const receive = async (r: Returned, goodQty: string, damagedQty: string) => {
    const x = await api.call<Returned>('POST', `service/returns/${r.id}/receive`, 'ADM', { version: r.version, goodQty, damagedQty });
    expect(x.status).toBe(201);
    return x.body;
  };

  it('never says short of an item without an RFID tag', async () => {
    const lines = [{ itemCode: 'TB-DIN-06', qty: '9', unitPrice: '1450' }];
    expect((await draft(lines)).stock.draftWarning).toContain('short');
    await api.prisma.mdmItem.updateMany({ where: { code: 'TB-DIN-06' }, data: { hasTag: false } });
    expect((await draft(lines)).stock.draftWarning).toBeNull();
    await api.prisma.mdmItem.updateMany({ where: { code: 'TB-DIN-06' }, data: { hasTag: true } });
  });

  it('is a setting that goes with the warehouse confirming, and is logged', async () => {
    const off = await api.call<{ general: Record<string, unknown> }>('PUT', 'service/settings/general', 'ADM', { warehouseConfirms: false, pickAndSign: true });
    expect(off.body.general).toMatchObject({ warehouseConfirms: false, pickAndSign: false });
    const on = await api.call<{ general: Record<string, unknown> }>('PUT', 'service/settings/general', 'ADM', { warehouseConfirms: true, pickAndSign: true, warrantyLocation: 'wnty' });
    expect(on.body.general).toEqual({ warehouseConfirms: true, pickAndSign: true, warrantyLocation: 'WNTY' });
    expect(await api.prisma.sysActivity.count({ where: { entityType: 'SVC_SETTING', message: { contains: 'The warehouse picks and signs: Off → On' } } })).toBe(1);
  });

  it('lets the warehouse add parts, then pick and sign: the delivery order is made at once, days before', async () => {
    const o = await draft([{ itemCode: 'TB-DIN-06', qty: '2', unitPrice: '1450' }]);
    const r = await api.call<Order>('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version });
    order = r.body;
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${order.docNo}`)).items.find((j) => j.salesOrderNo === order.docNo));
    jobId = row.id;
    await book(jobId, '2026-10-02');

    const list = await day('2026-10-02');
    expect(list).toMatchObject({ pickAndSign: true });
    expect(list.days.find((d) => d.date === '2026-10-02')).toMatchObject({ jobs: 1, toDo: 1 });
    expect(list.jobs[0]).toMatchObject({ canChangeParts: true, items: [{ itemCode: 'TB-DIN-06', needed: '2' }] });
    const add = (version: number, qty: string) => api.call<StockDay>('POST', `service/stock/${jobId}/parts`, 'ADM', { version, itemCode: 'CH-DIN-01', qty });
    const added = await add(list.jobs[0]!.version, '1');
    expect(added.body.jobs[0]!.extras).toMatchObject([{ itemCode: 'CH-DIN-01', qty: '1.0000' }]);
    const more = (await add(added.body.jobs[0]!.version, '2')).body.jobs[0]!;
    expect(more.extras).toMatchObject([{ itemCode: 'CH-DIN-01', qty: '3.0000' }]);
    expect((await add(more.version, '0')).status).toBe(400);
    const gone = await api.call<StockDay>('DELETE', `service/stock/${jobId}/parts/${more.extras[0]!.id}?version=${more.version}`, 'ADM');
    expect(gone.body.jobs[0]!.extras).toEqual([]);
    const last = (await add(gone.body.jobs[0]!.version, '1')).body.jobs[0]!;

    expect(await api.call('POST', `service/stock/${jobId}/confirm`, 'ADM', { version: last.version })).toMatchObject({ status: 400, body: { errors: [{ field: 'signedBy' }] } });
    const signed = await api.call<StockDay>('POST', `service/stock/${jobId}/confirm`, 'ADM', { version: last.version, signedBy: 'Faris' });
    expect(signed.body.jobs[0]).toMatchObject({ pickSignedBy: 'Faris', canChangeParts: false });
    expect((await add(signed.body.jobs[0]!.version, '1')).status).toBe(409);
    const x = await api.until('the delivery order', async () => {
      const v = await job(jobId);
      return v.delivery ? v : null;
    });
    const d = await delivery(x.delivery!.id);
    expect(d.docDate).toBe('2026-10-02');
    expect(d.activity.some((a) => a.message.startsWith('Made by the system when the warehouse picked and signed'))).toBe(true);
    expect((await api.get<Order>(`sales/orders/${order.id}`, 'AR')).revisions.notRevisable).toContain(d.docNo);
    // The parts are on the job, never on the delivery order.
    expect(await api.prisma.salDeliveryLine.count({ where: { deliveryId: d.id, itemCode: 'CH-DIN-01' } })).toBe(0);
    expect(x.items.filter((i) => i.extra).map((i) => i.itemCode)).toEqual(['CH-DIN-01']);
  });

  it('brings the goods of a postponed job back to be received, and checks the delivery order in when all are', async () => {
    const id = (await job(jobId)).delivery!.id;
    const c = await api.call<Delivery>('POST', `sales/deliveries/${id}/collect`, 'AR', { version: (await delivery(id)).version });
    expect(c.body.signature).toMatchObject({ state: 'COLLECTED' });
    const j = await record(jobId, { result: 'POSTPONED', reason: 'Customer not at home' });
    expect(j).toMatchObject({ stage: 'NOT_BOOKED', stock: { signedBy: null, confirmedBy: null } });
    expect(j.returns.map((r) => [r.itemCode, r.qty, r.reason])).toEqual([['CH-DIN-01', '1.0000', 'POSTPONED'], ['TB-DIN-06', '2.0000', 'POSTPONED']]);

    expect(await receive(j.returns[0]!, '1', '0')).toMatchObject({ location: null, grnNo: null });
    expect((await delivery(id)).signature).toMatchObject({ state: 'COLLECTED' });
    expect(await receive(j.returns[1]!, '1', '1')).toMatchObject({ location: 'WNTY', grnNo: null, receivedText: '1 good, 1 damaged' });
    const d = await api.until('the delivery order checked in', async () => {
      const v = await delivery(id);
      return v.signature?.state === 'TO_COLLECT' ? v : null;
    });
    expect(d.activity.some((a) => a.message.startsWith('Goods checked back in: received at the store by Admin'))).toBe(true);

    // Booked again: picked and signed again, on the same delivery order.
    await book(jobId, '2026-10-05');
    const s = await api.call<StockDay>('POST', `service/stock/${jobId}/confirm`, 'ADM', { version: (await job(jobId)).version, signedBy: 'Faris' });
    expect(s.body.jobs[0]).toMatchObject({ pickSignedBy: 'Faris', deliveryNo: d.docNo });
  });

  it('registers no warranty for the parts the warehouse added', async () => {
    await api.prisma.mdmItem.updateMany({ where: { code: 'CH-DIN-01' }, data: { warrantyMonths: 12 } });
    const j = await record(jobId, { result: 'COMPLETE', paidStatus: 'NO_CHARGE' });
    expect(j.stage).toBe('DONE');
    expect((await api.prisma.svcWarranty.findMany({ where: { jobId } })).map((w) => w.itemCode)).toEqual(['TB-DIN-06']);
  });

  it('exchanges a covered claim one-to-one: the faulty unit is received on its own GRN at the warranty location', async () => {
    const w = await api.prisma.svcWarranty.findFirstOrThrow({ where: { jobId } });
    await api.prisma.svcWarranty.update({ where: { id: w.id }, data: { status: 'ACTIVE', serialNo: 'SN-1' } });
    const made = await api.call<Job>('POST', `service/warranties/${w.id}/job`, 'ADM', { problem: 'Top is warped' });
    expect(made.body.warranty).toMatchObject({ exchange: false, canExchange: false });
    expect((await api.call('POST', `service/jobs/${made.body.id}/exchange`, 'ADM', { version: made.body.version })).status).toBe(409);
    const ok = await api.call<Job>('POST', `service/jobs/${made.body.id}/assess`, 'ADM', { version: made.body.version, result: 'COVERED' });
    expect(ok.body.warranty).toMatchObject({ canExchange: true });

    // Before it is an exchange, a claim takes nothing from the store.
    await book(made.body.id, '2026-10-06', 'aisyah', 'SHORT');
    expect((await day('2026-10-06')).jobs[0]).toMatchObject({ items: [] });
    const ex = await api.call<Job>('POST', `service/jobs/${made.body.id}/exchange`, 'ADM', { version: (await job(made.body.id)).version });
    expect(ex.body.warranty).toMatchObject({ exchange: true, canExchange: false });
    expect((await day('2026-10-06')).jobs[0]).toMatchObject({ items: [{ itemCode: 'TB-DIN-06', needed: '2' }] });

    const done = await record(made.body.id, { result: 'COMPLETE', paidStatus: 'NO_CHARGE' });
    expect(done.returns).toMatchObject([{ itemCode: 'TB-DIN-06', reason: 'EXCHANGE', qty: '2.0000' }]);
    expect(await receive(done.returns[0]!, '0', '2')).toMatchObject({ location: 'WNTY', grnNo: 'GRN-W-0001' });
    expect(await api.prisma.svcWarranty.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ serialNo: null, status: 'ACTIVE', endOn: w.endOn });
    expect((await job(made.body.id)).activity.some((a) => a.message.includes('on GRN-W-0001, to location WNTY'))).toBe(true);
  });
});
