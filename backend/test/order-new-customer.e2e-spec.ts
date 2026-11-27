import { reseed, startApi, type Api } from './e2e-helpers';

interface Option { code: string; name: string; branchCode: string; contactName: string | null; deliveryAddress: string | null; creditTermDays: number; priceListCode: string; creditLimit: string | null; defaultAgentCode: string | null }
interface Flow { switches: Record<string, boolean>; saved: string[] }
interface Customer { id: string; code: string; version: number; toComplete: boolean; allowedActions: string[]; addedFromOrder: { by: string; at: string } | null; activity: { message: string }[] }

/**
 * A salesperson adds a household customer while keying an order (phase 5, F1). Off by default: the standard flow
 * keeps customers with the office. On, Sales asks and Core makes the customer: active at once, cash terms, no credit
 * limit, the cash customer's price list, and marked for the office to complete. A phone already on file is refused,
 * whoever's customer it is. In the demo Aina Rahman (AR) is an HQ agent, Faizal Omar (FO) another agent, Lim Mei Ying
 * (LMY) a buyer, and ADM the Master Data Admin.
 */
describe('Salespeople add new customers on the order (end to end)', () => {
  let api: Api;
  let added: Option;
  let customerId: string;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const household = { name: 'Tan Mei Ling', phone: '012-345 6789', address: '12 Jalan Mawar, 81200 Johor Bahru', idNumber: '900101-01-1234' };
  const add = (user: string, body: Record<string, unknown>) => api.call<Option & { code: string; message: string; errors?: { field: string }[] }>('POST', 'sales/customers', user, body);
  const flow = (agentsAddCustomers: boolean) =>
    api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers });

  it('is refused while the switch is off, and adds nothing', async () => {
    const before = await api.prisma.mdmCustomer.count();
    const r = await add('AR', household);
    expect(r).toMatchObject({ status: 409, body: { code: 'NEW_CUSTOMERS_OFF' } });
    expect(r.body.message).toContain('Operation Policies › Sales Flow');
    expect(await api.prisma.mdmCustomer.count()).toBe(before);
  });

  it('is turned on in Sales Flow by an admin, logged, and kept by a save that does not send it', async () => {
    const on = await flow(true);
    expect(on.body.switches.agentsAddCustomers).toBe(true);
    expect(on.body.saved).toEqual(['Salespeople add new customers on the order: Off → On']);
    const older = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false });
    expect(older.body).toMatchObject({ saved: [], switches: { agentsAddCustomers: true } });
  });

  it('needs the name, a phone and the address, and someone who keys orders', async () => {
    const r = await add('AR', { name: 'Tan', phone: '', address: '' });
    expect(r.status).toBe(400);
    expect(r.body.errors!.map((e) => e.field).sort()).toEqual(['address', 'phone']);
    expect(await add('AR', { ...household, phone: '12-34' })).toMatchObject({ status: 400, body: { errors: [{ field: 'phone', message: "Type the customer's phone number." }] } });
    expect((await add('LMY', household)).status).toBe(403);
  });

  it('makes an active cash customer for the agent, on the cash customer’s price list, marked to complete', async () => {
    const r = await add('AR', household);
    expect(r.status).toBe(201);
    added = r.body;
    expect(added).toMatchObject({
      name: 'Tan Mei Ling', branchCode: 'HQ', contactName: 'Tan Mei Ling', deliveryAddress: '12 Jalan Mawar, 81200 Johor Bahru',
      creditTermDays: 0, priceListCode: 'STD-2026', creditLimit: null, defaultAgentCode: 'AR',
    });
    expect(added.code).toMatch(/^C-\d{4}$/);

    const row = await api.prisma.mdmCustomer.findFirstOrThrow({ where: { code: added.code } });
    customerId = row.id;
    expect(row).toMatchObject({
      status: 'ACTIVE', toComplete: true, createdBy: 'AR', phone: '012-345 6789', billingAddress: '12 Jalan Mawar, 81200 Johor Bahru',
      idType: 'NRIC', idNumber: '900101-01-1234', taxMode: 'EXCLUSIVE', creditLimit: null, overdueLimit: null, isCash: false,
    });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'mdm.customer.created', aggregateId: row.id } });
    expect(event.payload).toMatchObject({ code: added.code, addedFrom: 'SALES_ORDER', enquiryNo: null });
  });

  it('lets the agent use it on an order at once, in their branch', async () => {
    const r = await api.call<{ status: string; branch: { code: string }; creditTermDays: number; customer: { code: string } }>('POST', 'sales/orders', 'AR', {
      customerCode: added.code,
      lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'DRAFT', branch: { code: 'HQ' }, creditTermDays: 0, customer: { code: added.code } });
  });

  it('refuses a phone already on file, typed any way, even another agent’s customer, and says whose it is', async () => {
    expect(await add('AR', { ...household, name: 'Mei Ling Tan', phone: '+60 12-345 6789' })).toMatchObject({
      status: 409,
      body: { code: 'PHONE_IN_USE', message: `Tan Mei Ling (${added.code}) is already your customer: same phone number and address. Pick them on the order instead.` },
    });
    // C-0012 (+60 3-2280 1188) is Aina's; Faizal cannot see it, and still cannot add it again: he is told it is Aina's.
    const theirs = await add('FO', { name: 'Someone', phone: '03-2280 1188', address: 'Somewhere' });
    expect(theirs).toMatchObject({ status: 409, body: { code: 'PHONE_IN_USE' } });
    expect(theirs.body.message).toContain('is already a customer of Aina Rahman: same phone number. Ask to take them over');
  });

  it('keeps the new customer within the agent scope: another agent does not see it', async () => {
    const search = (user: string) => api.get<{ items: Option[] }>(`sales/lookups/customers?q=${encodeURIComponent('Tan Mei')}`, user);
    expect((await search('AR')).items.map((c) => c.code)).toEqual([added.code]);
    expect((await search('FO')).items.map((c) => c.code)).toEqual([]);
    expect((await api.call('GET', `core/customers/${customerId}`, 'FO')).status).toBe(404);
  });

  it('shows the office what to complete: Core home, the filtered list and the customer', async () => {
    const home = await api.get<{ attention: { key: string; lead: string; text: string; to: string }[] }>('core/dashboard');
    expect(home.attention.find((l) => l.key === 'customer-to-complete')).toEqual({
      key: 'customer-to-complete',
      lead: '1 customer',
      text: 'was added by salespeople from an order. Check it, fill in what is missing and mark it complete.',
      to: '/core/customers?toComplete=1',
    });
    const list = await api.get<{ items: { code: string; toComplete: boolean }[] }>('core/customers?toComplete=1');
    expect(list.items).toEqual([expect.objectContaining({ code: added.code, toComplete: true })]);

    const c = await api.get<Customer>(`core/customers/${customerId}`);
    expect(c.toComplete).toBe(true);
    expect(c.addedFromOrder).toEqual({ by: 'Aina Rahman', at: expect.any(String) });
    expect(c.allowedActions).toContain('complete');
    expect(c.activity.map((a) => a.message)).toContain(`Customer ${added.code} added by Aina Rahman from a sales order, to be completed by the office`);
    // The agent sees it, but cannot change master data or mark it complete.
    const asAgent = await api.get<Customer>(`core/customers/${customerId}`, 'AR');
    expect(asAgent.allowedActions).toEqual([]);
    expect((await api.call('POST', `core/customers/${customerId}/complete`, 'AR', { version: c.version })).status).toBe(403);
  });

  it('is marked complete by the office, logged, and leaves the lists', async () => {
    const c = await api.get<Customer>(`core/customers/${customerId}`);
    const done = await api.call<Customer>('POST', `core/customers/${customerId}/complete`, 'ADM', { version: c.version });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ toComplete: false, addedFromOrder: null });
    expect(done.body.allowedActions).not.toContain('complete');
    expect(done.body.activity.map((a) => a.message)).toContain(`Customer ${added.code} checked and marked complete`);
    expect(await api.call('POST', `core/customers/${customerId}/complete`, 'ADM', { version: done.body.version })).toMatchObject({ status: 409, body: { code: 'ALREADY_COMPLETE' } });

    const home = await api.get<{ attention: { key: string }[] }>('core/dashboard');
    expect(home.attention.some((l) => l.key === 'customer-to-complete')).toBe(false);
    expect((await api.get<{ items: unknown[] }>('core/customers?toComplete=1')).items).toEqual([]);
  });

  it('is refused again once the switch is turned off', async () => {
    expect((await flow(false)).body.saved).toEqual(['Salespeople add new customers on the order: On → Off']);
    expect((await add('AR', { ...household, phone: '019-888 7777' })).status).toBe(409);
  });
});
