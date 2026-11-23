import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { CreateOrderDto, OrderListQueryDto, RequestApprovalDto, ReviseOrderDto, UpdateOrderDto, VersionDto } from './dto/order.dto';
import { SalesOrderFlowQuery } from './order-flow.query';
import { OrdersQuery } from './orders.query';
import { OrderLapseService } from './lapse.service';
import { OrdersService } from './orders.service';

/** S10 list, S11 form, S12 credit check — /api/v1/sales/orders */
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(
    private readonly query: OrdersQuery,
    private readonly orders: OrdersService,
    private readonly flowQuery: SalesOrderFlowQuery,
    private readonly lapse: OrderLapseService,
  ) {}

  /** Phase 5: runs the automatic cancel now (Sales Flow › Check now); it also runs every hour. */
  @Post('lapse-check')
  @RequirePermission(P.SETTINGS_MANAGE)
  lapseCheck(@CurrentContext() ctx: RequestContext) {
    return this.lapse.run(ctx.tenantId);
  }

  /** S03 · Document flow of one order */
  @Get(':id/flow')
  @RequirePermission(P.VIEW)
  flow(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.flowQuery.flow(ctx, id);
  }

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: OrderListQueryDto) {
    return this.query.list(ctx, query);
  }

  @Post()
  @RequirePermission(P.ORDER_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreateOrderDto) {
    return this.orders.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  get(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(ctx, id);
  }

  @Patch(':id')
  @RequirePermission(P.ORDER_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermission(P.ORDER_EDIT)
  remove(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: VersionDto) {
    return this.orders.remove(ctx, id, q.version);
  }

  @Post(':id/request-approval')
  @RequirePermission(P.ORDER_EDIT)
  requestApproval(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestApprovalDto) {
    return this.orders.requestApproval(ctx, id, dto);
  }

  @Post(':id/release')
  @RequirePermission(P.ORDER_RELEASE)
  release(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.orders.release(ctx, id, dto.version);
  }

  /** Phase 5: the next revision of a released order, back in draft under the same number. */
  @Post(':id/revise')
  @RequirePermission(P.ORDER_EDIT)
  revise(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviseOrderDto) {
    return this.orders.revise(ctx, id, dto);
  }

  @Post(':id/discard-revision')
  @RequirePermission(P.ORDER_EDIT)
  discardRevision(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.orders.discardRevision(ctx, id, dto.version);
  }
}
