import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ApprovalsService } from '../../platform/approvals/approvals.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toMoney, toQty, toRmText } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { breachText, creditActivityText } from '../shared/credit.rules';
import { SalesDocumentLines } from '../shared/document-lines.service';
import { SalesMailService } from '../shared/sales-mail.service';
import { SAL_DOC_TYPE, SAL_ENTITY, SAL_EVENT, SAL_LINK, SAL_ROLE } from '../shared/sales.constants';
import { DeliveriesQuery, type DeliveryWithLines, type OrderWithLines } from './deliveries.query';
import { deliverProblems, DO_LOCKED_MESSAGE, openToDeliver, orderStatusAfterDelivery, type DeliveryAction } from './delivery.rules';
import { refuseErrors, signErrors } from './signed-delivery.rules';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import type { DeliveryApprovalDto, DeliveryNoteDto, RefuseDeliveryDto, SignDeliveryDto, UpdateDeliveryDto } from './dto/delivery.dto';

export const SIGNED_DO_KIND = 'SIGNED_DO';
export const REFUSED_DO_KIND = 'REFUSED_DO';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const qtyText = (lines: { qty: Prisma.Decimal; uomCode: string }[]) =>
  lines.filter((l) => l.qty.gt(0)).map((l) => `${toQty(l.qty).replace(/\.0+$/, '')} ${l.uomCode}`).join(', ');

/**
 * Delivery order commands (FlowS2 steps 7–9). Sales confirms deliveries until Inventory takes over: confirming
 * raises the order's delivered quantity in the same transaction and saves `sales.shipment.requested`.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: DeliveriesQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly approvals: ApprovalsService,
    private readonly outbox: OutboxWriter,
    private readonly mail: SalesMailService,
    private readonly docs: SalesDocumentLines,
    private readonly permissions: PermissionRegistry,
    private readonly clock: ClockService,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /** "Create DO" from the waiting list (S15): a draft for everything still open on a released order. */
  async create(ctx: RequestContext, salesOrderId: string) {
    if (!this.permissions.has(ctx.user.roles, P.DELIVERY_EDIT)) throw new BusinessRuleError('ACTION_NOT_ALLOWED', 'Only the store team can create delivery orders.');
    const order = await this.prisma.salSalesOrder.findFirst({ where: { id: salesOrderId, tenantId: ctx.tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } } });
    if (!order) throw ValidationFailedError.field('salesOrderId', 'Pick a released sales order.');
    if (order.isMigrated || !['RELEASED', 'PARTIAL'].includes(order.status)) {
      throw new BusinessRuleError('ORDER_NOT_DELIVERABLE', `${order.docNo} is not waiting for delivery. Only released orders with a balance can be delivered.`);
    }
    const { id } = await this.prisma.$transaction(async (tx) => this.draft(tx, ctx, order, this.clock.today(), `Created from ${order.docNo} by ${ctx.user.name}`));
    return this.query.detail(ctx, id);
  }

  /**
   * Drafts a delivery order for everything still open on the order, in the caller's transaction: the store's button, or
   * the system 24 hours before the installation (phase 5, InstallDeliveryListener).
   */
  async draft(tx: Tx, ctx: RequestContext, order: OrderWithLines, docDate: string, message: string, extra: { driver?: string | null } = {}): Promise<{ id: string; docNo: string }> {
    const cancelling = await tx.salCancelOrderLine.findMany({
      where: { tenantId: ctx.tenantId, soLineId: { in: order.lines.map((l) => l.id) }, cancelOrder: { status: 'DRAFT' } },
      select: { soLineId: true, cancelQty: true },
    });
    const open = order.lines
      .map((l) => ({ l, balance: openToDeliver(l).sub(cancelling.filter((c) => c.soLineId === l.id).reduce((s, c) => s.add(c.cancelQty), dec(0))) }))
      .filter((x) => x.balance.gt(0));
    if (!open.length) throw new BusinessRuleError('NOTHING_TO_DELIVER', `${order.docNo} has nothing left to deliver.`);

    const docNo = await this.numbering.next(tx, ctx.tenantId, SAL_DOC_TYPE.DELIVERY, { date: docDate, branchCode: order.branchCode });
    const row = await tx.salDelivery.create({
      data: {
        tenantId: ctx.tenantId, docNo, docDate: day(docDate), status: 'DRAFT', branchCode: order.branchCode,
        salesOrderId: order.id, salesOrderNo: order.docNo, customerCode: order.customerCode, customerName: order.customerName,
        warehouseCode: order.warehouseCode, deliverTo: order.deliveryAddress, receiver: order.contactName, driver: extra.driver ?? null,
        createdBy: ctx.user.code, updatedBy: ctx.user.code,
        lines: {
          create: open.map(({ l, balance }, i) => ({
            tenantId: ctx.tenantId, lineNo: i + 1, soLineId: l.id, itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName, uomCode: l.uomCode,
            orderedQty: l.orderedQty, deliveredBeforeQty: l.deliveredQty, qty: balance,
          })),
        },
      },
    });
    await tx.sysDocLink.create({
      data: { tenantId: ctx.tenantId, fromType: SAL_ENTITY.ORDER, fromId: order.id, fromNo: order.docNo, toType: SAL_ENTITY.DELIVERY, toId: row.id, toNo: docNo, linkType: SAL_LINK.DELIVERED },
    });
    await this.log(tx, ctx, row.id, docNo, 'created', message);
    // An order with installation (phase 5) tells its job which delivery order it has.
    if (order.installOption === 'INSTALLATION') await this.publishDrafted(tx, ctx, order, { id: row.id, docNo });
    if (order.autoDoNote) await tx.salSalesOrder.update({ where: { id: order.id }, data: { autoDoNote: null } });
    return { id: row.id, docNo };
  }

  publishDrafted(tx: Tx, ctx: RequestContext, order: { id: string; docNo: string }, d: { id: string; docNo: string }) {
    return this.outbox.publish(tx, ctx, [{
      name: SAL_EVENT.DELIVERY_DRAFTED, aggregateType: SAL_ENTITY.DELIVERY, aggregateId: d.id,
      payload: { doNo: d.docNo, doId: d.id, salesOrderId: order.id, salesOrderNo: order.docNo },
    }]);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateDeliveryDto) {
    const d = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, d, 'edit', this.lockedMessage(d));
    const lines = this.query.linesOf(d);
    const changes = new Map((dto.lines ?? []).map((l) => [l.lineNo, dec(l.qty)]));
    const problems = deliverProblems(lines.map((x) => ({ qty: changes.get(x.line.lineNo) ?? x.line.qty, balance: x.balance }))).filter((p) => p.field !== 'lines');
    if (problems.length) throw new ValidationFailedError(problems, 'Check the quantities before you save.');
    const qtyChanged = lines.some((x) => changes.has(x.line.lineNo) && !changes.get(x.line.lineNo)!.eq(x.line.qty));

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, dto.version, {
        ...(dto.docDate && { docDate: day(dto.docDate) }),
        ...(dto.vehicle !== undefined && { vehicle: dto.vehicle.trim() || null }),
        ...(dto.driver !== undefined && { driver: dto.driver.trim() || null }),
        ...(dto.consignmentNote !== undefined && { consignmentNote: dto.consignmentNote.trim() || null }),
        ...(dto.deliverTo !== undefined && { deliverTo: dto.deliverTo.trim() || null }),
        ...(dto.receiver !== undefined && { receiver: dto.receiver.trim() || null }),
        ...(dto.warehouseNote !== undefined && { warehouseNote: dto.warehouseNote.trim() || null }),
        // Changing what was approved removes the credit approval.
        ...(qtyChanged && d.approvedAt && { approvedAt: null }),
      });
      for (const x of lines) {
        const qty = changes.get(x.line.lineNo);
        if (qty && !qty.eq(x.line.qty)) await tx.salDeliveryLine.update({ where: { id: x.line.id }, data: { qty } });
      }
      await this.log(tx, ctx, d.id, d.docNo, 'saved', `Saved by ${ctx.user.name}`);
      if (qtyChanged && d.approvedAt) await this.log(tx, ctx, d.id, d.docNo, 'approval_cleared', 'Approval cleared: the quantities changed after it was approved', null, 1);
    });
    return this.query.detail(ctx, id);
  }

  /** Deletes a draft DO. Its number is not reused. */
  async remove(ctx: RequestContext, id: string, version: number) {
    const d = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, d, 'delete', this.lockedMessage(d));
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.salDelivery.deleteMany({ where: { id, tenantId: ctx.tenantId, version, status: 'DRAFT' } });
      if (deleted.count === 0) throw new StaleVersionError();
      await tx.sysDocLink.deleteMany({ where: { tenantId: ctx.tenantId, toType: SAL_ENTITY.DELIVERY, toId: id } });
      await this.approvals.cancelPending(tx, ctx, SAL_ENTITY.DELIVERY, id);
      await this.log(tx, ctx, id, d.docNo, 'deleted', `Draft deleted by ${ctx.user.name}. ${d.docNo} will not be used again.`);
      if (d.salesOrder?.installOption === 'INSTALLATION') {
        await this.outbox.publish(tx, ctx, [{
          name: SAL_EVENT.DELIVERY_REMOVED, aggregateType: SAL_ENTITY.DELIVERY, aggregateId: id,
          payload: { doNo: d.docNo, doId: id, salesOrderId: d.salesOrder.id, salesOrderNo: d.salesOrder.docNo },
        }]);
      }
    });
    return { deleted: true, docNo: d.docNo };
  }

  // ── Credit approval (policy "Delivery order": over the overdue limit → Sales Manager) ──

  async requestApproval(ctx: RequestContext, id: string, dto: DeliveryApprovalDto) {
    const d = await this.query.load(ctx.tenantId, id);
    const credit = await this.query.liveCredit(ctx, d);
    if (!credit || credit.check.action !== 'APPROVAL') {
      throw new BusinessRuleError('APPROVAL_NOT_NEEDED', credit?.check.action === 'BLOCK'
        ? `The credit check blocks this delivery: ${breachText(credit.check)}. It cannot be approved.`
        : 'The credit check passed. Confirm the delivery directly.');
    }
    await this.requireAction(ctx, d, 'requestApproval', this.lockedMessage(d));
    const step = await this.docs.approver(ctx, credit.approverRole ?? SAL_ROLE.MANAGER, d.branchCode);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, dto.version, { creditResult: 'OVER_LIMIT', creditSnapshot: credit.snapshot });
      await this.approvals.create(tx, ctx, {
        entityType: SAL_ENTITY.DELIVERY, entityId: d.id, docNo: d.docNo, amount: dec(credit.input.thisDocument),
        title: `${d.docNo} · ${d.customerName}`,
        reason: `${breachText(credit.check)} · delivery of ${d.salesOrderNo}`,
        requesterNote: dto.reason, steps: [step],
      });
      await this.log(tx, ctx, d.id, d.docNo, 'approval_requested', `Sent for approval to ${step.approverName ?? step.approverRole}`, dto.reason.trim());
    });
    return this.query.detail(ctx, id);
  }

  // ── Confirm (FlowS2 step 8) ───────────────────────────────────────────────

  /**
   * The sales order row is locked first, so two delivery orders for the same order can never together deliver
   * more than its balance (rule 1). A released proforma that is not paid holds the delivery (rule 9).
   */
  async confirm(ctx: RequestContext, id: string, version: number) {
    const d = await this.query.load(ctx.tenantId, id);
    if (d.status === 'DRAFT' && (await this.query.signed(ctx.tenantId, d))) {
      throw new BusinessRuleError('SIGNATURE_NEEDED', `${d.docNo} is delivered when the customer signs it. Mark it collected first, then record the signature.`);
    }
    const credit = await this.checkLeaving(ctx, d, 'confirm');
    await this.deliver(ctx, d, version, credit, { by: 'store' });
    return this.query.detail(ctx, id);
  }

  /** What must hold before goods leave the store: credit, the deposit, and the action itself. */
  private async checkLeaving(ctx: RequestContext, d: DeliveryWithLines, action: DeliveryAction) {
    if (!d.salesOrder) throw new BusinessRuleError('ORDER_MISSING', `${d.docNo} has no sales order to deliver.`);
    const credit = await this.query.liveCredit(ctx, d);
    if (d.status === 'DRAFT' && credit && !d.approvedAt) {
      if (credit.check.action === 'BLOCK') throw new BusinessRuleError('CREDIT_BLOCKED', `${creditActivityText(credit.input, credit.check)}. The delivery cannot be confirmed.`);
      if (credit.check.action === 'APPROVAL') throw new BusinessRuleError('CREDIT_APPROVAL_REQUIRED', `${creditActivityText(credit.input, credit.check)}. Type a reason and request approval.`);
    }
    await this.requireAction(ctx, d, action, this.lockedMessage(d));
    const hold = (await this.query.unpaidProformas(ctx.tenantId, [d.salesOrder.id])).get(d.salesOrder.id);
    if (hold) {
      throw new BusinessRuleError('DEPOSIT_UNPAID', `Delivery of ${d.salesOrderNo} is on hold until the deposit on ${hold.docNo} (${toRmText(hold.amount)}) is paid.`);
    }
    return credit;
  }

  /** The goods are the customer's: the order's delivered quantity goes up and Inventory is told, in one transaction. */
  private async deliver(
    ctx: RequestContext, d: DeliveryWithLines, version: number, credit: Awaited<ReturnType<DeliveriesQuery['liveCredit']>>,
    how: { by: 'store' } | { by: 'signature'; signerName: string; fileIds: string[] } | { by: 'management'; note: string | null },
  ) {
    const customer = await this.masterData.findCustomer(ctx.tenantId, d.customerCode);
    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sal_sales_order WHERE id = ${d.salesOrder!.id} FOR UPDATE`;
      const order = await tx.salSalesOrder.findUniqueOrThrow({ where: { id: d.salesOrder!.id }, include: { lines: { orderBy: { lineNo: 'asc' } } } });
      if (!['RELEASED', 'PARTIAL'].includes(order.status)) {
        throw new BusinessRuleError('ORDER_NOT_DELIVERABLE', `${order.docNo} is ${order.status === 'DONE' ? 'already fully delivered or closed' : 'not released'}. Nothing more can be delivered.`);
      }
      const counted = d.lines.map((l) => {
        const so = order.lines.find((x) => x.id === l.soLineId)!;
        return { line: l, so, balance: openToDeliver(so) };
      });
      const problems = deliverProblems(counted.map((c) => ({ qty: c.line.qty, balance: c.balance })));
      if (problems.length) throw new ValidationFailedError(problems, 'Check the quantities before you confirm.');

      await this.bump(tx, ctx, d.id, version, {
        status: 'CONFIRMED', confirmedAt: now, confirmedByCode: ctx.user.code, confirmedByName: ctx.user.name,
        ...(how.by === 'signature' && { signedAt: now, signerName: how.signerName, refusedAt: null, refusedByCode: null, refusedByName: null, refuseReason: null, refuseReturned: null }),
        ...(how.by === 'management' && { unsignedByName: ctx.user.name }),
        ...(credit && !d.approvedAt && { creditResult: credit.check.result, creditSnapshot: credit.snapshot }),
      }, 'DRAFT');
      if (how.by === 'signature') await this.attachments.attach(tx, ctx, how.fileIds, SAL_ENTITY.DELIVERY, d.id);
      for (const c of counted) {
        if (c.line.qty.eq(0)) {
          await tx.salDeliveryLine.delete({ where: { id: c.line.id } });
          continue;
        }
        await tx.salDeliveryLine.update({ where: { id: c.line.id }, data: { orderedQty: c.so.orderedQty, deliveredBeforeQty: c.so.deliveredQty } });
        await tx.salSalesOrderLine.update({ where: { id: c.so.id }, data: { deliveredQty: { increment: c.line.qty } } });
      }
      const after = order.lines.map((l) => {
        const c = counted.find((x) => x.so.id === l.id);
        return { ...l, deliveredQty: c ? l.deliveredQty.add(c.line.qty) : l.deliveredQty };
      });
      const status = orderStatusAfterDelivery(after);
      await tx.salSalesOrder.update({ where: { id: order.id }, data: { status, version: { increment: 1 }, updatedBy: ctx.user.code } });

      const delivered = qtyText(counted.map((c) => ({ qty: c.line.qty, uomCode: c.line.uomCode })));
      const balance = after.reduce((s, l) => s.add(openToDeliver(l)), dec(0));
      if (credit?.check.action === 'WARN') await this.log(tx, ctx, d.id, d.docNo, 'credit_check', creditActivityText(credit.input, credit.check));
      const said = how.by === 'signature' ? `Signed by ${how.signerName}, recorded by ${ctx.user.name}` : how.by === 'management' ? `Accepted without a signature by ${ctx.user.name}` : `Confirmed by ${ctx.user.name}`;
      await this.log(tx, ctx, d.id, d.docNo, 'confirmed', `${said} · ${delivered} delivered${d.driver ? `, driver ${d.driver}` : ''} · event saved for Inventory`, how.by === 'management' ? how.note : null, 1);
      await this.activity.log(tx, ctx, {
        entityType: SAL_ENTITY.ORDER, entityId: order.id, docNo: order.docNo, action: 'delivered',
        message: `${d.docNo} confirmed: ${delivered} delivered, balance ${toQty(balance).replace(/\.0+$/, '')}`, comment: null,
      });
      await this.outbox.publish(tx, ctx, [{
        name: SAL_EVENT.SHIPMENT_REQUESTED, aggregateType: SAL_ENTITY.DELIVERY, aggregateId: d.id,
        payload: {
          doNo: d.docNo, soNo: order.docNo, branchCode: d.branchCode, warehouseCode: d.warehouseCode, customerCode: d.customerCode,
          deliverTo: d.deliverTo, vehicle: d.vehicle, driver: d.driver, consignmentNote: d.consignmentNote,
          lines: counted.filter((c) => c.line.qty.gt(0)).map((c) => ({ lineNo: c.line.lineNo, soLineNo: c.so.lineNo, itemCode: c.line.itemCode, uomCode: c.line.uomCode, qty: toQty(c.line.qty) })),
        },
      }]);
      if (order.installOption === 'INSTALLATION') {
        await this.outbox.publish(tx, ctx, [{
          name: SAL_EVENT.DELIVERY_DELIVERED, aggregateType: SAL_ENTITY.DELIVERY, aggregateId: d.id,
          payload: { doNo: d.docNo, doId: d.id, salesOrderId: order.id, salesOrderNo: order.docNo, how: how.by === 'signature' ? 'SIGNED' : how.by === 'management' ? 'UNSIGNED' : 'CONFIRMED', signerName: how.by === 'signature' ? how.signerName : null },
        }]);
      }
      if (customer?.email) {
        await this.mail.send(tx, ctx, {
          templateKey: 'DELIVERY_NOTICE', entityType: SAL_ENTITY.DELIVERY, entityId: d.id, docNo: d.docNo, to: customer.email,
          vars: { 'contact.name': order.contactName ?? customer.contactName ?? customer.name, 'document.number': d.docNo, 'document.customer_ref': order.customerPoRef ?? '—', 'document.total': toMoney(0) },
        });
      }
    });
  }

  // ── The signed delivery order (phase 5) ───────────────────────────────────

  /** The installer collected the goods: from here they only change by signature, refusal or checking them back in. */
  async collect(ctx: RequestContext, id: string, version: number) {
    const d = await this.query.load(ctx.tenantId, id);
    const credit = await this.checkLeaving(ctx, d, 'collect');
    const problems = deliverProblems(this.query.linesOf(d).map((x) => ({ qty: x.line.qty, balance: x.balance })));
    if (problems.length) throw new ValidationFailedError(problems, 'Check the quantities before the goods leave.');
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, version, { collectedAt: this.clock.now(), collectedByName: ctx.user.name, ...(credit && !d.approvedAt && { creditResult: credit.check.result, creditSnapshot: credit.snapshot }) }, 'DRAFT');
      await this.log(tx, ctx, d.id, d.docNo, 'collected', `Collected${d.driver ? ` by ${d.driver}` : ''}, recorded by ${ctx.user.name}`);
    });
    return this.query.detail(ctx, id);
  }

  /** The goods came back unused, such as when the job is postponed: the same delivery order waits to be collected again. */
  async checkIn(ctx: RequestContext, id: string, dto: DeliveryNoteDto) {
    const d = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, d, 'checkIn', this.lockedMessage(d));
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, dto.version, { collectedAt: null, collectedByName: null }, 'DRAFT');
      await this.log(tx, ctx, d.id, d.docNo, 'checked_in', `Goods checked back in by ${ctx.user.name}`, dto.note?.trim() || null);
    });
    return this.query.detail(ctx, id);
  }

  /** The customer signed: delivered. Their signed delivery order is uploaded first and kept with it. */
  async sign(ctx: RequestContext, id: string, dto: SignDeliveryDto) {
    const d = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, d, 'sign', d.collectedAt || d.status !== 'DRAFT' ? this.lockedMessage(d) : `${d.docNo} must be collected before the customer signs it.`);
    const errors = signErrors({ signerName: dto.signerName, files: await this.files(ctx, d.id, SIGNED_DO_KIND, dto.fileIds) });
    if (errors.length) throw new ValidationFailedError(errors);
    await this.deliver(ctx, d, dto.version, null, { by: 'signature', signerName: dto.signerName!.trim(), fileIds: dto.fileIds ?? [] });
    return this.query.detail(ctx, id);
  }

  async refuse(ctx: RequestContext, id: string, dto: RefuseDeliveryDto) {
    const d = await this.query.load(ctx.tenantId, id);
    await this.requireAction(ctx, d, 'refuse', d.collectedAt ? this.lockedMessage(d) : `${d.docNo} must be collected before the customer is asked to sign.`);
    const errors = refuseErrors({ reason: dto.reason, files: await this.files(ctx, d.id, REFUSED_DO_KIND, dto.fileIds) });
    if (errors.length) throw new ValidationFailedError(errors);
    const reason = dto.reason!.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, dto.version, { refusedAt: this.clock.now(), refusedByCode: ctx.user.code, refusedByName: ctx.user.name, refuseReason: reason, refuseReturned: null }, 'DRAFT');
      await this.attachments.attach(tx, ctx, dto.fileIds ?? [], SAL_ENTITY.DELIVERY, d.id);
      await this.log(tx, ctx, d.id, d.docNo, 'refused', `The customer did not sign, recorded by ${ctx.user.name}; waiting for Management`, reason);
      await this.notifications.send(tx, ctx, {
        to: await this.notifications.whoCan(ctx.tenantId, P.EXCEPTION_APPROVE, d.branchCode), kind: 'sales.delivery.refused', link: `/sales/deliveries/${d.id}`,
        title: `${d.docNo} not signed`, body: `${d.customerName} (${d.salesOrderNo}) did not sign: ${reason}. Accept it unsigned, or send it back.`, entityType: SAL_ENTITY.DELIVERY, entityId: d.id,
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Management accepts it without a signature: delivered. Never by whoever recorded the refusal. */
  async acceptUnsigned(ctx: RequestContext, id: string, dto: DeliveryNoteDto) {
    const d = await this.query.load(ctx.tenantId, id);
    this.notOwnRefusal(ctx, d);
    await this.requireAction(ctx, d, 'acceptUnsigned', this.lockedMessage(d));
    await this.deliver(ctx, d, dto.version, null, { by: 'management', note: dto.note?.trim() || null });
    return this.query.detail(ctx, id);
  }

  async returnRefusal(ctx: RequestContext, id: string, dto: DeliveryNoteDto) {
    const d = await this.query.load(ctx.tenantId, id);
    this.notOwnRefusal(ctx, d);
    await this.requireAction(ctx, d, 'returnRefusal', this.lockedMessage(d));
    const why = dto.note?.trim();
    if (!why) throw ValidationFailedError.field('note', 'Type why it goes back.');
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, d.id, dto.version, { refusedAt: null, refuseReturned: why }, 'DRAFT');
      await this.log(tx, ctx, d.id, d.docNo, 'refusal_returned', `Sent back by ${ctx.user.name}: get the signature`, why);
      await this.notifications.send(tx, ctx, {
        to: [d.refusedByCode ?? ''], kind: 'sales.delivery.refusal_returned', link: `/sales/deliveries/${d.id}`, title: `${d.docNo} sent back`,
        body: `${d.customerName}: ${why}`, entityType: SAL_ENTITY.DELIVERY, entityId: d.id,
      });
    });
    return this.query.detail(ctx, id);
  }

  private notOwnRefusal(ctx: RequestContext, d: DeliveryWithLines) {
    if (d.refusedAt && d.refusedByCode === ctx.user.code) throw new BusinessRuleError('OWN_REFUSAL', `You recorded that ${d.customerName} did not sign ${d.docNo}, so someone else in Management decides.`);
  }

  /** Files of a kind: those already on the delivery order and those sent with the request. */
  private async files(ctx: RequestContext, id: string, kind: string, sent: string[] | undefined): Promise<number> {
    const kept = (await this.attachments.listFor(ctx.tenantId, SAL_ENTITY.DELIVERY, id)).filter((f) => f.kind === kind).map((f) => f.id);
    return new Set([...kept, ...(sent ?? [])]).size;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private lockedMessage(d: DeliveryWithLines): string {
    if (d.isMigrated) return 'Migrated delivery orders cannot be changed.';
    if (d.status === 'CONFIRMED') return DO_LOCKED_MESSAGE;
    if (d.refusedAt) return `The customer did not sign ${d.docNo}; it waits for Management.`;
    if (d.collectedAt) return `The goods of ${d.docNo} are with the installer. Record the signature, or check them back in.`;
    return `${d.docNo} is waiting for credit approval and is locked.`;
  }

  private async requireAction(ctx: RequestContext, d: DeliveryWithLines, action: DeliveryAction, message: string) {
    const [credit, approvals] = await Promise.all([this.query.liveCredit(ctx, d), this.approvals.listForEntity(ctx.tenantId, SAL_ENTITY.DELIVERY, d.id)]);
    const actions = this.query.actions(ctx, d, credit, approvals[0]?.status === 'PENDING', await this.query.signed(ctx.tenantId, d));
    if (!actions.includes(action)) {
      const canEdit = [P.DELIVERY_EDIT, P.DELIVERY_CONFIRM, P.DELIVERY_SIGN, P.EXCEPTION_APPROVE].some((p) => this.permissions.has(ctx.user.roles, p));
      throw new BusinessRuleError('ACTION_NOT_ALLOWED', canEdit ? message : 'Only the store team can change delivery orders.');
    }
  }

  /** Optimistic lock + status guard. */
  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SalDeliveryUpdateManyMutationInput, status?: 'DRAFT') {
    const result = await tx.salDelivery.updateMany({
      where: { id, tenantId: ctx.tenantId, version, ...(status && { status }) },
      data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code },
    });
    if (result.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string, comment?: string | null, afterMs = 0) {
    return this.activity.log(tx, ctx, { entityType: SAL_ENTITY.DELIVERY, entityId: id, docNo, action, message, comment: comment ?? null, afterMs });
  }
}
