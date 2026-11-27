// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Branch { code: string; amount: string | null; version: number; allocated: string; left: string | null; over: boolean; agents: { code: string; name: string; amount: string | null }[] }
interface Targets { month: string; canManage: boolean; branches: Branch[] }
interface Month { month: string; monthText: string; scope: string; ordered: { count: number; total: string }; paid: { count: number; total: string }; target: { amount: string | null; orderedPct: number | null; paidPct: number | null; branch: string | null } }
interface Order { id: string; docNo: string; version: number; status: string; totals: { total: string } }

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pct = (value: string, target: string) => Math.floor((Number(value) * 100) / Number(target));

/**
 * The salesperson's home on the phone (phase 5): a branch's monthly target split between its salespeople (S38), the
 * month so far (ordered, fully paid) against it, and the order list filtered by where the installation stands and how
 * much is paid. A company that sets no target sees no change.
 */
describe('The salesperson home: targets, the month so far and the order filters (end to end)', () => {
  let api: Api;
  let order: Order;
  let jobId = '';
  const docNos = async (query: string, user = 'AR') => (await api.get<{ items: { docNo: string }[] }>(`sales/orders?${query}&pageSize=100`, user)).items.map((i) => i.docNo);
  const save = (body: Record<string, unknown>, user = 'ADM') => api.call<Targets & { code?: string }>('PUT', 'sales/targets', user, { month: '2026-09', branchCode: 'HQ', agents: [], ...body });
  const upload = async (user: string, kind: string, entity?: { type: string; id: string }) => {
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.from(PNG, 'base64'))], { type: 'image/png' }), 'photo.png');
    form.append('kind', kind);
    if (entity) {
      form.append('entityType', entity.type);
      form.append('entityId', entity.id);
    }
    const res = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': user }, body: form });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('has no target until one is set, and only whoever holds the permission sets one', async () => {
    expect(await api.get<Month>('sales/dashboard/month', 'AR')).toMatchObject({ month: '2026-09', monthText: 'September 2026', scope: 'MINE', target: { amount: null, orderedPct: null, paidPct: null, branch: null } });
    const view = await api.get<Targets>('sales/targets?month=2026-09', 'AR');
    expect(view.canManage).toBe(false);
    const hq = view.branches.find((b) => b.code === 'HQ')!;
    expect(hq).toMatchObject({ amount: null, version: 0, allocated: '0.00', left: null, over: false });
    expect(hq.agents.map((a) => a.code)).toContain('AR');
    expect((await save({ amount: '1', version: 0 }, 'AR')).status).toBe(403);
  });

  it('sets the branch target and splits it, guarded by the version and logged', async () => {
    expect(await save({ amount: '-1', agents: [{ agentCode: 'ZZ', amount: '1' }], version: 0 })).toMatchObject({
      status: 400,
      body: { errors: [{ field: 'amount' }, { field: 'agents[0].agentCode', message: 'ZZ is not a salesperson of this branch.' }] },
    });
    const saved = await save({ amount: '60,000', agents: [{ agentCode: 'ar', amount: '20000' }], version: 0 });
    expect(saved.status).toBe(200);
    const hq = saved.body.branches.find((b) => b.code === 'HQ')!;
    expect(hq).toMatchObject({ amount: '60000.00', version: 1, allocated: '20000.00', left: '40000.00', over: false });
    expect(hq.agents.find((a) => a.code === 'AR')!.amount).toBe('20000.00');
    expect(await save({ amount: '50000', version: 0 })).toMatchObject({ status: 409, body: { code: 'STALE_VERSION' } });
    const log = await api.prisma.sysActivity.findFirst({ where: { entityType: 'SAL_TARGET' }, orderBy: { createdAt: 'desc' } });
    expect(log?.message).toContain('Branch target: none → RM 60,000.00');
    const month = await api.get<Month>('sales/dashboard/month', 'AR');
    expect(month.target).toMatchObject({ amount: '20000.00', branch: '60000.00', orderedPct: pct(month.ordered.total, '20000'), paidPct: pct(month.paid.total, '20000') });
  });

  it('counts a released order in the month, and lists an installation not booked and without a day', async () => {
    await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true, installDateLater: true, useReceipts: true });
    const before = await api.get<Month>('sales/dashboard/month', 'AR');
    const made = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    expect(made.status).toBe(201);
    const released = await api.call<Order>('POST', `sales/orders/${made.body.id}/release`, 'AR', { version: made.body.version });
    expect(released.body.status).toBe('RELEASED');
    order = released.body;

    const after = await api.get<Month>('sales/dashboard/month', 'AR');
    expect(after.ordered.count).toBe(before.ordered.count + 1);
    expect(after.ordered.total).toBe((Number(before.ordered.total) + Number(order.totals.total)).toFixed(2));

    expect(await docNos('install=toBook')).toContain(order.docNo);
    expect(await docNos('install=dateTbc')).toContain(order.docNo);
    expect(await docNos('install=today')).not.toContain(order.docNo);
    expect(await docNos('payment=unpaid')).toContain(order.docNo);
    expect(await docNos('payment=paid')).not.toContain(order.docNo);
  });

  it('follows the booking and the completed visit from Service', async () => {
    const people = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER', phone: '012-345 6789' });
    const hafiz = people.body.people.find((p) => p.name === 'Hafiz Rahman')!.id;
    const row = await api.until('the job', async () => (await api.get<{ items: { id: string; salesOrderNo: string | null }[] }>(`service/jobs?q=${order.docNo}`)).items.find((j) => j.salesOrderNo === order.docNo));
    jobId = row.id;
    const job = await api.get<{ version: number }>(`service/jobs/${jobId}`);
    expect((await api.call('POST', `service/jobs/${jobId}/book`, 'ADM', { version: job.version, personId: hafiz, date: '2026-09-29', slotGroupCode: 'STANDARD', start: 720 })).status).toBe(201);

    await api.until('booked for today', async () => (await docNos('install=today')).includes(order.docNo));
    expect(await docNos('install=toBook')).not.toContain(order.docNo);

    await upload('ADM', 'JOB_PHOTO', { type: 'SVC_JOB', id: jobId });
    const booked = await api.get<{ version: number }>(`service/jobs/${jobId}`);
    expect((await api.call('POST', `service/jobs/${jobId}/record`, 'ADM', { version: booked.version, result: 'COMPLETE', paidStatus: 'NO_CHARGE' })).status).toBe(201);
    await api.until('installed, not paid', async () => (await docNos('install=donePaymentPending')).includes(order.docNo));
  });

  it('counts the order fully paid once verified receipts reach its total', async () => {
    const before = await api.get<Month>('sales/dashboard/month', 'AR');
    const proof = await upload('AR', 'PAYMENT_PROOF');
    const r = await api.call<{ id: string; version: number }>('POST', 'sales/receipts', 'AR', {
      salesOrderId: order.id, docDate: '2026-09-29', kind: 'BALANCE', method: 'TRANSFER', amount: order.totals.total, payerRef: 'IBG 1', proofIds: [proof],
    });
    expect(r.status).toBe(201);
    expect(await docNos('payment=unpaid')).toContain(order.docNo);
    expect((await api.call('POST', `sales/receipts/${r.body.id}/verify`, 'ADM', { version: r.body.version, reference: 'CDM 1' })).status).toBe(201);

    expect(await docNos('payment=paid')).toContain(order.docNo);
    expect(await docNos('payment=notPaid')).not.toContain(order.docNo);
    expect(await docNos('install=donePaymentPending')).not.toContain(order.docNo);
    const after = await api.get<Month>('sales/dashboard/month', 'AR');
    expect(after.paid.count).toBe(before.paid.count + 1);
    expect(after.target.paidPct).toBe(pct(after.paid.total, '20000'));
  });
});
