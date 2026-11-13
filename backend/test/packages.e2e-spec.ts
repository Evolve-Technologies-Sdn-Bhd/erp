import { reseed, startApi, type Api } from './e2e-helpers';

interface PackageDetail {
  id: string;
  code: string;
  name: string;
  status: string;
  packagePrice: string;
  normalValue: string;
  saves: string | null;
  priceWarning: string | null;
  items: { itemCode: string; qty: string; listPrice: string | null; unitPrice: string | null; amount: string | null }[];
  gifts: { itemCode: string; itemName: string; qty: string; uomCode: string }[];
  allowedActions: string[];
  refusals: Record<string, string>;
  activity: { message: string }[];
  version: number;
}

/**
 * Packages in Core (C15, C16; phase 5, F1 part 2): several items at one price with a free gift. The seed has no
 * packages, so the journey makes PK-DIN-06 from FIELD_SALES_SEED_DATA.md with seeded items, prices it from STD-2026
 * and checks the spread, the rules, the history and the event.
 */
describe('Packages (end to end)', () => {
  let api: Api;
  let id = '';
  let version = 0;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const dining = {
    code: 'pk-din-06',
    name: 'Dining set, 6-seater',
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
    // CH-KID-01 is not for sale on its own; a gift may still be one.
    gifts: [
      { itemCode: 'CU-SET-02', qty: '1', uomCode: 'SET' },
      { itemCode: 'CH-KID-01', qty: '1', uomCode: 'PCS' },
    ],
  };

  it('starts with no packages', async () => {
    const list = await api.get<{ total: number; statusCounts: Record<string, number> }>('core/packages', 'ADM');
    expect(list.total).toBe(0);
    expect(list.statusCounts).toEqual({ all: 0, running: 0, scheduled: 0, ended: 0 });
  });

  it('lets only someone who edits price lists make one', async () => {
    const r = await api.call('POST', 'core/packages', 'AR', dining);
    expect(r).toMatchObject({ status: 403, body: { message: 'Your role cannot do this. Permission needed: core.price_list.edit.' } });
  });

  it('refuses a package that breaks the rules, naming each problem', async () => {
    const r = await api.call('POST', 'core/packages', 'ADM', {
      ...dining,
      runsUntil: '2026-08-01',
      giftRule: 'CHOOSE_ONE',
      gifts: [{ itemCode: 'CU-SET-02', qty: '1', uomCode: 'SET' }],
      items: [
        { itemCode: 'CH-KID-01', qty: '1', uomCode: 'PCS' },
        { itemCode: 'TB-DIN-06', qty: '1', uomCode: 'BOX' },
      ],
    });
    expect(r.status).toBe(400);
    const errors = (r.body.errors as { field: string; message: string }[]).map((e) => `${e.field}: ${e.message}`);
    expect(errors).toEqual([
      'runsUntil: Runs until cannot be before Runs from.',
      'gifts: Add at least 2 gifts for the customer to choose from.',
      'items[0].itemCode: CH-KID-01 is not for sale.',
      'items[1].uomCode: TB-DIN-06 is not kept in BOX. Use PCS.',
    ]);
  });

  it('makes PK-DIN-06 and spreads its price over the items by list value', async () => {
    const r = await api.call<PackageDetail>('POST', 'core/packages', 'ADM', dining);
    expect(r.status).toBe(201);
    const p = r.body;
    expect(p).toMatchObject({ code: 'PK-DIN-06', status: 'RUNNING', packagePrice: '2700.00', normalValue: '2950.00', saves: '250.00', priceWarning: null });
    expect(p.items.map((i) => [i.itemCode, i.listPrice, i.unitPrice, i.amount])).toEqual([
      ['TB-DIN-06', '1450.00', '1327.1200', '1327.12'],
      ['CH-DIN-01', '250.00', '228.8133', '1372.88'],
    ]);
    expect(p.gifts.map((g) => `${g.itemCode} ${g.uomCode}`)).toEqual(['CU-SET-02 SET', 'CH-KID-01 PCS']);
    expect(p.allowedActions).toEqual(['edit', 'end', 'delete']);
    expect(p.activity[0]!.message).toBe('Package PK-DIN-06 created');
    id = p.id;
    version = p.version;

    const event = await api.prisma.sysOutbox.findFirst({ where: { name: 'mdm.package.updated', aggregateId: id } });
    expect(event?.payload).toMatchObject({ code: 'PK-DIN-06', created: true });
  });

  it('refuses the same code again', async () => {
    const r = await api.call('POST', 'core/packages', 'ADM', dining);
    expect(r).toMatchObject({ status: 400, body: { errors: [{ field: 'code', message: 'PK-DIN-06 is already the code of Dining set, 6-seater.' }] } });
  });

  it('lists it under Running, with what the customer saves', async () => {
    const list = await api.get<{ items: { code: string; itemsText: string; normalValue: string; saves: string; giftText: string; statusLabel: string }[]; statusCounts: Record<string, number> }>('core/packages?status=running', 'AR');
    expect(list.statusCounts).toEqual({ all: 1, running: 1, scheduled: 0, ended: 0 });
    expect(list.items[0]).toMatchObject({ code: 'PK-DIN-06', itemsText: '1 × TB-DIN-06 PCS, 6 × CH-DIN-01 PCS', normalValue: '2950.00', saves: '250.00', giftText: 'Choose 1 of 2', statusLabel: 'Running' });
  });

  it('records a price change with before and after', async () => {
    const r = await api.call<PackageDetail>('PATCH', `core/packages/${id}`, 'ADM', { ...dining, packagePrice: '2650.00', version });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ packagePrice: '2650.00', saves: '300.00' });
    expect(r.body.activity[0]!.message).toBe('Package price: 2700.00 → 2650.00');
    version = r.body.version;
  });

  it('refuses a save from an old copy', async () => {
    const r = await api.call('PATCH', `core/packages/${id}`, 'ADM', { ...dining, version: version - 1 });
    expect(r.status).toBe(409);
  });

  it('ends a running package; an ended one is kept as it was', async () => {
    const r = await api.call<PackageDetail>('POST', `core/packages/${id}/end`, 'ADM', { version });
    expect(r.status).toBe(201);
    // It runs through today (29 Sep in the demo) and has ended from tomorrow.
    expect(r.body.status).toBe('RUNNING');
    expect(r.body.allowedActions).toEqual(['edit', 'delete']);
    expect(r.body.refusals.end).toBe('PK-DIN-06 was ended already. Today is its last day.');
    expect(r.body.activity[0]!.message).toBe('Package PK-DIN-06 ended. Today is its last day.');
    version = r.body.version;
  });

  it('deletes it, and its code is never used again', async () => {
    const r = await api.call('DELETE', `core/packages/${id}?version=${version}`, 'ADM');
    expect(r).toMatchObject({ status: 200, body: { deleted: true, code: 'PK-DIN-06' } });
    expect(await api.prisma.mdmPackageItem.count({ where: { packageCode: 'PK-DIN-06' } })).toBe(0);
    const again = await api.call('POST', 'core/packages', 'ADM', dining);
    expect(again).toMatchObject({ status: 400, body: { errors: [{ field: 'code', message: 'PK-DIN-06 belonged to a package that was deleted. Codes are never used again.' }] } });
  });
});
