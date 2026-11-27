import { deliveryAreaFields, INSTALL_DATE_REQUIRED, installationErrors, installationFields, installationText, jobCategoryField, releaseInstallation, siteTypeField } from './installation.rules';

describe('installationFields', () => {
  it('keeps nothing while the company does not ask', () => {
    expect(installationFields(false, { option: 'COLLECT', date: '2026-10-01' })).toEqual({ installOption: null, installDate: null });
  });

  it('defaults to Installation, and only an installation keeps a date', () => {
    expect(installationFields(true, {})).toEqual({ installOption: 'INSTALLATION', installDate: null });
    expect(installationFields(true, { date: '2026-10-01' })).toEqual({ installOption: 'INSTALLATION', installDate: '2026-10-01' });
    expect(installationFields(true, { option: 'DELIVERY', date: '2026-10-01' })).toEqual({ installOption: 'DELIVERY', installDate: null });
  });

  it('keeps what the order has when a save does not mention it', () => {
    const current = { option: 'INSTALLATION', date: '2026-10-01' };
    expect(installationFields(true, {}, current)).toEqual({ installOption: 'INSTALLATION', installDate: '2026-10-01' });
    expect(installationFields(true, { date: null }, current)).toEqual({ installOption: 'INSTALLATION', installDate: null });
    expect(installationFields(true, { option: 'COLLECT' }, current)).toEqual({ installOption: 'COLLECT', installDate: null });
  });
});

describe('installationErrors', () => {
  it('refuses a preferred date before the order date', () => {
    expect(installationErrors({ installOption: 'INSTALLATION', installDate: '2026-09-28' }, '2026-09-29')).toEqual([
      { field: 'installDate', message: 'The preferred date cannot be before the order date (29 Sep 2026).' },
    ]);
    expect(installationErrors({ installOption: 'INSTALLATION', installDate: '2026-09-29' }, '2026-09-29')).toEqual([]);
  });
});

describe('releaseInstallation (the app: required when all items are in stock)', () => {
  it('needs the date when every item is in stock', () => {
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: null }, true)).toEqual({ refusal: INSTALL_DATE_REQUIRED, afterStock: false });
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: '2026-10-01' }, true)).toEqual({ refusal: null, afterStock: false });
  });

  it('lets installation wait for stock when some items are short', () => {
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: null }, false)).toEqual({ refusal: null, afterStock: true });
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: '2026-10-20' }, false)).toEqual({ refusal: null, afterStock: false });
  });

  it('asks nothing for delivery only, collect, or a company that does not ask', () => {
    expect(releaseInstallation({ installOption: 'DELIVERY', installDate: null }, true)).toEqual({ refusal: null, afterStock: false });
    expect(releaseInstallation({ installOption: null, installDate: null }, true)).toEqual({ refusal: null, afterStock: false });
  });

  it('releases an installation in stock without a date when the date can be agreed later', () => {
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: null }, true, true)).toEqual({ refusal: null, afterStock: false });
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: '2026-10-01' }, true, true)).toEqual({ refusal: null, afterStock: false });
    // Short of stock: still waits for the stock, as with the switch off.
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: null }, false, true)).toEqual({ refusal: null, afterStock: true });
  });

  it('keeps asking for the date with the switch off (the default)', () => {
    expect(releaseInstallation({ installOption: 'INSTALLATION', installDate: null }, true, false)).toEqual({ refusal: INSTALL_DATE_REQUIRED, afterStock: false });
  });
});

describe('installationText', () => {
  it('reads the way the order shows it', () => {
    expect(installationText({ installOption: 'INSTALLATION', installDate: '2026-10-01', afterStock: false })).toBe('Preferred 1 Oct 2026');
    expect(installationText({ installOption: 'INSTALLATION', installDate: null, afterStock: true })).toBe('After stock arrives');
    expect(installationText({ installOption: 'COLLECT', installDate: null, afterStock: false })).toBe('Collect');
    expect(installationText({ installOption: null, installDate: null, afterStock: false })).toBeNull();
  });
});

describe('deliveryAreaFields: the postcode and state of the install address', () => {
  it('keeps nothing when the company does not ask for installation', () => {
    expect(deliveryAreaFields(false, { postcode: '40000', state: 'Selangor' })).toEqual({ deliveryPostcode: null, deliveryState: null });
  });
  it('keeps what is typed, keeps what was there when left out, and clears on empty', () => {
    expect(deliveryAreaFields(true, { postcode: '40000', state: 'Selangor' })).toEqual({ deliveryPostcode: '40000', deliveryState: 'Selangor' });
    const was = { postcode: '40000', state: 'Selangor' };
    expect(deliveryAreaFields(true, {}, was)).toEqual({ deliveryPostcode: '40000', deliveryState: 'Selangor' });
    expect(deliveryAreaFields(true, { postcode: '', state: null }, was)).toEqual({ deliveryPostcode: null, deliveryState: null });
    expect(deliveryAreaFields(true, { state: 'Johor' }, was)).toEqual({ deliveryPostcode: '40000', deliveryState: 'Johor' });
  });
});

describe('siteTypeField (the install site, for the job)', () => {
  it('keeps the site for an installation, and nothing for delivery, collect or a company that does not ask', () => {
    expect(siteTypeField(true, 'INSTALLATION', { siteType: 'CONDO' })).toEqual({ siteType: 'CONDO' });
    expect(siteTypeField(true, 'DELIVERY', { siteType: 'CONDO' })).toEqual({ siteType: null });
    expect(siteTypeField(false, 'INSTALLATION', { siteType: 'CONDO' })).toEqual({ siteType: null });
  });

  it('keeps the site already there when a save leaves it out, and clears it when sent empty', () => {
    expect(siteTypeField(true, 'INSTALLATION', {}, { siteType: 'LANDED' })).toEqual({ siteType: 'LANDED' });
    expect(siteTypeField(true, 'INSTALLATION', { siteType: '' }, { siteType: 'LANDED' })).toEqual({ siteType: null });
    expect(siteTypeField(true, 'INSTALLATION', { siteType: 'GARAGE' })).toEqual({ siteType: null });
  });
});

describe('jobCategoryField (the job category, for the job)', () => {
  it('keeps the category for an installation only', () => {
    expect(jobCategoryField(true, 'INSTALLATION', { jobCategory: 'combo' })).toEqual({ jobCategory: 'COMBO' });
    expect(jobCategoryField(true, 'DELIVERY', { jobCategory: 'COMBO' })).toEqual({ jobCategory: null });
    expect(jobCategoryField(false, 'INSTALLATION', { jobCategory: 'COMBO' })).toEqual({ jobCategory: null });
  });

  it('keeps the category already there when a save leaves it out, and clears it when sent empty', () => {
    expect(jobCategoryField(true, 'INSTALLATION', {}, { jobCategory: 'LONG' })).toEqual({ jobCategory: 'LONG' });
    expect(jobCategoryField(true, 'INSTALLATION', { jobCategory: '' }, { jobCategory: 'LONG' })).toEqual({ jobCategory: null });
  });
});
