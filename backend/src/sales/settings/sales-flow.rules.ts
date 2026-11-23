/** Sales flow rules (S34): which steps a company uses, and the change-history wording. Pure functions. */

/** The switches and their labels, in the order of the page. Every one defaults to the standard flow. */
export const FLOW_SWITCHES = {
  useEnquiries: 'Use enquiries',
  officeDraftsQuotations: 'Office drafts quotations',
  askInstallation: 'Ask for an installation option on the order',
  agentsAddCustomers: 'Salespeople add new customers on the order',
  priceRange: 'Salespeople set prices within a range of the price list',
  useReceipts: 'Salespeople record payments as official receipts',
  reviseOrders: 'Salespeople revise a released order until it is delivered',
  preOrders: 'Short stock makes the order a pre-order',
} as const;
export type FlowSwitchKey = keyof typeof FLOW_SWITCHES;
export type FlowSwitches = Record<FlowSwitchKey, boolean>;

/** What a company gets before anyone touches the page: the standard flow (no installation asked). */
export const STANDARD_FLOW: FlowSwitches = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false, priceRange: false, useReceipts: false, reviseOrders: false, preOrders: false };

/** Change-history lines, in the wording of the other policies: "Use enquiries: On → Off". */
export function flowChanges(before: FlowSwitches, after: FlowSwitches): string[] {
  const out: string[] = [];
  for (const key of Object.keys(FLOW_SWITCHES) as FlowSwitchKey[]) {
    if (before[key] !== after[key]) out.push(`${FLOW_SWITCHES[key]}: ${before[key] ? 'On' : 'Off'} → ${after[key] ? 'On' : 'Off'}`);
  }
  return out;
}

/** "Price range: 10% below to 20% above → 5% below to 20% above", when the percentages change. */
export function rangeChange(before: { belowPct: string; abovePct: string }, after: { belowPct: string; abovePct: string }): string | null {
  const text = (r: { belowPct: string; abovePct: string }) => `${r.belowPct}% below to ${r.abovePct}% above`;
  return text(before) === text(after) ? null : `Price range: ${text(before)} → ${text(after)}`;
}

/** The refusal when a salesperson tries to add a customer from an order while the company does not allow it. */
export const NEW_CUSTOMERS_OFF_MESSAGE =
  'Customers cannot be added from an order in this company. Turn on "Salespeople add new customers on the order" in Operation Policies › Sales Flow, or ask the office to add the customer in Core.';

/** The refusal when someone tries to log an enquiry while enquiries are off. */
export const ENQUIRIES_OFF_MESSAGE = 'Enquiries are turned off for this company. Turn on "Use enquiries" in Operation Policies › Sales Flow to log one.';
