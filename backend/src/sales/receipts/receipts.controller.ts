import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { CreateReceiptDto, ReceiptListQueryDto, ReceiptReasonDto, UpdateReceiptDto, VerifyReceiptDto } from './dto/receipt.dto';
import { ReceiptsQuery } from './receipts.query';
import { ReceiptsService } from './receipts.service';

/** S35 official receipts, S36 one receipt (phase 5) — /api/v1/sales/receipts */
@Controller('sales/receipts')
export class SalesReceiptsController {
  constructor(
    private readonly query: ReceiptsQuery,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ReceiptListQueryDto) {
    return this.query.list(ctx, query);
  }

  @Post()
  @RequirePermission(P.RECEIPT_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreateReceiptDto) {
    return this.receipts.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  get(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(ctx, id);
  }

  @Patch(':id')
  @RequirePermission(P.RECEIPT_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReceiptDto) {
    return this.receipts.update(ctx, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission(P.RECEIPT_EDIT)
  cancel(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiptReasonDto) {
    return this.receipts.cancel(ctx, id, dto);
  }

  /** Account: matches a bank transaction or a card settlement slip. */
  @Post(':id/verify')
  @RequirePermission(P.RECEIPT_VERIFY)
  verify(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyReceiptDto) {
    return this.receipts.verify(ctx, id, dto);
  }

  @Post(':id/send-back')
  @RequirePermission(P.RECEIPT_VERIFY)
  sendBack(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiptReasonDto) {
    return this.receipts.sendBack(ctx, id, dto);
  }
}
