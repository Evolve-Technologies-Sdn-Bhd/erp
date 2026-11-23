// The Service module is on, so a revision after the installer is booked can be checked. Set before the app loads.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Revisions {
  number: number; switchOn: boolean; inRevision: boolean; reason: string | null; changes: string[]; needsApproval: boolean; approvalReason: string | null;
  notRevisable: string | null;
  history: { revisionNo: number; reason: string; revisedBy: string; replacedAt: string | null; changes: string | null; total: string; lines: { itemCode: string; qty: string; unitPrice: string }[] }[];
}
interface Order {
  id: string; docNo: string; status: string; version: number; releasedAt: string | null; deliveryAddress: string | null; installBooking: string | null;
  lines: { itemCode: string; orderedQty: string; unitPrice: string }[]; totals: { total: string };
  revisions: Revisions; allowedActions: string[]; activity: { action: string; message: string; comment: string | null }[];
  message?: string; code?: string; errors?: { field: string; message: string }[];
}
interface Job { id: string; docNo: string; version: number; stage: string; siteAddress: string | null; items: { itemCode: string; qty: string }[] }

/**
 * Sales order revisions (phase 5): with the Sales Flow switch on, a released order with nothing made from it is
 * revised under the same number; the earlier revision is kept read-only. A revision after the installer is booked, or
 * one that changes a price, needs the Sales Manager. Service and Purchase follow the revised order. Today is Tue 29 Sep.
 */
describe('Sales order revisions (end to end)', () => {
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
  const order = (id: string) => api.get<Order>(`sales/orders/${id}`, 'AR');
  const release = async (id: string) => api.call<Order>('POST', `sales/orders/${id}/release`, 'AR', { version: (await order(id)).version });
  const revise = async (id: string, reason = 'Customer changed their mind') => api.call<Order>('POST', `sales/orders/${id}/revise`, 'AR', { version: (await order(id)).version, reason });
  const save = async (id: string, body: Record<string, unknown>) => api.call<Order>('PATCH', `sales/orders/${id}`, 'AR', { version: (await order(id)).version, ...body });
  const newOrder = async (lines = [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }, { itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }]) => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines, installDate: '2026-10-01', deliveryAddress: 'No. 3, Jalan Damai, Shah Alam' });
    expect(o.status).toBe(201);
    const r = await release(o.body.id);
    expect(r.body.status).toBe('RELEASED');
    return r.body;
  };
  const approve = async (docNo: string) => {
    const inbox = await api.get<{ items: { id: string; docNo: string }[] }>('sales/approvals', 'NA');
    const item = inbox.items.find((i) => i.docNo === docNo)!;
    expect((await api.call('POST', `sales/approvals/${item.id}/approve`, 'NA', { comment: 'Fine' })).status).toBe(201);
  };
  const jobFor = (soNo: string) => api.until(`the job for ${soNo}`, async () => (await api.get<{ items: (Job & { salesOrderNo: string })[] }>(`service/jobs?q=${soNo}`)).items.find((j) => j.salesOrderNo === soNo));

  let first: Order;

  it('refuses a revision while the company does not revise orders', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', FLOW)).status).toBe(200);
    first = await newOrder();
    expect(first.allowedActions).not.toContain('revise');
    expect(first.revisions).toMatchObject({ number: 1, switchOn: false, inRevision: false, notRevisable: null, history: [] });
    expect(await revise(first.id)).toMatchObject({ status: 409, body: { code: 'REVISIONS_OFF' } });
  });

  it('starts revision 2 under the same number, back in draft, keeping revision 1 read-only', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, reviseOrders: true })).status).toBe(200);
    expect((await order(first.id)).allowedActions).toContain('revise');
    expect(await api.call('POST', `sales/orders/${first.id}/revise`, 'AR', { version: first.version, reason: ' ' })).toMatchObject({
      status: 400, body: { errors: [{ field: 'reason', message: 'Type why the order is revised.' }] },
    });
    const r = await revise(first.id);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ docNo: first.docNo, status: 'DRAFT', releasedAt: first.releasedAt });
    expect(r.body.revisions).toMatchObject({ number: 2, inRevision: true, reason: 'Customer changed their mind', changes: [], needsApproval: false });
    expect(r.body.revisions.history).toMatchObject([{ revisionNo: 1, reason: 'Customer changed their mind', revisedBy: 'Aina Rahman', replacedAt: null, total: first.totals.total }]);
    expect(r.body.allowedActions).toEqual(expect.arrayContaining(['edit', 'discardRevision', 'release']));
    expect(r.body.allowedActions).not.toContain('delete');
    expect(r.body.activity[0]).toMatchObject({ action: 'revised', comment: 'Customer changed their mind' });
    // A revision keeps its customer.
    expect(await save(first.id, { customerCode: 'C-0012' })).toMatchObject({ status: 400, body: { errors: [{ field: 'customerCode' }] } });
  });

  it('releases a revision without a price change straight away, and says what it changed', async () => {
    const saved = await save(first.id, { deliveryAddress: 'No. 5, Jalan Damai, Shah Alam', lines: [{ itemCode: 'TB-DIN-06', qty: '2', unitPrice: '1450' }] });
    expect(saved.body.revisions.changes).toEqual(['Delivery address changed', 'TB-DIN-06 quantity 1 → 2', 'Removed CH-DIN-01', 'Total 2,145.00 → 3,190.00']);
    expect(saved.body.revisions.needsApproval).toBe(false);
    const r = await release(first.id);
    expect(r.body).toMatchObject({ status: 'RELEASED', releasedAt: first.releasedAt, revisions: { number: 2, inRevision: false } });
    expect(r.body.revisions.history[0]).toMatchObject({ revisionNo: 1, changes: 'Delivery address changed; TB-DIN-06 quantity 1 → 2; Removed CH-DIN-01; Total 2,145.00 → 3,190.00' });
    expect(r.body.activity[0]!.message).toMatch(/^Revision 2 released by Aina Rahman: Delivery address changed/);
    const events = await api.prisma.sysOutbox.findMany({ where: { name: 'sales.order.released', aggregateId: first.id }, orderBy: { occurredAt: 'asc' } });
    expect(events.map((e) => (e.payload as { revision: number }).revision)).toEqual([1, 2]);

    // Purchase's demand copy and Service's job follow the revision.
    await api.until('Purchase demand for the revision', async () => (await api.prisma.purSalesDemand.count({ where: { soNo: first.docNo } })) === 1);
    const job = await jobFor(first.docNo);
    await api.until('the job updated from revision 2', async () => (await api.get<Job>(`service/jobs/${job.id}`)).siteAddress === 'No. 5, Jalan Damai, Shah Alam');
    expect((await api.get<Job>(`service/jobs/${job.id}`)).items).toMatchObject([{ itemCode: 'TB-DIN-06', qty: '2.0000' }]);
  });

  it('asks the Sales Manager for a revision that changes a price, then releases it', async () => {
    await revise(first.id, 'Agreed a better price');
    const saved = await save(first.id, { lines: [{ itemCode: 'TB-DIN-06', qty: '2', unitPrice: '1400' }] });
    expect(saved.body.revisions).toMatchObject({ number: 3, needsApproval: true, approvalReason: 'Revision 3 changes prices (TB-DIN-06 price 1,450.00 → 1,400.00)' });
    expect(saved.body.allowedActions).toContain('requestApproval');
    expect(await release(first.id)).toMatchObject({ status: 409, body: { code: 'REVISION_APPROVAL_REQUIRED', message: 'Revision 3 changes prices (TB-DIN-06 price 1,450.00 → 1,400.00). Type a reason and request approval.' } });
    const asked = await api.call<Order>('POST', `sales/orders/${first.id}/request-approval`, 'AR', { version: saved.body.version, reason: 'Long-standing customer' });
    expect(asked.body.status).toBe('PENDING_APPROVAL');
    await approve(first.docNo);
    expect((await release(first.id)).body).toMatchObject({ status: 'RELEASED', revisions: { number: 3 } });
  });

  it('discards a revision: the order is back as it was released', async () => {
    const before = await order(first.id);
    await revise(first.id, 'Try a third unit');
    await save(first.id, { lines: [{ itemCode: 'TB-DIN-06', qty: '3', unitPrice: '1400' }] });
    const r = await api.call<Order>('POST', `sales/orders/${first.id}/discard-revision`, 'AR', { version: (await order(first.id)).version });
    expect(r.body).toMatchObject({ status: 'RELEASED', revisions: { number: 3, inRevision: false }, totals: { total: before.totals.total } });
    expect(r.body.lines).toMatchObject([{ itemCode: 'TB-DIN-06', orderedQty: '2.0000', unitPrice: '1400.0000' }]);
    expect(r.body.revisions.history.map((h) => h.revisionNo)).toEqual([2, 1]);
    expect(r.body.activity[0]!.message).toBe('Revision 4 discarded by Aina Rahman; back to revision 3 as it was released');
  });

  it('asks for approval after the installer is booked, and keeps the booking on the order', async () => {
    const job = await jobFor(first.docNo);
    const settings = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER' });
    const hafiz = settings.body.people.find((p) => p.name === 'Hafiz Rahman')!.id;
    const latest = await api.get<Job>(`service/jobs/${job.id}`);
    expect((await api.call('POST', `service/jobs/${job.id}/book`, 'ADM', { version: latest.version, personId: hafiz, date: '2026-10-01', slotGroupCode: 'STANDARD', start: 600 })).status).toBe(201);
    await api.until('the booking on the order', async () => (await order(first.id)).installBooking === 'Thu, 1 Oct · 10 AM – 12 PM · Hafiz Rahman');

    await revise(first.id, 'New address');
    const saved = await save(first.id, { deliveryAddress: 'No. 9, Jalan Damai, Shah Alam' });
    expect(saved.body.revisions.approvalReason).toBe('Revision 4 made after the installer was booked (Thu, 1 Oct · 10 AM – 12 PM · Hafiz Rahman)');
    expect((await release(first.id)).body.code).toBe('REVISION_APPROVAL_REQUIRED');
    await api.call('POST', `sales/orders/${first.id}/request-approval`, 'AR', { version: saved.body.version, reason: 'Wrong block number' });
    await approve(first.docNo);
    expect((await release(first.id)).body.status).toBe('RELEASED');
    // The booked job takes the new address and keeps its slot.
    await api.until('the booked job updated', async () => (await api.get<Job>(`service/jobs/${job.id}`)).siteAddress === 'No. 9, Jalan Damai, Shah Alam');
    expect((await api.get<Job>(`service/jobs/${job.id}`)).stage).toBe('BOOKED');

    // Taken off the board: the order no longer shows a booking.
    const booked = await api.get<Job>(`service/jobs/${job.id}`);
    await api.call('POST', `service/jobs/${job.id}/unbook`, 'ADM', { version: booked.version });
    await api.until('the booking cleared', async () => (await order(first.id)).installBooking === null);
  });

  it('cannot be revised once a delivery order is made from it', async () => {
    const delivery = await api.call<{ docNo: string }>('POST', 'sales/deliveries', 'AR', { salesOrderId: first.id });
    expect(delivery.status).toBe(201);
    const o = await order(first.id);
    expect(o.allowedActions).not.toContain('revise');
    expect(o.revisions.notRevisable).toBe(`${first.docNo} already has a delivery order (${delivery.body.docNo}), so it can no longer be revised. Cancel the undelivered balance instead.`);
    expect(await revise(first.id)).toMatchObject({ status: 409, body: { code: 'NOT_REVISABLE' } });
  });
});
