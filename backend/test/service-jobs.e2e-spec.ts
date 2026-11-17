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
    expect(job).toMatchObject({ source: 'SALES_ORDER', preferredDate: '2026-10-01', afterStock: false, contactName: 'Mr. Daniel Wong', allowedActions: ['edit', 'cancel', 'book'] });
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

  // ── Part 2: people, slot groups and the Planning Board ──────────────────────

  interface Settings { people: { id: string; name: string; role: string; version: number }[]; slotGroups: { code: string; name: string; slotsText: string }[] }
  interface Board { notBooked: { id: string; docNo: string; asksForThisDay: boolean }[]; people: { name: string; jobTypes: string[]; jobs: { docNo: string; slotText: string }[] }[] }
  const people: Record<string, string> = {};
  const jobId = async (whenText: string) => (await api.get<{ items: JobRow[] }>('service/jobs?status=notBooked')).items.find((j) => j.whenText === whenText)!.id;
  const book = async (id: string, personId: string, date: string, slotGroupCode: string, start: number) => {
    const job = await api.get<Job>(`service/jobs/${id}`);
    return api.call<Job & { booking: { text: string } | null; code?: string; message?: string }>('POST', `service/jobs/${id}/book`, 'ADM', { version: job.version, personId, date, slotGroupCode, start });
  };

  it('starts with the four slot groups of the design, and people the office adds', async () => {
    const s = await api.get<Settings>('service/settings');
    expect(s.slotGroups.map((g) => `${g.name}: ${g.slotsText}`)).toEqual([
      'Standard: 10 AM – 12 PM · 12 PM – 2 PM · 2 PM – 4 PM · 4 PM – 6 PM',
      'Early: 9 AM – 11 AM · 11 AM – 1 PM · 1 PM – 3 PM · 3 PM – 5 PM',
      'Short: 8 slots, 9 AM – 5 PM',
      'Long: 10 AM – 2 PM · 2 PM – 6 PM',
    ]);
    for (const [name, role] of [['Hafiz Rahman', 'INSTALLER'], ['Lee Jun Wei', 'INSTALLER'], ['Suresh Nair', 'TECHNICIAN']]) {
      const r = await api.call<Settings>('POST', 'service/settings/people', 'ADM', { name, role, phone: '012-345 6789' });
      expect(r.status).toBe(201);
      people[name!] = r.body.people.find((p) => p.name === name)!.id;
    }
    expect((await api.call('POST', 'service/settings/people', 'AR', { name: 'X', role: 'INSTALLER' })).status).toBe(403);
  });

  it('books a job in a free slot of someone who takes it, and never lets two jobs overlap', async () => {
    const board = await api.get<Board>('service/board?date=2026-10-01');
    expect(board.notBooked.find((j) => j.asksForThisDay)?.docNo).toBe('JB-0001');
    expect(board.people.map((p) => `${p.name}: ${p.jobTypes.join(',')}`)).toEqual(['Hafiz Rahman: INSTALLATION', 'Lee Jun Wei: INSTALLATION', 'Suresh Nair: SERVICE,REPAIR']);

    const first = await jobId('Asks for Thu, 1 Oct');
    expect(await book(first, people['Suresh Nair']!, '2026-10-01', 'STANDARD', 720)).toMatchObject({ status: 409, body: { message: 'Suresh Nair is Technician and does not take installation jobs.' } });
    const booked = await book(first, people['Hafiz Rahman']!, '2026-10-01', 'STANDARD', 720);
    expect(booked.body).toMatchObject({ stage: 'BOOKED', personName: 'Hafiz Rahman', whenText: 'Thu, 1 Oct · 12 PM – 2 PM', allowedActions: ['edit', 'cancel', 'book', 'unbook', 'record'] });
    expect(booked.body.activity[0]!.message).toBe('Booked for Hafiz Rahman, Thu, 1 Oct, 12 PM – 2 PM');

    const second = await jobId('After stock arrives');
    expect(await book(second, people['Hafiz Rahman']!, '2026-10-01', 'LONG', 600)).toMatchObject({ status: 409, body: { message: 'Hafiz Rahman already has JB-0001 at 12 PM – 2 PM that day.' } });
    expect(await book(second, people['Hafiz Rahman']!, '2026-10-01', 'STANDARD', 660)).toMatchObject({ status: 409, body: { message: '11 AM is not a start time of the Standard slot group.' } });
    expect((await book(second, people['Hafiz Rahman']!, '2026-10-01', 'STANDARD', 600)).body.stage).toBe('BOOKED');

    const after = await api.get<Board>('service/board?date=2026-10-01');
    expect(after.people[0]!.jobs.map((j) => `${j.docNo} ${j.slotText}`)).toEqual(['JB-0002 10 AM – 12 PM', 'JB-0001 12 PM – 2 PM']);
    expect(after.notBooked).toEqual([]);
  });

  it('moves a booked job, takes it off the board, and frees the slot when it is cancelled', async () => {
    const list = await api.get<{ items: JobRow[] }>('service/jobs?status=booked');
    const second = list.items.find((j) => j.docNo === 'JB-0002')!;
    const moved = await book(second.id, people['Lee Jun Wei']!, '2026-10-01', 'STANDARD', 600);
    expect(moved.body.activity[0]!.message).toBe('Moved to Lee Jun Wei, Thu, 1 Oct, 10 AM – 12 PM');
    const off = await api.call<Job>('POST', `service/jobs/${second.id}/unbook`, 'ADM', { version: moved.body.version });
    expect(off.body).toMatchObject({ stage: 'NOT_BOOKED', personName: null, whenText: 'After stock arrives' });
    const again = await book(second.id, people['Lee Jun Wei']!, '2026-10-01', 'STANDARD', 600);
    const cancelled = await api.call<Job>('POST', `service/jobs/${second.id}/cancel`, 'ADM', { version: again.body.version, reason: 'Customer cancelled the order' });
    expect(cancelled.body).toMatchObject({ stage: 'CANCELLED', personName: null });
    expect((await api.get<Board>('service/board?date=2026-10-01')).people[1]!.jobs).toEqual([]);
  });

  // ── Part 3: what the installer records at the visit ─────────────────────────

  interface Visit { result: string; resultLabel: string; paidLabel: string | null; paidMethod: string | null; recordedBy: string | null }
  type Recorded = Job & { visit: Visit | null; postponed: { reason: string; count: number } | null; photos: { fileName: string }[]; followUpJob: { id: string; docNo: string } | null; followUpOf: { docNo: string } | null; note: string | null };
  /** Uploads a small PNG to the job, as the job page does before recording the visit. */
  const photo = async (jobId: string) => {
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    form.append('file', new Blob([png], { type: 'image/png' }), 'after.png');
    form.append('kind', 'JOB_PHOTO');
    form.append('entityType', 'SVC_JOB');
    form.append('entityId', jobId);
    const res = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': 'ADM' }, body: form });
    expect(res.status).toBe(201);
  };
  const bookedVisit = async (start: number) => {
    const made = await api.call<Job>('POST', 'service/jobs', 'ADM', { jobType: 'SERVICE', customerCode: 'C-0045', preferredDate: '2026-10-02' });
    return (await book(made.body.id, people['Suresh Nair']!, '2026-10-02', 'SHORT', start)).body;
  };
  const record = async (job: Job, body: Record<string, unknown>) => {
    const latest = await api.get<Job>(`service/jobs/${job.id}`);
    return api.call<Recorded>('POST', `service/jobs/${job.id}/record`, 'ADM', { version: latest.version, ...body });
  };

  it('records a complete visit only with a photo and whether the customer paid, then closes it', async () => {
    const job = await bookedVisit(540);
    expect(job.allowedActions).toContain('record');
    const missing = await record(job, { result: 'COMPLETE' });
    expect(missing).toMatchObject({ status: 400, body: { errors: [{ field: 'photos', message: 'Add at least one photo of the work.' }, { field: 'paidStatus', message: 'Say whether the customer paid on site.' }] } });

    await photo(job.id);
    const done = await record(job, { result: 'COMPLETE', arrivedAt: '09:05', finishedAt: '09:50', paidStatus: 'PAID', paidMethod: 'TRANSFER', note: 'Cartridges changed' });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ stage: 'DONE', allowedActions: ['close'], visit: { result: 'COMPLETE', paidLabel: 'Paid on site', paidMethod: 'bank transfer', recordedBy: 'Admin for Suresh Nair' } });
    expect(done.body.photos.map((p) => p.fileName)).toEqual(['after.png']);
    expect(done.body.activity[0]!.message).toBe('Complete · paid on site by bank transfer · 1 photo, recorded by Admin for Suresh Nair');
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'service.job.done', aggregateId: job.id } });
    expect(event.payload).toMatchObject({ result: 'COMPLETE', paidStatus: 'PAID', personName: 'Suresh Nair', date: '2026-10-02' });
    expect((await api.get<{ items: (JobRow & { paidLabel: string | null })[] }>(`service/jobs?q=${job.docNo}`)).items[0]!.paidLabel).toBe('Paid');

    const closed = await api.call<Job>('POST', `service/jobs/${job.id}/close`, 'ADM', { version: done.body.version });
    expect(closed.body).toMatchObject({ stage: 'CLOSED', allowedActions: [] });
    expect((await api.call('POST', `service/jobs/${job.id}/unbook`, 'ADM', { version: closed.body.version })).status).toBe(409);
  });

  it('puts a postponed visit back on the waiting list, with the reason and the new date', async () => {
    const job = await bookedVisit(600);
    const r = await record(job, { result: 'POSTPONED', reason: 'Customer not at home', nextDate: '2026-10-06' });
    expect(r.body).toMatchObject({ stage: 'NOT_BOOKED', personName: null, whenText: 'Asks for Tue, 6 Oct', postponed: { reason: 'Customer not at home', count: 1 }, visit: null });
    expect(r.body.activity[0]).toMatchObject({ message: 'Postponed, recorded by Admin for Suresh Nair; waiting to be booked again, the customer asks for Tue, 6 Oct', comment: 'Customer not at home' });
  });

  it('gives a partly done visit one follow-up job with what is left to do', async () => {
    const job = await bookedVisit(660);
    await photo(job.id);
    const r = await record(job, { result: 'PARTIAL', reason: 'Wall bracket missing; bring one', paidStatus: 'NOT_PAID', notPaidReason: 'Pays when finished' });
    expect(r.body).toMatchObject({ stage: 'DONE', allowedActions: ['close', 'followUp'], visit: { resultLabel: 'Partly done', paidLabel: 'Not paid' } });
    const next = await api.call<Recorded>('POST', `service/jobs/${job.id}/follow-up`, 'ADM');
    expect(next.status).toBe(201);
    expect(next.body).toMatchObject({ stage: 'NOT_BOOKED', jobType: 'SERVICE', customerName: r.body.customerName, followUpOf: { docNo: job.docNo }, note: `Follow-up of ${job.docNo}: Wall bracket missing; bring one` });
    expect((await api.get<Recorded>(`service/jobs/${job.id}`)).followUpJob?.docNo).toBe(next.body.docNo);
    expect(await api.call('POST', `service/jobs/${job.id}/follow-up`, 'ADM')).toMatchObject({ status: 409, body: { message: `${job.docNo} already has its follow-up job, ${next.body.docNo}.` } });
  });
});
