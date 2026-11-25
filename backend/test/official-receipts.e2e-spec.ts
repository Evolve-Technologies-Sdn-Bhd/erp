// The job's payment comes from Service's listener, which runs only with the module on (set before the app loads).
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Receipt {
  id: string; docNo: string; status: string; statusLabel: string; amount: string; version: number; allowedActions: string[];
  proofs: { fileName: string }[]; returnReason: string | null; verifiedRef: string | null;
  order: { docNo: string; payment: string; verified: string; waiting: string; open: string } | null;
  activity: { action: string; message: string; comment: string | null }[];
}
interface Payments { status: string; label: string; total: string; verified: string; waiting: string; open: string; canRecord: boolean; receipts: { docNo: string; status: string }[] }
interface Order { id: string; docNo: string; version: number; status: string; totals: { total: string }; payments: Payments | null; activity: { message: string }[] }

/**
 * Official receipts (phase 5; the client's Account answers of 18 Nov 2026). With the Sales Flow switch on, a salesperson
 * records a payment on a released order with its proof; Account verifies it against the bank, or sends it back; only
 * verified receipts count as paid, and the order's installation job hears where the payment stands. Off by default.
 * Today is Tue 29 Sep 2026 (DEV_TODAY).
 */
describe('Official receipts (end to end)', () => {
  let api: Api;
  let order: Order;
  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true };

  beforeAll(async () => {
    reseed();
    api = await startApi();
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', FLOW)).status).toBe(200);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  /** Uploads the slip the way the receipt dialog does, and gives its id. */
  const slip = async (user = 'AR', name = 'slip.png', type = 'image/png', bytes: Uint8Array = Uint8Array.from(Buffer.from(PNG, 'base64'))) => {
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    form.append('kind', 'PAYMENT_PROOF');
    const res = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': user }, body: form });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const record = (user: string, body: Record<string, unknown>) =>
    api.call<Receipt>('POST', 'sales/receipts', user, { salesOrderId: order.id, docDate: '2026-09-28', kind: 'DEPOSIT', method: 'TRANSFER', ...body });
  const receipt = (id: string, user = 'AR') => api.get<Receipt>(`sales/receipts/${id}`, user);
  const payments = async () => (await api.get<Order>(`sales/orders/${order.id}`, 'AR')).payments!;
  const jobPayment = (status: string) => api.until(`the job to be ${status}`, async () => {
    const list = await api.get<{ items: { id: string; salesOrderNo: string | null }[] }>(`service/jobs?q=${order.docNo}`);
    const job = list.items.find((j) => j.salesOrderNo === order.docNo);
    if (!job) return null;
    const d = await api.get<{ orderPayment: { status: string; label: string; paid: string; total: string } | null; activity: { message: string }[] }>(`service/jobs/${job.id}`);
    return d.orderPayment?.status === status ? d : null;
  });

  it('is off by default: no Payments card, and a receipt is refused', async () => {
    const items = await api.get<{ items: { code: string; listPrice: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=CH-DIN-01', 'AR');
    const price = items.items.find((i) => i.code === 'CH-DIN-01')!.listPrice!;
    const made = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', lines: [{ itemCode: 'CH-DIN-01', qty: '10', unitPrice: price }] });
    expect(made.status).toBe(201);
    const released = await api.call<Order>('POST', `sales/orders/${made.body.id}/release`, 'AR', { version: made.body.version });
    expect(released.body.status).toBe('RELEASED');
    order = released.body;
    expect(order.payments).toBeNull();
    expect(await record('AR', { amount: '500.00', proofIds: [await slip()] })).toMatchObject({
      status: 409, body: { code: 'RECEIPTS_OFF', message: 'Official receipts are turned off for this company. Turn on "Salespeople record payments as official receipts" in Operation Policies › Sales Flow.' },
    });
  });

  it('turns on, logged, and the order shows what it still owes', async () => {
    const on = await api.call<{ saved: string[] }>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, useReceipts: true });
    expect(on.body.saved).toEqual(['Salespeople record payments as official receipts: Off → On']);
    expect(await payments()).toEqual({ status: 'UNPAID', label: 'Unpaid', total: order.totals.total, verified: '0.00', waiting: '0.00', open: order.totals.total, receipts: [], canRecord: true, released: true });
  });

  let deposit: Receipt;

  it('records a deposit with its proof, numbered OR-2609-0001, waiting for Account', async () => {
    expect(await record('AR', { amount: '0', docDate: '2026-09-30', proofIds: [] })).toMatchObject({
      status: 400,
      body: { errors: [
        { field: 'docDate', message: 'The day the money was received cannot be in the future.' },
        { field: 'amount', message: 'Type the amount received, more than 0, like 500.00.' },
        { field: 'proofIds', message: 'Add the payment proof: a photo or PDF of the slip.' },
      ] },
    });
    expect((await record('AR', { amount: '99999.00', proofIds: [await slip()] })).body).toMatchObject({ errors: [{ field: 'amount', message: `More than the order still owes (RM ${Number(order.totals.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}).` }] });

    const r = await record('AR', { amount: '500.00', payerRef: 'IBG 8812', proofIds: [await slip()] });
    expect(r.status).toBe(201);
    deposit = r.body;
    expect(deposit).toMatchObject({ docNo: 'OR-2609-0001', status: 'WAITING', statusLabel: 'Waiting to verify', amount: '500.00', allowedActions: ['edit', 'cancel'] });
    expect(deposit.proofs).toHaveLength(1);
    expect(deposit.activity[0]!.message).toBe('Recorded by Aina Rahman: Deposit RM 500.00 by bank transfer, received 28 Sep · waiting for Account');
    const p = await payments();
    expect(p).toMatchObject({ status: 'UNPAID', waiting: '500.00', verified: '0.00' });
    expect(p.receipts.map((x) => [x.docNo, x.status])).toEqual([['OR-2609-0001', 'WAITING']]);
    // Another branch's agent cannot reach it.
    expect((await api.call('GET', `sales/receipts/${deposit.id}`, 'LWJ')).status).toBe(404);
  });

  it('never lets the person who recorded a receipt verify it; Account sends one back to fix', async () => {
    const own = await record('ADM', { kind: 'BALANCE', method: 'CASH', amount: '100.00', proofIds: [await slip('ADM')] });
    expect(await api.call('POST', `sales/receipts/${own.body.id}/verify`, 'ADM', { version: own.body.version, reference: 'CDM 1' })).toMatchObject({
      status: 409, body: { code: 'OWN_RECEIPT', message: 'You recorded OR-2609-0002 yourself, so someone else in Account verifies it.' },
    });
    expect((await api.call('POST', `sales/receipts/${own.body.id}/verify`, 'AR', { version: own.body.version, reference: 'CDM 1' })).status).toBe(403);
    const back = await api.call<Receipt>('POST', `sales/receipts/${own.body.id}/send-back`, 'RI', { version: own.body.version, reason: 'The slip shows RM 150.00' });
    expect(back.body).toMatchObject({ status: 'RETURNED', statusLabel: 'Sent back', returnReason: 'The slip shows RM 150.00', allowedActions: [] });
    expect((await receipt(own.body.id)).allowedActions).toEqual(['edit', 'cancel']);
    const fixed = await api.call<Receipt>('PATCH', `sales/receipts/${own.body.id}`, 'AR', {
      version: back.body.version, docDate: '2026-09-28', kind: 'BALANCE', method: 'CASH', amount: '150.00', proofIds: [],
    });
    expect(fixed.body).toMatchObject({ status: 'WAITING', amount: '150.00', returnReason: null });
    expect(fixed.body.activity[0]!.message).toBe('Corrected and sent again by Aina Rahman: Balance RM 150.00 by cash, received 28 Sep');
  });

  it('verifies against the bank: the order becomes Deposit paid, then Fully paid, and its job hears it', async () => {
    const latest = await receipt(deposit.id, 'RI');
    expect(latest.allowedActions).toEqual(['verify', 'sendBack']);
    expect(await api.call('POST', `sales/receipts/${deposit.id}/verify`, 'RI', { version: latest.version, reference: ' ' })).toMatchObject({
      status: 400, body: { errors: [{ field: 'reference', message: 'Type the bank transaction or card settlement reference it matches.' }] },
    });
    const ok = await api.call<Receipt>('POST', `sales/receipts/${deposit.id}/verify`, 'RI', { version: latest.version, reference: 'MBB 28/09 TRX 77812' });
    expect(ok.body).toMatchObject({ status: 'VERIFIED', verifiedRef: 'MBB 28/09 TRX 77812', allowedActions: [], order: { payment: 'DEPOSIT', verified: '500.00' } });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.receipt.verified', aggregateId: deposit.id } });
    expect(event.payload).toMatchObject({ orNo: 'OR-2609-0001', amount: '500.00', kind: 'DEPOSIT', salesOrderNo: order.docNo, order: { total: order.totals.total, verified: '500.00', status: 'DEPOSIT' } });
    expect((await payments())).toMatchObject({ status: 'DEPOSIT', label: 'Deposit paid', verified: '500.00', waiting: '150.00' });
    const job = await jobPayment('DEPOSIT');
    expect(job.orderPayment).toEqual({ status: 'DEPOSIT', label: 'Deposit paid', paid: '500.00', total: order.totals.total });

    // The corrected one, then the rest of the balance.
    const second = (await api.get<{ items: Receipt[] }>('sales/receipts?status=waiting', 'RI')).items.find((x) => x.docNo === 'OR-2609-0002')!;
    expect((await api.call('POST', `sales/receipts/${second.id}/verify`, 'RI', { version: (await receipt(second.id, 'RI')).version, reference: 'CDM 28/09' })).status).toBe(201);
    const rest = (await payments()).open;
    const last = await record('AR', { kind: 'BALANCE', method: 'CARD_EPP', amount: rest, docDate: '2026-09-29', proofIds: [await slip()] });
    expect(last.body.docNo).toBe('OR-2609-0003');
    expect((await api.call('POST', `sales/receipts/${last.body.id}/verify`, 'RI', { version: last.body.version, reference: 'Settlement 29/09' })).status).toBe(201);
    expect(await payments()).toMatchObject({ status: 'FULLY_PAID', label: 'Fully paid', verified: order.totals.total, open: '0.00', canRecord: false });
    const paid = await jobPayment('FULLY_PAID');
    expect(paid.activity[0]!.message).toBe(`${order.docNo} payment OR-2609-0003 verified: Fully paid, RM ${Number(order.totals.total).toFixed(2)} of RM ${Number(order.totals.total).toFixed(2)}`);
    expect((await record('AR', { amount: '1.00', proofIds: [await slip()] })).body).toMatchObject({ errors: [{ field: 'amount', message: 'More than the order still owes (RM 0.00).' }] });
  });

  it('keeps verified receipts as they are, and lists Account’s queue', async () => {
    const verified = await receipt(deposit.id);
    expect(await api.call('POST', `sales/receipts/${deposit.id}/cancel`, 'AR', { version: verified.version, reason: 'x' })).toMatchObject({ status: 409 });
    const list = await api.get<{ items: Receipt[]; statusCounts: Record<string, number>; waitingAmount: string }>('sales/receipts', 'RI');
    expect(list.statusCounts).toMatchObject({ all: 3, waiting: 0, verified: 3, returned: 0, cancelled: 0 });
    expect(list.waitingAmount).toBe('0.00');
    const orderAfter = await api.get<Order>(`sales/orders/${order.id}`, 'AR');
    expect(orderAfter.activity.some((a) => a.message.startsWith('OR-2609-0001 verified: Deposit RM 500.00 by bank transfer · Deposit paid, RM 500.00 of RM '))).toBe(true);
  });

  it('counts the fully paid order for its salesperson, in the month it was paid (commission)', async () => {
    const r = await api.get<{ period: string; kpis: object; byAgent: { agentCode: string; count: number; total: string }[]; rows: { docNo: string; agentName: string; total: string }[] }>('sales/reports/paid-orders', 'NA');
    expect(r.rows).toMatchObject([{ docNo: order.docNo, agentName: 'Aina Rahman', total: order.totals.total }]);
    expect(r.byAgent).toMatchObject([{ agentCode: 'AR', count: 1, total: order.totals.total }]);
    expect(r.kpis).toMatchObject({ paid: { count: 1, total: order.totals.total }, agents: { count: 1 }, deposit: { count: 0 } });
    // Another agent's customers are never in it, and another month is empty.
    expect((await api.get<{ rows: unknown[] }>('sales/reports/paid-orders', 'FO')).rows).toEqual([]);
    expect((await api.get<{ rows: unknown[] }>('sales/reports/paid-orders?period=2026-08', 'NA')).rows).toEqual([]);
  });
});
