import { Injectable } from '@nestjs/common';
import type { Prisma, SalReceipt, SalSalesOrder } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { toMoney } from '../../platform/http/decimal';
import { NotFoundError } from '../../platform/http/errors';
import { buildStatusCounts, pageArgs, statusFromKey, toListResponse } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY } from '../shared/sales.constants';
import type { ReceiptListQueryDto } from './dto/receipt.dto';
import {
  allowedReceiptActions, orderPayment, RECEIPT_KIND_LABEL, RECEIPT_METHOD_LABEL, RECEIPT_STATUS_LABEL, RECEIPT_STATUSES,
  type ReceiptKind, type ReceiptMethod, type ReceiptStatus,
} from './receipt.rules';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Reading official receipts (phase 5): Account's list (S35), one receipt (S36), and the Payments card of an order. */
@Injectable()
export class ReceiptsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly attachments: AttachmentsService,
    private readonly permissions: PermissionRegistry,
  ) {}

  async load(tenantId: string, id: string): Promise<SalReceipt> {
    const row = await this.prisma.salReceipt.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Receipt');
    return row;
  }

  async isOn(tenantId: string): Promise<boolean> {
    const s = await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { useReceipts: true } });
    return Boolean(s?.useReceipts);
  }

  actions(ctx: RequestContext, r: SalReceipt) {
    return allowedReceiptActions(
      r.status as ReceiptStatus,
      { edit: this.permissions.has(ctx.user.roles, P.RECEIPT_EDIT), verify: this.permissions.has(ctx.user.roles, P.RECEIPT_VERIFY) },
      r.recordedByCode === ctx.user.code,
    );
  }

  /** S35 · Official receipts: Account's queue first (waiting, oldest first), with a tab per status. */
  async list(ctx: RequestContext, query: ReceiptListQueryDto) {
    const q = query.q?.trim();
    const base: Prisma.SalReceiptWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.order && { salesOrderId: query.order }),
      ...(q && { OR: [{ docNo: { contains: q } }, { customerName: { contains: q } }, { salesOrderNo: { contains: q } }] }),
    };
    const status = statusFromKey(query.status, RECEIPT_STATUSES);
    const where: Prisma.SalReceiptWhereInput = { ...base, ...(status && { status }) };
    const [rows, total, grouped, waiting] = await Promise.all([
      this.prisma.salReceipt.findMany({ where, orderBy: status === 'WAITING' ? [{ createdAt: 'asc' }] : [{ createdAt: 'desc' }, { docNo: 'desc' }], ...pageArgs(query) }),
      this.prisma.salReceipt.count({ where }),
      this.prisma.salReceipt.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.salReceipt.aggregate({ where: { ...base, status: 'WAITING' }, _sum: { amount: true } }),
    ]);
    return {
      ...toListResponse(rows.map((r) => this.row(r)), total, query, buildStatusCounts(grouped.map((g) => ({ status: g.status as ReceiptStatus, _count: g._count })), RECEIPT_STATUSES)),
      /** Money waiting for Account to check. */
      waitingAmount: toMoney(waiting._sum.amount ?? 0),
    };
  }

  /** S36 · One receipt, with its proof and where its order stands. */
  async detail(ctx: RequestContext, id: string) {
    const r = await this.load(ctx.tenantId, id);
    const [proofs, activity, order, siblings] = await Promise.all([
      this.attachments.listFor(ctx.tenantId, SAL_ENTITY.RECEIPT, r.id),
      this.activity.listFor(ctx.tenantId, SAL_ENTITY.RECEIPT, r.id),
      this.prisma.salSalesOrder.findFirst({ where: { tenantId: ctx.tenantId, id: r.salesOrderId }, select: { id: true, docNo: true, total: true } }),
      this.prisma.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: r.salesOrderId }, select: { status: true, amount: true } }),
    ]);
    const pay = orderPayment(order?.total ?? 0, siblings);
    return {
      ...this.row(r),
      /** When it was recorded, on the business clock (the activity line), not the database's own time. */
      recordedAt: activity.find((a) => a.action === 'recorded')?.at ?? r.createdAt.toISOString(),
      payerRef: r.payerRef,
      note: r.note,
      verifiedRef: r.verifiedRef,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      verifiedByName: r.verifiedByName,
      returnReason: r.returnReason,
      cancelReason: r.cancelReason,
      proofs,
      order: order
        ? { id: order.id, docNo: order.docNo, total: toMoney(order.total), payment: pay.status, paymentLabel: pay.label, verified: toMoney(pay.verified), waiting: toMoney(pay.waiting), open: toMoney(pay.open) }
        : null,
      activity,
      version: r.version,
      allowedActions: this.actions(ctx, r),
    };
  }

  /** The Payments card of a sales order (S11): null while the company does not use official receipts. */
  async forOrder(ctx: RequestContext, order: Pick<SalSalesOrder, 'id' | 'status' | 'total'>) {
    if (!(await this.isOn(ctx.tenantId))) return null;
    const rows = await this.prisma.salReceipt.findMany({ where: { tenantId: ctx.tenantId, salesOrderId: order.id }, orderBy: [{ createdAt: 'asc' }] });
    const pay = orderPayment(order.total, rows);
    const released = ['RELEASED', 'PARTIAL', 'DONE'].includes(order.status);
    return {
      status: pay.status,
      label: pay.label,
      total: toMoney(order.total),
      verified: toMoney(pay.verified),
      waiting: toMoney(pay.waiting),
      open: toMoney(pay.open),
      receipts: rows.map((r) => this.row(r)),
      /** A payment can be recorded on a released order that still owes money, by someone who records receipts. */
      canRecord: released && pay.open.gt(0) && this.permissions.has(ctx.user.roles, P.RECEIPT_EDIT),
      released,
    };
  }

  private row(r: SalReceipt) {
    return {
      id: r.id,
      docNo: r.docNo,
      docDate: iso(r.docDate),
      status: r.status,
      statusLabel: RECEIPT_STATUS_LABEL[r.status as ReceiptStatus],
      branchCode: r.branchCode,
      salesOrderId: r.salesOrderId,
      salesOrderNo: r.salesOrderNo,
      customerCode: r.customerCode,
      customerName: r.customerName,
      kind: r.kind,
      kindLabel: RECEIPT_KIND_LABEL[r.kind as ReceiptKind] ?? r.kind,
      method: r.method,
      methodLabel: RECEIPT_METHOD_LABEL[r.method as ReceiptMethod] ?? r.method,
      amount: toMoney(r.amount),
      recordedByName: r.recordedByName,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
