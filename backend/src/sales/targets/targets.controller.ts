import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SaveTargetsDto, TargetMonthQueryDto } from './targets.dto';
import { TargetsService } from './targets.service';

/** S38 · Sales targets — /api/v1/sales/targets. Anyone in Sales reads their branches; sales.target.manage sets them. */
@Controller('sales/targets')
export class SalesTargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Get()
  @RequirePermission(P.VIEW)
  view(@CurrentContext() ctx: RequestContext, @Query() query: TargetMonthQueryDto) {
    return this.targets.view(ctx, query.month);
  }

  /** One branch's month: the branch target and each salesperson's, as one save. */
  @Put()
  @RequirePermission(P.TARGET_MANAGE)
  save(@CurrentContext() ctx: RequestContext, @Body() dto: SaveTargetsDto) {
    return this.targets.save(ctx, dto);
  }
}
