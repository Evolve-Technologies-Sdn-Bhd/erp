// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Group { id: string; code: string; name: string; slotMinutes: number; firstStart: number; lastEnd: number; jobTypes: string[]; siteTypes: string[]; sitesText: string; defaultFor: string[]; isActive: boolean; version: number }
interface Settings { people: { id: string; name: string }[]; slotGroups: Group[] }
interface Job {
  id: string; docNo: string; stage: string; version: number; siteType: string | null; salesOrderNo: string | null; phone: string | null;
  siteAddress: string | null; postcode: string | null; state: string | null; missingForBooking: string[]; missingText: string | null;
}
interface Board { slotGroups: Group[]; notBooked: { docNo: string; missingForBooking: string[]; missingText: string | null }[] }
interface Order { id: string; docNo: string; version: number; deliveryPostcode: string | null; deliveryState: string | null }

/**
 * Job categories by site type, and the install address's postcode and state (phase 5): a company's Sales Admin asked
 * for categories with their own lengths, some never at a landed house, and for the name, contact number, install
 * address, postcode and state to be there before booking, as a warning, not a block. Today is Tue 29 Sep 2026.
 */
describe('Service: job categories by site type, and what the office needs before booking (end to end)', () => {
  let api: Api;
  let hafiz = '';

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const settings = () => api.get<Settings>('service/settings');
  const job = (id: string) => api.get<Job>(`service/jobs/${id}`);
  const addJob = async (siteType: string | null) => {
    const r = await api.call<Job>('POST', 'service/jobs', 'ADM', { jobType: 'INSTALLATION', customerCode: 'C-0045', preferredDate: '2026-10-01', siteType });
    expect(r.status).toBe(201);
    return r.body;
  };
  const book = async (id: string, slotGroupCode: string, start: number, date = '2026-10-01') => {
    const latest = await job(id);
    return api.call<Job & { message?: string }>('POST', `service/jobs/${id}/book`, 'ADM', { version: latest.version, personId: hafiz, date, slotGroupCode, start });
  };
  const flow = (askInstallation: boolean) =>
    api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation });
  const newOrder = (body: Record<string, unknown>) =>
    api.call<Order & { errors?: { field: string; message: string }[] }>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installDate: '2026-10-01', ...body });

  it('starts every slot group for every site, and lets the office keep a category to some sites', async () => {
    const before = await settings();
    expect(before.slotGroups.map((g) => [g.code, g.sitesText])).toEqual([['STANDARD', 'any site'], ['EARLY', 'any site'], ['SHORT', 'any site'], ['LONG', 'any site']]);

    const body = { name: 'Hacking / ceiling', slotMinutes: 240, firstStart: 600, lastEnd: 1080, jobTypes: ['INSTALLATION'] };
    expect(await api.call('POST', 'service/settings/slot-groups', 'ADM', { ...body, siteTypes: [] })).toMatchObject({
      status: 400, body: { errors: [{ field: 'siteTypes', message: 'Pick the sites this slot group is for.' }] },
    });
    const r = await api.call<Settings>('POST', 'service/settings/slot-groups', 'ADM', { ...body, siteTypes: ['COMMERCIAL', 'CONDO'] });
    expect(r.status).toBe(201);
    expect(r.body.slotGroups.find((g) => g.name === 'Hacking / ceiling')).toMatchObject({ code: 'HACKING-CEILING', siteTypes: ['CONDO', 'COMMERCIAL'], sitesText: 'Condo / apartment, Shop / office' });
    const log = await api.prisma.sysActivity.findFirstOrThrow({ where: { docNo: 'Hacking / ceiling', action: 'created' } });
    expect(log.message).toBe('Slot group Hacking / ceiling added: 4 h slots, 10 AM – 6 PM, for Installation, at Condo / apartment, Shop / office');

    // A save that leaves the sites out keeps them.
    const g = r.body.slotGroups.find((x) => x.code === 'HACKING-CEILING')!;
    const kept = await api.call<Settings>('PATCH', `service/settings/slot-groups/${g.id}`, 'ADM', { ...body, version: g.version });
    expect(kept.body.slotGroups.find((x) => x.code === 'HACKING-CEILING')!.siteTypes).toEqual(['CONDO', 'COMMERCIAL']);
    expect((await api.get<Board>('service/board?date=2026-10-01')).slotGroups.find((x) => x.code === 'HACKING-CEILING')!.siteTypes).toEqual(['CONDO', 'COMMERCIAL']);
  });

  it('books a job only into a category for its site, and keeps a booked job’s site type to what its category allows', async () => {
    const p = await api.call<Settings>('POST', 'service/settings/people', 'ADM', { name: 'Hafiz Rahman', role: 'INSTALLER' });
    hafiz = p.body.people.find((x) => x.name === 'Hafiz Rahman')!.id;

    const landed = await addJob('LANDED');
    expect(await book(landed.id, 'HACKING-CEILING', 600)).toMatchObject({ status: 409, body: { message: 'The Hacking / ceiling slot group is not for landed house sites.' } });
    expect((await book(landed.id, 'STANDARD', 600)).status).toBe(201);

    const condo = await addJob('CONDO');
    const booked = await book(condo.id, 'HACKING-CEILING', 840);
    expect(booked.status).toBe(201);
    const latest = await job(condo.id);
    expect(await api.call('PATCH', `service/jobs/${condo.id}`, 'ADM', { version: latest.version, siteType: 'LANDED' })).toMatchObject({
      status: 409, body: { message: `${condo.docNo} is booked in the Hacking / ceiling slot group, which is not for landed house sites. Move the job to another slot group first.` },
    });
    // A job whose site type is not set yet may go into any category of its type.
    const unknown = await addJob(null);
    expect(await book(unknown.id, 'HACKING-CEILING', 840)).toMatchObject({ status: 409, body: { message: `Hafiz Rahman already has ${condo.docNo} at 2 PM – 6 PM that day.` } });
    expect((await book(unknown.id, 'HACKING-CEILING', 600, '2026-10-02')).status).toBe(201);
  });

  it('keeps the postcode and state on the order only while it asks for installation', async () => {
    const off = await newOrder({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    expect(off.status).toBe(201);
    expect(off.body).toMatchObject({ deliveryPostcode: null, deliveryState: null });

    expect((await flow(true)).status).toBe(200);
    expect(await newOrder({ deliveryPostcode: '4015', deliveryState: 'Atlantis' })).toMatchObject({
      status: 400, body: { errors: expect.arrayContaining([{ field: 'deliveryPostcode', message: 'A postcode is 5 digits.' }, { field: 'deliveryState', message: 'Pick the state from the list.' }]) },
    });
    const on = await newOrder({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    expect(on.body).toMatchObject({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    // Left out on a save, they stay; empty clears them.
    const saved = await api.call<Order>('PATCH', `sales/orders/${on.body.id}`, 'AR', { version: on.body.version, remarks: 'Call first' });
    expect(saved.body).toMatchObject({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    const cleared = await api.call<Order>('PATCH', `sales/orders/${on.body.id}`, 'AR', { version: saved.body.version, deliveryState: '' });
    expect(cleared.body).toMatchObject({ deliveryPostcode: '40150', deliveryState: null });
    await api.call('PATCH', `sales/orders/${on.body.id}`, 'AR', { version: cleared.body.version, deliveryState: 'Selangor' });
  });

  it('carries them to the installation job, and warns before booking about what is missing, without stopping it', async () => {
    const customer = await api.prisma.mdmCustomer.findFirstOrThrow({ where: { code: 'C-0102' } });
    const contact = customer.phone ? [] : ['contact number'];

    const release = async (body: Record<string, unknown>) => {
      const o = await newOrder(body);
      const r = await api.call<{ status: string }>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
      expect(r.body.status).toBe('RELEASED');
      const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: o.body.id } });
      const row = await api.until(`the job for ${o.body.docNo}`, async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${o.body.docNo}`)).items.find((j) => j.salesOrderNo === o.body.docNo));
      return { event, job: await job(row.id) };
    };

    const full = await release({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    expect(full.event.payload).toMatchObject({ deliveryPostcode: '40150', deliveryState: 'Selangor' });
    expect(full.job).toMatchObject({ postcode: '40150', state: 'Selangor', missingForBooking: contact });

    const bare = await release({});
    expect(bare.job).toMatchObject({ postcode: null, state: null, missingForBooking: [...contact, 'postcode', 'state'] });
    expect(bare.job.missingText).toBe(contact.length ? 'Missing before booking: contact number, postcode and state.' : 'Missing before booking: postcode and state.');
    expect((await api.get<Board>('service/board?date=2026-10-02')).notBooked.find((j) => j.docNo === bare.job.docNo)).toMatchObject({ missingForBooking: [...contact, 'postcode', 'state'] });

    // The office fills them in on the job; a wrong postcode or state is refused.
    expect(await api.call('PATCH', `service/jobs/${bare.job.id}`, 'ADM', { version: bare.job.version, postcode: '123' })).toMatchObject({
      status: 400, body: { errors: [{ field: 'postcode', message: 'A postcode is 5 digits.' }] },
    });
    const filled = await api.call<Job>('PATCH', `service/jobs/${bare.job.id}`, 'ADM', { version: bare.job.version, postcode: '50450', state: 'W.P. Kuala Lumpur', phone: '03-2161 0000' });
    expect(filled.body).toMatchObject({ postcode: '50450', state: 'W.P. Kuala Lumpur', missingForBooking: [], missingText: null });

    // Missing details only warn: a job lacking them is still booked.
    const lacking = await addJob(null);
    expect(lacking.missingForBooking).toEqual(expect.arrayContaining(['postcode', 'state']));
    const latest = await job(lacking.id);
    const r = await api.call<Job>('POST', `service/jobs/${lacking.id}/book`, 'ADM', { version: latest.version, personId: hafiz, date: '2026-10-02', slotGroupCode: 'STANDARD', start: 840 });
    expect(r.status).toBe(201);
    expect(r.body.missingForBooking).toEqual(expect.arrayContaining(['postcode', 'state']));
  });
});
