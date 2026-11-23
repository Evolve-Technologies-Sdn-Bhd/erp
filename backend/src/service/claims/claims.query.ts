import { Injectable } from '@nestjs/common';
import type { Prisma, SvcClaim, SvcClaimLine, SvcJob } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { toMoney } from '../../platform/http/decimal';
import { NotFoundError, ValidationFailedError } from '../../platform/http/errors';
import { buildStatusCounts, pageArgs, statusFromKey, toListResponse } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { JOB_TYPE_LABEL, type JobType } from '../jobs/jobs.rules';
import { SVC_ENTITY } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import type { ClaimListQueryDto } from './claims.dto';
import {
  allowedClaimActions, CLAIM_STATUS_LABEL, CLAIM_STATUSES, claimPeriod, claimRefusal, periodText, referenceFee, updatedLate, type ClaimStatus,
} from './claims.rules';

export type ClaimWithLines = SvcClaim & { lines: SvcClaimLine[] };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

/** A job as it would go on a claim: the fee by rule, late or not, and why it cannot be claimed when it cannot. */
export interface EligibleJob {
  id: string;
  docNo: string;
  jobType: string;
  typeLabel: string;
  customerName: string;
  salesOrderNo: string | null;
  doneOn: string;
  categoryName: string | null;
  late: boolean;
  referenceAmount: string;
  claimable: boolean;
  why: string | null;
}

/** Reads for installer claims (F5): the jobs a claim can take, the list (V07) and one claim (V08). */
@Injectable()
export class ClaimsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly attachments: AttachmentsService,
    private readonly permissions: PermissionRegistry,
  ) {}

  async load(tenantId: string, id: string): Promise<ClaimWithLines> {
    const claim = await this.prisma.svcClaim.findFirst({ where: { id, tenantId }, include: { lines: { orderBy: { doneOn: 'asc' } } } });
    if (!claim) throw new NotFoundError('Claim');
    return claim;
  }

  /** The person, who must claim fees. */
  async person(tenantId: string, personId: string) {
    const p = await this.prisma.svcPerson.findFirst({ where: { tenantId, id: personId } });
    if (!p) throw ValidationFailedError.field('personId', 'Pick the installer from the list.');
    if (!p.claimsFees) throw ValidationFailedError.field('personId', `${p.name} does not claim fees. Tick Claims fees for them in Slots and Stages if they should.`);
    return p;
  }

  /** The person's jobs done in the claim period of a day, each with its fee by rule and whether it can be claimed. */
  async eligible(ctx: RequestContext, personId: string, onDay: string, claimId: string | null = null) {
    const person = await this.person(ctx.tenantId, personId);
    const period = claimPeriod(onDay);
    const jobs = await this.prisma.svcJob.findMany({
      where: { tenantId: ctx.tenantId, personId, jobDate: { gte: day(period.start), lte: day(period.end) }, stage: { in: ['DONE', 'CLOSED'] } },
      orderBy: [{ jobDate: 'asc' }, { docNo: 'asc' }],
    });
    const [groups, onClaims] = await Promise.all([
      this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId } }),
      this.prisma.svcClaimLine.findMany({
        where: { tenantId: ctx.tenantId, jobId: { in: jobs.map((j) => j.id) }, claim: { status: { not: 'CANCELLED' }, ...(claimId && { id: { not: claimId } }) } },
        select: { jobId: true, claim: { select: { docNo: true } } },
      }),
    ]);
    const items: EligibleJob[] = jobs.map((j) => this.eligibleJob(j, personId, period, groups, onClaims.find((c) => c.jobId === j.id)?.claim.docNo ?? null));
    return { person: { id: person.id, name: person.name }, period: { ...period, text: periodText(period) }, jobs: items };
  }

  eligibleJob(
    j: SvcJob,
    personId: string,
    period: { start: string; end: string },
    groups: { code: string; name: string; feeAmount: Prisma.Decimal | null }[],
    claimedOn: string | null,
  ): EligibleJob {
    const group = groups.find((g) => g.code === j.slotGroupCode) ?? null;
    const expectedEnd = j.expectedEnd ?? j.slotEnd;
    const late = Boolean(j.jobDate && expectedEnd !== null && j.recordedAt && updatedLate({ jobDate: iso(j.jobDate), expectedEnd }, j.recordedAt));
    const why = claimRefusal(
      { docNo: j.docNo, stage: j.stage, result: j.result, personId: j.personId, jobDate: j.jobDate ? iso(j.jobDate) : null, orderPayment: j.orderPayment, salesOrderNo: j.salesOrderNo, claimedOn },
      personId, period,
    );
    return {
      id: j.id, docNo: j.docNo, jobType: j.jobType, typeLabel: JOB_TYPE_LABEL[j.jobType as JobType], customerName: j.customerName, salesOrderNo: j.salesOrderNo,
      doneOn: j.jobDate ? iso(j.jobDate) : '', categoryName: group?.name ?? null, late,
      referenceAmount: referenceFee(group?.feeAmount?.toString() ?? null, late), claimable: !why, why,
    };
  }

  /** V07 · Claims: newest first, a tab per status, filtered on the installer. */
  async list(ctx: RequestContext, query: ClaimListQueryDto) {
    const q = query.q?.trim();
    const base: Prisma.SvcClaimWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.personId && { personId: query.personId }),
      ...(q && { OR: [{ docNo: { contains: q } }, { personName: { contains: q } }, { invoiceNo: { contains: q } }, { paymentRef: { contains: q } }] }),
    };
    const status = statusFromKey(query.status, CLAIM_STATUSES);
    const where: Prisma.SvcClaimWhereInput = { ...base, ...(status && { status }) };
    const [rows, total, grouped, sum] = await Promise.all([
      this.prisma.svcClaim.findMany({ where, include: { _count: { select: { lines: true } } }, orderBy: [{ periodStart: 'desc' }, { docNo: 'desc' }], ...pageArgs(query) }),
      this.prisma.svcClaim.count({ where }),
      this.prisma.svcClaim.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.svcClaim.aggregate({ where, _sum: { total: true } }),
    ]);
    return {
      ...toListResponse(
        rows.map((c) => ({
          id: c.id, docNo: c.docNo, personName: c.personName, periodText: periodText({ start: iso(c.periodStart), end: iso(c.periodEnd) }),
          payOn: iso(c.payOn), jobs: c._count.lines, total: toMoney(c.total), invoiceNo: c.invoiceNo, selfBilled: c.selfBilled,
          status: c.status, statusLabel: CLAIM_STATUS_LABEL[c.status as ClaimStatus], paymentRef: c.paymentRef,
        })),
        total,
        query,
        buildStatusCounts(grouped, CLAIM_STATUSES),
      ),
      /** What the claims on this filter add up to. */
      sumTotal: toMoney(sum._sum.total ?? 0),
    };
  }

  /** V08 · Claim. */
  async detail(ctx: RequestContext, id: string) {
    const c = await this.load(ctx.tenantId, id);
    const [activity, files] = await Promise.all([
      this.activity.listFor(ctx.tenantId, SVC_ENTITY.CLAIM, c.id),
      this.attachments.listFor(ctx.tenantId, SVC_ENTITY.CLAIM, c.id),
    ]);
    const has = (p: string) => this.permissions.has(ctx.user.roles, p);
    return {
      id: c.id, docNo: c.docNo, branchCode: c.branchCode, personId: c.personId, personName: c.personName,
      period: { start: iso(c.periodStart), end: iso(c.periodEnd), payOn: iso(c.payOn), text: periodText({ start: iso(c.periodStart), end: iso(c.periodEnd) }) },
      status: c.status, statusLabel: CLAIM_STATUS_LABEL[c.status as ClaimStatus],
      invoiceNo: c.invoiceNo, selfBilled: c.selfBilled, note: c.note, total: toMoney(c.total),
      submittedAt: c.submittedAt?.toISOString() ?? null, submittedByName: c.submittedByName,
      decidedAt: c.decidedAt?.toISOString() ?? null, decidedByName: c.decidedByName, returnReason: c.returnReason,
      paidOn: c.paidOn ? iso(c.paidOn) : null, paymentRef: c.paymentRef,
      lines: c.lines.map((l) => ({
        id: l.id, jobId: l.jobId, jobNo: l.jobNo, typeLabel: JOB_TYPE_LABEL[l.jobType as JobType] ?? l.jobType, customerName: l.customerName,
        salesOrderNo: l.salesOrderNo, categoryName: l.categoryName, doneOn: iso(l.doneOn), late: l.late,
        referenceAmount: toMoney(l.referenceAmount), amount: toMoney(l.amount), reason: l.reason,
      })),
      files: files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, downloadUrl: f.downloadUrl })),
      activity,
      version: c.version,
      allowedActions: allowedClaimActions(c.status as ClaimStatus, { edit: has(P.CLAIM_EDIT), approve: has(P.CLAIM_APPROVE) }, c.submittedBy === ctx.user.code),
    };
  }
}
