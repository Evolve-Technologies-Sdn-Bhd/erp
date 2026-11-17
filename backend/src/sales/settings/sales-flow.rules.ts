/** Sales flow rules (S34): which steps a company uses, and the change-history wording. Pure functions. */

/** The switches and their labels, in the order of the page. Every one defaults to the standard flow. */
export const FLOW_SWITCHES = {
  useEnquiries: 'Use enquiries',
  officeDraftsQuotations: 'Office drafts quotations',
  askInstallation: 'Ask for an installation option on the order',
} as const;
export type FlowSwitchKey = keyof typeof FLOW_SWITCHES;
export type FlowSwitches = Record<FlowSwitchKey, boolean>;

/** What a company gets before anyone touches the page: the standard flow (no installation asked). */
export const STANDARD_FLOW: FlowSwitches = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false };

/** Change-history lines, in the wording of the other policies: "Use enquiries: On → Off". */
export function flowChanges(before: FlowSwitches, after: FlowSwitches): string[] {
  const out: string[] = [];
  for (const key of Object.keys(FLOW_SWITCHES) as FlowSwitchKey[]) {
    if (before[key] !== after[key]) out.push(`${FLOW_SWITCHES[key]}: ${before[key] ? 'On' : 'Off'} → ${after[key] ? 'On' : 'Off'}`);
  }
  return out;
}

/** The refusal when someone tries to log an enquiry while enquiries are off. */
export const ENQUIRIES_OFF_MESSAGE = 'Enquiries are turned off for this company. Turn on "Use enquiries" in Operation Policies › Sales Flow to log one.';
