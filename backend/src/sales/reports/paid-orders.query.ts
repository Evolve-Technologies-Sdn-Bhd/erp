import { Injectable } from '@nestjs/common';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney } from '../../platform/http/decimal';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { orderPayment } from '../receipts/receipt.rules';
import { paidOn, perAgent } from './paid-orders.rules';
import { customersInGroup, iso, ReportFilters } from './report-filters';
import { monthRange } from './report.rules';
import type { OrderReportFilter } from './reports.query';

/** A verified receipt's day in the business timezone (UTC+8, no summer time). */
const dayVerified = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/** S05 · Fully paid orders (phase 5): what a month's commission is worked out from, per salesperson. */
@Injectable()
export class PaidOrdersQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly filters: ReportFilters,
  ) {}

  async report(ctx: RequestContext, filter: OrderReportFilter) {
    const tenantId = ctx.tenantId;
    const period = filter.period ?? this.clock.today().slice(0, 7);
    const { from, to } = monthRange(period);
    const { options, customers } = await this.filters.load(tenantId);
    const inGroup = customersInGroup(customers, filter.group);
    const [orders, receipts] = await Promise.all([
      this.prisma.salSalesOrder.findMany({
        where: { tenantId, status: { in: ['RELEASED', 'PARTIAL', 'DONE'] }, ...(filter.branch && { branchCode: filter.branch }), ...(filter.agent && { agentCode: filter.agent }) },
        select: { id: true, docNo: true, docDate: true, customerCode: true, customerName: true, agentCode: true, agentName: true, branchCode: true, subtotal: true, discountTotal: true, voucherTotal: true, total: true, balanceCancelled: true },
      }),
      this.prisma.salReceipt.findMany({ where: { tenantId, status: 'VERIFIED' }, select: { salesOrderId: true, amount: true, verifiedAt: true } }),
    ]);
    const byOrder = new Map<string, { amount: (typeof receipts)[number]['amount']; verifiedOn: string }[]>();
    for (const r of receipts) if (r.verifiedAt) byOrder.set(r.salesOrderId, [...(byOrder.get(r.salesOrderId) ?? []), { amount: r.amount, verifiedOn: dayVerified(r.verifiedAt) }]);

    const shown = orders.filter((o) => !inGroup || inGroup.has(o.customerCode)).map((o) => {
      const got = byOrder.get(o.id) ?? [];
      return { o, beforeTax: o.subtotal.sub(o.discountTotal).sub(o.voucherTotal), paid: paidOn(o.total, got), payment: orderPayment(o.total, got.map((g) => ({ status: 'VERIFIED', amount: g.amount }))) };
    });
    const paid = shown.filter((x) => x.paid && x.paid >= from && x.paid <= to).sort((a, b) => a.paid!.localeCompare(b.paid!) || a.o.docNo.localeCompare(b.o.docNo));
    // Not paid in full yet: no commission until it is. A cancelled balance is left out, nobody pays it.
    const waiting = shown.filter((x) => !x.paid && !x.o.balanceCancelled && x.o.total.gt(0));
    const agents = perAgent(paid.map((x) => ({ agentCode: x.o.agentCode, agentName: x.o.agentName, beforeTax: x.beforeTax, total: x.o.total })));
    const sum = (rows: typeof shown, of: (x: (typeof shown)[number]) => (typeof shown)[number]['beforeTax']) => rows.reduce((s, x) => s.add(of(x)), dec(0));
    const months = [...new Set([...shown.flatMap((x) => (x.paid ? [x.paid.slice(0, 7)] : [])), this.clock.today().slice(0, 7)])].sort().reverse();

    return {
      period, periods: months,
      kpis: {
        paid: { count: paid.length, beforeTax: toMoney(sum(paid, (x) => x.beforeTax)), total: toMoney(sum(paid, (x) => x.o.total)) },
        agents: { count: agents.length },
        deposit: { count: waiting.filter((x) => x.payment.status === 'DEPOSIT').length, amount: toMoney(sum(waiting.filter((x) => x.payment.status === 'DEPOSIT'), (x) => x.o.total.sub(x.payment.verified))) },
        unpaid: { count: waiting.filter((x) => x.payment.status === 'UNPAID').length, amount: toMoney(sum(waiting.filter((x) => x.payment.status === 'UNPAID'), (x) => x.o.total)) },
      },
      byAgent: agents.map((a) => ({ agentCode: a.agentCode, agentName: a.agentName, count: a.count, beforeTax: toMoney(a.beforeTax), total: toMoney(a.total) })),
      rows: paid.map((x) => ({
        id: x.o.id, docNo: x.o.docNo, docDate: iso(x.o.docDate)!, paidOn: x.paid!, customerName: x.o.customerName, agentCode: x.o.agentCode, agentName: x.o.agentName, branchCode: x.o.branchCode,
        beforeTax: toMoney(x.beforeTax), total: toMoney(x.o.total),
      })),
      totals: { beforeTax: toMoney(sum(paid, (x) => x.beforeTax)), total: toMoney(sum(paid, (x) => x.o.total)) },
      filters: options,
      footnote: 'An order counts in the month its verified official receipts reach its total. Before tax is after discounts and vouchers. Orders with a deposit or no payment earn nothing yet.',
    };
  }
}
