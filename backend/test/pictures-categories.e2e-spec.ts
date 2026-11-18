import { reseed, startApi, type Api } from './e2e-helpers';

type Change = { field: string; label: string; from: string | null; to: string | null };
type Activity = { message: string };
interface Pkg { id: string; code: string; version: number; category: string | null; terms: string | null; pictureId: string | null; pictureUrl: string | null; activity: Activity[] }
interface Entry { id: string; name: string; version: number; usedBy: string; refusals: { delete?: string } }
type Detail = Record<string, unknown> & { id: string; version: number; pictureId: string | null; pictureUrl: string | null; conversions: { fromUom: string; toUom: string; factor: string }[]; activity: Activity[] };

/**
 * Pictures, categories and terms for picking packages and items (phase 5). No flow changes: a package still goes on
 * an order the same way; Core keeps a picture, a category from its own reference list and the terms, and the Sales
 * pickers show them. Package codes take @ and up to 30 characters, as codes kept from another system have.
 */
describe('Pictures, package categories and terms (end to end)', () => {
  let api: Api;
  let picture: string;
  let pkg: Pkg;
  let orderId: string;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  /** Uploads a file the way the picture field does, and gives its id. */
  const upload = async (fileName: string, type: string, bytes: Uint8Array) => {
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), fileName);
    form.append('kind', 'PICTURE');
    const res = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': 'ADM' }, body: form });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };
  const png = () => Uint8Array.from(Buffer.from(PNG, 'base64'));
  const categories = async () => (await api.get<{ lists: Record<string, Entry[]> }>('core/reference')).lists['package-categories']!;

  const CODE = 'SET@3Y@FG@INSTALL@CONDO';
  const body = {
    code: CODE.toLowerCase(),
    name: 'Dining set, 6-seater, installed',
    uomCode: 'SET',
    salesTaxCode: 'SST10',
    priceListCode: 'STD-2026',
    packagePrice: '2700.00',
    giftRule: 'CHOOSE_ONE',
    runsFrom: '2026-09-01',
    runsUntil: '2026-12-31',
    items: [
      { itemCode: 'TB-DIN-06', qty: '1', uomCode: 'PCS' },
      { itemCode: 'CH-DIN-01', qty: '6', uomCode: 'PCS' },
    ],
    gifts: [
      { itemCode: 'CU-SET-02', qty: '1', uomCode: 'SET' },
      { itemCode: 'CH-KID-01', qty: '1', uomCode: 'PCS' },
    ],
  };
  const TERMS = 'Includes delivery and assembly.\n3 years warranty on the table, 1 year on the chairs.';

  it('keeps package categories in Core’s reference lists', async () => {
    expect(await categories()).toEqual([]);
    for (const name of ['Outdoor', 'Indoor']) expect((await api.call('POST', 'core/reference/package-categories', 'ADM', { name })).status).toBe(201);
    expect((await categories()).map((c) => [c.name, c.usedBy])).toEqual([['Indoor', 'Not used'], ['Outdoor', 'Not used']]);
    expect((await api.get<{ packageCategories: string[] }>('core/lookups/item-form')).packageCategories).toEqual(['Indoor', 'Outdoor']);
  });

  it('refuses a category not on the list, a picture that is not one, and a code over 30', async () => {
    const pdf = await upload('quote.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.4\n%%EOF\n'));
    const r = await api.call<{ errors: { field: string; message: string }[] }>('POST', 'core/packages', 'ADM', { ...body, category: 'Garden', pictureId: pdf });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual(expect.arrayContaining([
      { field: 'category', message: 'Pick the category from the list.' },
      { field: 'pictureId', message: 'A picture must be a JPG, PNG or WEBP file.' },
    ]));
    const long = await api.call<{ errors: { field: string; message: string }[] }>('POST', 'core/packages', 'ADM', { ...body, code: 'A'.repeat(31) });
    expect(long.body.errors).toEqual([{ field: 'code', message: 'Use capitals, digits, dashes and @, like PK-DIN-06 or SET@2Y@FG (up to 30).' }]);
  });

  it('makes a package with an @ code, a category, terms and a picture, logged', async () => {
    picture = await upload('dining-poster.png', 'image/png', png());
    const r = await api.call<Pkg>('POST', 'core/packages', 'ADM', { ...body, category: 'Indoor', terms: TERMS, pictureId: picture });
    expect(r.status).toBe(201);
    pkg = r.body;
    expect(pkg).toMatchObject({ code: CODE, category: 'Indoor', terms: TERMS, pictureId: picture, pictureUrl: `/attachments/${picture}/download` });
    const created = await api.prisma.sysActivity.findFirstOrThrow({ where: { entityId: pkg.id, action: 'created' } });
    const changes = (created.data as { changes: Change[] }).changes;
    expect(changes).toEqual(expect.arrayContaining([
      { field: 'category', label: 'Category', from: null, to: 'Indoor' },
      { field: 'picture', label: 'Picture', from: null, to: 'dining-poster.png' },
    ]));
    expect(await api.prisma.sysAttachment.findUniqueOrThrow({ where: { id: picture } })).toMatchObject({ entityType: 'MDM_PACKAGE', entityId: pkg.id });
    const listed = await api.get<{ items: { code: string; category: string | null; pictureUrl: string | null }[] }>('core/packages');
    expect(listed.items.find((p) => p.code === CODE)).toMatchObject({ category: 'Indoor', pictureUrl: `/attachments/${picture}/download` });
  });

  it('counts the package against its category, so the category cannot be deleted', async () => {
    const indoor = (await categories()).find((c) => c.name === 'Indoor')!;
    expect(indoor.usedBy).toBe('1 package');
    expect(await api.call('DELETE', `core/reference/package-categories/${indoor.id}?version=${indoor.version}`, 'ADM')).toMatchObject({
      status: 409,
      body: { message: '“Indoor” is used by 1 package, so it cannot be deleted. Make it inactive instead.' },
    });
  });

  it('keeps the category, terms and picture when a save does not send them, and a picture cannot move to another record', async () => {
    const { code: _code, ...rest } = body;
    const kept = await api.call<Pkg>('PATCH', `core/packages/${pkg.id}`, 'ADM', { ...rest, packagePrice: '2650.00', version: pkg.version });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ category: 'Indoor', terms: TERMS, pictureId: picture });
    pkg = kept.body;
    const other = await api.call<{ errors: { field: string; message: string }[] }>('POST', 'core/packages', 'ADM', { ...body, code: 'PK-OTHER-01', pictureId: picture });
    expect(other.body.errors).toEqual([{ field: 'pictureId', message: 'This file belongs to another record. Upload the picture again.' }]);
  });

  it('shows the picture, category and terms when a salesperson picks, and the long code goes on the order', async () => {
    const offered = await api.get<{ items: { code: string; category: string | null; terms: string | null; pictureUrl: string | null }[] }>('sales/lookups/packages?date=2026-09-29', 'AR');
    expect(offered.items.find((p) => p.code === CODE)).toMatchObject({ category: 'Indoor', terms: TERMS, pictureUrl: `/attachments/${picture}/download` });
    const file = await api.call<unknown>('GET', `attachments/${picture}/download`, 'AR');
    expect(file.status).toBe(200);

    const order = await api.call<{ id: string }>('POST', 'sales/orders', 'AR', {
      customerCode: 'C-0102',
      lines: [{ packageCode: CODE, qty: '1', giftItemCode: 'CH-KID-01' }],
    });
    expect(order.status).toBe(201);
    orderId = order.body.id;
    const lines = await api.prisma.salSalesOrderLine.findMany({ where: { salesOrderId: order.body.id }, select: { itemCode: true, packageCode: true } });
    expect(lines.map((l) => [l.itemCode, l.packageCode]).sort()).toEqual([['CH-DIN-01', CODE], ['CH-KID-01', CODE], ['TB-DIN-06', CODE]]);
    // The order keeps the package's terms for its printout.
    const detail = await api.get<{ lines: { package: { code: string; terms: string | null } | null }[] }>(`sales/orders/${orderId}`, 'AR');
    expect(detail.lines.map((l) => l.package?.terms)).toEqual([TERMS, TERMS, TERMS]);
  });

  it('takes the picture off, logged with the file name', async () => {
    const { code: _code, ...rest } = body;
    const off = await api.call<Pkg>('PATCH', `core/packages/${pkg.id}`, 'ADM', { ...rest, packagePrice: '2650.00', category: 'Indoor', terms: TERMS, pictureId: null, version: pkg.version });
    expect(off.body).toMatchObject({ pictureId: null, pictureUrl: null });
    expect(off.body.activity[0]!.message).toBe('Picture: dining-poster.png → —');
    pkg = off.body;
  });

  it('keeps the terms the order was made with when the package changes later', async () => {
    const { code: _code, ...rest } = body;
    const changed = await api.call<Pkg>('PATCH', `core/packages/${pkg.id}`, 'ADM', { ...rest, packagePrice: '2650.00', category: 'Indoor', terms: '1 year warranty only.', version: pkg.version });
    expect(changed.body.terms).toBe('1 year warranty only.');
    const order = await api.get<{ status: string; lines: { package: { terms: string | null } | null }[] }>(`sales/orders/${orderId}`, 'AR');
    expect(order.status).toBe('DRAFT');
    // A draft refreshes them on its next save; until then, and always once released, it keeps its own.
    expect(order.lines[0]!.package!.terms).toBe(TERMS);
  });

  it('gives an item a picture, which the Add item dialog shows', async () => {
    const ITEM = ['name', 'itemGroup', 'type', 'baseUom', 'barcode', 'einvoiceClassification', 'isPurchasable', 'isBuyToOrder', 'purchaseUom', 'purchaseTaxCode', 'preferredSupplierCode', 'reorderLevel', 'packSize', 'isSellable', 'salesUom', 'salesTaxCode', 'standardCost', 'serviceIntervalMonths'];
    const id = (await api.get<{ items: { id: string; code: string }[] }>('core/items?q=TB-DIN-06')).items.find((i) => i.code === 'TB-DIN-06')!.id;
    const before = await api.get<Detail>(`core/items/${id}`);
    expect(before.pictureUrl).toBeNull();
    const photo = await upload('table.png', 'image/png', png());
    const saved = await api.call<Detail>('PATCH', `core/items/${id}`, 'ADM', {
      ...Object.fromEntries(ITEM.map((k) => [k, before[k]])),
      conversions: before.conversions.map(({ fromUom, toUom, factor }) => ({ fromUom, toUom, factor })),
      pictureId: photo,
      version: before.version,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ pictureId: photo, pictureUrl: `/attachments/${photo}/download` });
    expect(saved.body.activity[0]!.message).toBe('Changed picture (blank) → table.png');
    const offered = await api.get<{ items: { code: string; pictureUrl: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=TB-DIN-06', 'AR');
    expect(offered.items.find((i) => i.code === 'TB-DIN-06')!.pictureUrl).toBe(`/attachments/${photo}/download`);
    // An item without a picture looks as before.
    const plain = await api.get<{ items: { code: string; pictureUrl: string | null }[] }>('sales/lookups/items?customerCode=C-0102&q=CH-DIN-01', 'AR');
    expect(plain.items.find((i) => i.code === 'CH-DIN-01')!.pictureUrl).toBeNull();
  });
});
