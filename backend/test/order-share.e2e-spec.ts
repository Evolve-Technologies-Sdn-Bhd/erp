import { reseed, startApi, type Api } from './e2e-helpers';

interface Order { id: string; docNo: string; status: string; version: number; share: { number: string | null; text: string } | null }

/**
 * Share the sales order on WhatsApp (phase 5): off by default. On, whoever keys orders gets the customer's number and
 * the message on a released order; the ERP sends nothing itself.
 */
describe('Share the sales order on WhatsApp (end to end)', () => {
  let api: Api;
  let order: Order;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false };
  const read = async (who: string) => (await api.call<Order>('GET', `sales/orders/${order.id}`, who)).body;

  it('offers nothing while the company does not use it', async () => {
    const made = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', contactName: 'Puan Salmah', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    expect(made.status).toBe(201);
    order = made.body;
    const released = await api.call<Order>('POST', `sales/orders/${order.id}/release`, 'AR', { version: order.version });
    expect(released.body).toMatchObject({ status: 'RELEASED', share: null });
  });

  it('gives the salesperson the number and the message once it is on', async () => {
    const saved = await api.call<{ saved: string[] }>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, shareWhatsapp: true });
    expect(saved.body.saved).toEqual(['Share the sales order with the customer on WhatsApp: Off → On']);
    const { share, docNo } = await read('AR');
    expect(share).not.toBeNull();
    expect(share!.number === null || /^60\d{8,11}$/.test(share!.number)).toBe(true);
    expect(share!.text).toContain('Hello Puan Salmah,');
    expect(share!.text).toContain(`Sales order: ${docNo}`);
    expect(share!.text).toMatch(/• .+ × 1 PCS/);
    expect(share!.text).toMatch(/Total: RM 1,\d{3}\.\d{2}$/);
  });

  it('is only for whoever keys orders, and only on a released order', async () => {
    expect((await read('RI')).share).toBeNull(); // Finance sees the order, and does not key it
    const draft = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    expect(draft.body.share).toBeNull();
  });
});
