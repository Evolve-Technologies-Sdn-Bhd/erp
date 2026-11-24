import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SvcJob, SvcJobItem, SvcJobStage } from '@prisma/client';
import { JobStockService } from '../stock/job-stock.service';
import { returnView } from '../returns/returns.service';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { toMoney, toQty } from '../../platform/http/decimal';
import { NotFoundError } from '../../platform/http/errors';
import { buildStatusCounts, pageArgs, statusFromKey, toListResponse } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SVC_ENTITY } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import type { JobListQueryDto } from './dto/job.dto';
import { timingView } from '../board/board.query';
import { busyEnd, slotLabel, timeLabel } from '../board/booking.rules';
import { businessNow, expectedEndOf, runsInto, type BusinessNow } from './timing.rules';
import { allowedJobActions, bookingNeeds, JOB_STAGE_LABEL, JOB_STAGES, JOB_TYPE_LABEL, shortDay, waitingText, type JobStage, type JobType } from './jobs.rules';
import { METHOD_LABEL, PAID_LABEL, RESULT_LABEL, type PaidMethod, type PaidStatus, type VisitResult } from './visit.rules';

export type JobWithItems = SvcJob & { items: SvcJobItem[] };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The jobs overdue now (timing.rules.ts): flagged before, or booked with the expected completion passed. Bookings
 * always carry `expectedEnd`, so the database can answer without the slot end.
 */
export function overdueWhere(now: BusinessNow): Prisma.SvcJobWhereInput {
  const booked = { in: ['BOOKED', 'ACCEPTED'] as SvcJobStage[] };
  return {
    OR: [
      { stage: { in: ['NOT_BOOKED', 'BOOKED', 'ACCEPTED'] as SvcJobStage[] }, overdueSince: { not: null } },
      { stage: booked, jobDate: { lt: day(now.date) } },
      { stage: booked, jobDate: day(now.date), expectedEnd: { lte: now.minutes } },
    ],
  };
}

/** Reads of the Service module (V01 home, V03 jobs, V04 job). Only svc_ tables, and Master Data through the port. */
@Injectable()
export class JobsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly permissions: PermissionRegistry,
    private readonly clock: ClockService,
    private readonly attachments: AttachmentsService,
    private readonly jobStock: JobStockService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  async load(tenantId: string, id: string): Promise<JobWithItems> {
    const job = await this.prisma.svcJob.findFirst({ where: { id, tenantId }, include: { items: { orderBy: { lineNo: 'asc' } } } });
    if (!job) throw new NotFoundError('Job');
    return job;
  }

  /** Where the business clock is now. */
  now(): BusinessNow {
    return businessNow(this.clock.now(), this.clock.today());
  }

  /** V03 · List of Jobs: newest first, with a tab per stage, and ?overdue=1 for the jobs overdue now. */
  async list(ctx: RequestContext, query: JobListQueryDto) {
    const q = query.q?.trim();
    const now = this.now();
    const base: Prisma.SvcJobWhereInput = {
      tenantId: ctx.tenantId,
      ...(query.type && { jobType: query.type as JobType }),
      ...(query.branch && { branchCode: query.branch }),
      AND: [
        ...(q ? [{ OR: [{ docNo: { contains: q } }, { customerName: { contains: q } }, { salesOrderNo: { contains: q } }] }] : []),
        ...(query.overdue ? [overdueWhere(now)] : []),
      ],
    };
    const stage = statusFromKey(query.status, JOB_STAGES);
    const where: Prisma.SvcJobWhereInput = { ...base, ...(stage && { stage }) };
    const [rows, total, grouped] = await Promise.all([
      this.prisma.svcJob.findMany({ where, orderBy: [{ createdAt: 'desc' }, { docNo: 'desc' }], ...pageArgs(query) }),
      this.prisma.svcJob.count({ where }),
      this.prisma.svcJob.groupBy({ by: ['stage'], where: base, _count: { _all: true } }),
    ]);
    return toListResponse(
      rows.map((j) => this.row(j, now)),
      total,
      query,
      buildStatusCounts(grouped.map((g) => ({ status: g.stage as JobStage, _count: g._count })), JOB_STAGES),
    );
  }

  /** V04 · Job. */
  async detail(ctx: RequestContext, id: string) {
    const job = await this.load(ctx.tenantId, id);
    const booked = job.jobDate && job.slotStart !== null && job.slotEnd !== null && job.personId;
    const [activity, customer, photos, followUp, sameDay] = await Promise.all([
      this.activity.listFor(ctx.tenantId, SVC_ENTITY.JOB, job.id),
      this.masterData.findCustomer(ctx.tenantId, job.customerCode),
      this.attachments.listFor(ctx.tenantId, SVC_ENTITY.JOB, job.id),
      this.prisma.svcJob.findFirst({ where: { tenantId: ctx.tenantId, followUpOfId: job.id }, select: { id: true, docNo: true } }),
      // The person's other jobs that day, to say which ones an extended job runs into.
      booked && (job.expectedEnd ?? 0) > job.slotEnd!
        ? this.prisma.svcJob.findMany({
            where: { tenantId: ctx.tenantId, personId: job.personId, jobDate: job.jobDate, stage: { notIn: ['CANCELLED', 'NOT_BOOKED'] }, id: { not: job.id } },
            select: { docNo: true, slotStart: true, slotEnd: true },
          })
        : Promise.resolve([]),
    ]);
    const end = booked ? busyEnd({ slotEnd: job.slotEnd!, expectedEnd: job.expectedEnd }) : null;
    const branches = await this.masterData.listBranches(ctx.tenantId);
    return {
      ...this.row(job, this.now()),
      branch: { code: job.branchCode, name: branches.find((b) => b.code === job.branchCode)?.name ?? job.branchCode },
      customer: { code: job.customerCode, name: job.customerName, email: customer?.email ?? null },
      contactName: job.contactName,
      phone: job.phone,
      siteAddress: job.siteAddress,
      /** The salesperson of the order (phase 5), who hears when the job is postponed, moved or at risk. */
      agentName: job.agentName,
      atRiskSince: job.atRiskSince?.toISOString() ?? null,
      postcode: job.postcode,
      state: job.state,
      /** What the office needs before booking and the job lacks: warned on the page and the board, never blocking. */
      ...bookingNeeds(job),
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
      booking: job.jobDate && job.slotStart !== null && job.slotEnd !== null
        ? {
            personId: job.personId, personName: job.personName, date: iso(job.jobDate), start: job.slotStart, end: job.slotEnd, slotGroupCode: job.slotGroupCode,
            text: `${shortDay(iso(job.jobDate)!)} · ${slotLabel(job.slotStart, job.slotEnd)}`,
            /** When it should be finished (F3 part 4): the slot end, or later when the office extended it. */
            expectedEnd: expectedEndOf(job),
            expectedText: timeLabel(expectedEndOf(job)!),
            extended: end !== null && end > job.slotEnd,
            extendReason: job.extendReason,
            /** The person's later jobs that day that start before this one is now expected to finish. */
            runsInto: end !== null && end > job.slotEnd
              ? runsInto({ start: job.slotStart, end }, sameDay.filter((o) => o.slotStart !== null && o.slotEnd !== null).map((o) => ({ docNo: o.docNo, start: o.slotStart!, end: o.slotEnd! })))
                  .map((o) => `${o.docNo} at ${slotLabel(o.start, o.end)}`)
              : [],
          }
        : null,
      /** The warehouse's check and the delivery order (phase 5). `confirms` false: the company does not use it. */
      stock: {
        confirms: await this.jobStock.confirms(ctx.tenantId),
        items: booked ? ((await this.jobStock.stockOf(ctx.tenantId, [job])).get(job.id) ?? []) : [],
        confirmedAt: job.stockConfirmedAt?.toISOString() ?? null,
        confirmedBy: job.stockConfirmedBy,
      },
      delivery: job.deliveryId ? { id: job.deliveryId, docNo: job.deliveryNo, delivered: Boolean(job.deliveredAt) } : null,
      /** Parts the installer said come back (phase 5). */
      returns: (await this.prisma.svcReturn.findMany({ where: { tenantId: ctx.tenantId, jobId: job.id }, orderBy: { itemCode: 'asc' } })).map(returnView),
      doneAt: job.doneAt?.toISOString() ?? null,
      doneNote: job.doneNote,
      /** What the installer recorded (F3 part 3): null until the visit is recorded as complete or partly done. */
      visit: job.result && job.result !== 'POSTPONED'
        ? {
            result: job.result, resultLabel: RESULT_LABEL[job.result as VisitResult], reason: job.resultReason, arrivedAt: job.arrivedAt, finishedAt: job.finishedAt,
            paidStatus: job.paidStatus, paidLabel: job.paidStatus ? PAID_LABEL[job.paidStatus as PaidStatus] : null,
            paidMethod: job.paidMethod ? METHOD_LABEL[job.paidMethod as PaidMethod] : null, notPaidReason: job.notPaidReason,
            recordedBy: job.recordedBy, recordedAt: job.recordedAt?.toISOString() ?? null,
          }
        : null,
      /** The last postponement, while the job waits to be booked again. */
      postponed: job.result === 'POSTPONED' ? { reason: job.resultReason, count: job.postponedCount } : null,
      photos,
      followUpOf: job.followUpOfId ? { id: job.followUpOfId, docNo: job.followUpOfNo } : null,
      followUpJob: followUp,
      closedAt: job.closedAt?.toISOString() ?? null,
      /** The order's payment, from Sales' official receipts (phase 5); null when Sales has not said. */
      orderPayment: job.orderPayment
        ? {
            status: job.orderPayment,
            label: ({ UNPAID: 'Unpaid', DEPOSIT: 'Deposit paid', FULLY_PAID: 'Fully paid' } as Record<string, string>)[job.orderPayment] ?? job.orderPayment,
            paid: job.orderPaid ? toMoney(job.orderPaid) : null,
            total: job.orderTotal ? toMoney(job.orderTotal) : null,
          }
        : null,
      allowedActions: allowedJobActions(
        job.stage as JobStage,
        { edit: this.permissions.has(ctx.user.roles, P.JOB_EDIT), book: this.permissions.has(ctx.user.roles, P.JOB_BOOK), record: this.permissions.has(ctx.user.roles, P.JOB_RECORD) },
        { partial: job.result === 'PARTIAL', hasFollowUp: Boolean(followUp) },
      ),
    };
  }

  /** V01 · Service home: what waits to be booked. Booking (part 2) adds today's jobs by person. */
  async home(ctx: RequestContext) {
    const today = this.clock.today();
    const now = this.now();
    const where = { tenantId: ctx.tenantId, stage: 'NOT_BOOKED' as const };
    const [waiting, count, grouped, notPaid, overdue] = await Promise.all([
      this.prisma.svcJob.findMany({ where, orderBy: [{ createdAt: 'asc' }, { docNo: 'asc' }], take: 10 }),
      this.prisma.svcJob.count({ where }),
      this.prisma.svcJob.groupBy({ by: ['stage'], where: { tenantId: ctx.tenantId }, _count: { _all: true } }),
      this.prisma.svcJob.count({ where: { tenantId: ctx.tenantId, stage: 'DONE', paidStatus: 'NOT_PAID' } }),
      this.prisma.svcJob.count({ where: { tenantId: ctx.tenantId, ...overdueWhere(now) } }),
    ]);
    const oldest = waiting[0];
    const days = oldest ? Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso(oldest.createdAt)}T00:00:00Z`)) / DAY_MS)) : null;
    return {
      today,
      notBooked: { count, oldestDays: days },
      /** Done jobs the customer did not pay for on site: the office follows them up before closing. */
      doneNotPaid: notPaid,
      /** Jobs past their expected completion with the visit not recorded (F3 part 4). */
      overdue,
      stages: buildStatusCounts(grouped.map((g) => ({ status: g.stage as JobStage, _count: g._count })), JOB_STAGES),
      waiting: waiting.map((j) => this.row(j, now)),
    };
  }

  private row(j: SvcJob, now: BusinessNow) {
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
      preferredDate: iso(j.preferredDate),
      personName: j.personName,
      /** "Tue, 29 Sep · 10 AM – 12 PM" once booked; before that, what the customer asks for. */
      whenText: j.jobDate && j.slotStart !== null && j.slotEnd !== null
        ? `${shortDay(iso(j.jobDate)!)} · ${slotLabel(j.slotStart, j.slotEnd)}`
        : waitingText({ preferredDate: iso(j.preferredDate), afterStock: j.afterStock }),
      stage: j.stage,
      stageLabel: JOB_STAGE_LABEL[j.stage as JobStage],
      /** SvcJobs.html "Paid on site": Paid, Not paid, No charge, or null before the visit. */
      paidLabel: j.paidStatus ? PAID_LABEL[j.paidStatus as PaidStatus].replace(' on site', '') : null,
      result: j.result,
      createdAt: j.createdAt.toISOString(),
      ...timingView(j, now),
    };
  }
}
