import { reviseRefusal, revisionApproval, revisionChanges, type RevisionContent } from './revision.rules';

const order = { docNo: 'SO-0012', status: 'RELEASED', isMigrated: false, moved: false, documents: [], purchaseOrderNo: null };

describe('reviseRefusal: until something acts on the order', () => {
  it('lets a released order with nothing made from it be revised', () => {
    expect(reviseRefusal(order)).toBeNull();
  });
  it('refuses once something is delivered, made or bought, and says what to do instead', () => {
    expect(reviseRefusal({ ...order, status: 'PARTIAL', moved: true })).toBe('Only a released order with nothing delivered can be revised. Cancel the undelivered balance of SO-0012 instead.');
    expect(reviseRefusal({ ...order, status: 'DRAFT' })).toMatch(/^Only a released order/);
    expect(reviseRefusal({ ...order, documents: [{ kind: 'delivery order', docNo: 'DO-0005' }] })).toBe(
      'SO-0012 already has a delivery order (DO-0005), so it can no longer be revised. Cancel the undelivered balance instead.',
    );
    expect(reviseRefusal({ ...order, purchaseOrderNo: 'PO-0007' })).toBe('SO-0012 has a buy-to-order line already on PO-0007, so it can no longer be revised. Cancel the undelivered balance instead.');
    expect(reviseRefusal({ ...order, isMigrated: true })).toBe('Migrated orders cannot be revised.');
  });
});

const base: RevisionContent = {
  contactName: 'Mr. Daniel Wong', deliveryAddress: 'No. 3, Jalan Damai', deliveryPostcode: '40150', deliveryState: 'Selangor', deliveryWantedBy: null,
  customerPoRef: null, project: null, remarks: null, installOption: 'INSTALLATION', installDate: '2026-10-01', total: '1580.50',
  lines: [
    { itemCode: 'TB-DIN-06', lineKind: 'ITEM', packageCode: null, packageQty: null, qty: '1.0000', unitPrice: '1450.0000', discountPct: '0.00' },
    { itemCode: 'CH-DIN-01', lineKind: 'ITEM', packageCode: null, packageQty: null, qty: '2.0000', unitPrice: '250.0000', discountPct: '0.00' },
  ],
  vouchers: [],
};

describe('revisionChanges: what a revision changed, in plain words', () => {
  it('finds nothing in an unchanged revision', () => {
    expect(revisionChanges(base, base)).toEqual({ changes: [], priceChanged: false, priceChanges: [] });
  });
  it('lists address, items and quantities; adding an item at its price is not a price change', () => {
    const after = {
      ...base, deliveryAddress: 'No. 5, Jalan Damai', total: '2030.50',
      lines: [{ ...base.lines[0]!, qty: '2.0000' }, { itemCode: 'FL-28', lineKind: 'ITEM', packageCode: null, packageQty: null, qty: '1.0000', unitPrice: '89.0000', discountPct: '0.00' }],
    };
    expect(revisionChanges(base, after)).toEqual({
      changes: ['Delivery address changed', 'TB-DIN-06 quantity 1 → 2', 'Added FL-28 × 1', 'Removed CH-DIN-01', 'Total 1,580.50 → 2,030.50'],
      priceChanged: false,
      priceChanges: [],
    });
  });
  it('calls a new price, a discount or a voucher a price change', () => {
    const after = {
      ...base, total: '1500.00',
      lines: [{ ...base.lines[0]!, unitPrice: '1400.0000' }, { ...base.lines[1]!, discountPct: '5.00' }],
      vouchers: [{ voucherNo: 'V-88', amount: '50.00' }],
    };
    const c = revisionChanges(base, after);
    expect(c.priceChanges).toEqual(['TB-DIN-06 price 1,450.00 → 1,400.00', 'CH-DIN-01 discount 0% → 5%', 'Voucher V-88 added (50.00 off)']);
    expect(c.priceChanged).toBe(true);
    expect(c.changes.at(-1)).toBe('Total 1,580.50 → 1,500.00');
  });
  it('treats a package as one entry and its gift on its own, priced by Core', () => {
    const pkg = (sets: string, gift: string): RevisionContent['lines'] => [
      { itemCode: 'TB-DIN-06', lineKind: 'PACKAGE', packageCode: 'PKG-HOME', packageQty: sets, qty: sets, unitPrice: '900.0000', discountPct: '0.00' },
      { itemCode: 'CH-DIN-01', lineKind: 'PACKAGE', packageCode: 'PKG-HOME', packageQty: sets, qty: sets, unitPrice: '300.0000', discountPct: '0.00' },
      { itemCode: gift, lineKind: 'GIFT', packageCode: 'PKG-HOME', packageQty: sets, qty: sets, unitPrice: '0.0000', discountPct: '0.00' },
    ];
    const c = revisionChanges({ ...base, lines: pkg('1', 'GF-MUG') }, { ...base, lines: pkg('2', 'GF-BAG') });
    expect(c.changes).toEqual(['Package PKG-HOME quantity 1 → 2', 'Added free gift GF-BAG × 2', 'Removed free gift GF-MUG']);
    expect(c.priceChanged).toBe(false);
  });
});

describe('revisionApproval: after booking or for a price change', () => {
  const none = { changes: [], priceChanged: false, priceChanges: [] };
  const address = { changes: ['Delivery address changed'], priceChanged: false, priceChanges: [] };
  const price = { changes: ['TB-DIN-06 price 1,450.00 → 1,400.00'], priceChanged: true, priceChanges: ['TB-DIN-06 price 1,450.00 → 1,400.00'] };
  it('lets an unchanged revision, or one before booking without a price change, go out directly', () => {
    expect(revisionApproval(2, none, 'Thu, 1 Oct')).toEqual({ needs: false, reason: null });
    expect(revisionApproval(2, address, null)).toEqual({ needs: false, reason: null });
  });
  it('asks the Sales Manager after booking or for a price change, saying why', () => {
    expect(revisionApproval(2, address, 'Thu, 1 Oct · 10 AM – 12 PM · Hafiz Rahman')).toEqual({
      needs: true, reason: 'Revision 2 made after the installer was booked (Thu, 1 Oct · 10 AM – 12 PM · Hafiz Rahman)',
    });
    expect(revisionApproval(3, price, null).reason).toBe('Revision 3 changes prices (TB-DIN-06 price 1,450.00 → 1,400.00)');
    expect(revisionApproval(2, price, 'Thu, 1 Oct').reason).toBe('Revision 2 made after the installer was booked (Thu, 1 Oct) and changes prices (TB-DIN-06 price 1,450.00 → 1,400.00)');
  });
});
