import { flowChanges, FLOW_SWITCHES, NEW_CUSTOMERS_OFF_MESSAGE, STANDARD_FLOW } from './sales-flow.rules';

describe('sales flow rules (S34)', () => {
  it('starts every company on the standard flow', () => {
    expect(STANDARD_FLOW).toEqual({ useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false });
    expect(Object.keys(STANDARD_FLOW)).toEqual(Object.keys(FLOW_SWITCHES));
  });

  it('writes one history line per switch that changed, in plain words', () => {
    expect(flowChanges(STANDARD_FLOW, { useEnquiries: false, officeDraftsQuotations: false, askInstallation: true, agentsAddCustomers: true })).toEqual([
      'Use enquiries: On → Off',
      'Office drafts quotations: On → Off',
      'Ask for an installation option on the order: Off → On',
      'Salespeople add new customers on the order: Off → On',
    ]);
    expect(flowChanges({ ...STANDARD_FLOW, useEnquiries: false }, STANDARD_FLOW)).toEqual(['Use enquiries: Off → On']);
  });

  it('writes nothing when nothing changed', () => {
    expect(flowChanges(STANDARD_FLOW, { ...STANDARD_FLOW })).toEqual([]);
  });

  it('tells a salesperson where the switch is when customers cannot be added from an order', () => {
    expect(NEW_CUSTOMERS_OFF_MESSAGE).toContain('Operation Policies › Sales Flow');
    expect(NEW_CUSTOMERS_OFF_MESSAGE).toContain('ask the office to add the customer in Core');
  });
});
