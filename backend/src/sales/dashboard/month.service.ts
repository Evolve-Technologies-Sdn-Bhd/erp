import { Injectable } from '@nestjs/common';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney } from '../../platform/http/decimal';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { PaidOrdersQuery } from '../reports/paid-orders.query';
import { monthRange } from '../reports/report.rules';
import { SAL_ROLE } from '../shared/sales.constants';
import { TargetsService } from '../targets/targets.service';
import { monthText, pctOf } from '../targets/targets.rules';

const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

/**
 * The month so far for the Sales home on the phone (phase 5): what was ordered (released orders dated this month), what
 * is fully paid (verified official receipts reaching the order's total this month, as the Fully paid orders report
 * counts it) and the target. A salesperson sees their own orders and target; anyone else their working branch's.
 */
@Injectable()
export class SalesMonthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly paidOrders: PaidOrdersQuery,
    private readonly targets: TargetsService,
  ) {}

  async get(ctx: RequestContext) {
    const today = this.clock.today();
    const month = today.slice(0, 7);
    const { from, to } = monthRange(month);
    const isAgent = ctx.user.roles.includes(SAL_ROLE.AGENT);
    const who = isAgent ? { agentCode: ctx.user.code } : { branchCode: ctx.branchCode };
    const [ordered, paid, target] = await Promise.all([
      this.prisma.salSalesOrder.aggregate({
        where: { tenantId: ctx.tenantId, revision: 0, status: { in: ['RELEASED', 'PARTIAL', 'DONE'] }, docDate: { gte: day(from), lte: day(to) }, ...who },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.paidOrders.report(ctx, { period: month, ...(isAgent ? { agent: ctx.user.code } : { branch: ctx.branchCode }) }),
      this.targets.forPerson(ctx.tenantId, month, ctx.branchCode, isAgent ? ctx.user.code : null),
    ]);
    const orderedTotal = ordered._sum.total ?? dec(0);
    const goal = isAgent ? target.mine : target.branch;
    return {
      today,
      month,
      monthText: monthText(month),
      /** MINE: the salesperson's own orders and target; BRANCH: the working branch's. */
      scope: isAgent ? 'MINE' : 'BRANCH',
      branchCode: ctx.branchCode,
      ordered: { count: ordered._count._all, total: toMoney(orderedTotal) },
      paid: { count: paid.kpis.paid.count, total: paid.kpis.paid.total, beforeTax: paid.kpis.paid.beforeTax },
      target: {
        amount: goal == null ? null : toMoney(goal),
        orderedPct: pctOf(orderedTotal, goal),
        paidPct: pctOf(paid.kpis.paid.total, goal),
        /** The branch's own target, for a salesperson to see the whole. */
        branch: target.branch == null ? null : toMoney(target.branch),
      },
    };
  }
}
