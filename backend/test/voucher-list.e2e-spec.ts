import { reseed, startApi, type Api } from './e2e-helpers';

interface Flow { switches: Record<string, boolean> }
interface Order { id: string; version: number; status: string; lines: { itemCode: string; unitPrice: string; listPrice: string | null }[]; vouchers: { voucherNo: string; description: string; amount: string }[]; totals: { voucherTotal: string } }
interface Listed { id: string; voucherNo: string; amount: string; uses: number; usesText: string; status: string; version: number; allowedActions: string[] }

/**
 * Fixed prices and the voucher list (phase 5, the Sales Support answers): with the two Sales Flow switches on, a price
 * on a quotation or a sales order is the price list's and is never typed, and what lowers it is a voucher picked from
 * the list Sales Support keeps. Off, prices and vouchers are typed as before.
 */
describe('Fixed prices and the voucher list (end to end)', () => {
  let api: Api;
  let list = '';
  let voucher: Listed;
  const line = (unitPrice: string, discountPct = '0', qty = '2') => ({ itemCode: 'CH-DIN-01', qty, unitPrice, discountPct });
  const order = (body: object) => api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', ...body });
  const flow = (on: object) => api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, ...on });

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const items = await api.get<{ items: { code: string; listPrice: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=CH-DIN-01', 'AR');
    list = items.items.find((i) => i.code === 'CH-DIN-01')!.listPrice!;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  it('changes nothing while the switches are off', async () => {
    const typed = await order({ lines: [line('70.00', '5')], vouchers: [{ voucherNo: 'ANY-1', amount: '5.00' }] });
    expect(typed.status).toBe(201);
    expect(typed.body.vouchers).toMatchObject([{ voucherNo: 'ANY-1', amount: '5.00' }]);
    expect(await api.get('sales/lookups/vouchers', 'AR')).toEqual({ items: [] });
  });

  it('is set up by whoever holds the voucher permission, not by salespeople', async () => {
    const body = { voucherNo: 'cv-50', description: 'Cash voucher RM 50', amount: '50.00', validFrom: '2026-09-01', validUntil: '2026-12-31', maxUses: 1 };
    expect((await api.call('POST', 'sales/vouchers', 'AR', body)).status).toBe(403);
    expect((await api.call('POST', 'sales/vouchers', 'NA', body)).status).toBe(403);
    const added = await api.call<Listed>('POST', 'sales/vouchers', 'ADM', body);
    expect(added).toMatchObject({ status: 201, body: { voucherNo: 'CV-50', amount: '50.00', uses: 0, usesText: '0 of 1', status: 'RUNNING', allowedActions: ['edit', 'end', 'delete'] } });
    voucher = added.body;
    expect(await api.call('POST', 'sales/vouchers', 'ADM', body)).toMatchObject({ status: 400, body: { errors: [{ field: 'voucherNo', message: 'CV-50 is on the list already.' }] } });
    expect(await api.call('POST', 'sales/vouchers', 'ADM', { ...body, voucherNo: 'CV-NEXT', validFrom: '2026-11-01' })).toMatchObject({ status: 201, body: { status: 'SCHEDULED' } });
    expect((await api.get<{ items: Listed[]; statusCounts: object; canManage: boolean }>('sales/vouchers', 'AR'))).toMatchObject({ statusCounts: { all: 2, running: 1, scheduled: 1, ended: 0 }, canManage: false });
  });

  it('turns both on, and refuses a typed price or discount on an order and a quotation', async () => {
    expect((await flow({ fixedPrices: true, voucherControl: true, priceRange: true })).body.switches).toMatchObject({ fixedPrices: true, voucherControl: true });
    const message = `The price comes from the price list (RM ${Number(list).toFixed(2)}). Use a voucher to lower it.`;
    for (const bad of [line('70.00'), line(list, '5'), line('999.00')]) {
      expect(await order({ lines: [bad] })).toMatchObject({ status: 400, body: { errors: [{ field: 'lines[0].unitPrice', message }] } });
    }
    expect(await api.call('POST', 'sales/quotations', 'AR', { customerCode: 'C-0102', validUntil: '2026-10-13', lines: [line('70.00')] })).toMatchObject({ status: 400, body: { errors: [{ field: 'lines[0].unitPrice', message }] } });
    const fine = await order({ lines: [line(list)] });
    expect(fine.status).toBe(201);
    // The order's price range stands back while prices are fixed.
    expect((await api.get<{ price: { rangeOn: boolean } }>(`sales/orders/${fine.body.id}`, 'AR')).price.rangeOn).toBe(false);
  });

  it('offers the running vouchers, and takes the amount from the list whatever is typed', async () => {
    expect(await api.get('sales/lookups/vouchers', 'AR')).toEqual({ items: [{ voucherNo: 'CV-50', description: 'Cash voucher RM 50', amount: '50.00', validUntil: '2026-12-31', left: 1 }] });
    expect(await order({ lines: [line(list)], vouchers: [{ voucherNo: 'ANY-1', amount: '5.00' }] })).toMatchObject({ status: 400, body: { errors: [{ field: 'vouchers[0].voucherNo', message: 'ANY-1 is not on the voucher list. Pick one from the list.' }] } });
    expect(await order({ lines: [line(list)], vouchers: [{ voucherNo: 'CV-NEXT', amount: '50.00' }] })).toMatchObject({ status: 400, body: { errors: [{ message: 'CV-NEXT starts on 2026-11-01.' }] } });
    const made = await order({ lines: [line(list)], vouchers: [{ voucherNo: 'cv-50', amount: '999.00', description: 'Mine' }] });
    expect(made).toMatchObject({ status: 201, body: { vouchers: [{ voucherNo: 'CV-50', description: 'Cash voucher RM 50', amount: '50.00' }], totals: { voucherTotal: '50.00' } } });

    // One order may use it: the next is refused, and this one keeps it when saved again.
    expect(await order({ lines: [line(list)], vouchers: [{ voucherNo: 'CV-50', amount: '50.00' }] })).toMatchObject({ status: 400, body: { errors: [{ message: 'CV-50 is used up: 1 of 1 orders.' }] } });
    const again = await api.call<Order>('PATCH', `sales/orders/${made.body.id}`, 'AR', { version: made.body.version, lines: [line(list, '0', '3')], vouchers: [{ voucherNo: 'CV-50', amount: '50.00' }] });
    expect(again).toMatchObject({ status: 200, body: { totals: { voucherTotal: '50.00' } } });
  });

  it('keeps the number and amount of a voucher in use, and ends it instead of deleting it', async () => {
    const used = await api.get<Listed>(`sales/vouchers/${voucher.id}`, 'ADM');
    expect(used).toMatchObject({ uses: 1, status: 'USED_UP', allowedActions: ['edit', 'end'] });
    const body = { voucherNo: 'CV-50', description: 'Cash voucher RM 50', amount: '60.00', validFrom: '2026-09-01', validUntil: '2026-12-31', maxUses: 5, version: used.version };
    expect(await api.call('PATCH', `sales/vouchers/${voucher.id}`, 'ADM', body)).toMatchObject({ status: 400, body: { errors: [{ field: 'amount', message: '1 order uses it: its amount stays. End it and add a new voucher.' }] } });
    const more = await api.call<Listed>('PATCH', `sales/vouchers/${voucher.id}`, 'ADM', { ...body, amount: '50.00' });
    expect(more).toMatchObject({ status: 200, body: { status: 'RUNNING', usesText: '1 of 5' } });
    expect(await api.call('DELETE', `sales/vouchers/${voucher.id}?version=${more.body.version}`, 'ADM')).toMatchObject({ status: 409, body: { code: 'IN_USE' } });
    const ended = await api.call<Listed & { activity: { message: string }[] }>('POST', `sales/vouchers/${voucher.id}/end`, 'ADM', { version: more.body.version });
    expect(ended).toMatchObject({ status: 201, body: { validUntil: '2026-09-29' } });
    expect(ended.body.activity.map((a) => a.message)).toEqual(expect.arrayContaining([expect.stringContaining('orders 1 → 5')]));
  });

  it('keeps a quoted price on the order made from it', async () => {
    await flow({ fixedPrices: false, voucherControl: true });
    const q = await api.call<{ id: string; version: number }>('POST', 'sales/quotations', 'AR', { customerCode: 'C-0102', validUntil: '2026-10-13', lines: [line(list, '5')] });
    const released = await api.call<{ version: number }>('POST', `sales/quotations/${q.body.id}/release`, 'AR', { version: q.body.version });
    await flow({ fixedPrices: true, voucherControl: true });
    const made = await api.call<{ orderId: string }>('POST', `sales/quotations/${q.body.id}/transfer`, 'AR', { version: released.body.version });
    expect(made.status).toBe(201);
    const o = await api.get<Order & { version: number }>(`sales/orders/${made.body.orderId}`, 'AR');
    expect(await api.call('PATCH', `sales/orders/${o.id}`, 'AR', { version: o.version, lines: [line(list, '5', '4')] })).toMatchObject({ status: 200 });
  });
});
