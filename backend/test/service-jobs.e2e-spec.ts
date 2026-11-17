// The Service module runs only where it is turned on. Set before the app is loaded, as wms.e2e-spec.ts does for its WMS.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface JobRow { id: string; docNo: string; jobType: string; typeLabel: string; customerName: string; salesOrderNo: string | null; whenText: string; stage: string; stageLabel: string }
interface Job extends JobRow {
  version: number;
  siteAddress: string | null;
  contactName: string | null;
  preferredDate: string | null;
  afterStock: boolean;
  source: string;
  items: { itemCode: string; itemName: string; qty: string; uomCode: string }[];
  activity: { action: string; message: string; comment: string | null }[];
  allowedActions: string[];
  cancelReason: string | null;
}

/**
 * The Service module, part 1 (phase 5, F3): its launcher tile, jobs made from released sales orders with installation
 * (Sales F1 part 5), jobs the office adds by hand, and cancelling one not booked yet. In the demo TB-DIN-06 has 4 at
 * HQ-MAIN and CH-DIN-01 none.
 */
describe('Service jobs (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
    // Sales asks for installation on the order (S34).
    const flow = await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true });
    expect(flow.status).toBe(200);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const releaseOrder = async (body: Record<string, unknown>) => {
    const o = await api.call<{ id: string; docNo: string; version: number }>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', ...body });
    expect(o.status).toBe(201);
    const r = await api.call<{ status: string }>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    expect(r.body.status).toBe('RELEASED');
    return o.body;
  };
  const jobFor = (soNo: string) => api.until(`the job for ${soNo}`, async () => (await api.get<{ items: JobRow[] }>(`service/jobs?q=${soNo}`)).items.find((j) => j.salesOrderNo === soNo));

  it('shows its tile on the launcher, and its permissions in the role editor', async () => {
    const tiles = await api.get<{ items: { code: string; name: string; state: string; route: string | null }[] }>('me/modules');
    expect(tiles.items.find((t) => t.code === 'service')).toEqual({ code: 'service', name: 'Service', tag: 'Installation · jobs', state: 'OPEN', route: '/service' });
    // A sales agent holds no Service permission yet: the tile reads No access.
    const agent = await api.get<{ items: { code: string; state: string }[] }>('me/modules', 'AR');
    expect(agent.items.find((t) => t.code === 'service')?.state).toBe('NO_ACCESS');
    expect((await api.call('GET', 'service/jobs', 'AR')).status).toBe(403);
  });

  it('makes an installation job, Not booked, from an order released with installation', async () => {
    const so = await releaseOrder({ lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installDate: '2026-10-01', contactName: 'Mr. Daniel Wong' });
    const row = await jobFor(so.docNo);
    expect(row).toMatchObject({ docNo: 'JB-0001', jobType: 'INSTALLATION', typeLabel: 'Installation', customerName: 'Villa Damai Resort', whenText: 'Asks for Thu, 1 Oct', stage: 'NOT_BOOKED', stageLabel: 'Not booked' });
    const job = await api.get<Job>(`service/jobs/${row.id}`);
    expect(job).toMatchObject({ source: 'SALES_ORDER', preferredDate: '2026-10-01', afterStock: false, contactName: 'Mr. Daniel Wong', allowedActions: ['edit', 'cancel'] });
    expect(job.siteAddress).toContain('Villa Damai Resort');
    expect(job.items).toEqual([{ lineNo: 1, itemCode: 'TB-DIN-06', itemName: expect.any(String), qty: '1.0000', uomCode: 'PCS', serialNo: null }]);
    expect(job.activity[0]).toMatchObject({ action: 'created', message: `Created from ${so.docNo}` });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'service.job.created', aggregateId: row.id } });
    expect(event.payload).toMatchObject({ jobNo: 'JB-0001', jobType: 'INSTALLATION', salesOrderNo: so.docNo, preferredDate: '2026-10-01' });
  });

  it('waits for stock when the order was released with items short', async () => {
    const so = await releaseOrder({ lines: [{ itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }] });
    expect(await jobFor(so.docNo)).toMatchObject({ whenText: 'After stock arrives', stage: 'NOT_BOOKED' });
  });

  it('makes no job for delivery only or collect', async () => {
    const so = await releaseOrder({ lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installOption: 'COLLECT' });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: so.id } });
    await api.until('the release event handled by Service', async () => (await api.prisma.sysEventHandled.count({ where: { eventId: event.id, handler: 'service.job-from-order' } })) > 0);
    expect((await api.get<{ items: JobRow[] }>(`service/jobs?q=${so.docNo}`)).items).toEqual([]);
  });

  it('lets the office add a service job by hand, from the customer’s details', async () => {
    const bad = await api.call('POST', 'service/jobs', 'ADM', { jobType: 'SERVICE', customerCode: 'C-0045', preferredDate: '2026-09-01' });
    expect(bad).toMatchObject({ status: 400, body: { errors: [{ field: 'preferredDate', message: 'The preferred date cannot be in the past.' }] } });
    const r = await api.call<Job>('POST', 'service/jobs', 'ADM', { jobType: 'SERVICE', customerCode: 'C-0045', preferredDate: '2026-10-05', note: 'Change the filter cartridge.' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ jobType: 'SERVICE', source: 'MANUAL', salesOrderNo: null, whenText: 'Asks for Mon, 5 Oct', stage: 'NOT_BOOKED' });
    expect(r.body.siteAddress).toBeTruthy();
    expect(r.body.activity[0]!.message).toBe('Added by Admin');
  });

  it('cancels a job not booked yet, with the reason, and then keeps it as it was', async () => {
    const list = await api.get<{ items: JobRow[]; statusCounts: Record<string, number> }>('service/jobs');
    expect(list.statusCounts).toMatchObject({ all: 3, notBooked: 3, cancelled: 0 });
    const job = await api.get<Job>(`service/jobs/${list.items.find((j) => j.jobType === 'SERVICE')!.id}`);
    const r = await api.call<Job>('POST', `service/jobs/${job.id}/cancel`, 'ADM', { version: job.version, reason: 'Customer moved the visit to next month' });
    expect(r.body).toMatchObject({ stage: 'CANCELLED', cancelReason: 'Customer moved the visit to next month', allowedActions: [] });
    expect((await api.call('PATCH', `service/jobs/${job.id}`, 'ADM', { version: r.body.version, note: 'x' })).status).toBe(409);
    const home = await api.get<{ notBooked: { count: number }; waiting: JobRow[] }>('service/home');
    expect(home.notBooked.count).toBe(2);
    expect(home.waiting.map((w) => w.whenText)).toEqual(['Asks for Thu, 1 Oct', 'After stock arrives']);
  });
});
