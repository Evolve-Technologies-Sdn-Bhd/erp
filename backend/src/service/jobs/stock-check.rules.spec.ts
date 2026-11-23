import { dueForCheck, hoursUntil, stockShort } from './stock-check.rules';

describe('stock check 24 hours before a booked installation', () => {
  const now = { date: '2026-09-29', minutes: 14 * 60 }; // Tue 29 Sep, 2 PM
  it('counts the hours to the slot and checks from 24 hours before it until it starts', () => {
    expect(hoursUntil({ jobDate: '2026-09-30', slotStart: 600 }, now)).toBe(20);
    expect(dueForCheck({ jobDate: '2026-09-30', slotStart: 600 }, now)).toBe(true); // tomorrow 10 AM
    expect(dueForCheck({ jobDate: '2026-09-30', slotStart: 960 }, now)).toBe(false); // tomorrow 4 PM: 26 hours away
    expect(dueForCheck({ jobDate: '2026-09-29', slotStart: 960 }, now)).toBe(true); // today 4 PM
    expect(dueForCheck({ jobDate: '2026-09-29', slotStart: 600 }, now)).toBe(false); // already started
  });
  it('names the stock items short, added up per item, and leaves out what is not stock', () => {
    expect(stockShort([
      { itemCode: 'CH-DIN-01', qty: '1.0000', onHand: '1.0000', isStock: true },
      { itemCode: 'CH-DIN-01', qty: '1.0000', onHand: '1.0000', isStock: true },
      { itemCode: 'SV-INS-01', qty: '1.0000', onHand: '0', isStock: false },
    ])).toBe('CH-DIN-01: 1 in stock, 2 needed');
    expect(stockShort([{ itemCode: 'TB-DIN-06', qty: '1', onHand: '4', isStock: true }])).toBeNull();
  });
});
