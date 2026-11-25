import { Injectable } from '@nestjs/common';
import type { SalVoucher } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toMoney } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { toListResponse } from '../../platform/http/list';
import type { ListQueryDto } from '../../platform/http/list-query.dto';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY } from '../shared/sales.constants';
import type { VoucherInput } from '../shared/voucher.rules';
import type { SaveVoucherDto } from './vouchers.dto';
import { cleanVoucherNo, fromList, usesText, VOUCHER_STATUS_LABEL, voucherErrors, voucherStatus, type ListedVoucher, type VoucherFields } from './vouchers.rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);
const rm = (v: Parameters<typeof toMoney>[0]) => toMoney(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** S37 · Vouchers (phase 5): the list Sales Support keeps, and what an order may take from it. */
@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
  ) {}

  async on(tenantId: string): Promise<boolean> {
    return Boolean((await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { voucherControl: true } }))?.voucherControl);
  }

  /** Orders using each voucher, whoever's they are; a cancelled order gives its use back. */
  private uses(tenantId: string, nos: string[], exceptOrderId?: string): Promise<Map<string, number>> {
    return asSystem(async () => {
      if (!nos.length) return new Map();
      const rows = await this.prisma.salOrderVoucher.groupBy({
        by: ['voucherNo'], _count: { _all: true },
        where: { tenantId, voucherNo: { in: nos }, salesOrder: { status: { not: 'CANCELLED' } }, ...(exceptOrderId && { salesOrderId: { not: exceptOrderId } }) },
      });
      return new Map(rows.map((r) => [r.voucherNo, r._count._all]));
    });
  }

  private view(v: SalVoucher, uses: number, canManage: boolean) {
    const status = voucherStatus({ validFrom: iso(v.validFrom), validUntil: v.validUntil ? iso(v.validUntil) : null, maxUses: v.maxUses }, uses, this.clock.today());
    return {
      id: v.id, voucherNo: v.voucherNo, description: v.description, amount: toMoney(v.amount), validFrom: iso(v.validFrom), validUntil: v.validUntil ? iso(v.validUntil) : null,
      maxUses: v.maxUses, uses, usesText: usesText(uses, v.maxUses), status, statusLabel: VOUCHER_STATUS_LABEL[status], updatedBy: v.updatedBy, version: v.version,
      allowedActions: canManage ? [status !== 'ENDED' && 'edit', (status === 'RUNNING' || status === 'USED_UP') && 'end', uses === 0 && 'delete'].filter(Boolean) : [],
    };
  }

  async list(ctx: RequestContext, query: ListQueryDto) {
    const q = query.q?.trim();
    const [rows, on] = await Promise.all([
      this.prisma.salVoucher.findMany({ where: { tenantId: ctx.tenantId, ...(q && { OR: [{ voucherNo: { contains: q } }, { description: { contains: q } }] }) }, orderBy: [{ validFrom: 'desc' }, { voucherNo: 'asc' }] }),
      this.on(ctx.tenantId),
    ]);
    const uses = await this.uses(ctx.tenantId, rows.map((r) => r.voucherNo));
    const canManage = this.permissions.has(ctx.user.roles, P.VOUCHER_MANAGE);
    const all = rows.map((r) => this.view(r, uses.get(r.voucherNo) ?? 0, canManage));
    const count = (...s: string[]) => all.filter((v) => s.includes(v.status)).length;
    const tab = query.status;
    const picked = tab === 'running' ? all.filter((v) => v.status === 'RUNNING') : tab === 'scheduled' ? all.filter((v) => v.status === 'SCHEDULED') : tab === 'ended' ? all.filter((v) => v.status === 'ENDED' || v.status === 'USED_UP') : all;
    return {
      ...toListResponse(picked.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), picked.length, query, { all: all.length, running: count('RUNNING'), scheduled: count('SCHEDULED'), ended: count('ENDED', 'USED_UP') }),
      on, canManage,
    };
  }

  async get(ctx: RequestContext, id: string) {
    const v = await this.load(ctx, id);
    const uses = (await this.uses(ctx.tenantId, [v.voucherNo])).get(v.voucherNo) ?? 0;
    return { ...this.view(v, uses, this.permissions.has(ctx.user.roles, P.VOUCHER_MANAGE)), activity: await this.activity.listFor(ctx.tenantId, SAL_ENTITY.VOUCHER, v.id) };
  }

  async create(ctx: RequestContext, dto: SaveVoucherDto) {
    const f = this.fields(dto);
    const errors = voucherErrors(f);
    if (!errors.some((e) => e.field === 'voucherNo') && (await this.prisma.salVoucher.findFirst({ where: { tenantId: ctx.tenantId, voucherNo: f.voucherNo } }))) {
      errors.push({ field: 'voucherNo', message: `${f.voucherNo} is on the list already.` });
    }
    if (errors.length) throw new ValidationFailedError(errors);
    const id = await this.prisma.$transaction(async (tx) => {
      const v = await tx.salVoucher.create({ data: { tenantId: ctx.tenantId, ...this.data(f), createdBy: ctx.user.code, updatedBy: ctx.user.code } });
      await this.log(tx, ctx, v, 'created', `Added by ${ctx.user.name}: ${f.description}, RM ${rm(f.amount)} off, ${this.datesText(f)}`);
      return v.id;
    });
    return this.get(ctx, id);
  }

  async update(ctx: RequestContext, id: string, dto: SaveVoucherDto) {
    const v = await this.load(ctx, id);
    const uses = (await this.uses(ctx.tenantId, [v.voucherNo])).get(v.voucherNo) ?? 0;
    const f = this.fields(dto);
    const errors = voucherErrors(f, { uses, voucherNo: v.voucherNo, amount: v.amount });
    if (f.voucherNo !== v.voucherNo && !errors.some((e) => e.field === 'voucherNo') && (await this.prisma.salVoucher.findFirst({ where: { tenantId: ctx.tenantId, voucherNo: f.voucherNo } }))) {
      errors.push({ field: 'voucherNo', message: `${f.voucherNo} is on the list already.` });
    }
    if (errors.length) throw new ValidationFailedError(errors);
    const was = { voucherNo: v.voucherNo, description: v.description, amount: toMoney(v.amount), validFrom: iso(v.validFrom), validUntil: v.validUntil ? iso(v.validUntil) : null, maxUses: v.maxUses };
    const changes = [
      was.voucherNo !== f.voucherNo && `number ${was.voucherNo} → ${f.voucherNo}`,
      was.description !== f.description && `name “${was.description}” → “${f.description}”`,
      !dec(was.amount).eq(dec(f.amount)) && `amount ${rm(was.amount)} → ${rm(f.amount)}`,
      this.datesText(was) !== this.datesText(f) && `${this.datesText(was)} → ${this.datesText(f)}`,
      was.maxUses !== f.maxUses && `orders ${was.maxUses ?? 'no limit'} → ${f.maxUses ?? 'no limit'}`,
    ].filter(Boolean);
    if (changes.length) {
      await this.prisma.$transaction(async (tx) => {
        await this.bump(tx, ctx, id, dto.version!, this.data(f));
        await this.log(tx, ctx, v, 'saved', `Changed by ${ctx.user.name}: ${changes.join('; ')}`);
      });
    }
    return this.get(ctx, id);
  }

  /** Today is its last day; orders that have it keep it. */
  async end(ctx: RequestContext, id: string, version: number) {
    const v = await this.load(ctx, id);
    const today = this.clock.today();
    const until = v.validUntil ? iso(v.validUntil) : null;
    if (iso(v.validFrom) > today) throw new BusinessRuleError('ACTION_NOT_ALLOWED', `${v.voucherNo} has not started yet. Change its dates or delete it instead.`);
    if (until && until <= today) throw new BusinessRuleError('ACTION_NOT_ALLOWED', until === today ? `Today is the last day of ${v.voucherNo} already.` : `${v.voucherNo} ended on ${until}.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, id, version, { validUntil: day(today) });
      await this.log(tx, ctx, v, 'ended', `Ended by ${ctx.user.name}: ${today} is its last day`);
    });
    return this.get(ctx, id);
  }

  async remove(ctx: RequestContext, id: string, version: number) {
    const v = await this.load(ctx, id);
    const uses = (await this.uses(ctx.tenantId, [v.voucherNo])).get(v.voucherNo) ?? 0;
    if (uses) throw new BusinessRuleError('IN_USE', `${v.voucherNo} is on ${uses} ${uses === 1 ? 'order' : 'orders'}, so it cannot be deleted. End it instead.`);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.salVoucher.deleteMany({ where: { id, tenantId: ctx.tenantId, version } });
      if (r.count === 0) throw new StaleVersionError();
      await this.log(tx, ctx, v, 'deleted', `Deleted by ${ctx.user.name}: ${v.description}, RM ${rm(v.amount)} off`);
    });
    return { deleted: true, voucherNo: v.voucherNo };
  }

  /** What an order of a date may take, for the picker on the sales order. */
  async running(ctx: RequestContext, date: string, orderId?: string) {
    if (!(await this.on(ctx.tenantId))) return { items: [] };
    const rows = await this.prisma.salVoucher.findMany({
      where: { tenantId: ctx.tenantId, validFrom: { lte: day(date) }, OR: [{ validUntil: null }, { validUntil: { gte: day(date) } }] }, orderBy: [{ amount: 'asc' }, { voucherNo: 'asc' }],
    });
    const uses = await this.uses(ctx.tenantId, rows.map((r) => r.voucherNo), orderId);
    return {
      items: rows.filter((r) => r.maxUses === null || (uses.get(r.voucherNo) ?? 0) < r.maxUses).map((r) => ({
        voucherNo: r.voucherNo, description: r.description, amount: toMoney(r.amount), validUntil: r.validUntil ? iso(r.validUntil) : null,
        left: r.maxUses === null ? null : r.maxUses - (uses.get(r.voucherNo) ?? 0),
      })),
    };
  }

  /** The order's vouchers from the list, or as typed while the company does not control them. */
  async forOrder(ctx: RequestContext, asked: VoucherInput[], orderDate: string, order: { id: string; vouchers: { voucherNo: string; amount: VoucherInput['amount']; description: string }[] } | null): Promise<VoucherInput[]> {
    if (!asked.length || !(await this.on(ctx.tenantId))) return asked;
    const nos = asked.map((v) => cleanVoucherNo(v.voucherNo));
    const rows = await this.prisma.salVoucher.findMany({ where: { tenantId: ctx.tenantId, voucherNo: { in: nos } } });
    const uses = await this.uses(ctx.tenantId, nos, order?.id);
    const listed: ListedVoucher[] = rows.map((r) => ({
      voucherNo: r.voucherNo, description: r.description, amount: r.amount, validFrom: iso(r.validFrom), validUntil: r.validUntil ? iso(r.validUntil) : null, maxUses: r.maxUses, uses: uses.get(r.voucherNo) ?? 0,
    }));
    const { vouchers, errors } = fromList(asked, listed, order?.vouchers ?? [], orderDate);
    if (errors.length) throw new ValidationFailedError(errors);
    return vouchers;
  }

  private fields(dto: SaveVoucherDto): VoucherFields {
    return { voucherNo: cleanVoucherNo(dto.voucherNo), description: dto.description.trim(), amount: dto.amount.trim(), validFrom: dto.validFrom, validUntil: dto.validUntil || null, maxUses: dto.maxUses ?? null };
  }

  private data(f: VoucherFields) {
    return { voucherNo: f.voucherNo, description: f.description, amount: dec(f.amount), validFrom: day(f.validFrom), validUntil: f.validUntil ? day(f.validUntil) : null, maxUses: f.maxUses };
  }

  private datesText(f: { validFrom: string; validUntil: string | null }): string {
    return `${f.validFrom} to ${f.validUntil ?? 'no end'}`;
  }

  private async load(ctx: RequestContext, id: string): Promise<SalVoucher> {
    const v = await this.prisma.salVoucher.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!v) throw new NotFoundError('Voucher');
    return v;
  }

  private async bump(tx: Tx, ctx: RequestContext, id: string, version: number, data: Partial<ReturnType<VouchersService['data']>>) {
    const r = await tx.salVoucher.updateMany({ where: { id, tenantId: ctx.tenantId, version }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (r.count === 0) throw new StaleVersionError();
  }

  private log(tx: Tx, ctx: RequestContext, v: Pick<SalVoucher, 'id' | 'voucherNo'>, action: string, message: string) {
    return this.activity.log(tx, ctx, { entityType: SAL_ENTITY.VOUCHER, entityId: v.id, docNo: v.voucherNo, action, message, comment: null });
  }
}
