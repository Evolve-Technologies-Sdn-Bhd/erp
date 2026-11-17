import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SvcJob, SvcJobItem } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { toQty } from '../../platform/http/decimal';
import { NotFoundError } from '../../platform/http/errors';
import { buildStatusCounts, pageArgs, statusFromKey, toListResponse } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SVC_ENTITY } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import type { JobListQueryDto } from './dto/job.dto';
import { allowedJobActions, JOB_STAGE_LABEL, JOB_STAGES, JOB_TYPE_LABEL, waitingText, type JobStage, type JobType } from './jobs.rules';

export type JobWithItems = SvcJob & { items: SvcJobItem[] };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads of the Service module (V01 home, V03 jobs, V04 job). Only svc_ tables, and Master Data through the port. */
@Injectable()
export class JobsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly permissions: PermissionRegistry,
    private readonly clock: ClockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  async load(tenantId: string, id: string): Promise<JobWithItems> {
    const job = await this.prisma.svcJob.findFirst({ where: { id, tenantId }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    if (!job) throw new NotFoundError('Job');
    return job;
  }

  /** V03 · List of Jobs: newest first, with a tab per stage. */
  async list(ctx: RequestContext, query: JobListQueryDto) {
    const q = query.q?.trim();
    const base: Prisma.SvcJobWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.type && { jobType: query.type as JobType }),
      ...(query.branch && { branchCode: query.branch }),
      ...(q && { OR: [{ docNo: { contains: q } }, { customerName: { contains: q } }, { salesOrderNo: { contains: q } }] }),
    };
    const stage = statusFromKey(query.status, JOB_STAGES);
    const where: Prisma.SvcJobWhereInput = { ...base, ...(stage && { stage }) };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.svcJob.findMany({ where, orderBy: [{ createdAt: 'desc' }, { docNo: 'desc' }], ...pageArgs(query) }),
      this.prisma.svcJob.count({ where }),
      this.prisma.svcJob.groupBy({ by: ['stage'], where: base, _count: { _all: true } }),
    ]);
    return toListResponse(
      rows.map((j) => this.row(j)),
      total,
      query,
      buildStatusCounts(grouped.map((g) => ({ status: g.stage as JobStage, _count: g._count })), JOB_STAGES),
    );
  }

  /** V04 · Job. */
  async detail(ctx: RequestContext, id: string) {
    const job = await this.load(ctx.tenantId, id);
    const [activity, customer] = await Promise.all([
      this.activity.listFor(ctx.tenantId, SVC_ENTITY.JOB, job.id),
      this.masterData.findCustomer(ctx.tenantId, job.customerCode),
    ]);
    const branches = await this.masterData.listBranches(ctx.tenantId);
    return {
      ...this.row(job),
      branch: { code: job.branchCode, name: branches.find((b) => b.code === job.branchCode)?.name ?? job.branchCode },
      customer: { code: job.customerCode, name: job.customerName, email: customer?.email ?? null },
      contactName: job.contactName,
      phone: job.phone,
      siteAddress: job.siteAddress,
      preferredDate: iso(job.preferredDate),
      afterStock: job.afterStock,
      note: job.note,
      source: job.source,
      salesOrderId: job.salesOrderId,
      cancelReason: job.cancelReason,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      items: job.items.map((i) => ({ lineNo: i.lineNo, itemCode: i.itemCode, itemName: i.itemName, qty: toQty(i.qty), uomCode: i.uomCode, serialNo: i.serialNo })),
      activity,
      version: job.version,
      allowedActions: allowedJobActions(job.stage as JobStage, this.permissions.has(ctx.user.roles, P.JOB_EDIT)),
    };
  }

  /** V01 · Service home: what waits to be booked. Booking (part 2) adds today's jobs by person. */
  async home(ctx: RequestContext) {
    const today = this.clock.today();
    const where = { tenantId: ctx.tenantId, stage: 'NOT_BOOKED' as const };
    const [waiting, count, grouped] = await Promise.all([
      this.prisma.svcJob.findMany({ where, orderBy: [{ createdAt: 'asc' }, { docNo: 'asc' }], take: 10 }),
      this.prisma.svcJob.count({ where }),
      this.prisma.svcJob.groupBy({ by: ['stage'], where: { tenantId: ctx.tenantId }, _count: { _all: true } }),
    ]);
    const oldest = waiting[0];
    const days = oldest ? Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso(oldest.createdAt)}T00:00:00Z`)) / DAY_MS)) : null;
    return {
      today,
      notBooked: { count, oldestDays: days },
      stages: buildStatusCounts(grouped.map((g) => ({ status: g.stage as JobStage, _count: g._count })), JOB_STAGES),
      waiting: waiting.map((j) => this.row(j)),
    };
  }

  private row(j: SvcJob) {
    return {
      id: j.id,
      docNo: j.docNo,
      jobType: j.jobType,
      typeLabel: JOB_TYPE_LABEL[j.jobType as JobType],
      branchCode: j.branchCode,
      customerCode: j.customerCode,
      customerName: j.customerName,
      area: j.area,
      salesOrderNo: j.salesOrderNo,
      /** Booking (part 2) fills the person and the slot; until then the list says what the customer asks for. */
      personName: null as string | null,
      whenText: waitingText({ preferredDate: iso(j.preferredDate), afterStock: j.afterStock }),
      stage: j.stage,
      stageLabel: JOB_STAGE_LABEL[j.stage as JobStage],
      createdAt: j.createdAt.toISOString(),
    };
  }
}
