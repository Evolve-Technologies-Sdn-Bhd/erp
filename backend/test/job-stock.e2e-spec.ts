// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Item { itemCode: string; needed: string; onHand: string; earlier: string; free: string; short: boolean }
interface StockJob { id: string; docNo: string; salesOrderNo: string | null; shortText: string | null; items: Item[]; confirmedBy: string | null; deliveryNo: string | null; version: number; canConfirm: boolean; canUndo: boolean }
interface StockDay { on: boolean; date: string; counts: { jobs: number; confirmed: number; short: number }; jobs: StockJob[] }
interface Job { id: string; docNo: string; stage: string; version: number; salesOrderNo: string | null; atRisk: boolean; atRiskNote: string | null; stock: { confirms: boolean; items: Item[]; confirmedBy: string | null }; delivery: { id: string; docNo: string } | null; activity: { action: string; message: string }[] }
interface Order { id: string; docNo: string; status: string; version: number; revisions: { notRevisable: string | null }; stock: { draftWarning: string | null }; activity: { action: string; message: string }[] }
interface Delivery { id: string; docNo: string; docDate: string; status: string; driver: string | null; version: number; activity: { action: string; message: string }[] }

/**
 * Stock held for booked installations, the warehouse's confirmation and the delivery order 24 hours before (phase 5,
 * build 1). HQ-MAIN holds 4 of TB-DIN-06. Off by default: nothing changes until the switches are on.
 */
describe('Service: stock for jobs and the delivery order 24 hours before (end to end)', () => {
  let api: Api;
  let hafiz = '';
  let first: { order: Order; job: Job };
  let second: { order: Order; job: Job };

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const people = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER' });
    hafiz = people.body.people.find((p) => p.name === 'Hafiz Rahman')!.id;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true };
  const job = (id: string) => api.get<Job>(`service/jobs/${id}`);
  const order = (id: string) => api.get<Order>(`sales/orders/${id}`, 'AR');
  const day = (date?: string) => api.get<StockDay>(`service/stock${date ? `?date=${date}` : ''}`);
  const draft = async (qty: string) => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', installDate: '2026-10-01', lines: [{ itemCode: 'TB-DIN-06', qty, unitPrice: '1450' }] });
    expect(o.status).toBe(201);
    return o.body;
  };
  const release = async (o: Order) => {
    const r = await api.call<Order>('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version });
    expect(r.body.status).toBe('RELEASED');
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${o.docNo}`)).items.find((j) => j.salesOrderNo === o.docNo));
    return { order: r.body, job: await job(row.id) };
  };
  const book = async (id: string, date: string, start: number) => {
    const r = await api.call<Job>('POST', `service/jobs/${id}/book`, 'ADM', { version: (await job(id)).version, personId: hafiz, date, slotGroupCode: 'STANDARD', start });
    expect(r.status).toBe(201);
    return r.body;
  };
  /** Puts a booked job's slot two hours from now on the business clock, so it is within the 24 hours. */
  const soon = async (id: string) => {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
    const at = Math.ceil((h! * 60 + m! + 120) / 30) * 30;
    const date = at >= 1440 ? '2026-09-30' : '2026-09-29';
    await api.prisma.svcJob.update({ where: { id }, data: { jobDate: new Date(`${date}T00:00:00.000Z`), slotStart: at % 1440, slotEnd: Math.min((at % 1440) + 120, 1440), expectedEnd: Math.min((at % 1440) + 120, 1440) } });
    return date;
  };

  it('confirms nothing while the company does not use it', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', FLOW)).status).toBe(200);
    first = await release(await draft('3'));
    await book(first.job.id, '2026-10-01', 600);
    expect(await day('2026-10-01')).toMatchObject({ on: false, counts: { jobs: 1, confirmed: 0 } });
    expect(await api.call('POST', `service/stock/${first.job.id}/confirm`, 'ADM', { version: (await job(first.job.id)).version })).toMatchObject({ status: 409, body: { code: 'STOCK_CONFIRM_OFF' } });
    // Nobody holds stock yet: another order for 2 of the 4 is not short.
    expect((await draft('2')).stock.draftWarning).toBeNull();
  });

  it('holds the stock of a booked installation for other orders, as a warning', async () => {
    await api.until('the booking on the order', async () => (await api.prisma.salSalesOrder.findUnique({ where: { id: first.order.id } }))?.installBookedAt);
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, holdStock: true, autoDelivery: true, reviseOrders: true })).status).toBe(200);
    const o = await draft('2');
    expect(o.stock.draftWarning).toBe('1 free (3 held for booked installations), 1 short');
    // Its own hold does not count against it.
    expect((await api.get<{ items: { code: string; inStock: string; heldQty: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=TB-DIN-06', 'AR')).items[0]).toMatchObject({ inStock: '1.0000', heldQty: '3.0000' });
    second = await release(o);
    expect(second.order.activity.some((a) => a.action === 'stock_warning' && a.message.includes('3 held for booked installations'))).toBe(true);
  });

  it('shows each job what earlier jobs leave, and lets the warehouse confirm', async () => {
    const on = await api.call<{ general: { warehouseConfirms: boolean } }>('PUT', 'service/settings/general', 'ADM', { warehouseConfirms: true });
    expect(on.body.general.warehouseConfirms).toBe(true);
    await book(second.job.id, '2026-10-01', 840);
    const list = await day('2026-10-01');
    expect(list).toMatchObject({ on: true, counts: { jobs: 2, confirmed: 0, short: 1 } });
    expect(list.jobs[0]).toMatchObject({ docNo: first.job.docNo, shortText: null, canConfirm: true });
    expect(list.jobs[1]).toMatchObject({ docNo: second.job.docNo, shortText: 'TB-DIN-06: 1 free (3 held by earlier jobs), 2 needed' });

    const r = await api.call<StockDay>('POST', `service/stock/${first.job.id}/confirm`, 'ADM', { version: list.jobs[0]!.version });
    expect(r.body.jobs[0]).toMatchObject({ canConfirm: false, canUndo: true });
    const undone = await api.call<StockDay>('POST', `service/stock/${first.job.id}/undo`, 'ADM', { version: r.body.jobs[0]!.version });
    expect(undone.body.jobs[0]).toMatchObject({ confirmedBy: null, canConfirm: true });
    // Not within 24 hours yet: confirming asks for nothing.
    await api.call('POST', `service/stock/${first.job.id}/confirm`, 'ADM', { version: undone.body.jobs[0]!.version });
    expect(await api.prisma.sysOutbox.count({ where: { name: 'service.job.delivery_due' } })).toBe(0);
    // Moved to another day: the warehouse confirms again.
    expect((await book(first.job.id, '2026-10-02', 600)).stock.confirmedBy).toBeNull();
  });

  it('marks a job within 24 hours at risk when the warehouse has not confirmed, and makes no delivery order', async () => {
    await soon(first.job.id);
    const run = await api.call<{ atRisk: string[]; deliveries: string[] }>('POST', 'service/jobs/stock-check', 'ADM');
    expect(run.body).toMatchObject({ atRisk: [first.job.docNo], deliveries: [] });
    expect(await job(first.job.id)).toMatchObject({ atRisk: true, atRiskNote: 'the warehouse has not confirmed the stock', delivery: null });
  });

  it('makes the delivery order once the stock is confirmed, and the order can no longer be revised', async () => {
    const date = await soon(first.job.id);
    expect((await order(first.order.id)).revisions.notRevisable).toBeNull();
    const r = await api.call<StockDay>('POST', `service/stock/${first.job.id}/confirm`, 'ADM', { version: (await job(first.job.id)).version });
    expect(r.status).toBe(201);
    const j = await api.until('the delivery order on the job', async () => {
      const x = await job(first.job.id);
      return x.delivery ? x : null;
    });
    expect(j).toMatchObject({ atRisk: false, stock: { confirmedBy: 'Admin' } });
    const d = await api.get<Delivery>(`sales/deliveries/${j.delivery!.id}`);
    expect(d).toMatchObject({ docNo: j.delivery!.docNo, status: 'DRAFT', docDate: date, driver: 'Hafiz Rahman' });
    expect(d.activity.some((a) => a.message.startsWith('Made by the system 24 hours before the installation'))).toBe(true);
    const o = await order(first.order.id);
    expect(o.activity.some((a) => a.action === 'auto_delivery')).toBe(true);
    expect(o.revisions.notRevisable).toContain(d.docNo);
    // Asked again: still one delivery order. And the confirmation can no longer be taken back.
    expect((await api.call<{ deliveries: string[] }>('POST', 'service/jobs/stock-check', 'ADM')).body.deliveries).toEqual([]);
    expect(await api.prisma.salDelivery.count({ where: { salesOrderId: first.order.id } })).toBe(1);
    expect(await api.call('POST', `service/stock/${first.job.id}/undo`, 'ADM', { version: j.version })).toMatchObject({ status: 409, body: { code: 'DELIVERY_MADE' } });
  });

  it('moves the same delivery order with the job', async () => {
    const moved = await book(first.job.id, '2026-10-05', 600);
    expect(moved.stock.confirmedBy).toBe('Admin'); // the goods are already prepared
    const id = moved.delivery!.id;
    const d = await api.until('the moved delivery order', async () => {
      const x = await api.get<Delivery>(`sales/deliveries/${id}`);
      return x.docDate === '2026-10-05' ? x : null;
    });
    expect(d.activity.some((a) => a.action === 'install_moved')).toBe(true);
    await api.call('POST', `service/jobs/${first.job.id}/unbook`, 'ADM', { version: (await job(first.job.id)).version });
    await api.until('the waiting delivery order', async () => (await api.get<Delivery>(`sales/deliveries/${id}`)).activity.some((a) => a.action === 'install_waiting'));
    expect((await job(first.job.id)).delivery!.docNo).toBe(d.docNo);
  });

  it('makes none while the order is being revised, and says so once', async () => {
    const so = await order(second.order.id);
    expect((await api.call('POST', `sales/orders/${so.id}/revise`, 'AR', { version: so.version, reason: 'Customer thinks again' })).status).toBe(201);
    await soon(second.job.id);
    await api.call('POST', `service/stock/${second.job.id}/confirm`, 'ADM', { version: (await job(second.job.id)).version });
    const o = await api.until('the note on the order', async () => {
      const x = await order(second.order.id);
      return x.activity.some((a) => a.action === 'auto_delivery_blocked') ? x : null;
    });
    await api.call('POST', 'service/jobs/stock-check', 'ADM');
    await api.until('the events', async () => (await api.prisma.sysOutbox.count({ where: { name: 'service.job.delivery_due', aggregateId: second.job.id } })) >= 2);
    expect((await order(o.id)).activity.filter((a) => a.action === 'auto_delivery_blocked')).toHaveLength(1);
    expect((await job(second.job.id)).delivery).toBeNull();
    // The revision is dropped: the next hourly check gets the delivery order.
    const back = await api.call<Order>('POST', `sales/orders/${o.id}/discard-revision`, 'AR', { version: o.version });
    expect(back.body.status).toBe('RELEASED');
    await api.call('POST', 'service/jobs/stock-check', 'ADM');
    const j = await api.until('the delivery order', async () => {
      const x = await job(second.job.id);
      return x.delivery ? x : null;
    });
    // Deleted by the store: the job has none again, and the next check asks again.
    const d = await api.get<Delivery>(`sales/deliveries/${j.delivery!.id}`, 'AR');
    expect((await api.call('DELETE', `sales/deliveries/${d.id}?version=${d.version}`, 'AR')).status).toBe(200);
    await api.until('the job without one', async () => (await job(second.job.id)).delivery === null);
  });
});
