import { flowChanges, FLOW_SWITCHES, STANDARD_FLOW } from './sales-flow.rules';

describe('sales flow rules (S34)', () => {
  it('starts every company on the standard flow', () => {
    expect(STANDARD_FLOW).toEqual({ useEnquiries: true, officeDraftsQuotations: true, askInstallation: false });
    expect(Object.keys(STANDARD_FLOW)).toEqual(Object.keys(FLOW_SWITCHES));
  });

  it('writes one history line per switch that changed, in plain words', () => {
    expect(flowChanges(STANDARD_FLOW, { useEnquiries: false, officeDraftsQuotations: false, askInstallation: true })).toEqual([
      'Use enquiries: On → Off',
      'Office drafts quotations: On → Off',
      'Ask for an installation option on the order: Off → On',
    ]);
    expect(flowChanges({ useEnquiries: false, officeDraftsQuotations: true, askInstallation: false }, STANDARD_FLOW)).toEqual(['Use enquiries: Off → On']);
  });

  it('writes nothing when nothing changed', () => {
    expect(flowChanges(STANDARD_FLOW, { ...STANDARD_FLOW })).toEqual([]);
  });
});
