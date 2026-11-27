import { reseed, startApi, type Api } from './e2e-helpers';

interface Note { kind: string; title: string; body: string; link: string | null }
interface Content { duitNow: { imageUrl: string; merchant: string } | null; contacts: { label: string; phone: string }[]; officeHours: string | null }

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * What connects the ERP website (admin, the office, Account) with the phone app (phase 5): what admin sets for the
 * phones (the DuitNow QR, Help contacts, office hours), and the alerts each side gets when the other acts: an approval
 * asked for and decided, an official receipt recorded, verified or sent back, a cancellation asked for and released.
 */
describe('The website and the phone app, connected (end to end)', () => {
  let api: Api;
  const notes = async (user: string) => (await api.get<{ items: Note[] }>('me/notifications', user)).items;
  const upload = async (user: string, kind: string) => {
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.from(PNG, 'base64'))], { type: 'image/png' }), 'qr.png');
    form.append('kind', kind);
    const res = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': user }, body: form });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const order = async (unitPrice: string) => {
    const made = await api.call<{ id: string; docNo: string; version: number; status: string; totals: { total: string } }>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice }] });
    expect(made.status).toBe(201);
    return made.body;
  };

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('shows the phones nothing until admin sets it, then what admin set', async () => {
    expect(await api.get<Content>('me/app-content', 'AR')).toEqual({ duitNow: null, contacts: [], officeHours: null });
    const view = await api.get<{ version: number; allowedActions: string[] }>('config/settings/app-content');
    expect(view).toMatchObject({ version: 0, allowedActions: ['edit'] });
    const qr = await upload('ADM', 'APP_DUITNOW_QR');
    const body = { duitNowFileId: qr, duitNowName: '', contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }], officeHours: 'Mon–Sat, 9 AM – 6 PM', version: 0 };
    expect((await api.call('PUT', 'config/settings/app-content', 'AR', body)).status).toBe(403);
    expect(await api.call('PUT', 'config/settings/app-content', 'ADM', body)).toMatchObject({ status: 400, body: { errors: [{ field: 'duitNowName' }] } });
    expect((await api.call('PUT', 'config/settings/app-content', 'ADM', { ...body, duitNowName: 'CLB Groups Sdn Bhd' })).status).toBe(200);
    const shown = await api.get<Content>('me/app-content', 'AR');
    expect(shown).toEqual({ duitNow: { imageUrl: `/attachments/${qr}/download`, merchant: 'CLB Groups Sdn Bhd' }, contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }], officeHours: 'Mon–Sat, 9 AM – 6 PM' });
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    expect((await fetch(`${base}${shown.duitNow!.imageUrl}`, { headers: { 'x-dev-user': 'AR' } })).status).toBe(200);
    expect(await api.call('PUT', 'config/settings/app-content', 'ADM', { ...body, duitNowName: 'X', version: 0 })).toMatchObject({ status: 409, body: { code: 'STALE_VERSION' } });
  });

  it('tells the approver when a salesperson asks, and the salesperson when it is decided', async () => {
    await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, priceRange: true, useReceipts: true });
    const o = await order('100');
    const asked = await api.call<{ status: string; version: number }>('POST', `sales/orders/${o.id}/request-approval`, 'AR', { version: o.version, reason: 'Matching a competitor' });
    expect(asked.body.status).toBe('PENDING_APPROVAL');
    const request = await api.prisma.sysApprovalRequest.findFirstOrThrow({ where: { entityId: o.id, status: 'PENDING' }, include: { steps: true } });
    const approver = request.steps.find((s) => s.stepNo === 1)!.approverCode!;
    expect((await notes(approver)).find((n) => n.kind === 'approval.requested' && n.title === `${o.docNo} waits for your approval`)).toMatchObject({ link: '/sales/approvals' });

    const decided = await api.call('POST', `sales/approvals/${request.id}/reject`, approver, { comment: 'Too low' });
    expect(decided.status).toBe(201);
    expect((await notes('AR')).find((n) => n.kind === 'approval.decided')).toMatchObject({ title: `${o.docNo} rejected`, link: `/sales/orders/${o.id}` });
  });

  it('tells Account when a receipt waits, and the salesperson when it is verified or sent back', async () => {
    const o = await order('1450');
    const released = await api.call<{ status: string; totals: { total: string } }>('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version });
    expect(released.body.status).toBe('RELEASED');
    const record = async (amount: string) => {
      const proof = await upload('AR', 'PAYMENT_PROOF');
      const r = await api.call<{ id: string; docNo: string; version: number }>('POST', 'sales/receipts', 'AR', { salesOrderId: o.id, docDate: '2026-09-29', kind: 'DEPOSIT', method: 'TRANSFER', amount, payerRef: 'IBG 1', proofIds: [proof] });
      expect(r.status).toBe(201);
      return r.body;
    };
    const first = await record('100.00');
    expect((await notes('ADM')).find((n) => n.kind === 'sales.receipt.recorded')).toMatchObject({ title: `${first.docNo} waits to be verified`, link: `/sales/receipts/${first.id}` });
    expect((await api.call('POST', `sales/receipts/${first.id}/verify`, 'ADM', { version: first.version, reference: 'CDM 1' })).status).toBe(201);
    expect((await notes('AR')).find((n) => n.kind === 'sales.receipt.verified')).toMatchObject({ title: `${first.docNo} verified`, link: `/sales/orders/${o.id}` });

    const second = await record('50.00');
    expect((await api.call('POST', `sales/receipts/${second.id}/send-back`, 'ADM', { version: second.version, reason: 'Slip unreadable' })).status).toBe(201);
    expect((await notes('AR')).find((n) => n.kind === 'sales.receipt.sent_back')).toMatchObject({ title: `${second.docNo} sent back by Account` });
  });

  it('tells the office when a salesperson asks to cancel, and the salesperson when it is released', async () => {
    const o = await order('1450');
    expect((await api.call('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version })).status).toBe(201);
    const lines = await api.get<{ lines: { soLineId: string; balanceQty: string }[] }>(`sales/cancel-orders/order-lines/${o.id}`, 'AR');
    const c = await api.call<{ id: string; docNo: string; version: number }>('POST', 'sales/cancel-orders', 'AR', {
      salesOrderId: o.id, reason: 'Customer changed requirement', lines: lines.lines.map((l) => ({ soLineId: l.soLineId, qty: l.balanceQty })),
    });
    expect(c.status).toBe(201);
    expect((await notes('ADM')).find((n) => n.kind === 'sales.cancel.requested')).toMatchObject({ title: `${c.body.docNo} waits to be released` });
    expect((await api.call('POST', `sales/cancel-orders/${c.body.id}/release`, 'ADM', { version: c.body.version })).status).toBe(201);
    expect((await notes('AR')).find((n) => n.kind === 'sales.cancel.released')).toMatchObject({ link: `/sales/orders/${o.id}` });
  });
});
