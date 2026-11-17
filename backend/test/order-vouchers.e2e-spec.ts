import { reseed, startApi, type Api } from './e2e-helpers';

interface Totals { subtotal: string; voucherTotal: string; taxLines: { code: string; amount: string }[]; rounding: string; total: string }
interface Voucher { voucherNo: string; description: string; amount: string; taxCode: string; taxAmount: string; invoiceNo?: string | null }

/**
 * Vouchers on a sales order (phase 5, F1 part 4), with SO-0009 of FIELD_SALES_SEED_DATA.md: PK-DIN-06 at 2,700.00
 * and voucher CV-2609-0031 for 50.00 give tax 10% of 2,650.00 = 265.00 and a total of 2,915.00. The voucher never
 * reaches the delivery order; the order's first invoice uses it, and a deleted draft invoice gives it back.
 */
describe('Vouchers on sales orders (end to end)', () => {
  let api: Api;
  let orderId = '';
  let version = 0;
  const pkg = { packageCode: 'PK-DIN-06', qty: '1', giftItemCode: 'CU-SET-02' };
  const voucher = { voucherNo: 'cv-2609-0031', amount: '50.00', description: 'Cash voucher RM 50' };

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const r = await api.call('POST', 'core/packages', 'ADM', {
      code: 'PK-DIN-06', name: 'Dining set, 6-seater', uomCode: 'SET', salesTaxCode: 'SST10', priceListCode: 'STD-2026', packagePrice: '2700.00',
      giftRule: 'CHOOSE_ONE', runsFrom: '2026-09-01', runsUntil: '2026-12-31',
      items: [{ itemCode: 'TB-DIN-06', qty: '1', uomCode: 'PCS' }, { itemCode: 'CH-DIN-01', qty: '6', uomCode: 'PCS' }],
      gifts: [{ itemCode: 'CU-SET-02', qty: '1', uomCode: 'SET' }, { itemCode: 'CH-KID-01', qty: '1', uomCode: 'PCS' }],
    });
    expect(r.status).toBe(201);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('refuses a voucher bigger than the items, or one typed twice', async () => {
    const big = await api.call('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [pkg], vouchers: [{ voucherNo: 'CV-1', amount: '2700.01' }] });
    expect(big).toMatchObject({ status: 400, body: { errors: [{ field: 'vouchers[0].amount', message: 'Vouchers cannot be more than the SST 10% items before tax (2,700.00).' }] } });
    const twice = await api.call('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [pkg], vouchers: [{ voucherNo: 'CV-1', amount: '10' }, { voucherNo: 'cv-1', amount: '10' }] });
    expect(twice).toMatchObject({ status: 400, body: { errors: [{ field: 'vouchers[1].voucherNo', message: 'Voucher CV-1 is on this order twice.' }] } });
  });

  it('takes 50.00 off before tax: 2,700.00 − 50.00, tax 265.00, total 2,915.00', async () => {
    const r = await api.call<{ id: string; version: number; totals: Totals; vouchers: Voucher[]; credit: { snapshot: { thisDocument: string } } }>('POST', 'sales/orders', 'AR', {
      customerCode: 'C-0102', lines: [pkg], vouchers: [voucher],
    });
    expect(r.status).toBe(201);
    expect(r.body.totals).toMatchObject({ subtotal: '2700.00', voucherTotal: '50.00', rounding: '0.00', total: '2915.00' });
    expect(r.body.totals.taxLines).toEqual([expect.objectContaining({ code: 'SST10', amount: '265.00' })]);
    expect(r.body.vouchers).toEqual([expect.objectContaining({ voucherNo: 'CV-2609-0031', description: 'Cash voucher RM 50', amount: '50.00', taxCode: 'SST10', taxAmount: '5.00', invoiceNo: null })]);
    expect(r.body.credit.snapshot.thisDocument).toBe('2915.00');
    orderId = r.body.id;
    version = r.body.version;
  });

  it('keeps the voucher when only the lines change, and drops it when the agent removes it', async () => {
    const two = await api.call<{ version: number; totals: Totals }>('PATCH', `sales/orders/${orderId}`, 'AR', { version, lines: [{ ...pkg, qty: '2' }] });
    expect(two.body.totals).toMatchObject({ subtotal: '5400.00', voucherTotal: '50.00', total: '5885.00' });
    const none = await api.call<{ version: number; totals: Totals; vouchers: Voucher[] }>('PATCH', `sales/orders/${orderId}`, 'AR', { version: two.body.version, lines: [pkg], vouchers: [] });
    expect(none.body).toMatchObject({ vouchers: [], totals: { voucherTotal: '0.00', total: '2970.00' } });
    const back = await api.call<{ version: number; totals: Totals }>('PATCH', `sales/orders/${orderId}`, 'AR', { version: none.body.version, vouchers: [voucher] });
    expect(back.body.totals.total).toBe('2915.00');
    version = back.body.version;
  });

  it('releases with the voucher in the event, and delivers the goods without it', async () => {
    const r = await api.call<{ status: string }>('POST', `sales/orders/${orderId}/release`, 'AR', { version });
    expect(r.body.status).toBe('RELEASED');
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.order.released', aggregateId: orderId } });
    expect((event.payload as { total: string; vouchers: unknown[] })).toMatchObject({ total: '2915.00', vouchers: [{ voucherNo: 'CV-2609-0031', amount: '50.00', taxCode: 'SST10', taxAmount: '5.00' }] });

    const delivery = (await api.call<{ id: string; version: number; lines: { itemCode: string }[] }>('POST', 'sales/deliveries', 'AR', { salesOrderId: orderId })).body;
    expect(delivery.lines.map((l) => l.itemCode)).toEqual(['TB-DIN-06', 'CH-DIN-01', 'CU-SET-02']);
    expect((await api.call<{ status: string }>('POST', `sales/deliveries/${delivery.id}/confirm`, 'AR', { version: delivery.version })).body.status).toBe('CONFIRMED');
  });

  it('uses the voucher on the first invoice, gives it back when that draft is deleted, and keeps it on release', async () => {
    const order = await api.get<{ lines: { id: string; orderedQty: string }[] }>(`sales/orders/${orderId}`, 'AR');
    const make = () => api.call<{ id: string; docNo: string; version: number; totals: Totals; vouchers: Voucher[] }>('POST', 'sales/invoices/from-order', 'AR', {
      salesOrderId: orderId, lines: order.lines.map((l) => ({ soLineId: l.id, qty: l.orderedQty })),
    });
    const first = await make();
    expect(first.status).toBe(201);
    expect(first.body.totals).toMatchObject({ voucherTotal: '50.00', total: '2915.00' });
    expect(first.body.totals.taxLines.map((t) => t.amount)).toEqual(['265.00']);
    expect(first.body.vouchers.map((v) => v.voucherNo)).toEqual(['CV-2609-0031']);
    expect((await api.get<{ vouchers: Voucher[] }>(`sales/orders/${orderId}`, 'AR')).vouchers[0]!.invoiceNo).toBe(first.body.docNo);

    expect((await api.call('DELETE', `sales/invoices/${first.body.id}?version=${first.body.version}`, 'AR')).status).toBe(200);
    expect((await api.get<{ vouchers: Voucher[] }>(`sales/orders/${orderId}`, 'AR')).vouchers[0]!.invoiceNo).toBeNull();

    const second = await make();
    expect(second.body.totals.total).toBe('2915.00');
    const released = await api.call<{ status: string; amounts: { balance: string } }>('POST', `sales/invoices/${second.body.id}/release`, 'AR', { version: second.body.version });
    expect(released).toMatchObject({ status: 201, body: { status: 'RELEASED', amounts: { balance: '2915.00' } } });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'sales.invoice.released', aggregateId: second.body.id } });
    expect(event.payload).toMatchObject({ subtotal: '2700.00', voucherTotal: '50.00', taxTotal: '265.00', total: '2915.00' });
  });
});
