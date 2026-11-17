import { reseed, startApi, type Api } from './e2e-helpers';

interface Installation { asked: boolean; option: string | null; optionLabel: string | null; preferredDate: string | null; afterStock: boolean; dateNeeded: boolean; text: string | null }
interface Order { id: string; version: number; status: string; installation: Installation }

/**
 * The installation option on sales orders (phase 5, F1 part 5). Off by default: the standard flow asks nothing. On,
 * it follows the agent's signing step of the Sales Mobile App Handbook: the preferred installation date is needed
 * when every item is in stock, and when some are short installation waits for stock. In the demo TB-DIN-06 has 4 at
 * HQ-MAIN and CH-DIN-01 none.
 */
describe('Installation option on sales orders (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const order = (body: Record<string, unknown>) => api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', ...body });
  const release = (o: { id: string; version: number }) => api.call<Order & { code?: string; message?: string }>('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version });
  const event = async (id: string) => (await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: id } })).payload as { installation: unknown };

  it('asks nothing while the switch is off, whatever the form sends', async () => {
    const r = await order({ lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installOption: 'COLLECT', installDate: '2026-10-01' });
    expect(r.status).toBe(201);
    expect(r.body.installation).toMatchObject({ asked: false, option: null, preferredDate: null, text: null });
    expect((await release(r.body)).body.status).toBe('RELEASED');
    expect((await event(r.body.id)).installation).toBeNull();
  });

  it('is turned on in Sales Flow by an admin, and logged', async () => {
    const r = await api.call<{ switches: Record<string, boolean>; saved: string[] }>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true });
    expect(r.body.switches.askInstallation).toBe(true);
    expect(r.body.saved).toEqual(['Ask for an installation option on the order: Off → On']);
  });

  it('needs the preferred date when every item is in stock, and never one before the order date', async () => {
    const r = await order({ lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }] });
    expect(r.body.installation).toMatchObject({ asked: true, option: 'INSTALLATION', optionLabel: 'Installation', preferredDate: null, dateNeeded: true, afterStock: false });
    expect(await release(r.body)).toMatchObject({ status: 409, body: { code: 'INSTALL_DATE_REQUIRED', message: "Pick the customer's preferred installation date. It is needed when every item is in stock." } });

    const early = await api.call('PATCH', `sales/orders/${r.body.id}`, 'AR', { version: r.body.version, installDate: '2026-09-28' });
    expect(early).toMatchObject({ status: 400, body: { errors: [{ field: 'installDate', message: 'The preferred date cannot be before the order date (29 Sep 2026).' }] } });

    const dated = await api.call<Order>('PATCH', `sales/orders/${r.body.id}`, 'AR', { version: r.body.version, installDate: '2026-10-01' });
    expect(dated.body.installation).toMatchObject({ preferredDate: '2026-10-01', text: 'Preferred 1 Oct 2026' });
    expect((await release(dated.body)).body.status).toBe('RELEASED');
    expect((await event(r.body.id)).installation).toEqual({ option: 'INSTALLATION', preferredDate: '2026-10-01', afterStock: false });
  });

  it('lets installation wait for stock when an item is short', async () => {
    const r = await order({ lines: [{ itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }] });
    expect(r.body.installation).toMatchObject({ dateNeeded: false, afterStock: true, text: 'After stock arrives' });
    const released = await release(r.body);
    expect(released.body).toMatchObject({ status: 'RELEASED', installation: { afterStock: true, text: 'After stock arrives' } });
    expect((await event(r.body.id)).installation).toEqual({ option: 'INSTALLATION', preferredDate: null, afterStock: true });
  });

  it('asks no date for delivery only or collect, and drops one sent', async () => {
    const r = await order({ lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installOption: 'COLLECT', installDate: '2026-10-01' });
    expect(r.body.installation).toMatchObject({ option: 'COLLECT', optionLabel: 'Collect', preferredDate: null, dateNeeded: false, text: 'Collect' });
    expect((await release(r.body)).body.status).toBe('RELEASED');
    expect((await event(r.body.id)).installation).toEqual({ option: 'COLLECT', preferredDate: null, afterStock: false });
  });
});
