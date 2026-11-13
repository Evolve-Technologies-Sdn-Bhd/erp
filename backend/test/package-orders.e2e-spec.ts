import { reseed, startApi, type Api } from './e2e-helpers';

interface OrderLine {
  id: string;
  lineNo: number;
  itemCode: string;
  orderedQty: string;
  unitPrice: string;
  listPrice: string | null;
  amount: string;
  taxAmount: string;
  lineKind: string;
  package: { group: number; code: string; name: string; qty: string; price: string; uomCode: string } | null;
}

/**
 * A package on a sales order (phase 5, F1 part 3): the order keeps it as its items priced from the package plus the
 * chosen free gift at 0.00, so delivery and invoice work on real items and no price check trips. The seed has no
 * packages, so the journey makes PK-DIN-06 first (FIELD_SALES_SEED_DATA.md).
 */
describe('Packages on sales orders (end to end)', () => {
  let api: Api;
  let packageId = '';
  let orderId = '';

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const r = await api.call<{ id: string }>('POST', 'core/packages', 'ADM', {
      code: 'PK-DIN-06', name: 'Dining set, 6-seater', uomCode: 'SET', salesTaxCode: 'SST10', priceListCode: 'STD-2026', packagePrice: '2700.00',
      giftRule: 'CHOOSE_ONE', runsFrom: '2026-09-01', runsUntil: '2026-12-31',
      items: [{ itemCode: 'TB-DIN-06', qty: '1', uomCode: 'PCS' }, { itemCode: 'CH-DIN-01', qty: '6', uomCode: 'PCS' }],
      // CH-KID-01 is not for sale on its own; as a gift it still goes on the order.
      gifts: [{ itemCode: 'CU-SET-02', qty: '1', uomCode: 'SET' }, { itemCode: 'CH-KID-01', qty: '1', uomCode: 'PCS' }],
    });
    expect(r.status).toBe(201);
    packageId = r.body.id;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('offers the running package with its price spread and its gifts', async () => {
    const r = await api.get<{ items: { code: string; price: string; normalValue: string; saves: string; taxName: string; items: { itemCode: string; unitPrice: string }[]; gifts: { itemCode: string }[]; problem: string | null }[] }>('sales/lookups/packages', 'AR');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ code: 'PK-DIN-06', price: '2700.00', normalValue: '2950.00', saves: '250.00', problem: null });
    expect(r.items[0]!.items.map((i) => `${i.itemCode} ${i.unitPrice}`)).toEqual(['TB-DIN-06 1327.1200', 'CH-DIN-01 228.8133']);
    expect(r.items[0]!.gifts.map((g) => g.itemCode)).toEqual(['CU-SET-02', 'CH-KID-01']);
    // Before it starts, nothing is offered.
    expect((await api.get<{ items: unknown[] }>('sales/lookups/packages?date=2026-08-31', 'AR')).items).toEqual([]);
  });

  it('asks for the gift and whole sets, pointing at the line the agent typed', async () => {
    const r = await api.call('POST', 'sales/orders', 'AR', {
      customerCode: 'C-0102',
      lines: [{ itemCode: 'CH-BAR-01', qty: '2', unitPrice: '190' }, { packageCode: 'PK-DIN-06', qty: '1.5' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([
      { field: 'lines[1].qty', message: 'Packages are sold in whole sets.' },
      { field: 'lines[1].giftItemCode', message: 'Pick the free gift for PK-DIN-06.' },
    ]);
  });

  it('keeps the package as its items priced from it, and the chosen gift at 0.00', async () => {
    const r = await api.call<{ id: string; docNo: string; version: number; lines: OrderLine[]; totals: { subtotal: string; taxLines: { amount: string }[]; total: string } }>('POST', 'sales/orders', 'AR', {
      customerCode: 'C-0102', lines: [{ packageCode: 'pk-din-06', qty: '1', giftItemCode: 'CH-KID-01' }],
    });
    expect(r.status).toBe(201);
    const o = r.body;
    expect(o.lines.map((l) => [l.lineNo, l.itemCode, l.orderedQty, l.unitPrice, l.listPrice, l.amount, l.lineKind])).toEqual([
      [1, 'TB-DIN-06', '1.0000', '1327.1200', '1327.1200', '1327.12', 'PACKAGE'],
      [2, 'CH-DIN-01', '6.0000', '228.8133', '228.8133', '1372.88', 'PACKAGE'],
      [3, 'CH-KID-01', '1.0000', '0.0000', null, '0.00', 'GIFT'],
    ]);
    expect(o.lines.every((l) => l.package?.code === 'PK-DIN-06' && l.package.group === 1 && l.package.qty === '1.0000' && l.package.price === '2700.00')).toBe(true);
    expect(o.totals).toMatchObject({ subtotal: '2700.00', total: '2970.00' });
    expect(o.totals.taxLines.map((t) => t.amount)).toEqual(['270.00']);
    orderId = o.id;

    // Two sets on save: the same unit prices, twice the quantities.
    const two = await api.call<{ version: number; lines: OrderLine[]; totals: { total: string } }>('PATCH', `sales/orders/${o.id}`, 'AR', {
      version: o.version, lines: [{ packageCode: 'PK-DIN-06', qty: '2', giftItemCode: 'CU-SET-02' }],
    });
    expect(two.status).toBe(200);
    expect(two.body.lines.map((l) => `${l.orderedQty} ${l.itemCode} ${l.amount}`)).toEqual(['2.0000 TB-DIN-06 2654.24', '12.0000 CH-DIN-01 2745.76', '2.0000 CU-SET-02 0.00']);
    expect(two.body.totals.total).toBe('5940.00');
    const back = await api.call<{ version: number }>('PATCH', `sales/orders/${o.id}`, 'AR', { version: two.body.version, lines: [{ packageCode: 'PK-DIN-06', qty: '1', giftItemCode: 'CH-KID-01' }] });
    expect(back.status).toBe(200);
  });

  it('releases it, with the gift that is not for sale on its own, and tells the event', async () => {
    const o = await api.get<{ version: number }>(`sales/orders/${orderId}`, 'AR');
    const r = await api.call<{ status: string; docNo: string }>('POST', `sales/orders/${orderId}/release`, 'AR', { version: o.version });
    expect(r).toMatchObject({ status: 201, body: { status: 'RELEASED' } });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: orderId } });
    expect((event.payload as { lines: { itemCode: string; lineKind: string; packageCode: string }[] }).lines.map((l) => `${l.itemCode} ${l.lineKind} ${l.packageCode}`)).toEqual([
      'TB-DIN-06 PACKAGE PK-DIN-06', 'CH-DIN-01 PACKAGE PK-DIN-06', 'CH-KID-01 GIFT PK-DIN-06',
    ]);
  });

  it('stops Core deleting a package an order uses', async () => {
    const p = await api.get<{ version: number; allowedActions: string[]; refusals: Record<string, string> }>(`core/packages/${packageId}`, 'ADM');
    expect(p.allowedActions).not.toContain('delete');
    expect(p.refusals.delete).toBe('PK-DIN-06 is used on 1 document, so it cannot be deleted. End it instead.');
    expect(await api.call('DELETE', `core/packages/${packageId}?version=${p.version}`, 'ADM')).toMatchObject({ status: 409, body: { code: 'PACKAGE_IN_USE' } });
    const usage = await api.get<{ documents: number; open: { docNo: string }[] }>('core/usage/package/PK-DIN-06', 'ADM');
    expect(usage.documents).toBe(1);
    const list = await api.get<{ items: { code: string; orders: number }[] }>('core/packages', 'ADM');
    expect(list.items.map((i) => `${i.code} ${i.orders}`)).toEqual(['PK-DIN-06 1']);
  });

  it('delivers the items and the gift, and invoices at the package prices without a price approval', async () => {
    let delivery = (await api.call<{ id: string; version: number; lines: { itemCode: string; qty: string }[] }>('POST', 'sales/deliveries', 'AR', { salesOrderId: orderId })).body;
    expect(delivery.lines.map((l) => `${l.itemCode} ${l.qty}`)).toEqual(['TB-DIN-06 1.0000', 'CH-DIN-01 6.0000', 'CH-KID-01 1.0000']);
    delivery = (await api.call<typeof delivery & { status: string }>('POST', `sales/deliveries/${delivery.id}/confirm`, 'AR', { version: delivery.version })).body;

    const order = await api.get<{ lines: OrderLine[] }>(`sales/orders/${orderId}`, 'AR');
    const inv = await api.call<{ id: string; version: number; allowedActions: string[]; totals: { total: string } }>('POST', 'sales/invoices/from-order', 'AR', {
      salesOrderId: orderId, lines: order.lines.map((l) => ({ soLineId: l.id, qty: l.orderedQty })),
    });
    expect(inv.status).toBe(201);
    expect(inv.body.totals.total).toBe('2970.00');
    expect(inv.body.allowedActions).toContain('release');
    const released = await api.call('POST', `sales/invoices/${inv.body.id}/release`, 'AR', { version: inv.body.version });
    expect(released).toMatchObject({ status: 201, body: { status: 'RELEASED' } });
  });
});
