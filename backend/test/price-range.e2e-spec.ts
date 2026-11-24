import { reseed, startApi, type Api } from './e2e-helpers';

interface Flow { switches: Record<string, boolean>; range: { belowPct: string; abovePct: string }; saved?: string[] }
interface Order {
  id: string; docNo: string; status: string; version: number; allowedActions: string[];
  lines: { id: string; orderedQty: string }[];
  price: { rangeOn: boolean; outside: number; reason: string | null; lineIds: string[]; needsApproval: boolean };
  approval: { state: string; reason: string | null };
  activity: { action: string; message: string }[];
}
interface Quote { id: string; docNo: string; status: string; version: number; allowedActions: string[]; discount: { over: boolean }; priceCheck: { mode: string; over: boolean; reason: string | null } }

/**
 * The price range (phase 5, F1; decision 11): with the Sales Flow switch on, a salesperson may price from 10% below to
 * 20% above the customer's price list; outside it the Sales Manager approves before release, on quotations and sales
 * orders, and a price approved upstream is not asked again downstream. Off, the standard rules stand: the quotation's
 * 15% discount limit, and orders priced freely (their invoices meet the strict price list).
 */
describe('Price range (end to end)', () => {
  let api: Api;
  let list = 0;
  const FLOW = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false };

  beforeAll(async () => {
    reseed();
    api = await startApi();
    const items = await api.get<{ items: { code: string; listPrice: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=CH-DIN-01', 'AR');
    list = Number(items.items.find((i) => i.code === 'CH-DIN-01')!.listPrice);
    expect(list).toBeGreaterThan(0);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const at = (factor: number) => (list * factor).toFixed(2);
  const order = async (unitPrice: string) => {
    const r = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [{ itemCode: 'CH-DIN-01', qty: '2', unitPrice }] });
    expect(r.status).toBe(201);
    return r.body;
  };
  const quote = async (unitPrice: string, discountPct: string) => {
    const r = await api.call<Quote>('POST', 'sales/quotations', 'AR', { customerCode: 'C-0102', validUntil: '2026-10-13', lines: [{ itemCode: 'CH-DIN-01', qty: '2', unitPrice, discountPct }] });
    expect(r.status).toBe(201);
    return r.body;
  };
  const approve = async (docNo: string) => {
    const inbox = await api.get<{ items: { id: string; docNo: string; kind: string }[] }>('sales/approvals', 'NA');
    const item = inbox.items.find((i) => i.docNo === docNo)!;
    // Marked by what is asked: a price, not credit; an order's request shows its lines against the price list.
    expect(item.kind).toBe(docNo.startsWith('QT') ? 'DISCOUNT' : 'PRICE');
    if (docNo.startsWith('SO')) {
      const detail = await api.get<{ kindLabel: string; panel: { type: string; lines: { itemCode: string; belowPct: string | null }[] } }>(`sales/approvals/${item.id}`, 'NA');
      expect(detail).toMatchObject({ kindLabel: 'Price', panel: { type: 'PRICE', lines: [{ itemCode: 'CH-DIN-01', belowPct: '12' }] } });
    }
    expect((await api.call('POST', `sales/approvals/${item.id}/approve`, 'NA', { comment: 'Fine this once' })).status).toBe(201);
  };
  const REASON_12 = 'Price 12% below the price list on 1 line (allowed: 10% below to 20% above)';

  it('keeps the standard rules while the switch is off', async () => {
    const flow = await api.get<Flow>('sales/settings/sales-flow');
    expect(flow).toMatchObject({ switches: { priceRange: false }, range: { belowPct: '10', abovePct: '20' } });

    const o = await order(at(0.88));
    expect(o.price).toEqual({ rangeOn: false, range: null, outside: 0, reason: null, lineIds: [], needsApproval: false });
    expect(o.allowedActions).toContain('release');
    // A 16% discount is over the 15% limit on a quotation.
    const q = await quote(at(1), '16');
    expect(q).toMatchObject({ discount: { over: true }, priceCheck: { mode: 'DISCOUNT', over: true, reason: 'Discount 16%, above 15% rule' } });
  });

  it('turns the range on with its two percentages, each change logged', async () => {
    expect(await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, priceRange: true, priceBelowPct: '120' })).toMatchObject({
      status: 400, body: { errors: [{ field: 'priceBelowPct', message: 'Type a percentage from 0 to 100.' }] },
    });
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'AR', { ...FLOW, priceRange: true })).status).toBe(403);
    const on = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, priceRange: true });
    expect(on.body).toMatchObject({ switches: { priceRange: true }, saved: ['Salespeople set prices within a range of the price list: Off → On'] });
    const moved = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, priceBelowPct: '15' });
    expect(moved.body).toMatchObject({ switches: { priceRange: true }, range: { belowPct: '15', abovePct: '20' }, saved: ['Price range: 10% below to 20% above → 15% below to 20% above'] });
    await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, priceBelowPct: '10' });
  });

  let approvedOrder: Order;

  it('asks the Sales Manager for a sales order priced outside the range, and releases it once approved', async () => {
    expect((await order(at(0.92))).price).toMatchObject({ rangeOn: true, outside: 0, needsApproval: false });
    expect((await order(at(1.24))).price.reason).toBe('Price 24% above the price list on 1 line (allowed: 10% below to 20% above)');

    const o = await order(at(0.88));
    expect(o.price).toMatchObject({ rangeOn: true, outside: 1, reason: REASON_12, lineIds: [o.lines[0]!.id], needsApproval: true });
    expect(o.allowedActions).toEqual(expect.arrayContaining(['requestApproval']));
    expect(o.allowedActions).not.toContain('release');
    expect(await api.call('POST', `sales/orders/${o.id}/release`, 'AR', { version: o.version })).toMatchObject({
      status: 409, body: { code: 'PRICE_APPROVAL_REQUIRED', message: `${REASON_12}. Type a reason and request approval.` },
    });

    const sent = await api.call<Order>('POST', `sales/orders/${o.id}/request-approval`, 'AR', { version: o.version, reason: 'Matching a competitor quote' });
    expect(sent.body).toMatchObject({ status: 'PENDING_APPROVAL', approval: { state: 'PENDING', reason: REASON_12 } });
    expect(sent.body.activity[0]!.message).toMatch(new RegExp(`^${REASON_12.replace(/[()]/g, '\\$&')} · sent for approval to `));

    await approve(o.docNo);
    const back = await api.get<Order>(`sales/orders/${o.id}`, 'AR');
    expect(back).toMatchObject({ status: 'DRAFT', price: { needsApproval: false }, approval: { state: 'APPROVED' } });
    const released = await api.call<Order>('POST', `sales/orders/${o.id}/release`, 'AR', { version: back.version });
    expect(released.body.status).toBe('RELEASED');
    approvedOrder = released.body;
  });

  it('replaces the discount limit on quotations, and does not ask again on the order made from it', async () => {
    // 16% off 1.20 × list is within the range, though over the 15% discount limit.
    const fine = await quote(at(1.2), '16');
    expect(fine).toMatchObject({ discount: { over: false }, priceCheck: { mode: 'RANGE', over: false, reason: null } });
    expect(fine.allowedActions).toContain('release');

    const q = await quote(at(1), '18');
    expect(q.priceCheck).toEqual({ mode: 'RANGE', over: true, reason: 'Price 18% below the price list on 1 line (allowed: 10% below to 20% above)', range: { belowPct: '10', abovePct: '20' } });
    expect(await api.call('POST', `sales/quotations/${q.id}/release`, 'AR', { version: q.version })).toMatchObject({ status: 409, body: { code: 'PRICE_APPROVAL_REQUIRED' } });
    const sent = await api.call<Quote>('POST', `sales/quotations/${q.id}/request-approval`, 'AR', { version: q.version, reason: 'Clearance' });
    expect(sent.body.status).toBe('PENDING_APPROVAL');
    await approve(q.docNo);
    const latest = await api.get<Quote>(`sales/quotations/${q.id}`, 'AR');
    const released = await api.call<Quote>('POST', `sales/quotations/${q.id}/release`, 'AR', { version: latest.version });
    expect(released.body.status).toBe('RELEASED');
    const made = await api.call<{ orderId: string }>('POST', `sales/quotations/${q.id}/transfer`, 'AR', { version: released.body.version });
    const so = await api.get<Order>(`sales/orders/${made.body.orderId}`, 'AR');
    expect(so.price).toMatchObject({ rangeOn: true, outside: 0, needsApproval: false });
    expect(so.allowedActions).toContain('release');
  });

  it('follows the range on the invoice without asking again for a price approved on the order', async () => {
    const delivery = (await api.call<{ id: string; version: number }>('POST', 'sales/deliveries', 'AR', { salesOrderId: approvedOrder.id })).body;
    expect((await api.call<{ status: string }>('POST', `sales/deliveries/${delivery.id}/confirm`, 'AR', { version: delivery.version })).body.status).toBe('CONFIRMED');
    const inv = await api.call<{ id: string; checks: { needsPrice: boolean; priceReason: string | null }; allowedActions: string[] }>('POST', 'sales/invoices/from-order', 'AR', {
      salesOrderId: approvedOrder.id, lines: approvedOrder.lines.map((l) => ({ soLineId: l.id, qty: l.orderedQty })),
    });
    expect(inv.status).toBe(201);
    expect(inv.body.checks).toMatchObject({ needsPrice: false, priceReason: null });
    expect(inv.body.allowedActions).toContain('release');
  });

  it('goes back to the standard rules when the switch is turned off', async () => {
    const off = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { ...FLOW, priceRange: false });
    expect(off.body.saved).toEqual(['Salespeople set prices within a range of the price list: On → Off']);
    expect((await order(at(0.88))).price).toMatchObject({ rangeOn: false, needsApproval: false });
  });
});
