import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import type { Env } from '../../config/env';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { toQty } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError } from '../../platform/http/errors';
import { buildStatusCounts, pageArgs, statusFromKey, toListResponse } from '../../platform/http/list';
import type { ListQueryDto } from '../../platform/http/list-query.dto';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { JobsService } from '../jobs/jobs.service';
import { shortDay } from '../jobs/jobs.rules';
import { SYSTEM_USER } from '../service.constants';
import { addDays, LEAD_DAYS, REMINDER_STATUS_LABEL, REMINDER_STATUSES, type ReminderStatus } from './reminder.rules';

const INTERVAL_NAME = 'service-reminders';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (v: string) => new Date(`${v}T00:00:00.000Z`);

/**
 * Service reminders (F6): the list (V06), the run that turns reminders due within 14 days into service jobs, and
 * dismissing one. The run goes every hour on a server that delivers events (OUTBOX_DISPATCH on, so never in the
 * tests), and the office can start it with *Make jobs now*. It is safe to run any number of times.
 */
@Injectable()
export class RemindersService implements OnApplicationShutdown {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly activity: ActivityService,
    private readonly clock: ClockService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /** Called by ServiceModule when the module is on. */
  schedule(): void {
    if (!this.config.get('OUTBOX_DISPATCH', { infer: true })) return;
    this.scheduler.addInterval(INTERVAL_NAME, setInterval(() => void this.runForAll(), 60 * 60 * 1000));
    setTimeout(() => void this.runForAll(), 15_000);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.getIntervals().includes(INTERVAL_NAME)) this.scheduler.deleteInterval(INTERVAL_NAME);
  }

  /** V06 · Reminders: due date first, with a tab per status. */
  async list(ctx: RequestContext, query: ListQueryDto) {
    const q = query.q?.trim();
    const base: Prisma.SvcReminderWhereInput = {
      tenantId: ctx.tenantId,
      ...(q && { OR: [{ customerName: { contains: q } }, { itemCode: { contains: q } }, { itemName: { contains: q } }, { jobNo: { contains: q } }] }),
    };
    const status = statusFromKey(query.status, REMINDER_STATUSES);
    const where = { ...base, ...(status && { status }) };
    const today = this.clock.today();
    const [rows, total, grouped] = await Promise.all([
      this.prisma.svcReminder.findMany({ where, orderBy: [{ dueOn: 'asc' }, { customerName: 'asc' }], ...pageArgs(query) }),
      this.prisma.svcReminder.count({ where }),
      this.prisma.svcReminder.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    return {
      ...toListResponse(
        rows.map((r) => ({
          id: r.id, customerCode: r.customerCode, customerName: r.customerName, area: r.area, itemCode: r.itemCode, itemName: r.itemName,
          qty: toQty(r.qty), uomCode: r.uomCode, intervalMonths: r.intervalMonths, lastDoneOn: iso(r.lastDoneOn), dueOn: iso(r.dueOn),
          dueText: shortDay(iso(r.dueOn)), overdue: r.status === 'UPCOMING' && iso(r.dueOn) < today,
          status: r.status, statusLabel: REMINDER_STATUS_LABEL[r.status as ReminderStatus], fromJobId: r.fromJobId, fromJobNo: r.fromJobNo,
          jobId: r.jobId, jobNo: r.jobNo, dismissReason: r.dismissReason, version: r.version,
        })),
        total,
        query,
        buildStatusCounts(grouped.map((g) => ({ status: g.status as ReminderStatus, _count: g._count })), REMINDER_STATUSES),
      ),
      leadDays: LEAD_DAYS,
      makesUntil: addDays(today, LEAD_DAYS),
    };
  }

  /** Make jobs now: every reminder due within the lead time becomes a service job, Not booked. */
  async run(ctx: RequestContext): Promise<{ made: { jobId: string; jobNo: string; customerName: string; itemCode: string; dueOn: string }[] }> {
    const today = this.clock.today();
    const due = await this.prisma.svcReminder.findMany({
      where: { tenantId: ctx.tenantId, status: 'UPCOMING', dueOn: { lte: day(addDays(today, LEAD_DAYS)) } },
      orderBy: { dueOn: 'asc' },
    });
    const made: { jobId: string; jobNo: string; customerName: string; itemCode: string; dueOn: string }[] = [];
    for (const r of due) {
      await this.prisma.$transaction(async (tx) => {
        // Only the run that moves the reminder from Upcoming makes the job: two runs at once never make two jobs.
        const taken = await tx.svcReminder.updateMany({ where: { id: r.id, version: r.version, status: 'UPCOMING' }, data: { status: 'JOB_MADE', version: { increment: 1 }, updatedBy: ctx.user.code } });
        if (taken.count === 0) return;
        const job = await this.jobs.createFromReminder(tx, ctx, r, today);
        await tx.svcReminder.update({ where: { id: r.id }, data: { jobId: job.id, jobNo: job.docNo } });
        made.push({ jobId: job.id, jobNo: job.docNo, customerName: r.customerName, itemCode: r.itemCode, dueOn: iso(r.dueOn) });
      });
    }
    return { made };
  }

  async dismiss(ctx: RequestContext, id: string, version: number, reason: string) {
    const r = await this.prisma.svcReminder.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!r) throw new NotFoundError('Reminder');
    if (r.status !== 'UPCOMING') throw new BusinessRuleError('ACTION_NOT_ALLOWED', r.status === 'JOB_MADE' ? `A job is made for it already: cancel ${r.jobNo} instead.` : 'This reminder is dismissed already.');
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.svcReminder.updateMany({ where: { id, version, status: 'UPCOMING' }, data: { status: 'DISMISSED', dismissReason: reason.trim(), version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (done.count === 0) throw new StaleVersionError();
      await this.activity.log(tx, ctx, { entityType: 'SVC_JOB', entityId: r.fromJobId, docNo: r.fromJobNo, action: 'reminder_dismissed', message: `Service reminder for ${r.itemCode} dismissed by ${ctx.user.name}`, comment: reason.trim() });
    });
    return { dismissed: true };
  }

  /** The hourly run, as the system, for every company with reminders due. */
  private async runForAll(): Promise<void> {
    try {
      await asSystem(async () => {
        const today = this.clock.today();
        const tenants = await this.prisma.svcReminder.findMany({
          where: { status: 'UPCOMING', dueOn: { lte: day(addDays(today, LEAD_DAYS)) } }, distinct: ['tenantId'], select: { tenantId: true },
        });
        for (const { tenantId } of tenants) {
          const branches = await this.masterData.listBranches(tenantId);
          const ctx: RequestContext = {
            tenantId, branchCode: branches[0]?.code ?? '', correlationId: `service-reminders-${Date.now()}`,
            user: { id: SYSTEM_USER.code, tenantId, code: SYSTEM_USER.code, name: SYSTEM_USER.name, email: '', roles: [], branchCodes: branches.map((b) => b.code), department: null, jobTitle: null },
          };
          const { made } = await this.run(ctx);
          if (made.length) this.logger.log(`Made ${made.length} service job(s) from reminders: ${made.map((m) => m.jobNo).join(', ')}`);
        }
      });
    } catch (error) {
      this.logger.error(`Service reminders run failed: ${(error as Error).message}`);
    }
  }
}
