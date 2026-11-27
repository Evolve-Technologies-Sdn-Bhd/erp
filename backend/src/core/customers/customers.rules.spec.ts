import {
  duplicateReasons,
  isSameCustomer,
  nameKey,
  sameAddress,
  sameCustomerMessage,
  activationGaps,
  addedFromOrderMessage,
  creditTermText,
  customerFromOrder,
  eInvoiceGap,
  ENQUIRY_NO,
  limitError,
  permissionsNeeded,
  phoneInUseMessage,
  phoneKey,
  setupProblemMessage,
  statusActions,
} from './customers.rules';

describe('permissionsNeeded', () => {
  it('asks the credit permission for credit fields and the edit permission for the rest', () => {
    expect(permissionsNeeded(['creditLimit'])).toEqual({ credit: true, details: false });
    expect(permissionsNeeded(['phone'])).toEqual({ credit: false, details: true });
    expect(permissionsNeeded(['overdueLimit', 'priceListCode'])).toEqual({ credit: true, details: true });
    expect(permissionsNeeded([])).toEqual({ credit: false, details: false });
  });
});

describe('activationGaps', () => {
  it('asks for name, branch, price list and credit term (rule 5)', () => {
    expect(activationGaps({ name: 'Hotel Seri Bayu', branchCode: 'HQ', priceListCode: 'STD-2026', creditTermDays: 30 })).toEqual([]);
    expect(activationGaps({ name: '', branchCode: '', priceListCode: '', creditTermDays: null }).map((g) => g.field)).toEqual(['name', 'branchCode', 'priceListCode', 'creditTermDays']);
  });
});

describe('limitError', () => {
  it('takes 0 or more, or empty for no limit', () => {
    expect(limitError(null, 'Credit limit')).toBeNull();
    expect(limitError('0', 'Credit limit')).toBeNull();
    expect(limitError('-1', 'Overdue limit')).toBe('Overdue limit cannot be below 0. Leave it empty for no limit.');
  });
});

describe('statusActions', () => {
  it('lets a prospect become a customer or be blocked', () => {
    expect(statusActions('ACTIVE')).toEqual(['block']);
    expect(statusActions('BLOCKED')).toEqual(['activate']);
    expect(statusActions('PROSPECT')).toEqual(['activate', 'block']);
  });
});

describe('eInvoiceGap', () => {
  it('says what e-Invoices would miss, and nothing for the cash customer', () => {
    expect(eInvoiceGap({ isCash: false, tin: 'C20881234050', idNumber: null })).toBe('No ID number yet. e-Invoices need it with the TIN.');
    expect(eInvoiceGap({ isCash: false, tin: null, idNumber: null })).toBe('No TIN or ID number yet. e-Invoices with this customer need both.');
    expect(eInvoiceGap({ isCash: false, tin: 'C1', idNumber: '201901012345' })).toBeNull();
    expect(eInvoiceGap({ isCash: true, tin: null, idNumber: null })).toBeNull();
  });
});

describe('ENQUIRY_NO and creditTermText', () => {
  it('reads Sales enquiry numbers and writes credit terms', () => {
    expect(ENQUIRY_NO.test('EQ-2609-0010')).toBe(true);
    expect(ENQUIRY_NO.test('EQ-L-0302')).toBe(false);
    expect(creditTermText(0)).toBe('Cash');
    expect(creditTermText(30)).toBe('30 days');
  });
});

describe('customers added by salespeople from an order (phase 5)', () => {
  it('matches the same phone however it is typed', () => {
    expect(phoneKey('+60 12-345 6789')).toBe('0123456789');
    expect(phoneKey('6012 3456789')).toBe('0123456789');
    expect(phoneKey('012-345 6789')).toBe('0123456789');
    expect(phoneKey('+60 3-2280 1188')).toBe('0322801188');
    expect(phoneKey('06-282 1234')).toBe('062821234');
    expect(phoneKey(null)).toBe('');
  });

  it('makes an active cash customer with no credit limit, on the cash customer’s price list', () => {
    const c = customerFromOrder(
      { name: ' Tan Mei Ling ', phone: '012-345 6789', address: ' 12 Jalan Mawar, Johor Bahru ', email: '', idNumber: '900101-01-1234', branchCode: 'HQ', agentCode: 'AR' },
      { priceListCode: 'STD-2026' },
    );
    expect(c).toMatchObject({
      name: 'Tan Mei Ling', contactName: 'Tan Mei Ling', phone: '012-345 6789',
      billingAddress: '12 Jalan Mawar, Johor Bahru', deliveryAddress: '12 Jalan Mawar, Johor Bahru',
      email: null, idType: 'NRIC', idNumber: '900101-01-1234', tin: null,
      branchCode: 'HQ', defaultAgentCode: 'AR', priceListCode: 'STD-2026', taxMode: 'EXCLUSIVE',
      creditTermDays: 0, creditLimit: null, overdueLimit: null, creditScope: null, category: null, area: null,
    });
    expect(customerFromOrder({ name: 'A', phone: '0123456789', address: 'B', email: null, idNumber: null, branchCode: 'HQ', agentCode: null }, { priceListCode: 'P' }))
      .toMatchObject({ idType: null, idNumber: null, defaultAgentCode: null });
  });

  it('says which customer has the phone already, and where to go when Core is not set up', () => {
    expect(phoneInUseMessage('C-0012')).toBe('C-0012 already has this phone number. Pick that customer on the order, or ask the office if it is someone else.');
    expect(addedFromOrderMessage('C-0103', 'Aina Rahman')).toBe('Customer C-0103 added by Aina Rahman from a sales order, to be completed by the office');
    expect(setupProblemMessage(['Pick the credit term from the list.'])).toBe('This customer cannot be added from an order yet: Pick the credit term from the list. Ask the office to check Core.');
  });
});

describe('duplicate customers (phase 5)', () => {
  const on = { name: 'Mr. Tan Ah Kow', phone: '012-345 6789', deliveryAddress: 'No. 12, Jalan Mawar 3, Taman Bunga, 81200 Johor Bahru', billingAddress: null };

  it('reads a name without its title, case or punctuation', () => {
    expect(nameKey('Mr. Tan  Ah-Kow')).toBe('tan ah kow');
    expect(nameKey('PUAN Siti Aminah')).toBe('siti aminah');
    expect(nameKey('Dato Sri Lee')).toBe('sri lee');
  });

  it('knows the same address typed two ways, and a different postcode', () => {
    expect(sameAddress('12 Jln Mawar 3, Tmn Bunga, 81200 Johor Bahru', on.deliveryAddress)).toBe(true);
    expect(sameAddress('12 Jalan Mawar 3, Taman Bunga, 81300 Johor Bahru', on.deliveryAddress)).toBe(false);
    expect(sameAddress('14 Jalan Melati, Taman Sri, 81200 Johor Bahru', on.deliveryAddress)).toBe(false);
    expect(sameAddress('Johor', on.deliveryAddress)).toBe(false);
  });

  it('matches on the phone, the name and the address', () => {
    expect(duplicateReasons({ name: 'Ah Kow', phone: '+60 12-345 6789', address: 'Somewhere else 1 2' }, on)).toEqual(['PHONE']);
    expect(duplicateReasons({ name: 'tan ah kow', phone: '019-000 0000', address: '12 Jln Mawar 3 Tmn Bunga 81200 Johor Bahru' }, on)).toEqual(['NAME', 'ADDRESS']);
    expect(duplicateReasons({ name: 'Tan Mei Ling', phone: '019-000 0000', address: '12 Jalan Mawar 3, Taman Bunga, 81200 Johor Bahru' }, on)).toEqual(['ADDRESS']);
    expect(duplicateReasons({ name: 'Lim', phone: '019-000 0000', address: 'Lot 5, Jalan Kenari, 50000 KL' }, on)).toEqual([]);
  });

  it('treats the phone, or the name with the address, as the same customer; the rest as a maybe', () => {
    expect(isSameCustomer(['PHONE'])).toBe(true);
    expect(isSameCustomer(['NAME', 'ADDRESS'])).toBe(true);
    expect(isSameCustomer(['ADDRESS'])).toBe(false);
    expect(isSameCustomer(['NAME'])).toBe(false);
  });

  it('says whose customer it is and what to do', () => {
    expect(sameCustomerMessage({ code: 'C-0012', name: 'Tan Ah Kow', agentName: 'Aina Rahman', mine: false }, ['NAME', 'ADDRESS'])).toBe(
      'Tan Ah Kow (C-0012) is already a customer of Aina Rahman: same name and address. Ask to take them over, or ask the office if it is someone else.',
    );
    expect(sameCustomerMessage({ code: 'C-0012', name: 'Tan Ah Kow', agentName: 'Aina Rahman', mine: true }, ['PHONE'])).toBe(
      'Tan Ah Kow (C-0012) is already your customer: same phone number. Pick them on the order instead.',
    );
  });
});
