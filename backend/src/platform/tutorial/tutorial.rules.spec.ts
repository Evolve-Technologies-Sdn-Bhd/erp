import { cleanTutorial, DEFAULT_TUTORIAL, MAX_DONE, readTutorial, TOUR_ID } from './tutorial.rules';

describe('tutorial rules', () => {
  it('starts a person with no row on Tutorial mode, nothing seen and nothing finished', () => {
    expect(readTutorial(null)).toEqual({ mode: true, welcomeSeen: false, done: [], active: null });
    // A fresh copy each time: changing one person's answer never changes the default.
    readTutorial(null).done.push('welcome');
    expect(DEFAULT_TUTORIAL.done).toEqual([]);
  });

  it('reads a saved row, dropping anything it cannot read instead of failing the page', () => {
    const row = {
      mode: false,
      welcomeSeen: true,
      done: ['welcome', 'welcome', 'Bad Id', 42, 'sales.order.create'],
      active: { tourId: 'welcome', step: 3, path: '/sales/orders', paused: true },
    };
    expect(readTutorial(row)).toEqual({
      mode: false,
      welcomeSeen: true,
      done: ['welcome', 'sales.order.create'],
      active: { tourId: 'welcome', step: 3, path: '/sales/orders', paused: true },
    });
    expect(readTutorial({ ...row, done: 'welcome' }).done).toEqual([]);
    expect(readTutorial({ ...row, active: { tourId: 'welcome', step: -1, path: '/x', paused: false } }).active).toBeNull();
    expect(readTutorial({ ...row, active: { tourId: 'welcome', step: 1, path: 'https://evil.example', paused: false } }).active).toBeNull();
    expect(readTutorial({ ...row, active: 'welcome' }).active).toBeNull();
    expect(readTutorial({ ...row, done: Array.from({ length: MAX_DONE + 5 }, (_, i) => `t${i}`) }).done).toHaveLength(MAX_DONE);
  });

  it('keeps each finished tour once, in the order finished', () => {
    expect(cleanTutorial({ mode: true, welcomeSeen: true, done: ['b', 'a', 'b'], active: null }).done).toEqual(['b', 'a']);
  });

  it('accepts tour ids like welcome and sales.order.create, nothing else', () => {
    for (const id of ['welcome', 'sales.order.create', 'purchase.po-approve', 'core.item2']) expect(TOUR_ID.test(id)).toBe(true);
    for (const id of ['Welcome', '.welcome', 'sales..order', 'sales.', 'a b', '', '1tour']) expect(TOUR_ID.test(id)).toBe(false);
  });
});
