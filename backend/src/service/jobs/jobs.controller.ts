import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { CancelJobDto, CreateJobDto, JobListQueryDto, UpdateJobDto } from './dto/job.dto';
import { JobsQuery } from './jobs.query';
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
  ) {}

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
}

/** V01 · Service home and the pickers — /api/v1/service. */
@Controller('service')
@UseGuards(ServiceOnGuard)
export class ServiceHomeController {
  constructor(
    private readonly query: JobsQuery,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  @Get('home')
  @RequirePermission(P.VIEW)
  home(@CurrentContext() ctx: RequestContext) {
    return this.query.home(ctx);
  }

  /** Customers for a job added by hand: active ones and prospects, with the site details to copy. */
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
