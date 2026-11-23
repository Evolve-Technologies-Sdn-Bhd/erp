import { deliveryAreaFields, INSTALL_DATE_REQUIRED, installationErrors, installationFields, installationText, releaseInstallation } from './installation.rules';

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
