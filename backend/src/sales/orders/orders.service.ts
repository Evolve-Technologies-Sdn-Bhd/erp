import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { STOCK_PORT, type StockPort } from '../../integration/integration.ports';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ApprovalsService, type DecisionResult } from '../../platform/approvals/approvals.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney, toQty } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { breachText, creditActivityText } from '../shared/credit.rules';
import { CreditService } from '../shared/credit.service';
import { SalesDocumentLines } from '../shared/document-lines.service';
import { PackageLines, type EnteredLine } from '../shared/package-lines.service';
import { toEnteredLine } from '../shared/package-lines.rules';
import { priceVouchers, totalsWithVouchers, type TaxedLine, type VoucherInput } from '../shared/voucher.rules';
import type { MdCustomer } from '../../master-data/master-data.port';
import { CREDIT_DOC, SAL_DOC_TYPE, SAL_ENTITY, SAL_EVENT, SAL_ROLE } from '../shared/sales.constants';
import type { CreateOrderDto, RequestApprovalDto, ReviseOrderDto, UpdateOrderDto } from './dto/order.dto';
import { HeldStock } from '../shared/held-stock.service';
import { ORDER_LOCKED_MESSAGE, stockShortfall, type OrderAction } from './order.rules';
import { deliveryAreaFields, installationErrors, installationFields, releaseInstallation } from './installation.rules';
import { OrdersQuery, type OrderWithLines } from './orders.query';
import { headerData, snapshotOf, type RevisionSnapshot } from './revision.snapshot';
import { preOrderActivity, preOrderAtRelease } from './pre-order.rules';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sales order commands (FlowS2). Every change runs in one transaction: the order, its activity, approval
 * requests and outbox events. The credit check runs on every save and again on release.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: OrdersQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
    private readonly outbox: OutboxWriter,
    private readonly credit: CreditService,
    private readonly docs: SalesDocumentLines,
    private readonly packages: PackageLines,
    private readonly clock: ClockService,
    private readonly heldStock: HeldStock,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
    @Inject(STOCK_PORT) private readonly stock: StockPort,
  ) {}

  // ── Create and save ───────────────────────────────────────────────────────

  async create(ctx: RequestContext, dto: CreateOrderDto) {
    const prepared = await this.prepareDraft(ctx, dto);
    const { id } = await this.prisma.$transaction((tx) => this.insertDraft(tx, ctx, prepared, {}));
    return this.query.detail(ctx, id);
  }

  /**
   * Validates a new order against Master Data (active customer, sellable items not excluded in the branch),
   * builds the lines and runs the credit check. Done before the transaction so it stays short.
   */
  async prepareDraft(ctx: RequestContext, dto: CreateOrderDto) {
    const docDate = dto.docDate ?? this.clock.today();
    const customer = await this.docs.activeCustomer(ctx, dto.customerCode);
    const branchCode = this.docs.branchFor(ctx, customer);
    const lines = await this.buildLines(ctx, customer, branchCode, docDate, dto.lines);
    const priced = await this.withVouchers(ctx.tenantId, lines.lines, dto.vouchers ?? []);
    const built = { ...lines, totals: priced.totals, vouchers: priced.vouchers };
    const credit = await this.credit.check(ctx.tenantId, { customer, docType: CREDIT_DOC.SALES_ORDER, thisDocument: toMoney(built.totals.total), branchCode });
    const install = await this.installation(ctx.tenantId, docDate, { option: dto.installOption, date: dto.installDate, postcode: dto.deliveryPostcode, state: dto.deliveryState });
    const warehouseCode = await this.docs.warehouseFor(ctx, branchCode);
    const agent = await this.docs.agentFor(ctx, customer);
    return { dto, docDate, customer, branchCode, built, credit, warehouseCode, agent, install };
  }

  /** Writes a prepared draft order in the caller's transaction: number, lines, activity. */
  async insertDraft(
    tx: Tx,
    ctx: RequestContext,
    prepared: Awaited<ReturnType<OrdersService['prepareDraft']>>,
    source: { quotationId?: string; quotationNo?: string; enquiryNo?: string | null; agent?: { code: string; name: string }; message?: string },
  ): Promise<{ id: string; docNo: string }> {
    const { dto, docDate, customer, branchCode, built, credit, warehouseCode, install } = prepared;
    const agent = source.agent ?? prepared.agent;
    const docNo = await this.numbering.next(tx, ctx.tenantId, SAL_DOC_TYPE.ORDER, { date: docDate, branchCode });
    const order = await tx.salSalesOrder.create({
      data: {
        tenantId: ctx.tenantId, docNo, docDate: day(docDate), status: 'DRAFT', branchCode, orderTypeCode: dto.orderTypeCode ?? (built.anyBuyToOrder ? 'BTO' : 'STD'),
        customerId: customer.id, customerCode: customer.code, customerName: customer.name, contactName: dto.contactName?.trim() || customer.contactName,
        agentCode: agent.code, agentName: agent.name, warehouseCode, deliveryWantedBy: dto.deliveryWantedBy ? day(dto.deliveryWantedBy) : null,
        currency: 'MYR', taxMode: 'EXCLUSIVE', creditTermDays: customer.creditTermDays, priceListCode: customer.priceListCode,
        customerPoRef: dto.customerPoRef?.trim() || null, project: dto.project?.trim() || null,
        deliveryAddress: dto.deliveryAddress?.trim() || customer.deliveryAddress, remarks: dto.remarks?.trim() || null,
        installOption: install.installOption, installDate: install.installDate ? day(install.installDate) : null,
        deliveryPostcode: install.deliveryPostcode, deliveryState: install.deliveryState,
        quotationId: source.quotationId ?? null, quotationNo: source.quotationNo ?? null, enquiryNo: source.enquiryNo ?? null,
        ...built.totals, creditResult: credit.check.result, creditSnapshot: credit.snapshot,
        createdBy: ctx.user.code, updatedBy: ctx.user.code,
        lines: { create: built.lines.map(({ qty, unitCost: _cost, ...l }, i) => ({ ...l, orderedQty: qty, tenantId: ctx.tenantId, lineNo: i + 1 })) },
        vouchers: { create: built.vouchers.map((v, i) => ({ ...v, tenantId: ctx.tenantId, sortOrder: i + 1 })) },
      },
    });
    await this.log(tx, ctx, order.id, docNo, 'created', source.message ?? `Created by ${ctx.user.name}`);
    await this.log(tx, ctx, order.id, docNo, 'credit_check', creditActivityText(credit.input, credit.check), null, 1);
    return { id: order.id, docNo };
  }

  async update(ctx: RequestContext, id: string, dto: UpdateOrderDto) {
    const order = await this.query.load(ctx.tenantId, id);
    this.require(await this.actionsFor(ctx, order), 'edit', order.isMigrated ? 'Migrated orders cannot be changed.' : order.status === 'PENDING_APPROVAL' ? `${order.docNo} is waiting for approval and is locked.` : ORDER_LOCKED_MESSAGE);

    // A revision (phase 5) keeps the order's customer and date: receipts, jobs and the number stay with them.
    if (order.revisingSince && dto.customerCode && dto.customerCode !== order.customerCode) {
      throw ValidationFailedError.field('customerCode', `A revised order keeps its customer: ${order.docNo} stays with ${order.customerName}.`);
    }
    if (order.revisingSince && dto.docDate && dto.docDate !== iso(order.docDate)) {
      throw ValidationFailedError.field('docDate', `A revised order keeps its order date (${iso(order.docDate)}).`);
    }
    const docDate = dto.docDate ?? iso(order.docDate);
    const customer = await this.docs.activeCustomer(ctx, dto.customerCode ?? order.customerCode);
    const customerChanged = customer.code !== order.customerCode;
    const branchCode = customerChanged ? this.docs.branchFor(ctx, customer) : order.branchCode;
    const built = dto.lines ? await this.buildLines(ctx, customer, branchCode, docDate, dto.lines) : null;
    // New lines or vouchers price the vouchers again: they lower the tax of the lines they are on (phase 5).
    const priced = built || dto.vouchers
      ? await this.withVouchers(ctx.tenantId, built?.lines ?? order.lines, dto.vouchers ?? order.vouchers.map((v) => ({ voucherNo: v.voucherNo, amount: v.amount, description: v.description, taxCode: v.taxCode })))
      : null;
    // A new customer brings their own address: the postcode and state go with it unless typed again.
    const install = await this.installation(
      ctx.tenantId, docDate, { option: dto.installOption, date: dto.installDate, postcode: dto.deliveryPostcode, state: dto.deliveryState },
      { option: order.installOption, date: order.installDate ? iso(order.installDate) : null, ...(customerChanged && dto.deliveryAddress === undefined ? { postcode: null, state: null } : { postcode: order.deliveryPostcode, state: order.deliveryState }) },
    );
    const total = priced ? priced.totals.total : order.total;
    const credit = await this.credit.check(ctx.tenantId, { customer, docType: CREDIT_DOC.SALES_ORDER, thisDocument: toMoney(total), branchCode, excludeOrderId: order.id });

    // Changing what was approved removes the approval: the order must be approved again.
    const clearApproval = Boolean(order.approvedAt) && (customerChanged || !total.eq(order.total));
    const creditChanged = credit.check.result !== order.creditResult || !total.eq(order.total);

    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.SalSalesOrderUpdateManyMutationInput = {
        ...(dto.docDate && { docDate: day(dto.docDate) }),
        ...(dto.deliveryWantedBy !== undefined && { deliveryWantedBy: dto.deliveryWantedBy ? day(dto.deliveryWantedBy) : null }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName.trim() || null }),
        ...(dto.customerPoRef !== undefined && { customerPoRef: dto.customerPoRef.trim() || null }),
        ...(dto.project !== undefined && { project: dto.project.trim() || null }),
        ...(dto.deliveryAddress !== undefined && { deliveryAddress: dto.deliveryAddress.trim() || null }),
        ...(dto.orderTypeCode && { orderTypeCode: dto.orderTypeCode }),
        ...(dto.remarks !== undefined && { remarks: dto.remarks.trim() || null }),
        installOption: install.installOption, installDate: install.installDate ? day(install.installDate) : null,
        deliveryPostcode: install.deliveryPostcode, deliveryState: install.deliveryState,
        ...(customerChanged && {
          customerId: customer.id, customerCode: customer.code, customerName: customer.name, branchCode, creditTermDays: customer.creditTermDays,
          priceListCode: customer.priceListCode, warehouseCode: await this.docs.warehouseFor(ctx, branchCode),
          ...(dto.contactName === undefined && { contactName: customer.contactName }),
          ...(dto.deliveryAddress === undefined && { deliveryAddress: customer.deliveryAddress }),
        }),
        ...(priced && priced.totals),
        creditResult: clearApproval || !order.approvedAt ? credit.check.result : order.creditResult,
        creditSnapshot: credit.snapshot,
        ...(clearApproval && { approvedAt: null, approvalRequired: false }),
      };
      await this.bump(tx, ctx, order.id, dto.version, data, 'DRAFT');
      if (priced) {
        await tx.salOrderVoucher.deleteMany({ where: { salesOrderId: order.id } });
        await tx.salOrderVoucher.createMany({ data: priced.vouchers.map((v, i) => ({ ...v, tenantId: ctx.tenantId, salesOrderId: order.id, sortOrder: i + 1 })) });
      }
      if (built) {
        await tx.salSalesOrderLine.deleteMany({ where: { salesOrderId: order.id } });
        await tx.salSalesOrderLine.createMany({ data: built.lines.map(({ qty, unitCost: _cost, ...l }, i) => ({ ...l, orderedQty: qty, tenantId: ctx.tenantId, salesOrderId: order.id, lineNo: i + 1 })) });
      }
      await this.log(tx, ctx, order.id, order.docNo, 'saved', `Saved by ${ctx.user.name}`);
      if (creditChanged) await this.log(tx, ctx, order.id, order.docNo, 'credit_check', creditActivityText(credit.input, credit.check), null, 1);
      if (clearApproval) await this.log(tx, ctx, order.id, order.docNo, 'approval_cleared', 'Approval cleared: the order changed after it was approved');
    });
    return this.query.detail(ctx, id);
  }

  /** Deletes a draft. Its number is not reused: the gap shows in the sequence. */
  async remove(ctx: RequestContext, id: string, version: number) {
    const order = await this.query.load(ctx.tenantId, id);
    this.require(await this.actionsFor(ctx, order), 'delete', 'Only draft orders can be deleted.');
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.salSalesOrder.deleteMany({ where: { id, tenantId: ctx.tenantId, version, status: 'DRAFT' } });
      if (deleted.count === 0) throw new StaleVersionError();
      await this.approvals.cancelPending(tx, ctx, SAL_ENTITY.ORDER, id);
      await this.log(tx, ctx, id, order.docNo, 'deleted', `Draft deleted by ${ctx.user.name}. ${order.docNo} will not be used again.`);
    });
    return { deleted: true, docNo: order.docNo };
  }

  // ── Credit approval (S12) ─────────────────────────────────────────────────

  /**
   * Sends a draft for approval: over its credit limit (credit control, S12) and/or, with the price range on (phase 5),
   * priced outside the range. One request, with a step for the Sales Manager for the price and one for the credit
   * rule's approver (one step when they are the same role).
   */
  async requestApproval(ctx: RequestContext, id: string, dto: RequestApprovalDto) {
    const order = await this.query.load(ctx.tenantId, id);
    const credit = await this.query.liveCredit(ctx, order);
    const price = await this.query.priceCheck(ctx.tenantId, order);
    const revision = await this.query.revisionState(ctx.tenantId, order);
    const revisionNeeds = Boolean(revision?.approval.needs);
    const creditNeeds = Boolean(credit && credit.check.action === 'APPROVAL');
    if (credit && credit.check.action === 'BLOCK') {
      throw new BusinessRuleError('APPROVAL_NOT_NEEDED', `The credit check blocks this order: ${breachText(credit.check)}. It cannot be approved; reduce the order or ask Finance.`);
    }
    if (credit && !creditNeeds && !price.needs && !revisionNeeds) {
      throw new BusinessRuleError('APPROVAL_NOT_NEEDED', price.rangeOn ? 'The credit check passed and every price is within the allowed range. Release the order directly.' : 'The credit check passed. Release the order directly.');
    }
    this.require(this.query.actions(ctx, order, credit, price.needs, { needs: revisionNeeds }), 'requestApproval', order.status === 'PENDING_APPROVAL' ? `${order.docNo} is already waiting for approval.` : ORDER_LOCKED_MESSAGE);
    const steps: Awaited<ReturnType<SalesDocumentLines['approver']>>[] = [];
    const reasons: string[] = [];
    if (revisionNeeds) {
      steps.push(await this.docs.approver(ctx, SAL_ROLE.MANAGER, order.branchCode));
      reasons.push(revision!.approval.reason!);
    }
    if (price.needs) {
      if (!steps.some((s) => s.approverRole === SAL_ROLE.MANAGER)) steps.push(await this.docs.approver(ctx, SAL_ROLE.MANAGER, order.branchCode));
      reasons.push(price.reason!);
    }
    if (creditNeeds) {
      const role = credit!.approverRole ?? SAL_ROLE.MANAGER;
      if (!steps.some((s) => s.approverRole === role)) steps.push(await this.docs.approver(ctx, role, order.branchCode));
      reasons.push(breachText(credit!.check));
    }
    const from = order.quotationNo ? ` · from quotation ${order.quotationNo}` : order.enquiryNo ? ` · from enquiry ${order.enquiryNo}` : '';
    const to = steps.map((s) => s.approverName ?? s.approverRole).join(', then ');

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, order.id, dto.version, {
        status: 'PENDING_APPROVAL', approvalRequired: true, ...(creditNeeds && { creditResult: 'OVER_LIMIT', creditSnapshot: credit!.snapshot }),
      }, 'DRAFT');
      await this.approvals.create(tx, ctx, {
        entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, amount: order.total,
        title: `${order.docNo} · ${order.customerName}`,
        reason: `${reasons.join(' · ')}${from}`,
        requesterNote: dto.reason, steps,
      });
      const why = [revisionNeeds ? revision!.approval.reason : null, price.needs ? price.reason : null].filter(Boolean).join(' · ');
      await this.log(tx, ctx, order.id, order.docNo, 'approval_requested', why ? `${why} · sent for approval to ${to}` : `Sent for approval to ${to}`, dto.reason.trim());
    });
    return this.query.detail(ctx, id);
  }

  /** Called by the approvals inbox after a decision on a sales order, inside its transaction. */
  async onApprovalDecision(tx: Tx, ctx: RequestContext, result: DecisionResult, comment: string | null) {
    const order = await tx.salSalesOrder.findFirstOrThrow({ where: { id: result.entityId, tenantId: ctx.tenantId } });
    if (result.outcome === 'NEXT_STEP') {
      await this.log(tx, ctx, order.id, order.docNo, 'approved_step', `Approved by ${ctx.user.name} · waiting for the next approver`, comment);
      return;
    }
    const approved = result.outcome === 'APPROVED';
    // The credit result moves only when the credit was part of the request; a price-only request leaves it.
    const creditAsked = order.creditResult === 'OVER_LIMIT';
    await tx.salSalesOrder.update({
      where: { id: order.id },
      data: {
        status: 'DRAFT', approvedAt: approved ? this.clock.now() : null, creditResult: creditAsked ? (approved ? 'APPROVED' : 'OVER_LIMIT') : order.creditResult,
        version: { increment: 1 }, updatedBy: ctx.user.code,
      },
    });
    await this.log(tx, ctx, order.id, order.docNo, approved ? 'approved' : 'rejected',
      approved ? `Approved by ${ctx.user.name} · ready to release` : `Rejected by ${ctx.user.name} · back to draft`, comment);
  }

  // ── Release (FlowS2 step 5) ───────────────────────────────────────────────

  async release(ctx: RequestContext, id: string, version: number) {
    const order = await this.query.load(ctx.tenantId, id);
    const customer = await this.docs.activeCustomer(ctx, order.customerCode);
    const credit = await this.query.liveCredit(ctx, order);
    if (order.status === 'DRAFT' && credit && !order.approvedAt) {
      if (credit.check.action === 'BLOCK') throw new BusinessRuleError('CREDIT_BLOCKED', `${creditActivityText(credit.input, credit.check)}. The order cannot be released.`);
      if (credit.check.action === 'APPROVAL') throw new BusinessRuleError('CREDIT_APPROVAL_REQUIRED', `${creditActivityText(credit.input, credit.check)}. Type a reason and request approval.`);
    }
    const price = await this.query.priceCheck(ctx.tenantId, order);
    if (price.needs) throw new BusinessRuleError('PRICE_APPROVAL_REQUIRED', `${price.reason}. Type a reason and request approval.`);
    const revision = await this.query.revisionState(ctx.tenantId, order);
    if (revision?.approval.needs && !order.approvedAt) throw new BusinessRuleError('REVISION_APPROVAL_REQUIRED', `${revision.approval.reason}. Type a reason and request approval.`);
    this.require(this.query.actions(ctx, order, credit, price.needs, { needs: Boolean(revision?.approval.needs) }), 'release', order.status === 'PENDING_APPROVAL' ? `${order.docNo} is waiting for approval.` : `${order.docNo} is already released.`);
    const giftOnly = order.lines.filter((l) => l.lineKind === 'GIFT' && !order.lines.some((o) => o.itemCode === l.itemCode && o.lineKind !== 'GIFT')).map((l) => l.itemCode);
    await this.docs.checkStillSellable(ctx, order.branchCode, order.lines.map((l) => l.itemCode), giftOnly);

    // Stock only warns (policy "Stock check while entering: warn, never block").
    const items = await this.masterData.findItems(ctx.tenantId, order.lines.map((l) => l.itemCode));
    const stock = await this.stock.listStock(ctx.tenantId, order.lines.map((l) => l.itemCode));
    const held = await this.heldStock.held(ctx.tenantId, order.lines.map((l) => l.itemCode), order.id);
    const shortfall = stockShortfall(order.lines.map((l) => ({
      held: held(l.itemCode, order.warehouseCode),
      itemCode: l.itemCode, qty: l.orderedQty, isStock: items.find((i) => i.code === l.itemCode)?.type === 'STOCK' && !l.isBuyToOrder,
      onHand: stock.filter((s) => s.itemCode === l.itemCode && s.warehouseCode === order.warehouseCode).reduce((sum, s) => sum.add(dec(s.onHand)), dec(0)),
    })));
    // Installation (phase 5): the date is needed when every item is in stock; short or bought-to-order items wait for stock.
    const allInStock = !shortfall && !order.lines.some((l) => l.isBuyToOrder);
    const install = releaseInstallation({ installOption: order.installOption, installDate: order.installDate ? iso(order.installDate) : null }, allInStock);
    if (install.refusal) throw new BusinessRuleError('INSTALL_DATE_REQUIRED', install.refusal);
    // Pre-order (phase 5): with the switch on, short stock makes the whole order a pre-order.
    const preOrdersOn = Boolean((await this.prisma.salSetting.findUnique({ where: { tenantId: ctx.tenantId }, select: { preOrders: true } }))?.preOrders);
    const pre = preOrderAtRelease(preOrdersOn, shortfall);
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      // A revision goes out again under the same number; the order keeps its first release (phase 5).
      const first = !order.releasedAt;
      await this.bump(tx, ctx, order.id, version, {
        installAfterStock: install.afterStock, revisingSince: null, isPreOrder: pre.isPreOrder, preOrderShort: pre.note,
        status: 'RELEASED', ...(first && { releasedAt: now, releasedByCode: ctx.user.code, releasedByName: ctx.user.name }),
        ...(credit && !order.approvedAt && { creditResult: credit.check.result, creditSnapshot: credit.snapshot }),
      }, 'DRAFT');
      if (shortfall) await this.log(tx, ctx, order.id, order.docNo, 'stock_warning', `At release: ${shortfall}. Warned, not blocked (policy: stock check warns).`);
      if (pre.isPreOrder) await this.log(tx, ctx, order.id, order.docNo, 'pre_order', preOrderActivity(shortfall!));
      const bto = order.lines.filter((l) => l.isBuyToOrder);
      if (revision) {
        const changes = revision.changes.changes.length ? revision.changes.changes.join('; ') : 'No changes';
        await tx.salOrderRevision.update({ where: { id: revision.before.id }, data: { replacedAt: now, changes } });
        await this.log(tx, ctx, order.id, order.docNo, 'released', `Revision ${order.revisionNo} released by ${ctx.user.name}: ${changes} · event sales.order.released saved`);
      } else {
        await this.log(tx, ctx, order.id, order.docNo, 'released', `Released by ${ctx.user.name} · event sales.order.released saved${bto.length ? ' · Purchase drafts a PO for the buy-to-order lines' : ''}`);
      }
      await this.outbox.publish(tx, ctx, [{
        name: SAL_EVENT.ORDER_RELEASED, aggregateType: SAL_ENTITY.ORDER, aggregateId: order.id,
        payload: {
          soNo: order.docNo, revision: order.revisionNo, docDate: iso(order.docDate), branchCode: order.branchCode, customerCode: customer.code, customerName: customer.name,
          agentCode: order.agentCode, agentName: order.agentName,
          contactName: order.contactName, deliveryAddress: order.deliveryAddress, deliveryPostcode: order.deliveryPostcode, deliveryState: order.deliveryState,
          total: toMoney(order.total), deliveryWantedBy: order.deliveryWantedBy ? iso(order.deliveryWantedBy) : null, warehouseCode: order.warehouseCode,
          lines: order.lines.map((l) => ({ lineNo: l.lineNo, itemCode: l.itemCode, uomCode: l.uomCode, qty: toQty(l.orderedQty), isBuyToOrder: l.isBuyToOrder, lineKind: l.lineKind, packageCode: l.packageCode })),
          preOrder: pre.isPreOrder,
          installation: order.installOption
            ? { option: order.installOption, preferredDate: order.installDate ? iso(order.installDate) : null, afterStock: install.afterStock }
            : null,
          vouchers: order.vouchers.map((v) => ({ voucherNo: v.voucherNo, amount: toMoney(v.amount), taxCode: v.taxCode, taxAmount: toMoney(v.taxAmount) })),
        },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  // ── Revisions (phase 5) ───────────────────────────────────────────────────

  /**
   * Starts the next revision of a released order: the order as it is is kept read-only, and the order goes back to
   * draft under the same number, with the reason. It is changed with the usual form and released again.
   */
  async revise(ctx: RequestContext, id: string, dto: ReviseOrderDto) {
    const order = await this.query.load(ctx.tenantId, id);
    const check = order.status === 'RELEASED' ? await this.query.reviseCheck(ctx.tenantId, order) : null;
    if (check) throw new BusinessRuleError(check.code, check.message);
    this.require(await this.actionsFor(ctx, order), 'revise', order.status === 'RELEASED' ? 'You cannot revise sales orders.' : `Only a released order with nothing delivered can be revised.`);
    const reason = dto.reason.trim();
    const next = order.revisionNo + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.salOrderRevision.create({
        data: {
          tenantId: ctx.tenantId, salesOrderId: order.id, revisionNo: order.revisionNo, snapshot: snapshotOf(order) as unknown as Prisma.InputJsonValue,
          reason, revisedBy: ctx.user.name, revisedAt: this.clock.now(),
        },
      });
      const r = await tx.salSalesOrder.updateMany({
        where: { id: order.id, tenantId: ctx.tenantId, version: dto.version, status: 'RELEASED' },
        data: {
          status: 'DRAFT', revisionNo: next, revisingSince: this.clock.now(), reviseReason: reason, approvedAt: null, approvalRequired: false,
          version: { increment: 1 }, updatedBy: ctx.user.code,
        },
      });
      if (r.count === 0) throw new StaleVersionError();
      await this.log(tx, ctx, order.id, order.docNo, 'revised', `Revision ${next} started by ${ctx.user.name}; revision ${order.revisionNo} is kept. The order is back in draft until it is released again.`, reason);
    });
    return this.query.detail(ctx, id);
  }

  /** Drops the revision in draft: the order goes back to the revision before, as it was released. */
  async discardRevision(ctx: RequestContext, id: string, version: number) {
    const order = await this.query.load(ctx.tenantId, id);
    this.require(await this.actionsFor(ctx, order), 'discardRevision', order.status === 'PENDING_APPROVAL' ? `${order.docNo} is waiting for approval and is locked.` : `${order.docNo} is not being revised.`);
    const before = await this.prisma.salOrderRevision.findFirstOrThrow({ where: { tenantId: ctx.tenantId, salesOrderId: order.id, revisionNo: order.revisionNo - 1 } });
    const snap = before.snapshot as unknown as RevisionSnapshot;
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, order.id, version, {
        ...headerData(snap), status: 'RELEASED', revisionNo: before.revisionNo, revisingSince: null, reviseReason: null,
      }, 'DRAFT');
      await tx.salSalesOrderLine.deleteMany({ where: { salesOrderId: order.id } });
      await tx.salOrderVoucher.deleteMany({ where: { salesOrderId: order.id } });
      await tx.salSalesOrderLine.createMany({ data: snap.lines.map((l) => ({ ...l, salesOrderId: order.id })) as Prisma.SalSalesOrderLineCreateManyInput[] });
      if (snap.vouchers.length) await tx.salOrderVoucher.createMany({ data: snap.vouchers.map((v) => ({ ...v, salesOrderId: order.id })) as Prisma.SalOrderVoucherCreateManyInput[] });
      await tx.salOrderRevision.delete({ where: { id: before.id } });
      await this.approvals.cancelPending(tx, ctx, SAL_ENTITY.ORDER, order.id);
      await this.log(tx, ctx, order.id, order.docNo, 'revision_discarded', `Revision ${order.revisionNo} discarded by ${ctx.user.name}; back to revision ${before.revisionNo} as it was released`);
    });
    return this.query.detail(ctx, id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * The installation option, preferred date, and the delivery address's postcode and state the order keeps (phase 5):
   * only when the company asks for them.
   */
  private async installation(
    tenantId: string,
    docDate: string,
    input: { option?: string | null; date?: string | null; postcode?: string | null; state?: string | null },
    current: { option: string | null; date: string | null; postcode: string | null; state: string | null } | null = null,
  ) {
    const setting = await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { askInstallation: true } });
    const asked = Boolean(setting?.askInstallation);
    const fields = installationFields(asked, input, current);
    const errors = installationErrors(fields, docDate);
    if (errors.length) throw new ValidationFailedError(errors);
    return { ...fields, ...deliveryAreaFields(asked, input, current) };
  }

  /** Prices the order's vouchers against its lines and works out the totals with them (phase 5, F1 part 4). */
  private async withVouchers(tenantId: string, lines: TaxedLine[], input: VoucherInput[]) {
    const [taxes, setting] = await Promise.all([
      this.masterData.listTaxCodes(tenantId),
      this.prisma.salSetting.findUnique({ where: { tenantId }, select: { roundTo5Sen: true } }),
    ]);
    const { vouchers, errors } = priceVouchers(input, lines, new Map(taxes.map((t) => [t.code, t.name])));
    if (errors.length) throw new ValidationFailedError(errors);
    return { vouchers, totals: totalsWithVouchers(lines, vouchers, setting?.roundTo5Sen ?? true) };
  }


  /**
   * The order's lines from what the form sent: item lines as they are, packages as their items and free gifts
   * (phase 5). Errors point at the line the user typed.
   */
  private async buildLines(ctx: RequestContext, customer: MdCustomer, branchCode: string, docDate: string, entered: EnteredLine[]) {
    const expanded = await this.packages.expand(ctx.tenantId, docDate, entered);
    try {
      const built = await this.docs.buildLines(ctx, customer, branchCode, docDate, expanded.input, 'EXCLUSIVE', expanded.options);
      return { ...built, lines: built.lines.map((l, i) => ({ ...l, ...expanded.meta[i]! })) };
    } catch (error) {
      if (!(error instanceof ValidationFailedError)) throw error;
      const body = error.getResponse() as { message: string; errors: { field: string; message: string }[] };
      throw new ValidationFailedError(toEnteredLine(body.errors, expanded.origin), body.message);
    }
  }


  private async actionsFor(ctx: RequestContext, order: OrderWithLines) {
    return this.query.actionsWithRevision(ctx, order, await this.query.liveCredit(ctx, order), (await this.query.priceCheck(ctx.tenantId, order)).needs);
  }

  private require(actions: OrderAction[], action: OrderAction, message: string) {
    if (!actions.includes(action)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', message);
  }

  /** Optimistic lock + status guard: refuses if someone else changed the order meanwhile. */
  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SalSalesOrderUpdateManyMutationInput, status?: 'DRAFT') {
    const result = await tx.salSalesOrder.updateMany({
      where: { id, tenantId: ctx.tenantId, version, ...(status && { status }) },
      data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code },
    });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string, comment?: string | null, afterMs = 0) {
    return this.activity.log(tx, ctx, { entityType: SAL_ENTITY.ORDER, entityId: id, docNo, action, message, comment: comment ?? null, afterMs });
  }
}
