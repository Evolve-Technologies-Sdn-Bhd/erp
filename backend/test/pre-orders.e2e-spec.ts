import { reseed, startApi, type Api } from './e2e-helpers';

interface PreOrder { switchOn: boolean; isPreOrder: boolean; shortAtRelease: string | null; label: string | null; stockArrived: boolean; willBe: boolean }
interface Order { id: string; docNo: string; status: string; version: number; warehouseCode: string; preOrder: PreOrder; activity: { action: string; message: string }[] }
interface Row { docNo: string; preOrder: { label: string; stockArrived: boolean } | null }

/**
 * Pre-orders (phase 5): with "Short stock makes the order a pre-order" on, an order released with any item short of
 * stock is a pre-order as a whole. It stays marked and shows "Stock arrived" once its open quantities are in stock;
 * nobody releases it again. In the demo CH-DIN-01 has none at HQ-MAIN and TB-DIN-06 has 4.
 */
describe('Pre-orders (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false };
  const draft = async (lines: { itemCode: string; qty: string; unitPrice: string }[]) => {
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines });
    expect(o.status).toBe(201);
    return o.body;
  };
  const release = async (o: Order) => api.call<Order>('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version });
  const short = [{ itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }];

  it('leaves a short order as it is while the company does not make pre-orders', async () => {
    const o = await draft(short);
    expect(o.preOrder).toMatchObject({ switchOn: false, willBe: false });
    const r = await release(o);
    expect(r.body).toMatchObject({ status: 'RELEASED', preOrder: { isPreOrder: false, label: null } });
  });

  let pre: Order;

  it('releases an order with any item short as a pre-order, as a whole', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, preOrders: true })).status).toBe(200);
    const o = await draft([...short, { itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }]);
    expect(o.preOrder).toMatchObject({ switchOn: true, willBe: true });
    const r = await release(o);
    pre = r.body;
    expect(pre.preOrder).toEqual({
      switchOn: true, isPreOrder: true, shortAtRelease: 'CH-DIN-01: 0 in stock, 2 short', label: 'Pre-order · waiting for stock', stockArrived: false, willBe: false,
    });
    expect(pre.activity.find((a) => a.action === 'pre_order')?.message).toBe('Released as a pre-order: CH-DIN-01: 0 in stock, 2 short. The whole order waits for stock.');
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: pre.id } });
    expect(event.payload).toMatchObject({ preOrder: true });

    // An order with everything in stock is not one.
    const full = await release(await draft([{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }]));
    expect(full.body.preOrder).toMatchObject({ isPreOrder: false, label: null });

    const list = await api.get<{ items: Row[] }>('sales/orders?preOrder=1', 'AR');
    expect(list.items.map((i) => [i.docNo, i.preOrder?.label])).toEqual([[pre.docNo, 'Pre-order · waiting for stock']]);
  });

  it('shows Stock arrived once the open quantities are in stock, without releasing it again', async () => {
    const tenant = await api.prisma.sysTenant.findFirstOrThrow();
    await api.prisma.invStockSnapshot.upsert({
      where: { tenantId_warehouseCode_itemCode: { tenantId: tenant.id, warehouseCode: pre.warehouseCode, itemCode: 'CH-DIN-01' } },
      create: { tenantId: tenant.id, warehouseCode: pre.warehouseCode, itemCode: 'CH-DIN-01', onHand: 5, asOf: new Date() },
      update: { onHand: 5 },
    });
    const o = await api.get<Order>(`sales/orders/${pre.id}`, 'AR');
    expect(o).toMatchObject({ status: 'RELEASED', preOrder: { isPreOrder: true, label: 'Pre-order · stock arrived', stockArrived: true } });
    expect((await api.get<{ items: Row[] }>('sales/orders?preOrder=1', 'AR')).items[0]!.preOrder).toEqual({ label: 'Pre-order · stock arrived', stockArrived: true });
  });
});
