import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { CheckCustomerDto, NewCustomerDto, TransferRequestDto } from './dto/new-customer.dto';
import { SalesNewCustomersService } from './new-customers.service';

/** Phase 5 · a new household customer from the sales order form (S11) — /api/v1/sales/customers */
@Controller('sales/customers')
export class SalesNewCustomersController {
  constructor(private readonly customers: SalesNewCustomersService) {}

  /** Whoever keys orders may add one while doing so, when Sales Flow allows it (S34). Core makes it. */
  @Post()
  @RequirePermission(P.ORDER_EDIT)
  add(@CurrentContext() ctx: RequestContext, @Body() dto: NewCustomerDto) {
    return this.customers.add(ctx, dto);
  }

  /** Phase 5: customers that look like this one, in every branch and of every salesperson, before adding it. */
  @Post('check')
  @HttpCode(200)
  @RequirePermission(P.ORDER_EDIT)
  check(@CurrentContext() ctx: RequestContext, @Body() dto: CheckCustomerDto) {
    return this.customers.check(ctx, dto);
  }

  /** Phase 5: ask to take over another salesperson's customer. The office decides; orders may be keyed meanwhile. */
  @Post('transfer-requests')
  @RequirePermission(P.ORDER_EDIT)
  askTransfer(@CurrentContext() ctx: RequestContext, @Body() dto: TransferRequestDto) {
    return this.customers.askTransfer(ctx, dto);
  }

  @Get('transfer-requests')
  @RequirePermission(P.ORDER_EDIT)
  myTransfers(@CurrentContext() ctx: RequestContext) {
    return this.customers.myTransfers(ctx);
  }
}
