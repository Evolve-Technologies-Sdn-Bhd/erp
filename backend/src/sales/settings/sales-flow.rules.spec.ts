import { flowChanges, FLOW_SWITCHES, NEW_CUSTOMERS_OFF_MESSAGE, rangeChange, STANDARD_FLOW } from './sales-flow.rules';

describe('sales flow rules (S34)', () => {
  it('starts every company on the standard flow', () => {
    expect(STANDARD_FLOW).toEqual({ useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false, priceRange: false, useReceipts: false, reviseOrders: false, preOrders: false });
    expect(Object.keys(STANDARD_FLOW)).toEqual(Object.keys(FLOW_SWITCHES));
  });

  it('writes one history line per switch that changed, in plain words', () => {
    expect(flowChanges(STANDARD_FLOW, { useEnquiries: false, officeDraftsQuotations: false, askInstallation: true, agentsAddCustomers: true, priceRange: true, useReceipts: true, reviseOrders: true, preOrders: true })).toEqual([
      'Use enquiries: On → Off',
      'Office drafts quotations: On → Off',
      'Ask for an installation option on the order: Off → On',
      'Salespeople add new customers on the order: Off → On',
      'Salespeople set prices within a range of the price list: Off → On',
      'Salespeople record payments as official receipts: Off → On',
      'Salespeople revise a released order until it is delivered: Off → On',
      'Short stock makes the order a pre-order: Off → On',
    ]);
    expect(rangeChange({ belowPct: '10', abovePct: '20' }, { belowPct: '5', abovePct: '20' })).toBe('Price range: 10% below to 20% above → 5% below to 20% above');
    expect(rangeChange({ belowPct: '10', abovePct: '20' }, { belowPct: '10', abovePct: '20' })).toBeNull();
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
