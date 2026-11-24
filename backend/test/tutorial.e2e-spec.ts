import { reseed, startApi, type Api } from './e2e-helpers';

/**
 * Guided tours (Help): each person's Tutorial mode, welcome, finished tours and a tour left mid-way, saved on the
 * server so it follows them to any computer, kept apart per person, checked, and never written to the activity log.
 */
describe('Guided tours: saved per person (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const fresh = { mode: true, welcomeSeen: false, done: [], active: null };

  it('treats everyone as a first-time user after the seed', async () => {
    expect(await api.get('me/tutorial', 'LMY')).toEqual(fresh);
    expect(await api.get('me/tutorial', 'AZ')).toEqual(fresh);
  });

  it('saves one person’s tours without touching anyone else’s, and writes no activity line', async () => {
    const before = await api.prisma.sysActivity.count();
    const state = { mode: true, welcomeSeen: true, done: ['welcome'], active: { tourId: 'welcome', step: 4, path: '/purchase/orders?status=draft', paused: true } };
    const saved = await api.call('PUT', 'me/tutorial', 'LMY', state);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(state);
    expect(await api.get('me/tutorial', 'LMY')).toEqual(state);
    expect(await api.get('me/tutorial', 'AZ')).toEqual(fresh);
    expect(await api.prisma.sysActivity.count()).toBe(before);

    // Finishing the paused tour clears it; a tour finished twice is kept once.
    const finished = await api.call('PUT', 'me/tutorial', 'LMY', { ...state, done: ['welcome', 'welcome'], active: null });
    expect(finished.body).toEqual({ ...state, done: ['welcome'], active: null });
  });

  it('has no guide words on the standard demo: the guides use neutral ones', async () => {
    expect(await api.get('me/tutorial/guide-values', 'LMY')).toEqual({ values: {} });
  });

  it('turns Tutorial mode off and keeps it off', async () => {
    await api.call('PUT', 'me/tutorial', 'AZ', { mode: false, welcomeSeen: true, done: [], active: null });
    expect(await api.get('me/tutorial', 'AZ')).toMatchObject({ mode: false, welcomeSeen: true });
  });

  it('refuses a broken state with the field that is wrong', async () => {
    const bad = async (body: unknown) => {
      const res = await api.call<{ errors: { field: string }[] }>('PUT', 'me/tutorial', 'LMY', body);
      expect(res.status).toBe(400);
      return res.body.errors.map((e) => e.field);
    };
    expect(await bad({ ...fresh, done: ['Not A Tour'] })).toContain('done');
    expect(await bad({ ...fresh, mode: 'yes' })).toContain('mode');
    expect(await bad({ ...fresh, active: { tourId: 'welcome', step: -1, path: '/', paused: false } })).toContain('active.step');
    expect(await bad({ ...fresh, active: { tourId: 'welcome', step: 1, path: 'https://elsewhere.example', paused: false } })).toContain('active.path');
    expect(await bad({ ...fresh, done: Array.from({ length: 201 }, (_, i) => `tour${i}`) })).toContain('done');
    // Unknown fields are dropped, not saved.
    const res = await api.call('PUT', 'me/tutorial', 'RAH', { ...fresh, welcomeSeen: true, sneaky: 'x' });
    expect(res.body).toEqual({ ...fresh, welcomeSeen: true });
  });

  it('puts a person back to first time with Reset my progress', async () => {
    const res = await api.call('DELETE', 'me/tutorial', 'LMY');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fresh);
    expect(await api.get('me/tutorial', 'AZ')).toMatchObject({ mode: false });
  });
});
