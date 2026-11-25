/** Sales flow rules (S34): which steps a company uses, and the change-history wording. Pure functions. */

/** The switches and their labels, in the order of the page. Every one defaults to the standard flow. */
export const FLOW_SWITCHES = {
  useEnquiries: 'Use enquiries',
  officeDraftsQuotations: 'Office drafts quotations',
  askInstallation: 'Ask for an installation option on the order',
  agentsAddCustomers: 'Salespeople add new customers on the order',
  fixedPrices: 'Prices come from the price list and cannot be typed',
  voucherControl: 'Vouchers come from the voucher list',
  priceRange: 'Salespeople set prices within a range of the price list',
  useReceipts: 'Salespeople record payments as official receipts',
  reviseOrders: 'Salespeople revise a released order until it is delivered',
  preOrders: 'Short stock makes the order a pre-order',
  autoCancel: 'Cancel an order with no receipt and no delivery after a number of days',
  shareWhatsapp: 'Share the sales order with the customer on WhatsApp',
  holdStock: 'Hold stock for booked installations',
  autoDelivery: 'Make the delivery order 24 hours before the installation',
  signedDelivery: 'The customer signs the delivery order',
  autoInvoice: 'Draft the invoice when the installation is delivered',
  receiptsPayInvoices: 'Verified receipts pay the invoices of their order',
} as const;
export type FlowSwitchKey = keyof typeof FLOW_SWITCHES;
export type FlowSwitches = Record<FlowSwitchKey, boolean>;

/** What a company gets before anyone touches the page: the standard flow (no installation asked). */
export const STANDARD_FLOW: FlowSwitches = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false, fixedPrices: false, voucherControl: false, priceRange: false, useReceipts: false, reviseOrders: false, preOrders: false, autoCancel: false, shareWhatsapp: false, holdStock: false, autoDelivery: false, signedDelivery: false, autoInvoice: false, receiptsPayInvoices: false };

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

/** "Automatic cancel: after 60 days → after 45 days", when the number of days changes. */
export const daysChange = (before: number, after: number): string | null => (before === after ? null : `Automatic cancel: after ${before} days → after ${after} days`);

/** The refusal when a salesperson tries to add a customer from an order while the company does not allow it. */
export const NEW_CUSTOMERS_OFF_MESSAGE =
  'Customers cannot be added from an order in this company. Turn on "Salespeople add new customers on the order" in Operation Policies › Sales Flow, or ask the office to add the customer in Core.';

/** The refusal when someone tries to log an enquiry while enquiries are off. */
export const ENQUIRIES_OFF_MESSAGE = 'Enquiries are turned off for this company. Turn on "Use enquiries" in Operation Policies › Sales Flow to log one.';
