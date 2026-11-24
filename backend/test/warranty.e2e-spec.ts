// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Warranty { id: string; jobNo: string; salesOrderNo: string | null; itemCode: string; serialNo: string | null; startOn: string; endOn: string; state: string; stateLabel: string; version: number }
interface Job {
  id: string; docNo: string; stage: string; version: number; salesOrderNo: string | null; jobType: string; note: string | null; cancelReason: string | null;
  items: { itemCode: string; serialNo: string | null }[]; parts: { itemCode: string; qty: string }[]; activity: { action: string; message: string }[];
  warranty: { unit: Warranty | null; suggested: string; assessment: string | null; canAssess: boolean } | null;
}
interface Order { id: string; docNo: string; status: string; version: number; totals: { total: string } }

/**
 * The warranty register (phase 5, build 3): an item with a warranty in Core is registered by a complete installation,
 * active once the order is fully paid; a claim is a warranty job the office decides. Today is Tue 29 Sep 2026.
 */
describe('Service: the warranty register and claims (end to end)', () => {
  let api: Api;
  const people: Record<string, string> = {};
  let n = 0;

  beforeAll(async () => {
    reseed();
    api = await startApi();
    for (const [key, name, role] of [['hafiz', 'Hafiz Rahman', 'INSTALLER'], ['aisyah', 'Nor Aisyah', 'WARRANTY']] as const) {
      const r = await api.call<{ people: { id: string; name: string }[] }>('POST', 'service/settings/people', 'ADM', { name, role });
      people[key] = r.body.people.find((p) => p.name === name)!.id;
    }
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const job = (id: string) => api.get<Job>(`service/jobs/${id}`);
  const list = (query = '') => api.get<{ items: Warranty[]; statusCounts: Record<string, number> }>(`service/warranties${query}`);
  const photo = async (id: string) => {
    n += 1;
    await api.prisma.sysAttachment.create({ data: { tenantId: (await api.prisma.sysTenant.findFirstOrThrow()).id, fileName: `p${n}.jpg`, mimeType: 'image/jpeg', sizeBytes: 10, storageKey: `test/w-${n}-${Date.now()}.jpg`, kind: 'JOB_PHOTO', entityType: 'SVC_JOB', entityId: id, uploadedByCode: 'ADM' } });
  };
  const bookAndRecord = async (id: string, person: string, group: string, date: string, start: number, body: Record<string, unknown>) => {
    const b = await api.call<Job>('POST', `service/jobs/${id}/book`, 'ADM', { version: (await job(id)).version, personId: people[person], date, slotGroupCode: group, start });
    expect(b.status).toBe(201);
    await photo(id);
    return api.call<Job & { errors?: { field: string; message: string }[] }>('POST', `service/jobs/${id}/record`, 'ADM', { version: (await job(id)).version, result: 'COMPLETE', paidStatus: 'NO_CHARGE', ...body });
  };

  let order: Order;
  let unit: Warranty;

  it('keeps the warranty of an item in Core, with before and after values', async () => {
    const id = (await api.prisma.mdmItem.findFirstOrThrow({ where: { code: 'TB-DIN-06' } })).id;
    const ITEM = ['name', 'itemGroup', 'type', 'baseUom', 'barcode', 'einvoiceClassification', 'isPurchasable', 'isBuyToOrder', 'purchaseUom', 'purchaseTaxCode', 'preferredSupplierCode', 'reorderLevel', 'packSize', 'isSellable', 'salesUom', 'salesTaxCode', 'standardCost', 'serviceIntervalMonths'];
    const before = await api.get<Record<string, unknown> & { version: number; conversions: { fromUom: string; toUom: string; factor: string }[] }>(`core/items/${id}`);
    expect(before.warrantyMonths).toBeNull();
    const body = (warrantyMonths: number | null) => ({
      ...Object.fromEntries(ITEM.map((k) => [k, before[k]])), conversions: before.conversions.map(({ fromUom, toUom, factor }) => ({ fromUom, toUom, factor })), warrantyMonths, version: before.version,
    });
    expect(await api.call('PATCH', `core/items/${id}`, 'ADM', body(0))).toMatchObject({ status: 400 });
    const saved = await api.call<{ warrantyMonths: number; activity: { message: string }[] }>('PATCH', `core/items/${id}`, 'ADM', body(12));
    expect(saved.body.warrantyMonths).toBe(12);
    expect(saved.body.activity[0]!.message).toBe('Changed warranty (months) (blank) → 12');
  });

  it('registers the units of a complete installation, waiting until the order is fully paid', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true, useReceipts: true })).status).toBe(200);
    const o = await api.call<Order>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', installOption: 'INSTALLATION', installDate: '2026-10-01', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }, { itemCode: 'CH-DIN-01', qty: '2', unitPrice: '250' }] });
    const r = await api.call<Order>('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
    order = r.body;
    const row = await api.until('the job', async () => (await api.get<{ items: Job[] }>(`service/jobs?q=${order.docNo}`)).items.find((j) => j.salesOrderNo === order.docNo));
    const done = await bookAndRecord(row.id, 'hafiz', 'STANDARD', '2026-10-01', 600, {});
    expect(done.body.activity.some((a) => a.message === 'Warranty registered: TB-DIN-06 until 2027-09-30 once fully paid')).toBe(true);
    const all = await list();
    expect(all.statusCounts).toEqual({ all: 1, active: 0, pending: 1, expired: 0, void: 0 });
    unit = all.items[0]!;
    expect(unit).toMatchObject({ itemCode: 'TB-DIN-06', salesOrderNo: order.docNo, startOn: '2026-10-01', endOn: '2027-09-30', state: 'PENDING', stateLabel: 'Waiting for payment' });

    // Account verifies the full payment: active.
    const proof = (await api.prisma.sysAttachment.create({ data: { tenantId: (await api.prisma.sysTenant.findFirstOrThrow()).id, fileName: 'slip.png', mimeType: 'image/png', sizeBytes: 10, storageKey: `test/slip-${Date.now()}.png`, kind: 'PAYMENT_PROOF', uploadedByCode: 'AR' } })).id;
    const or = await api.call<{ id: string; version: number }>('POST', 'sales/receipts', 'AR', { salesOrderId: order.id, docDate: '2026-09-28', kind: 'BALANCE', method: 'TRANSFER', amount: order.totals.total, proofIds: [proof] });
    expect(or.status).toBe(201);
    expect((await api.call('POST', `sales/receipts/${or.body.id}/verify`, 'RI', { version: or.body.version, reference: 'MBB 1' })).status).toBe(201);
    await api.until('the active warranty', async () => (await list('?status=active')).items.length === 1);
  });

  it('finds a unit by phone, order or serial number, and keeps its serial number', async () => {
    const phone = (await api.prisma.svcWarranty.findFirstOrThrow()).phoneKey!;
    for (const q of [phone.slice(-6), order.docNo, unit.jobNo, 'TB-DIN']) expect((await list(`?q=${encodeURIComponent(q)}`)).items).toHaveLength(1);
    unit = (await list()).items[0]!;
    const saved = await api.call<Warranty>('PATCH', `service/warranties/${unit.id}`, 'ADM', { version: unit.version, serialNo: 'SN-778812' });
    expect(saved.body.serialNo).toBe('SN-778812');
    expect((await list('?q=778812')).items).toHaveLength(1);
    expect((await list('?q=no-such-unit')).items).toHaveLength(0);
  });

  it('takes a claim as a warranty job, decided covered, with the parts used', async () => {
    const made = await api.call<Job>('POST', `service/warranties/${unit.id}/job`, 'ADM', { problem: 'One leg is loose', preferredDate: '2026-10-06' });
    expect(made.body).toMatchObject({ jobType: 'WARRANTY', stage: 'NOT_BOOKED', note: 'One leg is loose', items: [{ itemCode: 'TB-DIN-06', serialNo: 'SN-778812' }], warranty: { suggested: 'COVERED', assessment: null, canAssess: true } });
    const j = await api.call<Job & { errors?: unknown[] }>('POST', `service/jobs/${made.body.id}/assess`, 'ADM', { version: made.body.version, result: 'COVERED' });
    expect(j.body.warranty).toMatchObject({ assessment: 'COVERED', unit: { state: 'ACTIVE' } });

    const bad = await bookAndRecord(made.body.id, 'aisyah', 'SHORT', '2026-10-06', 600, { parts: [{ itemCode: 'NO-SUCH', qty: '1' }] });
    expect(bad).toMatchObject({ status: 400, body: { errors: [{ field: 'parts[0].itemCode' }] } });
    const ok = await api.call<Job>('POST', `service/jobs/${made.body.id}/record`, 'ADM', { version: (await job(made.body.id)).version, result: 'COMPLETE', paidStatus: 'NO_CHARGE', parts: [{ itemCode: 'CH-DIN-01', qty: '1' }] });
    expect(ok.body).toMatchObject({ stage: 'DONE', parts: [{ itemCode: 'CH-DIN-01', qty: '1.0000' }] });
    // A warranty job registers nothing new.
    expect((await list()).statusCounts.all).toBe(1);
    expect((await api.get<{ items: { code: string }[] }>('service/lookups/items?q=CH-DIN')).items.map((i) => i.code)).toContain('CH-DIN-01');
  });

  it('rejects a claim with a reason, which cancels the job; charges with a reason; and takes none on a void unit', async () => {
    const a = await api.call<Job>('POST', `service/warranties/${unit.id}/job`, 'ADM', { problem: 'Scratches' });
    expect(await api.call('POST', `service/jobs/${a.body.id}/assess`, 'ADM', { version: a.body.version, result: 'REJECTED' })).toMatchObject({ status: 400, body: { errors: [{ field: 'note' }] } });
    const rejected = await api.call<Job>('POST', `service/jobs/${a.body.id}/assess`, 'ADM', { version: a.body.version, result: 'REJECTED', note: 'Caused by the customer' });
    expect(rejected.body).toMatchObject({ stage: 'CANCELLED', cancelReason: 'Warranty claim rejected: Caused by the customer' });

    await api.prisma.svcWarranty.update({ where: { id: unit.id }, data: { endOn: new Date('2026-09-01T00:00:00.000Z') } });
    expect((await list('?status=expired')).items).toHaveLength(1);
    const b = await api.call<Job>('POST', `service/warranties/${unit.id}/job`, 'ADM', { problem: 'Loose again' });
    expect(b.body.warranty).toMatchObject({ suggested: 'CHARGEABLE', unit: { state: 'EXPIRED' } });
    const charged = await api.call<Job>('POST', `service/jobs/${b.body.id}/assess`, 'ADM', { version: b.body.version, result: 'CHARGEABLE', note: 'Out of warranty' });
    expect(charged.body).toMatchObject({ stage: 'NOT_BOOKED', warranty: { assessment: 'CHARGEABLE' } });

    const w = (await list()).items[0]!;
    expect((await api.call('POST', `service/warranties/${w.id}/void`, 'ADM', { version: w.version })).status).toBe(400);
    expect((await api.call<Warranty>('POST', `service/warranties/${w.id}/void`, 'ADM', { version: w.version, reason: 'Moved to another site' })).body.state).toBe('VOID');
    expect(await api.call('POST', `service/warranties/${w.id}/job`, 'ADM', { problem: 'x' })).toMatchObject({ status: 409, body: { code: 'WARRANTY_VOID' } });
  });
});
