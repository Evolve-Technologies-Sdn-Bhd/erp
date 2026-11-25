import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { VersionDto } from '../jobs/dto/job.dto';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { JobStockService } from './job-stock.service';

class StockDateQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date such as 2026-10-01.' })
  date?: string;
}

/** Confirming; who signed is needed where the warehouse picks and signs. */
class ConfirmStockDto extends VersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signedBy?: string;
}

class AddPartDto extends VersionDto {
  @IsString()
  @MaxLength(30)
  itemCode!: string;

  @IsString()
  @MaxLength(20)
  qty!: string;
}

/** V09 · Stock for Jobs — /api/v1/service/stock. */
@Controller('service/stock')
@UseGuards(ServiceOnGuard)
export class ServiceStockController {
  constructor(private readonly stock: JobStockService) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: StockDateQuery) {
    return this.stock.list(ctx, query.date);
  }

  @Post(':id/confirm')
  @RequirePermission(P.STOCK_CONFIRM)
  confirm(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmStockDto) {
    return this.stock.confirm(ctx, id, dto.version, dto.signedBy);
  }

  /** A part or accessory the warehouse adds. */
  @Post(':id/parts')
  @RequirePermission(P.STOCK_CONFIRM)
  addPart(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPartDto) {
    return this.stock.addPart(ctx, id, dto);
  }

  @Delete(':id/parts/:itemId')
  @RequirePermission(P.STOCK_CONFIRM)
  removePart(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Query() dto: VersionDto) {
    return this.stock.removePart(ctx, id, itemId, dto.version);
  }

  @Post(':id/undo')
  @RequirePermission(P.STOCK_CONFIRM)
  undo(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.stock.undo(ctx, id, dto.version);
  }
}
