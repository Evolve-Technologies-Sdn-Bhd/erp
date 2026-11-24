// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Signature { state: string; signerName: string | null; refuseReason: string | null; refuseReturned: string | null; unsignedByName: string | null }
interface Delivery { id: string; docNo: string; status: string; statusLabel: string; version: number; signature: Signature | null; allowedActions: string[]; activity: { action: string; message: string }[] }
interface Job { id: string; docNo: string; stage: string; version: number; salesOrderNo: string | null; delivery: { id: string; docNo: string; delivered: boolean } | null; returns: { id: string; itemCode: string; qty: string; receivedText: string | null }[]; cancelReason: string | null }
interface Order { id: string; docNo: string; status: string; statusLabel: string; version: number }
interface Returned { id: string; jobNo: string; itemCode: string; qty: string; version: number; canReceive: boolean; receivedText: string | null }

/**
 * The signed delivery order, returned parts, unfinished jobs and cancelling after the delivery order (phase 5, build 2).
 * Off by default: a delivery order is confirmed by the store as before.
 */
describe('The signed delivery order and returned parts (end to end)', () => {
  let api: Api;
  let hafiz = '';
  let n = 0;

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
  const delivery = (id: string, who = 'ADM') => api.get<Delivery>(`sales/deliveries/${id}`, who);
  const step = (id: string, what: string, who: string, body: Record<string, unknown>) => api.call<Delivery & { code?: string; errors?: { field: string }[] }>('POST', `sales/deliveries/${id}/${what}`, who, body);
  /** A file already uploaded, as the screens do before the call. */
  const file = async (kind: string) => {
    const tenantId = (await api.prisma.sysTenant.findFirstOrThrow()).id;
    n += 1;
    return (await api.prisma.sysAttachment.create({ data: { tenantId, fileName: `paper-${n}.jpg`, mimeType: 'image/jpeg', sizeBytes: 10, storageKey: `test/paper-${n}-${Date.now()}.jpg`, kind, uploadedByCode: 'ADM' } })).id;
  };
  const made = async () => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', installDate: '2026-10-01', lines: [{ itemCode: 'TB-DIN-06', qty: '2', unitPrice: '1450' }] });
    const r = await api.call<Order>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    expect(r.body.status).toBe('RELEASED');
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${r.body.docNo}`)).items.find((j) => j.salesOrderNo === r.body.docNo));
    return { order: r.body, jobId: row.id };
  };
  const book = async (id: string, start: number) => {
    const r = await api.call<Job>('POST', `service/jobs/${id}/book`, 'ADM', { version: (await job(id)).version, personId: hafiz, date: '2026-10-01', slotGroupCode: 'STANDARD', start });
    expect(r.status).toBe(201);
  };
  const draftDo = async (orderId: string) => {
    const d = await api.call<Delivery>('POST', 'sales/deliveries', 'AR', { salesOrderId: orderId });
    expect(d.status).toBe(201);
    return d.body;
  };

  it('is confirmed by the store as before while the company does not use signatures', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', FLOW)).status).toBe(200);
    const { order, jobId } = await made();
    const d = await draftDo(order.id);
    expect(d).toMatchObject({ signature: null });
    expect(d.allowedActions).toContain('confirm');
    expect((await step(d.id, 'collect', 'AR', { version: d.version })).status).toBe(409);
    expect((await step(d.id, 'confirm', 'AR', { version: d.version })).body).toMatchObject({ status: 'CONFIRMED', statusLabel: 'Delivered' });
    await api.until('the delivered job', async () => (await job(jobId)).delivery?.delivered);
  });

  let first: { order: Order; jobId: string };
  let d1: Delivery;

  it('is collected first, and delivered when the customer signs', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, signedDelivery: true })).status).toBe(200);
    first = await made();
    await book(first.jobId, 600);
    d1 = await draftDo(first.order.id);
    expect(d1).toMatchObject({ signature: { state: 'TO_COLLECT' } });
    expect(d1.allowedActions).toEqual(expect.arrayContaining(['edit', 'collect']));
    expect(d1.allowedActions).not.toContain('confirm');
    expect(await step(d1.id, 'confirm', 'AR', { version: d1.version })).toMatchObject({ status: 409, body: { code: 'SIGNATURE_NEEDED' } });
    expect((await step(d1.id, 'sign', 'ADM', { version: d1.version, signerName: 'Puan Salmah', fileIds: [await file('SIGNED_DO')] })).status).toBe(409);

    const c = await step(d1.id, 'collect', 'AR', { version: d1.version });
    expect(c.body).toMatchObject({ status: 'DRAFT', statusLabel: 'Collected', signature: { state: 'COLLECTED' } });
    expect(c.body.allowedActions).not.toContain('edit');
    expect((await api.call('DELETE', `sales/deliveries/${d1.id}?version=${c.body.version}`, 'AR')).status).toBe(409);

    // Postponed: the goods are checked back in, and the same delivery order is collected again.
    const back = await step(d1.id, 'check-in', 'AR', { version: c.body.version, note: 'Customer not at home' });
    expect(back.body).toMatchObject({ statusLabel: 'Draft', signature: { state: 'TO_COLLECT' } });
    const again = await step(d1.id, 'collect', 'AR', { version: back.body.version });

    const none = await step(d1.id, 'sign', 'ADM', { version: again.body.version, signerName: '' });
    expect(none).toMatchObject({ status: 400, body: { errors: [{ field: 'signerName' }, { field: 'fileIds' }] } });
    const signed = await step(d1.id, 'sign', 'ADM', { version: again.body.version, signerName: 'Puan Salmah', fileIds: [await file('SIGNED_DO')] });
    expect(signed.body).toMatchObject({ status: 'CONFIRMED', statusLabel: 'Delivered', signature: { state: 'DELIVERED', signerName: 'Puan Salmah' } });
    expect(signed.body.activity.some((a) => a.message.startsWith('Signed by Puan Salmah, recorded by Admin'))).toBe(true);
    expect((await api.get<Order>(`sales/orders/${first.order.id}`, 'AR')).status).toBe('DONE');
    await api.until('the signed job', async () => (await job(first.jobId)).delivery?.delivered);
  });

  it('goes to Management when the customer refuses, and never to whoever recorded it', async () => {
    const { order, jobId } = await made();
    const d = await draftDo(order.id);
    const c = await step(d.id, 'collect', 'AR', { version: d.version });
    expect(await step(d.id, 'refuse', 'ADM', { version: c.body.version })).toMatchObject({ status: 400, body: { errors: [{ field: 'reason' }, { field: 'fileIds' }] } });
    const r = await step(d.id, 'refuse', 'ADM', { version: c.body.version, reason: 'Not satisfied with the finish', fileIds: [await file('REFUSED_DO')] });
    expect(r.body).toMatchObject({ statusLabel: 'Not signed', signature: { state: 'REFUSED', refuseReason: 'Not satisfied with the finish' } });
    expect(await step(d.id, 'accept-unsigned', 'ADM', { version: r.body.version })).toMatchObject({ status: 409, body: { code: 'OWN_REFUSAL' } });
    expect((await step(d.id, 'accept-unsigned', 'AR', { version: r.body.version })).status).toBe(403);

    // Someone in Management: a role with the exception permission.
    const role = await api.call<{ id: string }>('POST', 'config/roles', 'ADM', { code: 'MGMT', name: 'Management', agentScopeCustomers: false, agentScopeDocuments: false, permissions: ['sales.view', 'sales.exception.approve', 'sales.cancel_order.release', 'sales.cancel_order.edit'] });
    expect([200, 201]).toContain(role.status);
    const roleId = (await api.prisma.sysRole.findFirstOrThrow({ where: { code: 'MGMT' } })).id;
    const ri = await api.prisma.sysUser.findFirstOrThrow({ where: { code: 'RI' } });
    await api.prisma.sysUserRole.create({ data: { tenantId: ri.tenantId, userId: ri.id, roleId } });
    const sent = await step(d.id, 'return-refusal', 'RI', { version: r.body.version, note: 'Ask again after the touch-up' });
    expect(sent.body).toMatchObject({ signature: { state: 'COLLECTED', refuseReturned: 'Ask again after the touch-up' } });
    const r2 = await step(d.id, 'refuse', 'ADM', { version: sent.body.version, reason: 'Still refuses' });
    const ok = await step(d.id, 'accept-unsigned', 'RI', { version: r2.body.version, note: 'Photos are clear' });
    expect(ok.body).toMatchObject({ status: 'CONFIRMED', statusLabel: 'Delivered, not signed', signature: { unsignedByName: 'Rosnah Ismail' } });
    await api.until('the job', async () => (await job(jobId)).delivery?.delivered);
  });

  it('lists parts coming back at the visit, and the store receives them', async () => {
    await api.prisma.sysAttachment.create({ data: { tenantId: (await api.prisma.sysTenant.findFirstOrThrow()).id, fileName: 'done.jpg', mimeType: 'image/jpeg', sizeBytes: 10, storageKey: `test/done-${Date.now()}.jpg`, kind: 'JOB_PHOTO', entityType: 'SVC_JOB', entityId: first.jobId, uploadedByCode: 'ADM' } });
    const visit = { result: 'COMPLETE', paidStatus: 'NO_CHARGE' };
    expect(await api.call('POST', `service/jobs/${first.jobId}/record`, 'ADM', { ...visit, version: (await job(first.jobId)).version, returns: [{ itemCode: 'TB-DIN-06', qty: '3' }] })).toMatchObject({
      status: 400, body: { errors: [{ field: 'returns[0].qty', message: 'Not more than the job took (2).' }] },
    });
    const done = await api.call<Job>('POST', `service/jobs/${first.jobId}/record`, 'ADM', { ...visit, version: (await job(first.jobId)).version, returns: [{ itemCode: 'TB-DIN-06', qty: '2' }] });
    expect(done.body).toMatchObject({ stage: 'DONE', returns: [{ itemCode: 'TB-DIN-06', qty: '2.0000', receivedText: null }] });

    const list = await api.get<{ items: Returned[]; statusCounts: Record<string, number> }>('service/returns?status=expected');
    expect(list.statusCounts).toEqual({ all: 1, expected: 1, received: 0 });
    const r = list.items[0]!;
    expect(await api.call('POST', `service/returns/${r.id}/receive`, 'ADM', { version: r.version, goodQty: '1', damagedQty: '0' })).toMatchObject({ status: 400, body: { errors: [{ field: 'note' }] } });
    const got = await api.call<Returned>('POST', `service/returns/${r.id}/receive`, 'ADM', { version: r.version, goodQty: '1', damagedQty: '1' });
    expect(got.body.receivedText).toBe('1 good, 1 damaged');
    expect(await api.prisma.sysOutbox.count({ where: { name: 'service.parts.returned' } })).toBe(1);
    expect((await api.call('POST', `service/returns/${r.id}/receive`, 'ADM', { version: r.version, goodQty: '2', damagedQty: '0' })).status).toBe(409);
  });

  it('warns the office once about an unfinished job, and the board shows it', async () => {
    const { jobId } = await made();
    await book(jobId, 840);
    await api.prisma.svcJob.update({ where: { id: jobId }, data: { jobDate: new Date('2026-09-28T00:00:00.000Z') } });
    await api.call('POST', 'service/jobs/stock-check', 'ADM');
    await api.call('POST', 'service/jobs/stock-check', 'ADM');
    expect(await api.prisma.sysNotification.count({ where: { kind: 'service.job.unfinished', entityId: jobId, userCode: 'ADM' } })).toBe(1);
    const board = await api.get<{ people: { name: string; unfinished: { id: string; why: string }[] }[] }>('service/board?date=2026-10-01');
    expect(board.people.find((p) => p.name === 'Hafiz Rahman')!.unfinished).toMatchObject([{ id: jobId, why: 'the visit is not recorded' }]);
  });

  it('keeps cancelling after the delivery order to Management, and the job goes with it', async () => {
    const { order, jobId } = await made();
    const d = await draftDo(order.id);
    const line = await api.prisma.salSalesOrderLine.findFirstOrThrow({ where: { salesOrderId: order.id } });
    const co = await api.call<{ id: string }>('POST', 'sales/cancel-orders', 'AR', { salesOrderId: order.id, reason: 'Customer changed requirement', lines: [{ soLineId: line.id, qty: '2' }] });
    expect(co.status).toBe(201);
    const source = co.body;
    const version = (await api.prisma.salCancelOrder.findUniqueOrThrow({ where: { id: source.id } })).version;
    expect(await api.call('POST', `sales/cancel-orders/${source.id}/release`, 'NA', { version })).toMatchObject({ status: 409, body: { code: 'MANAGEMENT_NEEDED' } });

    const c = await step(d.id, 'collect', 'AR', { version: d.version });
    expect(await api.call('POST', `sales/cancel-orders/${source.id}/release`, 'RI', { version })).toMatchObject({ status: 409, body: { code: 'GOODS_COLLECTED' } });
    await step(d.id, 'check-in', 'AR', { version: c.body.version });
    const ok = await api.call<{ status: string }>('POST', `sales/cancel-orders/${source.id}/release`, 'RI', { version });
    expect(ok.body.status).toBe('RELEASED');
    expect(await api.prisma.salDelivery.count({ where: { id: d.id } })).toBe(0);
    const j = await api.until('the cancelled job', async () => {
      const x = await job(jobId);
      return x.stage === 'CANCELLED' ? x : null;
    });
    expect(j.cancelReason).toContain('the order was cancelled');
    expect(j.delivery).toBeNull();
  });
});
