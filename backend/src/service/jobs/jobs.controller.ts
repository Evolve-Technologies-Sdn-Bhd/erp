import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { AssessJobDto } from '../warranty/warranty.dto';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { BookJobDto, CancelJobDto, CreateJobDto, ExtendJobDto, JobListQueryDto, RecordVisitDto, UpdateJobDto, VersionDto } from './dto/job.dto';
import { BoardQuery } from '../board/board.query';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { JobsQuery } from './jobs.query';
import { StockCheckService } from './stock-check.service';
import { JobsService } from './jobs.service';

class SearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** V03 · Jobs and V04 · Job — /api/v1/service/jobs. */
@Controller('service/jobs')
@UseGuards(ServiceOnGuard)
export class ServiceJobsController {
  constructor(
    private readonly query: JobsQuery,
    private readonly service: JobsService,
    private readonly stockCheck: StockCheckService,
  ) {}

  /** Phase 5: checks now the stock of installations booked in the next 24 hours; it also runs every hour. */
  @Post('stock-check')
  @RequirePermission(P.JOB_BOOK)
  checkStock(@CurrentContext() ctx: RequestContext) {
    return this.stockCheck.run(ctx.tenantId);
  }

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: JobListQueryDto) {
    return this.query.list(ctx, query);
  }

  @Post()
  @RequirePermission(P.JOB_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreateJobDto) {
    return this.service.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  detail(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(ctx, id);
  }

  @Patch(':id')
  @RequirePermission(P.JOB_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.service.update(ctx, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission(P.JOB_EDIT)
  cancel(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelJobDto) {
    return this.service.cancel(ctx, id, dto);
  }

  /** Book a job, or move a booked one, on the Planning Board. */
  @Post(':id/book')
  @RequirePermission(P.JOB_BOOK)
  book(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookJobDto) {
    return this.service.book(ctx, id, dto);
  }

  @Post(':id/unbook')
  @RequirePermission(P.JOB_BOOK)
  unbook(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.service.unbook(ctx, id, dto);
  }

  /** Give a booked job longer: a later expected completion that day, with the reason (F3 part 4). */
  @Post(':id/extend')
  @RequirePermission(P.JOB_BOOK)
  extend(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendJobDto) {
    return this.service.extend(ctx, id, dto);
  }

  /** What happened at the visit (F3 part 3). */
  @Post(':id/record')
  @RequirePermission(P.JOB_RECORD)
  record(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordVisitDto) {
    return this.service.record(ctx, id, dto);
  }

  /** A partly done job's follow-up job. */
  @Post(':id/follow-up')
  @RequirePermission(P.JOB_EDIT)
  followUp(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.followUp(ctx, id);
  }

  /** A warranty claim: covered, chargeable or rejected (phase 5). */
  @Post(':id/assess')
  @RequirePermission(P.JOB_EDIT)
  assess(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssessJobDto) {
    return this.service.assess(ctx, id, dto);
  }

  @Post(':id/close')
  @RequirePermission(P.JOB_BOOK)
  close(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.service.close(ctx, id, dto);
  }
}

/** V01 · Service home and the pickers — /api/v1/service. */
@Controller('service')
@UseGuards(ServiceOnGuard)
export class ServiceHomeController {
  constructor(
    private readonly query: JobsQuery,
    private readonly board: BoardQuery,
    private readonly prisma: PrismaService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  @Get('home')
  @RequirePermission(P.VIEW)
  async home(@CurrentContext() ctx: RequestContext) {
    const home = await this.query.home(ctx);
    const month = home.today.slice(0, 7);
    const [byPerson, serviceDue] = await Promise.all([
      this.board.todayByPerson(ctx),
      this.prisma.svcReminder.count({ where: { tenantId: ctx.tenantId, status: { not: 'DISMISSED' }, dueOn: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(new Date(`${month}-01T00:00:00Z`).setUTCMonth(new Date(`${month}-01T00:00:00Z`).getUTCMonth() + 1)) } } }),
    ]);
    return { ...home, byPerson, serviceDue, today: { jobs: byPerson.reduce((s, p) => s + p.jobs, 0), done: byPerson.reduce((s, p) => s + p.done, 0) }, date: home.today };
  }

  /** Customers for a job added by hand: active ones and prospects, with the site details to copy. */
  /** Items for the parts used on a visit (phase 5). */
  @Get('lookups/items')
  @RequirePermission(P.VIEW)
  async items(@CurrentContext() ctx: RequestContext, @Query() query: SearchQuery) {
    const rows = await this.masterData.searchSellableItems(ctx.tenantId, { q: query.q, limit: 20 });
    return { items: rows.map((i) => ({ code: i.code, name: i.name, uomCode: i.uomCode })) };
  }

  @Get('lookups/customers')
  @RequirePermission(P.VIEW)
  async customers(@CurrentContext() ctx: RequestContext, @Query() query: SearchQuery) {
    const rows = await this.masterData.searchCustomers(ctx.tenantId, { q: query.q, activeOnly: false, limit: 20 });
    return {
      items: rows.filter((c) => !c.isCash && c.status !== 'BLOCKED').map((c) => ({
        code: c.code, name: c.name, contactName: c.contactName, phone: c.phone, deliveryAddress: c.deliveryAddress, area: c.area, branchCode: c.branchCode,
      })),
    };
  }
}
