import { allowedJobActions, bookingNeeds, manualJobErrors, missingForBooking, missingText, readReleasedOrder, shortDay, waitingText } from './jobs.rules';

// SO-0009 in FIELD_SALES_SEED_DATA.md, as Sales publishes it when released (F1 part 5).
const released = {
  soNo: 'SO-0009', branchCode: 'HQ', customerCode: 'C-0078', customerName: 'Klinik Sihat Jaya', contactName: 'Dr. Nurul Huda',
  deliveryAddress: 'No. 12, Jalan Sihat 3, 40000 Shah Alam',
  installation: { option: 'INSTALLATION', preferredDate: '2026-10-01', afterStock: false },
  lines: [{ lineNo: 1, itemCode: 'TB-DIN-06', uomCode: 'PCS', qty: '1.0000' }, { lineNo: 2, itemCode: 'CH-DIN-01', uomCode: 'PCS', qty: '6.0000' }],
};

describe('readReleasedOrder', () => {
  it('reads an order with installation', () => {
    expect(readReleasedOrder(released)).toEqual({
      soNo: 'SO-0009', revision: 1, agentCode: null, agentName: null, warehouseCode: null, branchCode: 'HQ', customerCode: 'C-0078', customerName: 'Klinik Sihat Jaya', contactName: 'Dr. Nurul Huda',
      deliveryAddress: 'No. 12, Jalan Sihat 3, 40000 Shah Alam', postcode: null, state: null, preferredDate: '2026-10-01', afterStock: false, siteType: null, category: null, contactPhone: null,
      lines: [{ itemCode: 'TB-DIN-06', uomCode: 'PCS', qty: '1.0000' }, { itemCode: 'CH-DIN-01', uomCode: 'PCS', qty: '6.0000' }],
    });
  });

  it('reads the install site the salesperson picked, and ignores one it does not know', () => {
    expect(readReleasedOrder({ ...released, installation: { ...released.installation, siteType: 'CONDO' } })).toMatchObject({ siteType: 'CONDO' });
    expect(readReleasedOrder({ ...released, installation: { ...released.installation, siteType: 'GARAGE' } })).toMatchObject({ siteType: null });
  });

  it('reads the job category and the phone given on the order', () => {
    expect(readReleasedOrder({ ...released, contactPhone: '012-345 6789', installation: { ...released.installation, category: 'COMBO' } })).toMatchObject({ category: 'COMBO', contactPhone: '012-345 6789' });
  });

  it('reads the postcode and state the order keeps with the installation', () => {
    expect(readReleasedOrder({ ...released, deliveryPostcode: '40000', deliveryState: 'Selangor' })).toMatchObject({ postcode: '40000', state: 'Selangor' });
    expect(readReleasedOrder({ ...released, deliveryPostcode: '', deliveryState: null })).toMatchObject({ postcode: null, state: null });
  });

  it('makes no job for delivery only, collect, a company that does not ask, or a payload it cannot read', () => {
    expect(readReleasedOrder({ ...released, installation: { option: 'COLLECT', preferredDate: null, afterStock: false } })).toBeNull();
    expect(readReleasedOrder({ ...released, installation: null })).toBeNull();
    expect(readReleasedOrder({ ...released, installation: undefined })).toBeNull();
    expect(readReleasedOrder({ soNo: 'SO-1' })).toBeNull();
    expect(readReleasedOrder(null)).toBeNull();
  });
});

describe('waitingText', () => {
  it('says what the customer asks for (SvcJobs.html)', () => {
    expect(waitingText({ preferredDate: '2026-10-01', afterStock: false })).toBe('Asks for Thu, 1 Oct');
    expect(waitingText({ preferredDate: null, afterStock: true })).toBe('After stock arrives');
    expect(waitingText({ preferredDate: null, afterStock: false })).toBe('—');
    expect(shortDay('2026-09-29')).toBe('Tue, 29 Sep');
  });
});

describe('allowedJobActions', () => {
  const all = { edit: true, book: true, record: true };
  it('follows the simple stages: not booked, booked, done, closed', () => {
    expect(allowedJobActions('NOT_BOOKED', all)).toEqual(['edit', 'cancel', 'book']);
    expect(allowedJobActions('BOOKED', all)).toEqual(['edit', 'cancel', 'book', 'unbook', 'extend', 'record']);
    expect(allowedJobActions('DONE', all)).toEqual(['close']);
    expect(allowedJobActions('DONE', all, { partial: true })).toEqual(['close', 'followUp']);
    expect(allowedJobActions('DONE', all, { partial: true, hasFollowUp: true })).toEqual(['close']);
    expect(allowedJobActions('CLOSED', all)).toEqual([]);
    expect(allowedJobActions('CANCELLED', all)).toEqual([]);
  });
  it('gives each permission only its own actions', () => {
    expect(allowedJobActions('NOT_BOOKED', { edit: false, book: true })).toEqual(['book']);
    expect(allowedJobActions('BOOKED', { edit: true, book: false })).toEqual(['edit', 'cancel']);
    expect(allowedJobActions('BOOKED', { edit: false, book: false, record: true })).toEqual(['record']);
    expect(allowedJobActions('NOT_BOOKED', { edit: false, book: false })).toEqual([]);
  });
});

describe('manualJobErrors', () => {
  it('needs a type and a site, and no date in the past', () => {
    expect(manualJobErrors({ jobType: 'SERVICE', siteAddress: 'Jalan 1', preferredDate: '2026-10-05' }, '2026-09-29')).toEqual([]);
    expect(manualJobErrors({ jobType: 'CLEANING', siteAddress: ' ', preferredDate: '2026-09-28' }, '2026-09-29')).toEqual([
      { field: 'jobType', message: 'Pick installation, service, warranty or repair.' },
      { field: 'siteAddress', message: 'Type the address the installer goes to.' },
      { field: 'preferredDate', message: 'The preferred date cannot be in the past.' },
    ]);
  });
});

describe('what the office needs before booking (warned, never blocked)', () => {
  const full = { customerName: 'Klinik Sihat Jaya', phone: '012-345 6789', siteAddress: 'No. 12, Jalan Sihat 3, Shah Alam', postcode: '40000', state: 'Selangor' };
  it('names what is missing, in the order the office fills it in', () => {
    expect(missingForBooking(full)).toEqual([]);
    expect(missingForBooking({ ...full, postcode: null, state: ' ' })).toEqual(['postcode', 'state']);
    expect(missingForBooking({ customerName: '', phone: null, siteAddress: null, postcode: null, state: null })).toEqual(['customer name', 'contact number', 'install address', 'postcode', 'state']);
  });
  it('says it in one line', () => {
    expect(missingText([])).toBeNull();
    expect(missingText(['state'])).toBe('Missing before booking: state.');
    expect(missingText(['contact number', 'postcode', 'state'])).toBe('Missing before booking: contact number, postcode and state.');
  });
  it('asks only while the job waits to be booked or is booked', () => {
    const lacking = { ...full, postcode: null };
    expect(bookingNeeds({ ...lacking, stage: 'NOT_BOOKED' })).toEqual({ missingForBooking: ['postcode'], missingText: 'Missing before booking: postcode.' });
    expect(bookingNeeds({ ...lacking, stage: 'BOOKED' }).missingForBooking).toEqual(['postcode']);
    expect(bookingNeeds({ ...lacking, stage: 'DONE' })).toEqual({ missingForBooking: [], missingText: null });
  });
});
