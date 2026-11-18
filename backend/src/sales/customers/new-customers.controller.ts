import { Body, Controller, Post } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { NewCustomerDto } from './dto/new-customer.dto';
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
}
