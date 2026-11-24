import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { JobsService } from '../jobs/jobs.service';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { UpdateWarrantyDto, VoidWarrantyDto, WarrantyJobDto } from './warranty.dto';
import { WarrantyService } from './warranty.service';

/** V11 · Warranties — /api/v1/service/warranties. */
@Controller('service/warranties')
@UseGuards(ServiceOnGuard)
export class ServiceWarrantiesController {
  constructor(
    private readonly warranties: WarrantyService,
    private readonly jobs: JobsService,
  ) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.warranties.list(ctx, query);
  }

  @Patch(':id')
  @RequirePermission(P.JOB_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarrantyDto) {
    return this.warranties.update(ctx, id, dto);
  }

  @Post(':id/void')
  @RequirePermission(P.JOB_EDIT)
  void(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidWarrantyDto) {
    return this.warranties.void(ctx, id, dto);
  }

  /** A claim: a warranty job on this unit, not booked. */
  @Post(':id/job')
  @RequirePermission(P.JOB_EDIT)
  job(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WarrantyJobDto) {
    return this.jobs.createFromWarranty(ctx, id, dto);
  }
}
