import type { ScopeRule } from '../platform/scope/scope.rules';

/**
 * Sales' data scope (CLAUDE.md → Phase 4 · Data scopes): every Sales document by its branch (FR-SEC-022, 032) and, for a
 * user whose role is agent-scoped for documents, only the documents of their own customers (FR-SEC-030, 031). An
 * enquiry for a prospect has no customer yet and stays with the agent who owns it. Settings are not scoped.
 */
const document = (model: string, own: string, ownerField?: string): ScopeRule => ({
  model,
  module: 'sales',
  branchField: 'branchCode',
  viewFilter: true,
  agent: { kind: 'document', customerField: 'customerCode', ownField: own, ...(ownerField && { ownerField }) },
});

/**
 * Who made each document (phase 5): an agent always sees what they made, so orders keyed for a customer they asked to
 * take over stay theirs to follow, whatever the office decides.
 */
const MADE_BY: Record<string, string> = {
  SalQuotation: 'agentCode',
  SalSalesOrder: 'agentCode',
  SalInvoice: 'agentCode',
  SalProforma: 'agentCode',
  SalReceipt: 'recordedByCode',
  SalDelivery: 'createdBy',
  SalCashSale: 'createdBy',
  SalDebitNote: 'createdBy',
  SalReturn: 'createdBy',
  SalCancelOrder: 'createdBy',
};

export const SALES_SCOPE_RULES: readonly ScopeRule[] = [
  document('SalEnquiry', 'agentCode', 'agentCode'),
  // Targets (phase 5) are a branch's, not a customer's: seen in the user's own branches.
  { model: 'SalTarget', module: 'sales', branchField: 'branchCode' },
  ...Object.entries(MADE_BY).map(([m, own]) => document(m, own)),
];
