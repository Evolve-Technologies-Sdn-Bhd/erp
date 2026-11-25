import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SaveVoucherDto, VoucherListQueryDto, VoucherVersionDto } from './vouchers.dto';
import { VouchersService } from './vouchers.service';

/** S37 · Vouchers — /api/v1/sales/vouchers. Anyone in Sales reads; sales.voucher.manage sets them up. */
@Controller('sales/vouchers')
export class SalesVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: VoucherListQueryDto) {
    return this.vouchers.list(ctx, query);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  get(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.get(ctx, id);
  }

  @Post()
  @RequirePermission(P.VOUCHER_MANAGE)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: SaveVoucherDto) {
    return this.vouchers.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.VOUCHER_MANAGE)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveVoucherDto) {
    return this.vouchers.update(ctx, id, dto);
  }

  @Post(':id/end')
  @RequirePermission(P.VOUCHER_MANAGE)
  end(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoucherVersionDto) {
    return this.vouchers.end(ctx, id, dto.version);
  }

  @Delete(':id')
  @RequirePermission(P.VOUCHER_MANAGE)
  remove(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query() dto: VoucherVersionDto) {
    return this.vouchers.remove(ctx, id, dto.version);
  }
}
