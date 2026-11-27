import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SalOrderVoucher, SalSalesOrder, SalSalesOrderLine } from '@prisma/client';
import { STOCK_PORT, type StockPort } from '../../integration/integration.ports';
import { isCountedStock, MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import { ApprovalsService } from '../../platform/approvals/approvals.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { TenantService } from '../../platform/context/tenant.service';
import { HeldStock } from '../shared/held-stock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney, toPrice, toQty, toRate } from '../../platform/http/decimal';
import { NotFoundError } from '../../platform/http/errors';
import { buildStatusCounts, dateRange, pageArgs, parseSort, statusFromKey, toListResponse, toOrderBy } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { buyToOrderStatus } from '../buy-to-order/buy-to-order.rules';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { CreditService, type CreditOutcome } from '../shared/credit.service';
import { SalesLinkedDocsService } from '../shared/linked-docs.service';
import { CREDIT_DOC, SAL_ENTITY } from '../shared/sales.constants';
import { taxLinesWithVouchers } from '../shared/voucher.rules';
import { netUnitPrice, outsideRange, rangeReason } from '../shared/price-range.rules';
import { PriceRules } from '../shared/price-rules.service';
import { ReceiptsQuery } from '../receipts/receipts.query';
import { INSTALL_OPTION_LABEL, installationText, type InstallOption } from './installation.rules';
import type { OrderListQueryDto } from './dto/order.dto';
import { allowedOrderActions, creditLabel, SO_STATUSES, statusLabel, stockShortfall, type SoStatus } from './order.rules';
import { REVISIONS_OFF_MESSAGE, reviseRefusal, revisionApproval, revisionChanges } from './revision.rules';
import { revisionContent, type RevisionSnapshot } from './revision.snapshot';
import { preOrderState } from './pre-order.rules';
import { installWhere, paymentSets, paymentWhere } from './list-filters.rules';
import { mayShare, orderShareText, whatsappNumber } from './share.rules';

export type OrderWithLines = SalSalesOrder & { lines: SalSalesOrderLine[]; vouchers: SalOrderVoucher[] };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const sum = (values: Prisma.Decimal[]) => values.reduce((s, v) => s.add(v), dec(0));
const open = (l: SalSalesOrderLine) => {
  const q = l.orderedQty.sub(l.deliveredQty).sub(l.cancelledQty);
  return q.gt(0) ? q : dec(0);
};

/** Reading sales orders: the list (S10) and one order with its credit check and approval (S11, S12). */
@Injectable()
export class OrdersQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
    private readonly permissions: PermissionRegistry,
    private readonly credit: CreditService,
    private readonly linked: SalesLinkedDocsService,
    private readonly priceRules: PriceRules,
    private readonly receipts: ReceiptsQuery,
    private readonly tenants: TenantService,
    private readonly heldStock: HeldStock,
    private readonly clock: ClockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
    @Inject(STOCK_PORT) private readonly stock: StockPort,
  ) {}

  async load(tenantId: string, id: string): Promise<OrderWithLines> {
    const row = await this.prisma.salSalesOrder.findFirst({ where: { id, tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } }, vouchers: { orderBy: { sortOrder: 'asc' } } } });
    if (!row) throw new NotFoundError('Sales order');
    return row;
  }

  /** The credit check as it stands now, for a draft (S12 panel and the Release button). */
  async liveCredit(ctx: RequestContext, order: OrderWithLines): Promise<CreditOutcome | null> {
    if (order.status !== 'DRAFT' || order.isMigrated) return null;
    const customer = await this.masterData.findCustomer(ctx.tenantId, order.customerCode);
    if (!customer) return null;
    return this.credit.check(ctx.tenantId, {
      customer, docType: CREDIT_DOC.SALES_ORDER, thisDocument: toMoney(order.total), branchCode: order.branchCode, excludeOrderId: order.id,
    });
  }

  /**
   * The price range (phase 5): with it on, a draft's lines priced outside it need the Sales Manager before release. A
   * line made from its released quotation at the quoted price (same item, same net price) was checked there and is not
   * asked again.
   */
  async priceCheck(tenantId: string, order: OrderWithLines) {
    const rule = await this.priceRules.load(tenantId);
    if (!rule.range) return { rangeOn: false, range: null, result: null, reason: null, needs: false };
    const quoted = order.quotationId
      ? await this.prisma.salQuotationLine.findMany({ where: { tenantId, quotationId: order.quotationId }, select: { itemCode: true, unitPrice: true, discountPct: true } })
      : [];
    const result = outsideRange(order.lines.map((l) => {
      const net = netUnitPrice(l);
      const quotedSame = quoted.some((q) => q.itemCode === l.itemCode && netUnitPrice(q).eq(net));
      return { unitPrice: l.unitPrice, discountPct: l.discountPct, listPrice: l.listPrice, lineKind: l.lineKind, approvedNet: quotedSame ? net : null };
    }), rule.range);
    return {
      rangeOn: true, range: rule.range, result,
      reason: result.count ? rangeReason(result, rule.range) : null,
      needs: order.status === 'DRAFT' && result.count > 0 && !order.approvedAt,
    };
  }

  actions(
    ctx: RequestContext,
    order: SalSalesOrder & { lines: SalSalesOrderLine[] },
    credit: CreditOutcome | null,
    priceNeeds = false,
    revision: { canRevise?: boolean; needs?: boolean } = {},
  ) {
    const has = (p: string) => this.permissions.has(ctx.user.roles, p);
    return allowedOrderActions({
      everReleased: Boolean(order.releasedAt),
      inRevision: Boolean(order.revisingSince),
      revisionNeedsApproval: Boolean(revision.needs),
      canRevise: Boolean(revision.canRevise),
      status: order.status as SoStatus,
      isMigrated: order.isMigrated,
      creditNeedsApproval: credit ? credit.check.action === 'APPROVAL' : order.creditResult === 'OVER_LIMIT',
      priceNeedsApproval: priceNeeds,
      creditBlocked: credit ? credit.check.action === 'BLOCK' : false,
      approved: Boolean(order.approvedAt),
      hasOpenBalance: order.lines.some((l) => open(l).gt(0)),
      hasToInvoice: order.lines.some((l) => l.deliveredQty.gt(l.invoicedQty)),
      canEdit: has(P.ORDER_EDIT),
      canRelease: has(P.ORDER_RELEASE),
      canDeliver: has(P.DELIVERY_EDIT),
      canInvoice: has(P.INVOICE_EDIT),
      canProforma: has(P.PROFORMA_EDIT),
      canCancel: has(P.CANCEL_ORDER_EDIT),
    });
  }

  // ── Pre-orders (phase 5) ──────────────────────────────────────────────────

  /** Where each pre-order stands now: its open quantities against stock in its warehouse. */
  async preOrderStates(tenantId: string, orders: (SalSalesOrder & { lines: SalSalesOrderLine[] })[]) {
    const out = new Map<string, { label: string; stockArrived: boolean }>();
    const pre = orders.filter((o) => o.isPreOrder);
    if (!pre.length) return out;
    const codes = [...new Set(pre.flatMap((o) => o.lines.map((l) => l.itemCode)))];
    const [items, stock] = await Promise.all([this.masterData.findItems(tenantId, codes), this.stock.listStock(tenantId, codes)]);
    for (const o of pre) {
      const held = await this.heldStock.held(tenantId, o.lines.map((l) => l.itemCode), o.id);
      const shortNow = stockShortfall(o.lines.map((l) => ({
        held: held(l.itemCode, o.warehouseCode),
        itemCode: l.itemCode, qty: open(l), isStock: isCountedStock(items.find((i) => i.code === l.itemCode)) && !l.isBuyToOrder,
        onHand: sum(stock.filter((s) => s.itemCode === l.itemCode && s.warehouseCode === o.warehouseCode).map((s) => dec(s.onHand))),
      })));
      const state = preOrderState({ isPreOrder: o.isPreOrder, status: o.status }, shortNow);
      if (state) out.set(o.id, state);
    }
    return out;
  }

  // ── Revisions (phase 5) ───────────────────────────────────────────────────

  /** Why the order cannot be revised now, or null: the Sales Flow switch, then anything already made from it. */
  async reviseCheck(tenantId: string, order: OrderWithLines): Promise<{ code: string; message: string } | null> {
    const setting = await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { reviseOrders: true } });
    if (!setting?.reviseOrders) return { code: 'REVISIONS_OFF', message: REVISIONS_OFF_MESSAGE };
    const pick = { docNo: true } as const;
    const [delivery, invoice, cancel, proforma] = await Promise.all([
      this.prisma.salDelivery.findFirst({ where: { tenantId, salesOrderId: order.id }, select: pick }),
      this.prisma.salInvoice.findFirst({ where: { tenantId, salesOrderId: order.id }, select: pick }),
      this.prisma.salCancelOrder.findFirst({ where: { tenantId, salesOrderId: order.id }, select: pick }),
      this.prisma.salProforma.findFirst({ where: { tenantId, salesOrderId: order.id, status: { not: 'CANCELLED' } }, select: pick }),
    ]);
    const documents: { kind: string; docNo: string }[] = [];
    if (delivery) documents.push({ kind: 'delivery order', docNo: delivery.docNo });
    if (invoice) documents.push({ kind: 'invoice', docNo: invoice.docNo });
    if (cancel) documents.push({ kind: 'cancel order', docNo: cancel.docNo });
    if (proforma) documents.push({ kind: 'proforma invoice', docNo: proforma.docNo });
    const message = reviseRefusal({
      docNo: order.docNo, status: order.status, isMigrated: order.isMigrated, documents,
      moved: order.lines.some((l) => l.deliveredQty.gt(0) || l.invoicedQty.gt(0) || l.cancelledQty.gt(0)),
      purchaseOrderNo: order.lines.find((l) => l.purchaseOrderNo)?.purchaseOrderNo ?? null,
    });
    return message ? { code: 'NOT_REVISABLE', message } : null;
  }

  /** A revision in draft: what it changes so far against the revision before, and whether releasing it needs approval. */
  async revisionState(tenantId: string, order: OrderWithLines) {
    if (!order.revisingSince) return null;
    const before = await this.prisma.salOrderRevision.findFirst({ where: { tenantId, salesOrderId: order.id, revisionNo: order.revisionNo - 1 } });
    if (!before) return null;
    const changes = revisionChanges((before.snapshot as unknown as RevisionSnapshot).content, revisionContent(order));
    return { before, changes, approval: revisionApproval(order.revisionNo, changes, order.installBooking) };
  }

  /** The actions with the revision's part worked out (the service calls this before each command). */
  async actionsWithRevision(ctx: RequestContext, order: OrderWithLines, credit: CreditOutcome | null, priceNeeds: boolean) {
    const [check, state] = await Promise.all([
      order.status === 'RELEASED' ? this.reviseCheck(ctx.tenantId, order) : Promise.resolve(null),
      this.revisionState(ctx.tenantId, order),
    ]);
    return this.actions(ctx, order, credit, priceNeeds, { canRevise: order.status === 'RELEASED' && !check, needs: Boolean(state?.approval.needs) });
  }

  // ── List (S10) ────────────────────────────────────────────────────────────

  async list(ctx: RequestContext, query: OrderListQueryDto) {
    const sort = parseSort(query.sort, { docNo: 'docNo', docDate: 'docDate', total: 'total', customer: 'customerName' }, '-docDate');
    const docDate = dateRange(query);
    const q = query.q?.trim();
    // The salesperson's home (phase 5): where the installation stands, and how much is paid.
    const extra: Prisma.SalSalesOrderWhereInput[] = [];
    if (query.install) extra.push(installWhere(query.install, new Date(`${this.clock.today()}T00:00:00.000Z`)));
    const paymentKind = query.payment ?? (query.install === 'donePaymentPending' ? 'notPaid' : undefined);
    if (paymentKind) extra.push(paymentWhere(paymentKind, await this.paymentSets(ctx.tenantId)));
    const base: Prisma.SalSalesOrderWhereInput = {
      tenantId: ctx.tenantId,
      revision: 0,
      ...(extra.length && { AND: extra }),
      ...(docDate && { docDate }),
      ...(query.customer?.trim() && { customerName: { contains: query.customer.trim() } }),
      ...(query.agent && { agentCode: query.agent }),
      ...(query.branch && { branchCode: query.branch }),
      ...(query.preOrder === '1' && { isPreOrder: true }),
      ...(q && { OR: [{ docNo: { contains: q } }, { customerName: { contains: q } }, { customerPoRef: { contains: q } }] }),
    };
    const status = statusFromKey(query.status, SO_STATUSES);
    const where: Prisma.SalSalesOrderWhereInput = { ...base, ...(status && { status }) };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.salSalesOrder.findMany({ where, include: { lines: true }, orderBy: [toOrderBy(sort), { docNo: sort.direction }], ...pageArgs(query) }),
      this.prisma.salSalesOrder.count({ where }),
      this.prisma.salSalesOrder.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const pre = await this.preOrderStates(ctx.tenantId, rows);
    const invoiced = await this.prisma.salInvoice.groupBy({
      by: ['salesOrderNo'],
      where: { tenantId: ctx.tenantId, status: 'RELEASED', salesOrderNo: { in: rows.map((r) => r.docNo) } },
      _sum: { total: true },
    });
    return toListResponse(
      rows.map((o) => ({
        id: o.id,
        docNo: o.docNo,
        branchCode: o.branchCode,
        docDate: iso(o.docDate),
        customerName: o.customerName,
        isBuyToOrder: o.orderTypeCode === 'BTO',
        /** Phase 5: "Pre-order · waiting for stock" or "· stock arrived"; null for other orders. */
        preOrder: pre.get(o.id) ?? null,
        agentName: o.agentName,
        total: toMoney(o.total),
        orderedQty: toQty(sum(o.lines.map((l) => l.orderedQty))),
        deliveredQty: toQty(sum(o.lines.map((l) => l.deliveredQty))),
        invoicedAmount: toMoney(invoiced.find((i) => i.salesOrderNo === o.docNo)?._sum.total ?? 0),
        status: o.status,
        statusLabel: statusLabel(o.status as SoStatus, o.balanceCancelled),
        balanceCancelled: o.balanceCancelled,
        credit: creditLabel(o.creditResult, o.status as SoStatus),
        overLimit: o.creditResult === 'OVER_LIMIT' || o.creditResult === 'BLOCKED',
        isMigrated: o.isMigrated,
        version: o.version,
        // The list does not run a live credit check; the stored result decides whether Release is offered.
        allowedActions: this.actions(ctx, o, null),
      })),
      total,
      query,
      buildStatusCounts(grouped, SO_STATUSES),
    );
  }

  /** Orders fully and partly paid by verified official receipts (only these count as paid). */
  private async paymentSets(tenantId: string) {
    const verified = await this.prisma.salReceipt.groupBy({ by: ['salesOrderId'], where: { tenantId, status: 'VERIFIED' }, _sum: { amount: true } });
    const orders = verified.length ? await this.prisma.salSalesOrder.findMany({ where: { tenantId, id: { in: verified.map((v) => v.salesOrderId) } }, select: { id: true, total: true } }) : [];
    return paymentSets(
      verified.map((v) => ({ salesOrderId: v.salesOrderId, amount: v._sum.amount ?? 0 })),
      new Map(orders.map((o) => [o.id, o.total])),
    );
  }

  // ── One order (S11, S12) ──────────────────────────────────────────────────

  async detail(ctx: RequestContext, id: string) {
    const order = await this.load(ctx.tenantId, id);
    const codes = order.lines.map((l) => l.itemCode);
    const [credit, activity, links, approvals, branches, taxes, priceLists, items, stock, customer] = await Promise.all([
      this.liveCredit(ctx, order),
      this.activity.listFor(ctx.tenantId, SAL_ENTITY.ORDER, order.id),
      this.linked.forDocument(ctx.tenantId, SAL_ENTITY.ORDER, order.id),
      this.approvals.listForEntity(ctx.tenantId, SAL_ENTITY.ORDER, order.id),
      this.masterData.listBranches(ctx.tenantId),
      this.masterData.listTaxCodes(ctx.tenantId),
      this.masterData.listPriceLists(ctx.tenantId),
      this.masterData.findItems(ctx.tenantId, codes),
      this.stock.listStock(ctx.tenantId, codes),
      this.masterData.findCustomer(ctx.tenantId, order.customerCode),
    ]);
    const taxName = (code: string) => taxes.find((t) => t.code === code)?.name ?? code;
    const latest = approvals[0] ?? null;
    const decidedStep = latest?.steps.find((s) => s.decidedAt);
    const waitingStep = latest?.status === 'PENDING' ? latest.steps.find((s) => s.status === 'WAITING') : null;

    // Stock: live for drafts (warns only), and what was logged at release for released orders.
    const onHand = (code: string) => sum(stock.filter((s) => s.itemCode === code && s.warehouseCode === order.warehouseCode).map((s) => dec(s.onHand)));
    const held = await this.heldStock.held(ctx.tenantId, codes, order.id);
    const shortfall = stockShortfall(order.lines.map((l) => ({
      held: held(l.itemCode, order.warehouseCode),
      itemCode: l.itemCode, qty: l.orderedQty, onHand: onHand(l.itemCode), isStock: isCountedStock(items.find((i) => i.code === l.itemCode)) && !l.isBuyToOrder,
    })));
    const releaseNote = activity.find((a) => a.action === 'stock_warning')?.message ?? null;
    // Installation (phase 5): a draft is judged on stock now; a released order keeps what release decided.
    const setting = await this.prisma.salSetting.findUnique({ where: { tenantId: ctx.tenantId }, select: { askInstallation: true, installDateLater: true } });
    const draft = order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL';
    const allInStock = !shortfall && !order.lines.some((l) => l.isBuyToOrder);
    const installDate = order.installDate ? iso(order.installDate) : null;
    const afterStock = draft ? order.installOption === 'INSTALLATION' && !installDate && !allInStock : order.installAfterStock;
    // Vouchers (phase 5) lower the tax of the items they are on.
    const taxLines = taxLinesWithVouchers(order.lines, order.vouchers).map((t) => ({ code: t.code, name: taxName(t.code), amount: toMoney(t.amount) }));
    const quotation = order.quotationId ? await this.prisma.salQuotation.findFirst({ where: { id: order.quotationId }, select: { id: true, docNo: true } }) : null;
    const price = await this.priceCheck(ctx.tenantId, order);
    const flags = await this.prisma.salSetting.findUnique({ where: { tenantId: ctx.tenantId }, select: { reviseOrders: true, preOrders: true, shareWhatsapp: true } });
    const switchOn = Boolean(flags?.reviseOrders);
    const preOrder = (await this.preOrderStates(ctx.tenantId, [order])).get(order.id) ?? null;
    const [reviseCheck, revisionState, revisions] = await Promise.all([
      order.status === 'RELEASED' ? this.reviseCheck(ctx.tenantId, order) : Promise.resolve(null),
      this.revisionState(ctx.tenantId, order),
      this.prisma.salOrderRevision.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: order.id }, orderBy: { revisionNo: 'desc' } }),
    ]);

    return {
      id: order.id,
      docNo: order.docNo,
      revision: order.revision,
      docDate: iso(order.docDate),
      status: order.status,
      statusLabel: statusLabel(order.status as SoStatus, order.balanceCancelled),
      balanceCancelled: order.balanceCancelled,
      isMigrated: order.isMigrated,
      version: order.version,
      customer: { code: order.customerCode, name: order.customerName, active: customer?.status === 'ACTIVE' },
      contactName: order.contactName,
      branch: { code: order.branchCode, name: branches.find((b) => b.code === order.branchCode)?.name ?? order.branchCode },
      agent: { code: order.agentCode, name: order.agentName },
      warehouseCode: order.warehouseCode,
      deliveryWantedBy: iso(order.deliveryWantedBy),
      promisedDate: iso(order.promisedDate),
      currency: order.currency,
      taxMode: order.taxMode,
      creditTermDays: order.creditTermDays,
      priceList: { code: order.priceListCode, name: priceLists.find((p) => p.code === order.priceListCode)?.name ?? order.priceListCode },
      customerPoRef: order.customerPoRef,
      project: order.project,
      deliveryAddress: order.deliveryAddress,
      deliveryPostcode: order.deliveryPostcode,
      deliveryState: order.deliveryState,
      /** Revisions (phase 5): the one in draft, why it cannot be revised now, and the earlier ones kept read-only. */
      revisions: {
        number: order.revisionNo,
        switchOn,
        inRevision: Boolean(order.revisingSince),
        reason: order.revisingSince ? order.reviseReason : null,
        since: order.revisingSince?.toISOString() ?? null,
        changes: revisionState?.changes.changes ?? [],
        needsApproval: Boolean(revisionState?.approval.needs) && !order.approvedAt,
        approvalReason: revisionState?.approval.reason ?? null,
        /** Why a released order cannot be revised now; null when it can, or when it is not released. */
        notRevisable: order.status === 'RELEASED' && switchOn ? (reviseCheck?.message ?? null) : null,
        history: revisions.map((r) => {
          const snap = r.snapshot as unknown as RevisionSnapshot;
          return {
            revisionNo: r.revisionNo, reason: r.reason, revisedBy: r.revisedBy, revisedAt: r.revisedAt.toISOString(),
            replacedAt: r.replacedAt?.toISOString() ?? null, changes: r.changes, total: toMoney(dec(snap.content.total)),
            lines: snap.lines.map((l) => ({
              lineNo: Number(l.lineNo), itemCode: String(l.itemCode), itemName: String(l.itemName), uomCode: String(l.uomCode),
              qty: toQty(dec(String(l.orderedQty))), unitPrice: toPrice(dec(String(l.unitPrice))),
              discountPct: dec(String(l.discountPct)).toFixed(2), amount: toMoney(dec(String(l.amount))),
            })),
          };
        }),
      },
      /** Pre-order (phase 5): what was short at release and where it stands now; for a draft, whether it will be one. */
      preOrder: {
        switchOn: Boolean(flags?.preOrders),
        isPreOrder: order.isPreOrder,
        shortAtRelease: order.preOrderShort,
        label: preOrder?.label ?? null,
        stockArrived: preOrder?.stockArrived ?? false,
        willBe: draft && Boolean(flags?.preOrders) && Boolean(shortfall),
      },
      /** Share on WhatsApp (phase 5): the customer's number (null: pick the chat in WhatsApp) and the message. Null when it is not offered. */
      share: mayShare({ switchOn: Boolean(flags?.shareWhatsapp), status: order.status, canEdit: this.permissions.has(ctx.user.roles, P.ORDER_EDIT) })
        ? {
            number: whatsappNumber(customer?.phone),
            text: orderShareText({
              company: await this.tenants.name(), contactName: order.contactName, customerName: order.customerName,
              docNo: order.docNo, revisionNo: order.revisionNo, docDate: iso(order.docDate)!, total: toMoney(order.total),
              installOption: order.installOption, installDate, afterStock,
              lines: order.lines.map((l) => ({
                itemName: l.itemName, uomCode: l.uomCode, qty: toQty(l.orderedQty), lineKind: l.lineKind,
                package: l.packageCode ? { group: l.packageGroup, name: l.packageName, uomCode: l.packageUomCode, qty: l.packageQty ? toQty(l.packageQty) : null } : null,
              })),
            }),
          }
        : null,
      /** The installer's booking, from Service (phase 5): a revision after booking needs approval. */
      installBooking: order.installBooking,
      installation: {
        asked: Boolean(setting?.askInstallation),
        option: order.installOption,
        optionLabel: order.installOption ? (INSTALL_OPTION_LABEL[order.installOption as InstallOption] ?? order.installOption) : null,
        preferredDate: installDate,
        afterStock,
        /** A draft installation whose items are all in stock needs the date before release, unless the date can be agreed later. */
        dateNeeded: draft && order.installOption === 'INSTALLATION' && allInStock && !setting?.installDateLater,
        text: installationText({ installOption: order.installOption, installDate, afterStock }),
      },
      orderTypeCode: order.orderTypeCode,
      quotation: quotation ? { id: quotation.id, no: quotation.docNo } : null,
      enquiryNo: order.enquiryNo,
      lines: order.lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uomCode: l.uomCode,
        taxCode: l.taxCode,
        taxName: taxName(l.taxCode),
        taxRate: toRate(l.taxRate),
        listPrice: l.listPrice ? toPrice(l.listPrice) : null,
        unitPrice: toPrice(l.unitPrice),
        discountPct: l.discountPct.toFixed(2),
        orderedQty: toQty(l.orderedQty),
        deliveredQty: toQty(l.deliveredQty),
        invoicedQty: toQty(l.invoicedQty),
        cancelledQty: toQty(l.cancelledQty),
        balanceQty: toQty(open(l)),
        grossAmount: toMoney(l.grossAmount),
        discountAmount: toMoney(l.discountAmount),
        amount: toMoney(l.amount),
        taxAmount: toMoney(l.taxAmount),
        isBuyToOrder: l.isBuyToOrder,
        purchaseOrderNo: l.purchaseOrderNo,
        purchase: buyToOrderStatus(l),
        lineKind: l.lineKind,
        package: l.packageCode ? { group: l.packageGroup, code: l.packageCode, name: l.packageName, qty: l.packageQty ? toQty(l.packageQty) : null, price: l.packagePrice ? toMoney(l.packagePrice) : null, uomCode: l.packageUomCode, terms: l.packageTerms } : null,
      })),
      vouchers: order.vouchers.map((v) => ({
        voucherNo: v.voucherNo, description: v.description, amount: toMoney(v.amount), taxCode: v.taxCode, taxName: taxName(v.taxCode), taxAmount: toMoney(v.taxAmount),
        invoiceNo: v.invoiceNo,
      })),
      totals: { subtotal: toMoney(order.subtotal), discountTotal: toMoney(order.discountTotal), voucherTotal: toMoney(order.voucherTotal), taxLines, rounding: toMoney(order.rounding), total: toMoney(order.total) },
      quantities: {
        ordered: toQty(sum(order.lines.map((l) => l.orderedQty))),
        delivered: toQty(sum(order.lines.map((l) => l.deliveredQty))),
        uomCode: order.lines[0]?.uomCode ?? '',
      },
      credit: {
        result: credit?.check.result ?? order.creditResult,
        /** For a draft: the check now. Otherwise what was stored at save ("Credit at save"). */
        snapshot: credit?.snapshot ?? order.creditSnapshot,
        live: Boolean(credit),
        needsApproval: credit ? credit.check.action === 'APPROVAL' && !order.approvedAt : false,
        blocked: credit ? credit.check.action === 'BLOCK' : false,
        approverRole: credit?.approverRole ?? null,
      },
      /** The price range (phase 5): lines priced outside it need the Sales Manager before release. */
      price: {
        rangeOn: price.rangeOn,
        range: price.range,
        outside: price.result?.count ?? 0,
        reason: price.reason,
        lineIds: price.result ? price.result.lines.map((i) => order.lines[i]!.id) : [],
        needsApproval: price.needs,
      },
      approval: {
        state: !latest ? 'NONE' : latest.status === 'PENDING' ? 'PENDING' : latest.status === 'APPROVED' ? 'APPROVED' : latest.status === 'REJECTED' ? 'REJECTED' : 'NONE',
        reason: latest?.reason ?? null,
        note: latest?.requesterNote ?? null,
        requestedBy: latest?.requestedByName ?? null,
        requestedAt: latest?.createdAt ?? null,
        waitingFor: waitingStep ? (waitingStep.approverName ?? waitingStep.approverRole) : null,
        decidedBy: decidedStep?.decidedByName ?? null,
        decidedAt: decidedStep?.decidedAt ?? null,
        comment: decidedStep?.comment ?? null,
      },
      stock: {
        draftWarning: order.status === 'DRAFT' ? shortfall : null,
        releaseNote,
        inventoryConnected: this.stock.connected,
      },
      /** Official receipts (phase 5): null while the company does not use them. */
      payments: await this.receipts.forOrder(ctx, order),
      releasedAt: order.releasedAt?.toISOString() ?? null,
      releasedByName: order.releasedByName,
      links,
      activity,
      allowedActions: this.actions(ctx, order, credit, price.needs, {
        canRevise: order.status === 'RELEASED' && !reviseCheck,
        needs: Boolean(revisionState?.approval.needs),
      }),
    };
  }
}
