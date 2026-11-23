import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { ClockService } from '../../platform/clock/clock.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { dec, toMoney } from '../../platform/http/decimal';
import { BusinessRuleError, StaleVersionError, ValidationFailedError, type FieldError } from '../../platform/http/errors';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SVC_DOC_TYPE, SVC_ENTITY, SVC_EVENT, SVC_SEQUENCES } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import type { ClaimLineDto, CreateClaimDto, PayClaimDto, ReturnClaimDto, UpdateClaimDto } from './claims.dto';
import { ClaimsQuery, type ClaimWithLines } from './claims.query';
import { allowedClaimActions, claimPeriod, invoiceFileError, lineErrors, periodText, submitErrors, type ClaimAction, type ClaimStatus } from './claims.rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);
const money = (v: Prisma.Decimal) => toMoney(v);

/**
 * Installer claims (F5, claims.rules.ts): the office keys a claim for an installer and a claim period, with the jobs
 * and the installer's invoice, until installers do it on the phone app; Account approves or sends it back, then
 * records the payment voucher. Every change writes activity; submitting, approving and sending back alert the people
 * concerned; approving and paying publish events for Finance later.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly query: ClaimsQuery,
    private readonly numbering: NumberingService,
    private readonly activity: ActivityService,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
  ) {}

  async create(ctx: RequestContext, dto: CreateClaimDto) {
    const person = await this.query.person(ctx.tenantId, dto.personId);
    const period = claimPeriod(dto.day);
    const built = await this.buildLines(ctx, dto.personId, dto.day, dto.lines ?? [], null);
    await this.checkFiles(ctx.tenantId, dto.invoiceFileIds ?? [], null);
    const { id } = await this.prisma.$transaction(async (tx) => {
      await this.ensureSequence(tx, ctx.tenantId);
      const docNo = await this.numbering.next(tx, ctx.tenantId, SVC_DOC_TYPE.CLAIM, { date: this.clock.today(), branchCode: ctx.branchCode });
      const claim = await tx.svcClaim.create({
        data: {
          tenantId: ctx.tenantId, docNo, branchCode: built.branchCode ?? ctx.branchCode, personId: person.id, personName: person.name,
          periodStart: day(period.start), periodEnd: day(period.end), payOn: day(period.payOn),
          invoiceNo: dto.invoiceNo?.trim() || null, selfBilled: dto.selfBilled ?? false, note: dto.note?.trim() || null, total: built.total,
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
          lines: { create: built.lines.map((l) => ({ ...l, tenantId: ctx.tenantId })) },
        },
      });
      if (dto.invoiceFileIds?.length) await this.attachments.attach(tx, ctx, dto.invoiceFileIds, SVC_ENTITY.CLAIM, claim.id);
      await this.log(tx, ctx, claim.id, docNo, 'created', `Keyed by ${ctx.user.name} for ${person.name}, ${periodText(period)}: ${built.lines.length} job${built.lines.length === 1 ? '' : 's'}, RM ${money(built.total)}`);
      return claim;
    });
    return this.query.detail(ctx, id);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateClaimDto) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'edit', `${c.docNo} is ${c.status === 'SUBMITTED' ? 'waiting for Account' : 'closed'} and cannot be changed.`);
    const built = dto.lines ? await this.buildLines(ctx, c.personId, iso(c.periodStart), dto.lines, c.id) : null;
    await this.checkFiles(ctx.tenantId, dto.invoiceFileIds ?? [], c.id);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, dto.version, {
        ...(dto.invoiceNo !== undefined && { invoiceNo: dto.invoiceNo.trim() || null }),
        ...(dto.selfBilled !== undefined && { selfBilled: dto.selfBilled }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
        ...(built && { total: built.total }),
      });
      if (built) {
        await tx.svcClaimLine.deleteMany({ where: { claimId: c.id } });
        await tx.svcClaimLine.createMany({ data: built.lines.map((l) => ({ ...l, tenantId: ctx.tenantId, claimId: c.id })) });
      }
      if (dto.invoiceFileIds?.length) await this.attachments.attach(tx, ctx, dto.invoiceFileIds, SVC_ENTITY.CLAIM, c.id);
      await this.log(tx, ctx, c.id, c.docNo, 'saved', `Saved by ${ctx.user.name}${built ? `: ${built.lines.length} job${built.lines.length === 1 ? '' : 's'}, RM ${money(built.total)}` : ''}`);
    });
    return this.query.detail(ctx, id);
  }

  /** Sends the claim to Account, checking again that every job can still be claimed. */
  async submit(ctx: RequestContext, id: string, version: number) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'submit', `${c.docNo} cannot be submitted now.`);
    const files = await this.attachments.listFor(ctx.tenantId, SVC_ENTITY.CLAIM, c.id);
    const errors = submitErrors({ lines: c.lines.length, invoiceNo: c.invoiceNo, selfBilled: c.selfBilled, invoiceFiles: files.length });
    if (errors.length) throw new ValidationFailedError(errors);
    await this.buildLines(ctx, c.personId, iso(c.periodStart), c.lines.map((l) => ({ jobId: l.jobId, amount: l.amount.toFixed(2), reason: l.reason ?? undefined })), c.id);
    const account = await this.notifications.whoCan(ctx.tenantId, P.CLAIM_APPROVE, c.branchCode);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, version, { status: 'SUBMITTED', submittedAt: this.clock.now(), submittedBy: ctx.user.code, submittedByName: ctx.user.name, returnReason: null });
      await this.log(tx, ctx, c.id, c.docNo, 'submitted', `Submitted to Account by ${ctx.user.name}: RM ${money(c.total)}`);
      await this.notifications.send(tx, ctx, {
        to: account, kind: 'service.claim.submitted', link: `/service/claims/${c.id}`, entityType: SVC_ENTITY.CLAIM, entityId: c.id,
        title: `${c.docNo} to check: ${c.personName}`, body: `${periodText({ start: iso(c.periodStart), end: iso(c.periodEnd) })}, ${c.lines.length} job${c.lines.length === 1 ? '' : 's'}, RM ${money(c.total)}.`,
      });
    });
    return this.query.detail(ctx, id);
  }

  async approve(ctx: RequestContext, id: string, version: number) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'approve', c.submittedBy === ctx.user.code ? 'Whoever submitted a claim does not approve it. Ask someone else in Account.' : `${c.docNo} is not waiting for Account.`);
    const payOn = iso(c.payOn);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, version, { status: 'APPROVED', decidedAt: this.clock.now(), decidedByName: ctx.user.name });
      await this.log(tx, ctx, c.id, c.docNo, 'approved', `Approved by ${ctx.user.name}: RM ${money(c.total)}, to pay on ${payOn}`);
      await this.notifications.send(tx, ctx, {
        to: [c.submittedBy ?? ''], kind: 'service.claim.approved', link: `/service/claims/${c.id}`, entityType: SVC_ENTITY.CLAIM, entityId: c.id,
        title: `${c.docNo} approved`, body: `${c.personName}: RM ${money(c.total)}, paid on ${payOn}.`,
      });
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.CLAIM_APPROVED, aggregateType: SVC_ENTITY.CLAIM, aggregateId: c.id,
        payload: {
          claimNo: c.docNo, personId: c.personId, personName: c.personName, periodStart: iso(c.periodStart), periodEnd: iso(c.periodEnd), payOn,
          invoiceNo: c.invoiceNo, selfBilled: c.selfBilled, total: money(c.total),
          lines: c.lines.map((l) => ({ jobNo: l.jobNo, salesOrderNo: l.salesOrderNo, amount: money(l.amount) })),
        },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  async sendBack(ctx: RequestContext, id: string, dto: ReturnClaimDto) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'return', c.submittedBy === ctx.user.code ? 'Whoever submitted a claim does not decide it.' : `${c.docNo} is not waiting for Account.`);
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, dto.version, { status: 'RETURNED', decidedAt: this.clock.now(), decidedByName: ctx.user.name, returnReason: reason });
      await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.CLAIM, entityId: c.id, docNo: c.docNo, action: 'returned', message: `Sent back by ${ctx.user.name}`, comment: reason });
      await this.notifications.send(tx, ctx, {
        to: [c.submittedBy ?? ''], kind: 'service.claim.returned', link: `/service/claims/${c.id}`, entityType: SVC_ENTITY.CLAIM, entityId: c.id,
        title: `${c.docNo} sent back`, body: `${c.personName}: ${reason}`,
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Account records the payment voucher. */
  async pay(ctx: RequestContext, id: string, dto: PayClaimDto) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'pay', `${c.docNo} must be approved before it is paid.`);
    const ref = dto.paymentRef.trim();
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, dto.version, { status: 'PAID', paidOn: day(dto.paidOn), paymentRef: ref });
      await this.log(tx, ctx, c.id, c.docNo, 'paid', `Paid by ${ctx.user.name} on ${dto.paidOn}, ${ref}: RM ${money(c.total)}`);
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.CLAIM_PAID, aggregateType: SVC_ENTITY.CLAIM, aggregateId: c.id,
        payload: { claimNo: c.docNo, personId: c.personId, personName: c.personName, paidOn: dto.paidOn, paymentRef: ref, total: money(c.total) },
      }]);
    });
    return this.query.detail(ctx, id);
  }

  /** A draft or a claim sent back is cancelled; its jobs can go on another claim. */
  async cancel(ctx: RequestContext, id: string, version: number) {
    const c = await this.query.load(ctx.tenantId, id);
    this.require(ctx, c, 'cancel', `${c.docNo} cannot be cancelled now.`);
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, ctx, c, version, { status: 'CANCELLED' });
      await this.log(tx, ctx, c.id, c.docNo, 'cancelled', `Cancelled by ${ctx.user.name}; its jobs can be claimed again`);
    });
    return this.query.detail(ctx, id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** The claim's lines: each job must be claimable, at the fee by rule unless an amount with a reason is given. */
  private async buildLines(ctx: RequestContext, personId: string, onDay: string, input: ClaimLineDto[], claimId: string | null) {
    const { jobs } = await this.query.eligible(ctx, personId, onDay, claimId);
    const errors: FieldError[] = [];
    const seen = new Set<string>();
    const picked = input.flatMap((l, i) => {
      if (seen.has(l.jobId)) return [];
      seen.add(l.jobId);
      const job = jobs.find((j) => j.id === l.jobId);
      if (!job || !job.claimable) {
        errors.push({ field: `lines[${i}].jobId`, message: job?.why ?? 'This job was not done by this person in this claim period.' });
        return [];
      }
      return [{ job, amount: l.amount?.trim() || job.referenceAmount, reason: l.reason?.trim() || null }];
    });
    errors.push(...lineErrors(picked.map((p) => ({ amount: p.amount, referenceAmount: p.job.referenceAmount, reason: p.reason }))));
    if (errors.length) throw new ValidationFailedError(errors);
    const branches = await this.prisma.svcJob.findMany({ where: { tenantId: ctx.tenantId, id: { in: picked.map((p) => p.job.id) } }, select: { branchCode: true } });
    const lines = picked.map((p) => ({
      jobId: p.job.id, jobNo: p.job.docNo, jobType: p.job.jobType, customerName: p.job.customerName, salesOrderNo: p.job.salesOrderNo, categoryName: p.job.categoryName,
      doneOn: day(p.job.doneOn), late: p.job.late, referenceAmount: dec(p.job.referenceAmount), amount: dec(p.amount),
      reason: dec(p.amount).eq(dec(p.job.referenceAmount)) ? null : p.reason,
    }));
    return { lines, total: lines.reduce((s, l) => s.add(l.amount), dec(0)), branchCode: branches[0]?.branchCode ?? null };
  }

  private async checkFiles(tenantId: string, ids: string[], claimId: string | null) {
    if (!ids.length) return;
    const files = await this.prisma.sysAttachment.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, mimeType: true, entityType: true, entityId: true } });
    const problem = ids.map((fid) => invoiceFileError(files.find((f) => f.id === fid) ?? null, claimId)).find(Boolean);
    if (problem) throw ValidationFailedError.field('invoiceFileIds', problem);
  }

  private require(ctx: RequestContext, c: ClaimWithLines, action: ClaimAction, message: string) {
    const has = (p: string) => this.permissions.has(ctx.user.roles, p);
    const allowed = allowedClaimActions(c.status as ClaimStatus, { edit: has(P.CLAIM_EDIT), approve: has(P.CLAIM_APPROVE) }, c.submittedBy === ctx.user.code);
    const own = (action === 'approve' || action === 'return') && c.status === 'SUBMITTED' && c.submittedBy === ctx.user.code;
    if (!allowed.includes(action)) throw new BusinessRuleError(own ? 'OWN_CLAIM' : 'ACTION_NOT_ALLOWED', message);
  }

  private async bump(tx: Tx, ctx: RequestContext, c: ClaimWithLines, version: number, data: Prisma.SvcClaimUpdateManyMutationInput) {
    const r = await tx.svcClaim.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, version, status: c.status }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
    if (r.count === 0) throw new StaleVersionError();
  }

  private async ensureSequence(tx: Tx, tenantId: string) {
    const s = SVC_SEQUENCES.find((x) => x.docType === SVC_DOC_TYPE.CLAIM)!;
    await tx.sysNumberSequence.upsert({
      where: { tenantId_docType: { tenantId, docType: s.docType } },
      update: {},
      create: { tenantId, module: 'service', docType: s.docType, name: s.name, prefix: s.prefix, digits: s.digits },
    });
  }

  private log(tx: Tx, ctx: RequestContext, id: string, docNo: string, action: string, message: string) {
    return this.activity.log(tx, ctx, { entityType: SVC_ENTITY.CLAIM, entityId: id, docNo, action, message, comment: null });
  }
}
