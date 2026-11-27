import { Inject, Injectable } from '@nestjs/common';
import type { MdmCustomer, MdmCustomerTransfer } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { ClockService } from '../../platform/clock/clock.service';
import { CORE_ENTITY, CORE_EVENT } from '../core.constants';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import { CoreRecordsService } from '../shared/core-records.service';
import {
  addressWords,
  customerSnapshot,
  duplicateReasons,
  isSameCustomer,
  nameKey,
  PHONE_DIGITS_MIN,
  phoneKey,
  postcodeOf,
  reasonsText,
  TRANSFER_STATUS_LABEL,
  type DuplicateReason,
  type TransferStatus,
} from './customers.rules';
import { customerRecord } from './customers.record';

/** A customer on file that looks like the one being added: who has it, and how it matches. Never its phone or address. */
export interface CustomerMatch {
  id: string;
  code: string;
  name: string;
  status: string;
  branchCode: string;
  agentCode: string | null;
  agentName: string | null;
  /** The person asking is its salesperson: pick it instead. */
  mine: boolean;
  reasons: DuplicateReason[];
  reasonText: string;
  /** The phone, or the name with the address: the same customer, never added again. */
  same: boolean;
  /** Someone asked to take it over and the office has not decided yet. */
  pendingAgentName: string | null;
  pendingMine: boolean;
}

/**
 * Duplicate customers and taking one over (phase 5; the user's rules of 27 Nov 2026). Every customer counts, in every
 * branch and of every salesperson, so these reads run as the system. A salesperson asks to take over another's
 * customer; while the office decides, the asker sees it and keys orders for it (pendingAgentCode); whoever edits
 * customers approves or rejects, and the customer moves to the asker on approval.
 */
@Injectable()
export class CustomerTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: CoreRecordsService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionRegistry,
    private readonly clock: ClockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  private async names(tenantId: string) {
    const users = await this.masterData.listUsers(tenantId);
    return { name: (code: string | null) => (code ? (users.find((u) => u.code === code)?.name ?? code) : null), users };
  }

  /** Customers that match a name, phone and address: the same one first, then the maybes. At most ten. */
  async matches(ctx: RequestContext, typed: { name: string; phone: string; address: string }): Promise<CustomerMatch[]> {
    const tenantId = ctx.tenantId;
    const key = phoneKey(typed.phone);
    const nameWord = nameKey(typed.name).split(' ').sort((a, b) => b.length - a.length)[0] ?? '';
    const postcode = postcodeOf(typed.address);
    const addressWord = addressWords(typed.address).filter((w) => !/^\d+$/.test(w)).sort((a, b) => b.length - a.length)[0] ?? '';
    const candidates = await asSystem(async () => {
      const byPhone = key.length >= PHONE_DIGITS_MIN
        ? await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM mdm_customer
            WHERE tenantId = ${tenantId} AND phone IS NOT NULL AND REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ${`%${key.slice(-PHONE_DIGITS_MIN)}`}`
        : [];
      const or = [
        ...(nameWord.length >= 3 ? [{ name: { contains: nameWord } }] : []),
        ...(postcode ? [{ deliveryAddress: { contains: postcode } }, { billingAddress: { contains: postcode } }] : addressWord.length >= 4 ? [{ deliveryAddress: { contains: addressWord } }, { billingAddress: { contains: addressWord } }] : []),
        ...(byPhone.length ? [{ id: { in: byPhone.map((r) => r.id) } }] : []),
      ];
      if (!or.length) return [] as MdmCustomer[];
      return this.prisma.mdmCustomer.findMany({ where: { tenantId, isCash: false, OR: or }, take: 500 });
    });
    const { name } = await this.names(tenantId);
    return candidates
      .map((c) => ({ c, reasons: duplicateReasons(typed, c) }))
      .filter((x) => x.reasons.length)
      .map(({ c, reasons }) => ({
        id: c.id, code: c.code, name: c.name, status: c.status, branchCode: c.branchCode,
        agentCode: c.defaultAgentCode, agentName: name(c.defaultAgentCode), mine: c.defaultAgentCode === ctx.user.code,
        reasons, reasonText: reasonsText(reasons), same: isSameCustomer(reasons),
        pendingAgentName: name(c.pendingAgentCode), pendingMine: c.pendingAgentCode === ctx.user.code,
      }))
      .sort((a, b) => Number(b.same) - Number(a.same) || b.reasons.length - a.reasons.length || a.code.localeCompare(b.code))
      .slice(0, 10);
  }

  private view(t: MdmCustomerTransfer, ctx: RequestContext) {
    const canDecide = t.status === 'PENDING' && this.permissions.has(ctx.user.roles, P.CUSTOMER_EDIT) && t.toAgentCode !== ctx.user.code;
    return {
      id: t.id, customerId: t.customerId, customerCode: t.customerCode, customerName: t.customerName,
      fromAgentCode: t.fromAgentCode, fromAgentName: t.fromAgentName, toAgentCode: t.toAgentCode, toAgentName: t.toAgentName, toBranchCode: t.toBranchCode,
      reason: t.reason, status: t.status, statusLabel: TRANSFER_STATUS_LABEL[t.status as TransferStatus] ?? t.status,
      decidedBy: t.decidedBy, decidedAt: t.decidedAt?.toISOString() ?? null, decisionNote: t.decisionNote, createdAt: t.createdAt.toISOString(), version: t.version,
      allowedActions: canDecide ? ['approve', 'reject'] : [],
    };
  }

  /** A salesperson asks to take over another salesperson's customer. They see it, and key orders for it, while it waits. */
  async request(ctx: RequestContext, input: { customerCode: string; reason: string }) {
    const tenantId = ctx.tenantId;
    const reason = input.reason.trim();
    if (!reason) throw ValidationFailedError.field('reason', 'Say why the customer should be yours (e.g. they called you, they want you to serve them).');
    const c = await asSystem(() => this.prisma.mdmCustomer.findFirst({ where: { tenantId, code: input.customerCode.trim().toUpperCase() } }));
    if (!c || c.isCash) throw new NotFoundError('Customer');
    if (c.defaultAgentCode === ctx.user.code) throw new BusinessRuleError('ALREADY_YOURS', `${c.name} (${c.code}) is already your customer.`);
    const open = await asSystem(() => this.prisma.mdmCustomerTransfer.findFirst({ where: { tenantId, customerId: c.id, status: 'PENDING' } }));
    if (open) {
      if (open.toAgentCode === ctx.user.code) return this.view(open, ctx);
      throw new BusinessRuleError('TRANSFER_PENDING', `${open.toAgentName} already asked to take ${c.name} (${c.code}) over. The office decides that first.`);
    }
    const { name } = await this.names(tenantId);
    const from = name(c.defaultAgentCode);
    const made = await this.prisma.$transaction(async (tx) => {
      const t = await tx.mdmCustomerTransfer.create({
        data: {
          tenantId, customerId: c.id, customerCode: c.code, customerName: c.name, fromAgentCode: c.defaultAgentCode, fromAgentName: from,
          toAgentCode: ctx.user.code, toAgentName: ctx.user.name, toBranchCode: ctx.branchCode, reason: reason.slice(0, 300),
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
        },
      });
      // A fact about the customer, not an edit of it: its version stays, so nobody's open form goes stale.
      await tx.mdmCustomer.update({ where: { id: c.id }, data: { pendingAgentCode: ctx.user.code } });
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER, entityId: c.id, code: c.code, action: 'transfer_asked',
        message: `${ctx.user.name} asked to take ${c.code} over${from ? ` from ${from}` : ''}: ${reason}`.slice(0, 500),
        event: CORE_EVENT.CUSTOMER_UPDATED, snapshot: customerSnapshot(customerRecord({ ...c, pendingAgentCode: ctx.user.code })),
        changes: [{ field: 'pendingAgentCode', label: 'Asked to take over by', from: '—', to: ctx.user.name }],
      });
      const office = await this.notifications.whoCan(tenantId, P.CUSTOMER_EDIT, c.branchCode);
      const body = `${ctx.user.name} asks to take over ${c.name} (${c.code})${from ? `, ${from}'s customer` : ''}: ${reason}. They can key orders for it while you decide.`;
      await this.notifications.send(tx, ctx, { to: office, kind: 'core.customer.transfer_asked', title: `Customer transfer: ${c.name}`, body, link: `/core/customers/${c.id}`, entityType: CORE_ENTITY.CUSTOMER, entityId: c.id });
      if (c.defaultAgentCode) {
        await this.notifications.send(tx, ctx, { to: [c.defaultAgentCode], kind: 'core.customer.transfer_asked', title: `${ctx.user.name} asked for your customer ${c.name}`, body: `${reason}. The office decides.`, link: `/core/customers/${c.id}`, entityType: CORE_ENTITY.CUSTOMER, entityId: c.id });
      }
      return t;
    });
    return this.view(made, ctx);
  }

  /** The office approves (the customer becomes the asker's) or rejects (the asker no longer sees it). */
  async decide(ctx: RequestContext, id: string, approve: boolean, version: number, note: string | null) {
    const tenantId = ctx.tenantId;
    const t = await this.prisma.mdmCustomerTransfer.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundError('Transfer request');
    if (t.status !== 'PENDING') throw new BusinessRuleError('ALREADY_DECIDED', `This request was ${t.status.toLowerCase()} already.`);
    if (t.toAgentCode === ctx.user.code) throw new BusinessRuleError('OWN_REQUEST', 'Someone else decides your own request.');
    if (t.version !== version) throw new StaleVersionError();
    const text = note?.trim() || null;
    if (!approve && !text) throw ValidationFailedError.field('note', 'Say why, so the salesperson knows.');
    const c = await asSystem(() => this.prisma.mdmCustomer.findFirst({ where: { id: t.customerId, tenantId } }));
    if (!c) throw new NotFoundError('Customer');
    const asker = (await this.masterData.listUsers(tenantId)).find((u) => u.code === t.toAgentCode);
    // The customer moves to the asker's branch only when they cannot see its own.
    const moveTo = approve && asker && !asker.branchCodes.includes(c.branchCode) && !c.visibleToAllBranches ? t.toBranchCode : null;
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmCustomerTransfer.updateMany({
        where: { id, version },
        data: { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: ctx.user.name, decidedAt: this.clock.now(), decisionNote: text, version: { increment: 1 }, updatedBy: ctx.user.code },
      });
      if (saved.count !== 1) throw new StaleVersionError();
      const after: MdmCustomer = approve
        ? { ...c, defaultAgentCode: t.toAgentCode, pendingAgentCode: null, ...(moveTo && { branchCode: moveTo }) }
        : { ...c, pendingAgentCode: c.pendingAgentCode === t.toAgentCode ? null : c.pendingAgentCode };
      await tx.mdmCustomer.update({
        where: { id: c.id },
        data: approve
          ? { defaultAgentCode: t.toAgentCode, pendingAgentCode: null, ...(moveTo && { branchCode: moveTo }), version: { increment: 1 }, updatedBy: ctx.user.code }
          : { pendingAgentCode: after.pendingAgentCode },
      });
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER, entityId: c.id, code: c.code, action: approve ? 'transferred' : 'transfer_rejected',
        message: (approve
          ? `Salesperson ${t.fromAgentName ?? 'none'} → ${t.toAgentName}${moveTo ? `, branch ${c.branchCode} → ${moveTo}` : ''}, approved by ${ctx.user.name}`
          : `${ctx.user.name} rejected ${t.toAgentName}'s request to take ${c.code} over${text ? `: ${text}` : ''}`).slice(0, 500),
        changes: approve
          ? [{ field: 'defaultAgentCode', label: 'Salesperson', from: t.fromAgentName ?? '—', to: t.toAgentName }, ...(moveTo ? [{ field: 'branchCode', label: 'Branch', from: c.branchCode, to: moveTo }] : [])]
          : [{ field: 'pendingAgentCode', label: 'Asked to take over by', from: t.toAgentName, to: '—' }],
        event: CORE_EVENT.CUSTOMER_UPDATED,
        snapshot: customerSnapshot(customerRecord(after)),
      });
      const title = approve ? `${c.name} is now your customer` : `Your request for ${c.name} was rejected`;
      // Approved: a link to the customer, now theirs. Rejected: no link, they no longer see it.
      await this.notifications.send(tx, ctx, { to: [t.toAgentCode], kind: 'core.customer.transfer_decided', title, body: text ?? (approve ? `${ctx.user.name} approved it.` : ''), link: approve ? `/core/customers/${c.id}` : null, entityType: CORE_ENTITY.CUSTOMER, entityId: c.id });
      if (approve && t.fromAgentCode) {
        await this.notifications.send(tx, ctx, { to: [t.fromAgentCode], kind: 'core.customer.transfer_decided', title: `${c.name} moved to ${t.toAgentName}`, body: `Approved by ${ctx.user.name}${text ? `: ${text}` : '.'}`, entityType: CORE_ENTITY.CUSTOMER, entityId: c.id });
      }
    });
    const done = await this.prisma.mdmCustomerTransfer.findFirstOrThrow({ where: { id, tenantId } });
    return this.view(done, ctx);
  }

  /** The office's list: waiting first. Seen for the customers' branches the user works in. */
  async list(ctx: RequestContext, status?: string) {
    const rows = await this.prisma.mdmCustomerTransfer.findMany({
      where: { tenantId: ctx.tenantId, ...(status && status !== 'all' && { status: status.toUpperCase() }) },
      orderBy: [{ createdAt: 'desc' }], take: 200,
    });
    const customers = await asSystem(() => this.prisma.mdmCustomer.findMany({ where: { tenantId: ctx.tenantId, id: { in: rows.map((r) => r.customerId) } }, select: { id: true, branchCode: true } }));
    const mine = rows.filter((r) => ctx.user.branchCodes.includes(customers.find((c) => c.id === r.customerId)?.branchCode ?? '') || ctx.user.branchCodes.includes(r.toBranchCode));
    const counts = await this.prisma.mdmCustomerTransfer.groupBy({ by: ['status'], where: { tenantId: ctx.tenantId, id: { in: mine.map((r) => r.id) } }, _count: { _all: true } });
    return {
      items: mine.map((r) => this.view(r, ctx)).sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING')),
      statusCounts: { all: mine.length, ...Object.fromEntries(counts.map((c) => [c.status.toLowerCase(), c._count._all])) },
    };
  }

  /** The salesperson's own requests, newest first. */
  async mine(ctx: RequestContext) {
    const rows = await this.prisma.mdmCustomerTransfer.findMany({ where: { tenantId: ctx.tenantId, toAgentCode: ctx.user.code }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { items: rows.map((r) => this.view(r, ctx)) };
  }

  /** The request waiting on one customer, for its page. */
  async pendingFor(ctx: RequestContext, customerId: string) {
    const t = await this.prisma.mdmCustomerTransfer.findFirst({ where: { tenantId: ctx.tenantId, customerId, status: 'PENDING' } });
    return t ? this.view(t, ctx) : null;
  }
}
