import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import { CustomerTransfersService } from './transfers.service';

class TransferListQuery {
  @IsOptional()
  @IsIn(['all', 'pending', 'approved', 'rejected'])
  status?: string;
}

class DecideTransferDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  /** Needed to reject: the salesperson is told why. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

/** Phase 5 · salespeople asking to take over another's customer — /api/v1/core/customer-transfers. The office decides. */
@Controller('core/customer-transfers')
export class CoreCustomerTransfersController {
  constructor(private readonly transfers: CustomerTransfersService) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: TransferListQuery) {
    return this.transfers.list(ctx, query.status ?? 'pending');
  }

  @Post(':id/approve')
  @RequirePermission(P.CUSTOMER_EDIT)
  approve(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideTransferDto) {
    return this.transfers.decide(ctx, id, true, dto.version, dto.note ?? null);
  }

  @Post(':id/reject')
  @RequirePermission(P.CUSTOMER_EDIT)
  reject(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideTransferDto) {
    return this.transfers.decide(ctx, id, false, dto.version, dto.note ?? null);
  }
}
