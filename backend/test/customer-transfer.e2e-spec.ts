import { reseed, startApi, type Api } from './e2e-helpers';

interface Match { code: string; name: string; agentName: string | null; mine: boolean; same: boolean; reasons: string[]; pendingMine: boolean }
interface Transfer { id: string; customerCode: string; status: string; toAgentCode: string; fromAgentName: string | null; version: number; allowedActions: string[] }

/**
 * Duplicate customers and taking one over (phase 5, the user's rules of 27 Nov 2026). Every customer is checked on the
 * phone, the name and the address, whoever's it is; the same one is never added again, and a salesperson asks to take
 * over another's customer. While the office decides they see it and key orders for it; the orders they made stay
 * theirs whatever the decision. In the demo C-0012 (+60 3-2280 1188) is Aina Rahman's (AR), and Faizal Omar (FO) is
 * another agent.
 */
describe('Duplicate customers and taking one over (end to end)', () => {
  let api: Api;
  let c0012 = '';
  let orderNo = '';
  const check = (user: string, body: object) => api.call<{ items: Match[] }>('POST', 'sales/customers/check', user, body);
  const add = (user: string, body: object) => api.call<{ code: string; message: string }>('POST', 'sales/customers', user, body);
  const ask = (user: string, customerCode: string) => api.call<Transfer & { code?: string; message?: string }>('POST', 'sales/customers/transfer-requests', user, { customerCode, reason: 'The customer called me for a second unit' });
  const seen = async (user: string) => (await api.call('GET', `core/customers/${c0012}`, user)).status;
  const pending = async () => (await api.get<{ items: Transfer[] }>('core/customer-transfers?status=pending')).items.find((t) => t.customerCode === 'C-0012')!;

  beforeAll(async () => {
    reseed();
    api = await startApi();
    await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: true });
    c0012 = (await api.get<{ items: { id: string; code: string }[] }>('core/customers?q=C-0012')).items.find((c) => c.code === 'C-0012')!.id;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('finds another agent’s customer by phone and says whose it is, without showing their details', async () => {
    const r = await check('FO', { name: 'Someone', phone: '03-2280 1188', address: 'Somewhere' });
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toMatchObject({ code: 'C-0012', agentName: 'Aina Rahman', mine: false, same: true, reasons: ['PHONE'] });
    expect(Object.keys(r.body.items[0]!)).not.toContain('phone');
    expect(await seen('FO')).toBe(404);
  });

  it('asks the office to make the customer theirs, tells the office and the agent who has it', async () => {
    const r = await ask('FO', 'C-0012');
    expect(r).toMatchObject({ status: 201, body: { customerCode: 'C-0012', status: 'PENDING', toAgentCode: 'FO', fromAgentName: 'Aina Rahman' } });
    expect((await ask('FO', 'C-0012')).body.id).toBe(r.body.id);
    expect(await ask('AR', 'C-0012')).toMatchObject({ status: 409, body: { code: 'ALREADY_YOURS' } });
    const told = await api.prisma.sysNotification.findMany({ where: { kind: 'core.customer.transfer_asked' } });
    expect(told.map((n) => n.userCode)).toEqual(expect.arrayContaining(['ADM', 'AR']));
  });

  it('lets the asking agent see the customer and key an order for it while the office decides', async () => {
    expect(await seen('FO')).toBe(200);
    const order = await api.call<{ docNo: string; status: string }>('POST', 'sales/orders', 'FO', { customerCode: 'C-0012', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    expect(order.status).toBe(201);
    orderNo = order.body.docNo;
    const list = async (user: string) => (await api.get<{ items: { docNo: string }[] }>(`sales/orders?q=${orderNo}`, user)).items.map((o) => o.docNo);
    expect(await list('FO')).toEqual([orderNo]);
    expect(await list('AR')).toEqual([orderNo]);
  });

  it('is decided by the office: a rejection needs a reason, and the agent keeps the orders they made', async () => {
    const t = await pending();
    expect(t.allowedActions).toEqual(['approve', 'reject']);
    expect((await api.call('POST', `core/customer-transfers/${t.id}/reject`, 'FO', { version: t.version, note: 'x' })).status).toBe(403);
    expect(await api.call('POST', `core/customer-transfers/${t.id}/reject`, 'ADM', { version: t.version })).toMatchObject({ status: 400 });
    expect(await api.call('POST', `core/customer-transfers/${t.id}/reject`, 'ADM', { version: t.version, note: 'Aina serves this resort' })).toMatchObject({ status: 201, body: { status: 'REJECTED' } });
    expect(await seen('FO')).toBe(404);
    expect((await api.get<{ items: { docNo: string }[] }>(`sales/orders?q=${orderNo}`, 'FO')).items.map((o) => o.docNo)).toEqual([orderNo]);
  });

  it('moves the customer to the agent when the office approves', async () => {
    await ask('FO', 'C-0012');
    const t = await pending();
    expect(await api.call('POST', `core/customer-transfers/${t.id}/approve`, 'ADM', { version: t.version })).toMatchObject({ status: 201, body: { status: 'APPROVED' } });
    expect(await seen('FO')).toBe(200);
    expect(await seen('AR')).toBe(404);
    const c = await api.get<{ defaultAgentCode: string; activity: { message: string }[] }>(`core/customers/${c0012}`);
    expect(c.defaultAgentCode).toBe('FO');
  });

  it('asks to confirm a customer with the same name or the same address only, and refuses the same name and address', async () => {
    const lim = { name: 'Lim Ah Seng', phone: '012-777 1234', address: 'No 5, Jalan Kenari 2, Taman Sri, 50000 Kuala Lumpur' };
    expect((await add('AR', lim)).status).toBe(201);
    expect(await add('FO', { ...lim, phone: '013-888 0000' })).toMatchObject({ status: 409, body: { code: 'SAME_CUSTOMER' } });
    const namesake = { name: 'Mr. Lim Ah Seng', phone: '013-888 0000', address: '8 Lorong Bunga, 10000 George Town' };
    expect(await add('FO', namesake)).toMatchObject({ status: 409, body: { code: 'POSSIBLE_DUPLICATE' } });
    expect((await add('FO', { ...namesake, notDuplicate: true })).status).toBe(201);
    const family = await check('FO', { name: 'Lim Mei Hua', phone: '016-111 2222', address: '5 Jln Kenari 2, Tmn Sri, 50000 Kuala Lumpur' });
    expect(family.body.items[0]).toMatchObject({ name: 'Lim Ah Seng', same: false, reasons: ['ADDRESS'], agentName: 'Aina Rahman' });
  });
});
