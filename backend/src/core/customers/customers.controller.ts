import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import { CheckCustomerDto, CreateCustomerDto, CustomerListQueryDto, CustomerVersionDto, UpdateCustomerDto } from './dto/customer.dto';
import { lookalikeInput } from './customers.rules';
import { CustomersQuery } from './customers.query';
import { CustomersService } from './customers.service';
import { CustomerTransfersService } from './transfers.service';

/** C04 customer list, C05 customer — /api/v1/core/customers */
@Controller('core/customers')
export class CoreCustomersController {
  constructor(
    private readonly query: CustomersQuery,
    private readonly customers: CustomersService,
    private readonly transfers: CustomerTransfersService,
  ) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: CustomerListQueryDto) {
    return this.query.list(ctx, query);
  }

  @Post()
  @RequirePermission(P.CUSTOMER_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreateCustomerDto) {
    return this.customers.create(ctx, dto, undefined, true);
  }

  /** Phase 5: customers that look like the one about to be added (phone, name, address), in every branch. */
  @Post('check')
  @HttpCode(200)
  @RequirePermission(P.CUSTOMER_EDIT)
  check(@CurrentContext() ctx: RequestContext, @Body() dto: CheckCustomerDto) {
    return this.transfers.matches(ctx, lookalikeInput(dto)).then((items) => ({ items }));
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  async detail(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    // Phase 5: a salesperson's request to take this customer over, while the office decides.
    const [customer, transfer] = await Promise.all([this.query.detail(ctx, id), this.transfers.pendingFor(ctx, id)]);
    return { ...customer, transfer };
  }

  /**
   * Who may save depends on what changed: credit fields need core.customer.credit (the Finance Manager has only that),
   * the rest core.customer.edit. The service checks it field by field.
   */
  @Patch(':id')
  @RequirePermission(P.VIEW)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(ctx, id, dto);
  }

  @Post(':id/block')
  @RequirePermission(P.CUSTOMER_EDIT)
  block(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerVersionDto) {
    return this.customers.setStatus(ctx, id, 'block', dto.version);
  }

  @Post(':id/activate')
  @RequirePermission(P.CUSTOMER_EDIT)
  activate(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerVersionDto) {
    return this.customers.setStatus(ctx, id, 'activate', dto.version);
  }

  /** The office has checked a customer a salesperson added from an order (phase 5). */
  @Post(':id/complete')
  @RequirePermission(P.CUSTOMER_EDIT)
  complete(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerVersionDto) {
    return this.customers.complete(ctx, id, dto.version);
  }

  @Delete(':id')
  @RequirePermission(P.CUSTOMER_EDIT)
  remove(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: CustomerVersionDto) {
    return this.customers.remove(ctx, id, q.version);
  }
}
