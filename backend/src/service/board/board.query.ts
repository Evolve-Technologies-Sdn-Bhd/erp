import { Injectable } from '@nestjs/common';
import type { SvcJob } from '@prisma/client';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { bookingNeeds, JOB_STAGE_LABEL, JOB_TYPE_LABEL, shortDay, waitingText, type JobStage, type JobType } from '../jobs/jobs.rules';
import { businessNow, momentText, overdueOf, type BusinessNow } from '../jobs/timing.rules';
import { personView, ServiceSettingsService, slotGroupView } from '../settings/settings.service';
import { busyEnd, SITE_TYPE_LABEL, slotLabel, timeLabel, type SiteType } from './booking.rules';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

/** What the board and the lists show about a job's timing: overdue since when, and the site type. */
export function timingView(j: SvcJob, now: BusinessNow) {
  const o = overdueOf({ stage: j.stage, jobDate: iso(j.jobDate), slotEnd: j.slotEnd, expectedEnd: j.expectedEnd, overdueSince: j.overdueSince }, now);
  return {
    overdue: o.overdue,
    /** "Thu, 1 Oct, 2 PM" while overdue, or when a done job was late. */
    overdueSinceText: o.since ? momentText(o.since) : null,
    siteType: j.siteType,
    siteTypeLabel: j.siteType ? SITE_TYPE_LABEL[j.siteType as SiteType] ?? j.siteType : null,
    /** Stock not ready 24 hours before the installation (phase 5): what is short. */
    atRisk: Boolean(j.atRiskSince),
    atRiskNote: j.atRiskNote,
  };
}

/**
 * V02 · Planning Board (SvcBoard.html, kept simple): one day, a row per person with their jobs, the jobs waiting to
 * be booked, and the slot groups. The screen works out the free slots from these; the server checks again on booking.
 */
@Injectable()
export class BoardQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ServiceSettingsService,
    private readonly clock: ClockService,
  ) {}

  async board(ctx: RequestContext, date?: string) {
    await this.settings.ensureSlotGroups(ctx);
    const today = this.clock.today();
    const now = businessNow(this.clock.now(), today);
    const on = date ?? today;
    const [people, groups, booked, waiting] = await Promise.all([
      this.prisma.svcPerson.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcJob.findMany({ where: { tenantId: ctx.tenantId, jobDate: day(on), stage: { notIn: ['CANCELLED', 'NOT_BOOKED'] } }, orderBy: { slotStart: 'asc' } }),
      this.prisma.svcJob.findMany({ where: { tenantId: ctx.tenantId, stage: 'NOT_BOOKED' }, orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return {
      date: on,
      dateText: shortDay(on),
      today,
      /** Where the business clock is today, so the board can draw the time line. */
      nowMinutes: on === today ? now.minutes : null,
      people: people.map((p) => ({
        ...personView(p),
        jobs: booked.filter((j) => j.personId === p.id).map((j) => {
          const end = busyEnd({ slotEnd: j.slotEnd!, expectedEnd: j.expectedEnd });
          return {
            id: j.id, docNo: j.docNo, jobType: j.jobType, typeLabel: JOB_TYPE_LABEL[j.jobType as JobType], customerName: j.customerName, area: j.area,
            start: j.slotStart!, end: j.slotEnd!, slotText: slotLabel(j.slotStart!, j.slotEnd!), stage: j.stage, stageLabel: JOB_STAGE_LABEL[j.stage as JobStage],
            /** Until when the person is busy: past the slot when the office extended the job. */
            busyEnd: end,
            extendedText: end > j.slotEnd! ? `Extended to ${timeLabel(end)}` : null,
            ...timingView(j, now),
          };
        }),
      })),
      slotGroups: groups.map(slotGroupView),
      notBooked: waiting.map((j) => ({
        id: j.id, docNo: j.docNo, jobType: j.jobType, typeLabel: JOB_TYPE_LABEL[j.jobType as JobType], customerName: j.customerName, area: j.area,
        salesOrderNo: j.salesOrderNo, preferredDate: iso(j.preferredDate), afterStock: j.afterStock, whenText: waitingText({ preferredDate: iso(j.preferredDate), afterStock: j.afterStock }),
        version: j.version,
        /** The customer asks for the day on the board. */
        asksForThisDay: iso(j.preferredDate) === on,
        ...timingView(j, now),
        ...bookingNeeds(j),
      })),
    };
  }

  /** V01 · Today by person: how many jobs each person has today and how many are done. */
  async todayByPerson(ctx: RequestContext) {
    const today = this.clock.today();
    const [people, jobs] = await Promise.all([
      this.prisma.svcPerson.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.svcJob.findMany({ where: { tenantId: ctx.tenantId, jobDate: day(today), stage: { notIn: ['CANCELLED', 'NOT_BOOKED'] } }, select: { personId: true, stage: true } }),
    ]);
    return people.map((p) => {
      const mine = jobs.filter((j) => j.personId === p.id);
      return { ...personView(p), jobs: mine.length, done: mine.filter((j) => j.stage === 'DONE' || j.stage === 'CLOSED').length };
    });
  }
}
