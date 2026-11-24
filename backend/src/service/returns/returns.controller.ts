import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { ReceiveReturnDto } from './returns.dto';
import { ReturnsService } from './returns.service';

/** V10 · Returned Parts — /api/v1/service/returns. */
@Controller('service/returns')
@UseGuards(ServiceOnGuard)
export class ServiceReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.returns.list(ctx, query);
  }

  @Post(':id/receive')
  @RequirePermission(P.STOCK_CONFIRM)
  receive(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveReturnDto) {
    return this.returns.receive(ctx, id, dto);
  }
}
