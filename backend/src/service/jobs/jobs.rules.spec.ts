import { allowedJobActions, manualJobErrors, readReleasedOrder, shortDay, waitingText } from './jobs.rules';

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
      soNo: 'SO-0009', branchCode: 'HQ', customerCode: 'C-0078', customerName: 'Klinik Sihat Jaya', contactName: 'Dr. Nurul Huda',
      deliveryAddress: 'No. 12, Jalan Sihat 3, 40000 Shah Alam', preferredDate: '2026-10-01', afterStock: false,
      lines: [{ itemCode: 'TB-DIN-06', uomCode: 'PCS', qty: '1.0000' }, { itemCode: 'CH-DIN-01', uomCode: 'PCS', qty: '6.0000' }],
    });
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
  it('lets the office change or cancel only a job not booked yet', () => {
    expect(allowedJobActions('NOT_BOOKED', true)).toEqual(['edit', 'cancel']);
    expect(allowedJobActions('BOOKED', true)).toEqual([]);
    expect(allowedJobActions('CANCELLED', true)).toEqual([]);
    expect(allowedJobActions('NOT_BOOKED', false)).toEqual([]);
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
