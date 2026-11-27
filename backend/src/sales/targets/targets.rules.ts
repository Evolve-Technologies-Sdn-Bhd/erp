import { dec, toMoney, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';

/**
 * Sales targets (phase 5, the client's Sales home): a branch's target for a month, split between its salespeople. A
 * company that sets none sees nothing change. What counts against a target is worked out from the orders, never stored.
 * Pure functions, tested in targets.rules.spec.ts.
 */

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;

const RM = (v: DecimalInput) => `RM ${toMoney(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** "" or null: no target. Otherwise the amount as typed, trimmed. */
export const cleanAmount = (v: string | null | undefined): string | null => (v == null || !v.trim() ? null : v.trim().replace(/,/g, ''));

export interface TargetInput {
  month: string;
  amount: string | null;
  agents: { agentCode: string; amount: string | null }[];
}

/** The month, the amounts (0 or more, 2 decimals) and the salespeople (each once, each of this branch). */
export function targetErrors(t: TargetInput, branchAgents: readonly string[]): FieldError[] {
  const errors: FieldError[] = [];
  if (!MONTH.test(t.month)) errors.push({ field: 'month', message: 'Month must look like 2026-11.' });
  if (t.amount !== null && !AMOUNT.test(t.amount)) errors.push({ field: 'amount', message: 'Type the branch target like 60000.00, or leave it empty.' });
  const seen = new Set<string>();
  t.agents.forEach((a, i) => {
    if (seen.has(a.agentCode)) errors.push({ field: `agents[${i}].agentCode`, message: `${a.agentCode} is on the list twice.` });
    seen.add(a.agentCode);
    if (!branchAgents.includes(a.agentCode)) errors.push({ field: `agents[${i}].agentCode`, message: `${a.agentCode} is not a salesperson of this branch.` });
    if (a.amount !== null && !AMOUNT.test(a.amount)) errors.push({ field: `agents[${i}].amount`, message: 'Type the target like 20000.00, or leave it empty.' });
  });
  return errors;
}

/** How much of the branch target is split between its salespeople, and what is left (negative: split more than the target). */
export function allocation(branch: DecimalInput | null, agents: (DecimalInput | null)[]) {
  const allocated = agents.reduce<ReturnType<typeof dec>>((s, a) => (a == null ? s : s.add(dec(a))), dec(0));
  const left = branch == null ? null : dec(branch).sub(allocated);
  return { allocated: toMoney(allocated), left: left === null ? null : toMoney(left), over: left !== null && left.lt(0) };
}

/** Whole percent of the target reached, or null without a target (or a target of 0). */
export function pctOf(value: DecimalInput, target: DecimalInput | null): number | null {
  if (target == null || !dec(target).gt(0)) return null;
  return Math.floor(dec(value).mul(100).div(dec(target)).toNumber());
}

/** Activity lines for a save: "Branch target: none → RM 60,000.00", "Sales Agent (AGENT1): RM 20,000.00 → none". */
export function targetChanges(
  before: { amount: DecimalInput | null; agents: Map<string, DecimalInput | null> },
  after: { amount: string | null; agents: { agentCode: string; amount: string | null }[] },
  names: Map<string, string>,
): string[] {
  const txt = (v: DecimalInput | null) => (v == null ? 'none' : RM(v));
  const same = (a: DecimalInput | null, b: DecimalInput | null) => (a == null || b == null ? a == b : dec(a).eq(dec(b)));
  const out: string[] = [];
  if (!same(before.amount, after.amount)) out.push(`Branch target: ${txt(before.amount)} → ${txt(after.amount)}`);
  for (const a of after.agents) {
    const was = before.agents.get(a.agentCode) ?? null;
    if (!same(was, a.amount)) out.push(`${names.get(a.agentCode) ?? a.agentCode} (${a.agentCode}): ${txt(was)} → ${txt(a.amount)}`);
  }
  return out;
}

/** "2026-11" → "November 2026" */
export function monthText(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
