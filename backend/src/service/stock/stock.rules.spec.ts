import { deliveryDue, goesFirst, goodsOf, itemStock, notReady, partRefusal, shortText, signedByError, type BookedJob } from './stock.rules';

const job = (docNo: string, jobDate: string, slotStart: number, qty: string, warehouseCode = 'HQ-MAIN'): BookedJob => ({
  id: docNo, docNo, jobDate, slotStart, warehouseCode, items: [{ itemCode: 'TB-DIN-06', itemName: 'Dining table', qty, uomCode: 'PCS' }],
});
const stock = (n: string) => () => n;
const all = () => true;

describe('stock of booked jobs', () => {
  it('puts the earlier day, then the earlier slot, then the lower number first', () => {
    expect(goesFirst(job('JB-0009', '2026-10-01', 600, '1'), job('JB-0001', '2026-10-02', 540, '1'))).toBe(true);
    expect(goesFirst(job('JB-0001', '2026-10-01', 720, '1'), job('JB-0009', '2026-10-01', 600, '1'))).toBe(false);
    expect(goesFirst(job('JB-0001', '2026-10-01', 600, '1'), job('JB-0002', '2026-10-01', 600, '1'))).toBe(true);
  });

  it('leaves a later job what earlier jobs of the same warehouse do not need', () => {
    const first = job('JB-0001', '2026-10-01', 600, '3');
    const later = job('JB-0002', '2026-10-01', 720, '2');
    const elsewhere = job('JB-0003', '2026-09-30', 600, '9', 'PNG-MAIN');
    expect(itemStock(first, [first, later, elsewhere], stock('4'), all)).toMatchObject([{ needed: '3', earlier: '0', free: '4', short: false }]);
    const rows = itemStock(later, [first, later, elsewhere], stock('4'), all);
    expect(rows).toMatchObject([{ needed: '2', onHand: '4', earlier: '3', free: '1', short: true }]);
    expect(shortText(rows)).toBe('TB-DIN-06: 1 free (3 held by earlier jobs), 2 needed');
  });

  it('adds an item up once, never goes below 0, and leaves out items that are not stock', () => {
    const j = { ...job('JB-0001', '2026-10-01', 600, '1'), items: [...job('x', '', 0, '1').items, ...job('x', '', 0, '2').items, { itemCode: 'SVC', itemName: 'Fitting', qty: '1', uomCode: 'JOB' }] };
    const rows = itemStock(j, [job('JB-0000', '2026-09-30', 600, '9')], stock('2'), (c) => c !== 'SVC');
    expect(rows).toMatchObject([{ itemCode: 'TB-DIN-06', needed: '3', free: '0', short: true }]);
    expect(shortText(itemStock(job('JB-0001', '2026-10-01', 600, '3'), [], stock('1'), all))).toBe('TB-DIN-06: 1 in stock, 3 needed');
    expect(shortText([])).toBeNull();
  });

  it('is not ready when short, or not confirmed where the warehouse confirms', () => {
    expect(notReady({ confirms: false, confirmed: false, short: null })).toBeNull();
    expect(notReady({ confirms: false, confirmed: false, short: 'A: short' })).toBe('A: short');
    expect(notReady({ confirms: true, confirmed: false, short: null })).toBe('the warehouse has not confirmed the stock');
    expect(notReady({ confirms: true, confirmed: false, short: 'A: short' })).toBe('A: short');
    expect(notReady({ confirms: true, confirmed: true, short: 'A: short' })).toBeNull();
  });

  it('asks for a delivery order once, for a confirmed job of a sales order', () => {
    const due = { confirms: true, confirmed: true, salesOrderId: 'x', deliveryNo: null };
    expect(deliveryDue(due)).toBe(true);
    expect(deliveryDue({ ...due, confirms: false })).toBe(false);
    expect(deliveryDue({ ...due, confirmed: false })).toBe(false);
    expect(deliveryDue({ ...due, salesOrderId: null })).toBe(false);
    expect(deliveryDue({ ...due, deliveryNo: 'DO-0001' })).toBe(false);
  });

  it('never calls an item without a tag short, because nobody counts it', () => {
    const rows = itemStock(job('JB-0001', '2026-10-01', 600, '3'), [], stock('0'), all, () => false);
    expect(rows).toMatchObject([{ needed: '3', free: '0', short: false, counted: false }]);
    expect(shortText(rows)).toBeNull();
    expect(itemStock(job('JB-0001', '2026-10-01', 600, '3'), [], stock('0'), all)).toMatchObject([{ short: true, counted: true }]);
  });

  it('takes the unit of a claim only as an exchange, and the parts the warehouse added always', () => {
    const items = [{ code: 'TB-DIN-06', extra: false }, { code: 'SCREW', extra: true }];
    expect(goodsOf({ jobType: 'INSTALLATION', exchange: false, items })).toHaveLength(2);
    expect(goodsOf({ jobType: 'WARRANTY', exchange: false, items })).toEqual([items[1]]);
    expect(goodsOf({ jobType: 'WARRANTY', exchange: true, items })).toHaveLength(2);
  });

  it('needs who signed, and changes parts only before that', () => {
    expect(signedByError(' ')).toBe('Type who picked and signed.');
    expect(signedByError('Faris')).toBeNull();
    const j = { docNo: 'JB-0001', stage: 'BOOKED', confirmed: false };
    expect(partRefusal(j)).toBeNull();
    expect(partRefusal({ ...j, stage: 'DONE' })).toBe('JB-0001 is not booked.');
    expect(partRefusal({ ...j, confirmed: true })).toContain('picked already');
  });
});
