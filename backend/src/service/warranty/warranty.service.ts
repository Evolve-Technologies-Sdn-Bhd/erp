import { Injectable } from '@nestjs/common';
import type { Prisma, SvcWarranty } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toQty } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { pageArgs, toListResponse } from '../../platform/http/list';
import type { ListQueryDto } from '../../platform/http/list-query.dto';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SVC_ENTITY, SVC_EVENT } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import type { JobWithItems } from '../jobs/jobs.query';
import type { UpdateWarrantyDto, VoidWarrantyDto } from './warranty.dto';
import { phoneDigits, WARRANTY_STATE_LABEL, warrantiesFrom, warrantyState, type WarrantyState } from './warranty.rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

/** V11 · Warranties (phase 5): the register, found by customer, phone, sales order, job, item or serial number. */
@Injectable()
export class WarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
  ) {}

  view(w: SvcWarranty) {
    const state = warrantyState({ status: w.status, endOn: iso(w.endOn) }, this.clock.today());
    return {
      id: w.id, customerCode: w.customerCode, customerName: w.customerName, contactName: w.contactName, phone: w.phone, siteAddress: w.siteAddress,
      salesOrderNo: w.salesOrderNo, jobId: w.jobId, jobNo: w.jobNo, itemCode: w.itemCode, itemName: w.itemName, uomCode: w.uomCode, qty: toQty(w.qty), serialNo: w.serialNo,
      warrantyMonths: w.warrantyMonths, startOn: iso(w.startOn), endOn: iso(w.endOn), state, stateLabel: WARRANTY_STATE_LABEL[state], voidReason: w.voidReason, version: w.version,
    };
  }

  async find(tenantId: string, id: string): Promise<SvcWarranty> {
    const w = await this.prisma.svcWarranty.findFirst({ where: { tenantId, id } });
    if (!w) throw new NotFoundError('Warranty');
    return w;
  }

  async list(ctx: RequestContext, query: ListQueryDto) {
    const q = query.q?.trim();
    const digits = phoneDigits(q);
    const today = day(this.clock.today());
    const base: Prisma.SvcWarrantyWhereInput = {
      tenantId: ctx.tenantId,
      ...(q && {
        OR: [
          { customerName: { contains: q } }, { customerCode: { contains: q } }, { salesOrderNo: { contains: q } }, { jobNo: { contains: q } }, { itemCode: { contains: q } },
          { itemName: { contains: q } }, { serialNo: { contains: q } }, ...(digits.length >= 4 ? [{ phoneKey: { contains: digits } }] : []),
        ],
      }),
    };
    const states: Record<string, Prisma.SvcWarrantyWhereInput> = {
      active: { status: 'ACTIVE', endOn: { gte: today } }, pending: { status: 'PENDING', endOn: { gte: today } }, expired: { status: { not: 'VOID' }, endOn: { lt: today } }, void: { status: 'VOID' },
    };
    const where = { ...base, ...(query.status && states[query.status]) };
    const [rows, total, all, ...counts] = await Promise.all([
      this.prisma.svcWarranty.findMany({ where, orderBy: [{ startOn: 'desc' }, { jobNo: 'desc' }, { itemCode: 'asc' }], ...pageArgs(query) }),
      this.prisma.svcWarranty.count({ where }),
      this.prisma.svcWarranty.count({ where: base }),
      ...Object.values(states).map((s) => this.prisma.svcWarranty.count({ where: { ...base, ...s } })),
    ]);
    const statusCounts = Object.fromEntries([['all', all], ...Object.keys(states).map((k, i) => [k, counts[i]!])]) as { all: number } & Record<string, number>;
    const canEdit = this.permissions.has(ctx.user.roles, P.JOB_EDIT);
    return toListResponse(rows.map((w) => ({ ...this.view(w), canEdit: canEdit && w.status !== 'VOID' })), total, query, statusCounts);
  }

  /** A complete installation registers its items, in the visit's transaction. */
  async register(tx: Tx, ctx: RequestContext, job: JobWithItems, doneOn: string, months: Map<string, number | null>): Promise<string | null> {
    const rows = warrantiesFrom(
      { doneOn, needsPayment: job.salesOrderId !== null, fullyPaid: job.orderPayment === 'FULLY_PAID' },
      job.items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, qty: i.qty.toString(), uomCode: i.uomCode, serialNo: i.serialNo, warrantyMonths: months.get(i.itemCode) ?? null })),
    );
    if (!rows.length) return null;
    await tx.svcWarranty.createMany({
      data: rows.map((r) => ({
        tenantId: ctx.tenantId, branchCode: job.branchCode, customerCode: job.customerCode, customerName: job.customerName, contactName: job.contactName, phone: job.phone,
        phoneKey: phoneDigits(job.phone) || null, siteAddress: job.siteAddress, area: job.area, salesOrderId: job.salesOrderId, salesOrderNo: job.salesOrderNo, jobId: job.id, jobNo: job.docNo,
        itemCode: r.itemCode, itemName: r.itemName, uomCode: r.uomCode, qty: dec(r.qty), serialNo: r.serialNo, warrantyMonths: r.warrantyMonths, startOn: day(r.startOn), endOn: day(r.endOn),
        status: r.status, activatedAt: r.status === 'ACTIVE' ? this.clock.now() : null, updatedBy: ctx.user.code,
      })),
      skipDuplicates: true,
    });
    await this.outbox.publish(tx, ctx, [{
      name: SVC_EVENT.WARRANTY_REGISTERED, aggregateType: SVC_ENTITY.JOB, aggregateId: job.id,
      payload: { jobNo: job.docNo, salesOrderNo: job.salesOrderNo, customerCode: job.customerCode, units: rows.map((r) => ({ itemCode: r.itemCode, qty: r.qty, startOn: r.startOn, endOn: r.endOn, status: r.status })) },
    }]);
    return rows.map((r) => `${r.itemCode} until ${r.endOn}${r.status === 'PENDING' ? ' once fully paid' : ''}`).join(', ');
  }

  /** The order is fully paid: its warranties become active. Returns how many. */
  async activateForOrder(tx: Tx, tenantId: string, salesOrderId: string, by: string): Promise<number> {
    const r = await tx.svcWarranty.updateMany({
      where: { tenantId, salesOrderId, status: 'PENDING' }, data: { status: 'ACTIVE', activatedAt: this.clock.now(), version: { increment: 1 }, updatedBy: by },
    });
    return r.count;
  }

  /** A one-to-one exchange: the warranty goes on with the new unit, whose serial number is not known yet. */
  async exchanged(tx: Tx, ctx: RequestContext, job: { docNo: string; warrantyId: string | null }): Promise<void> {
    if (!job.warrantyId) return;
    const w = await tx.svcWarranty.findFirst({ where: { tenantId: ctx.tenantId, id: job.warrantyId } });
    if (!w) return;
    await tx.svcWarranty.update({ where: { id: w.id }, data: { serialNo: null, version: { increment: 1 }, updatedBy: ctx.user.code } });
    await this.log(tx, ctx, w, 'warranty_exchanged', `${w.itemCode} exchanged one-to-one on ${job.docNo}: the warranty goes on to ${iso(w.endOn)} with the new unit${w.serialNo ? `; type its serial number (was ${w.serialNo})` : ''}`, null);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateWarrantyDto) {
    const w = await this.find(ctx.tenantId, id);
    if (w.status === 'VOID') throw new BusinessRuleError('ACTION_NOT_ALLOWED', `The warranty of ${w.itemCode} is void.`);
    const serialNo = dto.serialNo?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, w.id, dto.version, { serialNo });
      await this.log(tx, ctx, w, 'warranty_saved', `${w.itemCode} serial number: ${w.serialNo ?? 'none'} → ${serialNo ?? 'none'}`, null);
    });
    return this.view(await this.find(ctx.tenantId, id));
  }

  async void(ctx: RequestContext, id: string, dto: VoidWarrantyDto) {
    const w = await this.find(ctx.tenantId, id);
    const reason = dto.reason?.trim();
    if (!reason) throw ValidationFailedError.field('reason', 'Type why the warranty is void.');
    if (w.status === 'VOID') throw new BusinessRuleError('ACTION_NOT_ALLOWED', `The warranty of ${w.itemCode} is already void.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, w.id, dto.version, { status: 'VOID', voidReason: reason });
      await this.log(tx, ctx, w, 'warranty_void', `Warranty of ${w.itemCode} made void by ${ctx.user.name}`, reason);
    });
    return this.view(await this.find(ctx.tenantId, id));
  }

  /** The unit a warranty job is about, for its page. */
  async ofJob(tenantId: string, warrantyId: string | null) {
    if (!warrantyId) return null;
    const w = await this.prisma.svcWarranty.findFirst({ where: { tenantId, id: warrantyId } });
    return w ? this.view(w) : null;
  }

  stateOf(w: SvcWarranty): WarrantyState {
    return warrantyState({ status: w.status, endOn: iso(w.endOn) }, this.clock.today());
  }

  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Prisma.SvcWarrantyUpdateManyMutationInput) {
    const r = await tx.svcWarranty.updateMany({ where: { id, tenantId: ctx.tenantId, version }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (r.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, w: SvcWarranty, action: string, message: string, comment: string | null) {
    return this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: w.jobId, docNo: w.jobNo, action, message, comment });
  }
}
