import { mayShare, orderShareText, whatsappNumber, type ShareOrder } from './share.rules';

describe('whatsappNumber', () => {
  it('takes a Malaysian number however it is typed', () => {
    for (const typed of ['012-345 6789', '0123456789', '+60 12-345 6789', '60123456789', '0060123456789', '(012) 345 6789']) {
      expect(whatsappNumber(typed)).toBe('60123456789');
    }
    expect(whatsappNumber('011-2345 6789')).toBe('601123456789');
  });

  it('keeps another country code, and takes the first of two numbers', () => {
    expect(whatsappNumber('+65 9123 4567')).toBe('6591234567');
    expect(whatsappNumber('65 9123 4567')).toBe('6591234567');
    expect(whatsappNumber('012-345 6789 / 07-123 4567')).toBe('60123456789');
    expect(whatsappNumber('012-345 6789 or 013-111 2222')).toBe('60123456789');
  });

  it('is null for what cannot be a phone number', () => {
    for (const bad of [null, undefined, '', 'ask office', '12345', '123456789', '+1']) expect(whatsappNumber(bad)).toBeNull();
  });
});

describe('orderShareText', () => {
  const order: ShareOrder = {
    company: 'CLB Groups', contactName: 'Puan Salmah', customerName: 'Salmah Household', docNo: 'SO-0051', revisionNo: 1, docDate: '2026-09-29',
    lines: [
      { itemName: 'Outdoor Dining Table', uomCode: 'PCS', qty: '1.0000', lineKind: 'PACKAGE', package: { group: 1, name: 'Dining Combo', uomCode: 'SET', qty: '1.0000' } },
      { itemName: 'Dining Chair', uomCode: 'PCS', qty: '4.0000', lineKind: 'PACKAGE', package: { group: 1, name: 'Dining Combo', uomCode: 'SET', qty: '1.0000' } },
      { itemName: 'Seat Cushion', uomCode: 'PCS', qty: '4.0000', lineKind: 'GIFT', package: { group: 1, name: 'Dining Combo', uomCode: 'SET', qty: '1.0000' } },
      { itemName: 'Bubble Wrap', uomCode: 'M', qty: '1.5000', lineKind: 'ITEM', package: null },
    ],
    total: '3190.00', installOption: 'INSTALLATION', installDate: '2026-10-01', afterStock: false,
  };

  it('lists a package once with its gift, the other items, the total and the installation', () => {
    expect(orderShareText(order)).toBe(
      [
        'Hello Puan Salmah,', '', 'Thank you for your order with CLB Groups.', '', 'Sales order: SO-0051', 'Date: 29 Sep 2026', '',
        '• Dining Combo × 1 SET', '   Free: Seat Cushion × 4 PCS', '• Bubble Wrap × 1.5 M', '', 'Total: RM 3,190.00', '',
        'Preferred installation: 1 Oct 2026', 'Our office will contact you to confirm the installation.',
      ].join('\n'),
    );
  });

  it('greets the customer when there is no contact, and names the revision', () => {
    const text = orderShareText({ ...order, contactName: ' ', revisionNo: 2 });
    expect(text).toContain('Hello Salmah Household,');
    expect(text).toContain('Sales order: SO-0051 (revision 2)');
  });

  it('says what the order asked for: after stock, delivery only, collect, or nothing', () => {
    expect(orderShareText({ ...order, installDate: null, afterStock: true })).toContain('Preferred installation: after the stock arrives');
    expect(orderShareText({ ...order, installDate: null })).toMatch(/Total: RM 3,190\.00\n\nOur office will contact you to confirm the installation\.$/);
    expect(orderShareText({ ...order, installOption: 'DELIVERY' })).toMatch(/Delivery only$/);
    expect(orderShareText({ ...order, installOption: 'COLLECT' })).toMatch(/To be collected$/);
    expect(orderShareText({ ...order, installOption: null })).toMatch(/Total: RM 3,190\.00$/);
  });
});

describe('mayShare', () => {
  it('needs the switch, the permission and a released order', () => {
    for (const status of ['RELEASED', 'PARTIAL', 'DONE']) expect(mayShare({ switchOn: true, status, canEdit: true })).toBe(true);
    for (const status of ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED']) expect(mayShare({ switchOn: true, status, canEdit: true })).toBe(false);
    expect(mayShare({ switchOn: false, status: 'RELEASED', canEdit: true })).toBe(false);
    expect(mayShare({ switchOn: true, status: 'RELEASED', canEdit: false })).toBe(false);
  });
});
