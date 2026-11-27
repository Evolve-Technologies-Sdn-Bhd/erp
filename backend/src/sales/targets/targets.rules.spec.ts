import { allocation, cleanAmount, monthText, pctOf, targetChanges, targetErrors } from './targets.rules';

describe('sales targets (phase 5)', () => {
  const agents = ['AGENT1', 'AGENT2'];

  it('takes a month, a branch target and each salesperson once', () => {
    expect(targetErrors({ month: '2026-11', amount: '60000.00', agents: [{ agentCode: 'AGENT1', amount: '20000' }, { agentCode: 'AGENT2', amount: null }] }, agents)).toEqual([]);
    expect(targetErrors({ month: '2026-11', amount: null, agents: [] }, agents)).toEqual([]);
  });

  it('refuses a bad month, a bad amount, a stranger and a salesperson twice', () => {
    const errors = targetErrors(
      { month: '2026-13', amount: '-5', agents: [{ agentCode: 'AGENT1', amount: '1.234' }, { agentCode: 'AGENT1', amount: '1' }, { agentCode: 'AGENT9', amount: '1' }] },
      agents,
    );
    expect(errors.map((e) => e.field)).toEqual(['month', 'amount', 'agents[0].amount', 'agents[1].agentCode', 'agents[2].agentCode']);
  });

  it('reads an empty amount as no target, and drops thousand separators', () => {
    expect(cleanAmount('')).toBeNull();
    expect(cleanAmount('  ')).toBeNull();
    expect(cleanAmount(null)).toBeNull();
    expect(cleanAmount(' 60,000.50 ')).toBe('60000.50');
  });

  it('says how much of the branch target is split and what is left', () => {
    expect(allocation('60000', ['20000', null, '15000.50'])).toEqual({ allocated: '35000.50', left: '24999.50', over: false });
    expect(allocation('30000', ['20000', '15000'])).toEqual({ allocated: '35000.00', left: '-5000.00', over: true });
    expect(allocation(null, ['20000'])).toEqual({ allocated: '20000.00', left: null, over: false });
  });

  it('works out the whole percent reached, none without a target', () => {
    expect(pctOf('15000', '60000')).toBe(25);
    expect(pctOf('17770', '60000')).toBe(29);
    expect(pctOf('70000', '60000')).toBe(116);
    expect(pctOf('100', null)).toBeNull();
    expect(pctOf('100', '0')).toBeNull();
  });

  it('logs what changed, in plain words', () => {
    const names = new Map([['AGENT1', 'Sales Agent'], ['AGENT2', 'Agent Two']]);
    expect(
      targetChanges(
        { amount: null, agents: new Map([['AGENT1', '20000']]) },
        { amount: '60000', agents: [{ agentCode: 'AGENT1', amount: '20000.00' }, { agentCode: 'AGENT2', amount: '25000' }] },
        names,
      ),
    ).toEqual(['Branch target: none → RM 60,000.00', 'Agent Two (AGENT2): none → RM 25,000.00']);
    expect(targetChanges({ amount: '60000', agents: new Map([['AGENT1', '20000']]) }, { amount: '60000.00', agents: [{ agentCode: 'AGENT1', amount: null }] }, names)).toEqual([
      'Sales Agent (AGENT1): RM 20,000.00 → none',
    ]);
  });

  it('names the month', () => {
    expect(monthText('2026-11')).toBe('November 2026');
  });
});
