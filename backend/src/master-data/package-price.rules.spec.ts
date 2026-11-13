import { packageRunsOn } from './package-price.rules';

describe('packageRunsOn', () => {
  const p = { runsFrom: '2026-09-01', runsUntil: '2026-12-31', endedOn: null };
  it('runs from its first day through its last day', () => {
    expect(packageRunsOn(p, '2026-08-31')).toBe(false);
    expect(packageRunsOn(p, '2026-09-01')).toBe(true);
    expect(packageRunsOn(p, '2026-12-31')).toBe(true);
    expect(packageRunsOn(p, '2027-01-01')).toBe(false);
  });
  it('runs through the day it was ended early, and with no last day for ever', () => {
    expect(packageRunsOn({ ...p, endedOn: '2026-09-29' }, '2026-09-29')).toBe(true);
    expect(packageRunsOn({ ...p, endedOn: '2026-09-29' }, '2026-09-30')).toBe(false);
    expect(packageRunsOn({ ...p, runsUntil: null }, '2030-01-01')).toBe(true);
  });
});
