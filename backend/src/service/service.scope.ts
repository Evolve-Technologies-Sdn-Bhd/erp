import type { ScopeRule } from '../platform/scope/scope.rules';

/**
 * Service's data scope (CLAUDE.md → Phase 4 · Data scopes): a job is seen from its own branch, and the top bar's branch
 * narrows the lists like any other document. Agent scope does not apply: jobs are the office's and the installers' work.
 */
export const SERVICE_SCOPE_RULES: readonly ScopeRule[] = [
  { model: 'SvcJob', module: 'service', branchField: 'branchCode', viewFilter: true },
  { model: 'SvcReminder', module: 'service', branchField: 'branchCode', viewFilter: true },
  { model: 'SvcReturn', module: 'service', branchField: 'branchCode', viewFilter: true },
  { model: 'SvcWarranty', module: 'service', branchField: 'branchCode', viewFilter: true },
  { model: 'SvcClaim', module: 'service', branchField: 'branchCode', viewFilter: true },
];
