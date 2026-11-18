import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { RemindersService } from './reminders.service';

class DismissDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty({ message: 'Type why the reminder is dismissed.' })
  @MaxLength(300)
  reason!: string;
}

/** V06 · Reminders — /api/v1/service/reminders (F6). */
@Controller('service/reminders')
@UseGuards(ServiceOnGuard)
export class ServiceRemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.reminders.list(ctx, query);
  }

  /** Make jobs now: reminders due within 14 days become service jobs. The server also does this every hour. */
  @Post('run')
  @RequirePermission(P.JOB_EDIT)
  run(@CurrentContext() ctx: RequestContext) {
    return this.reminders.run(ctx);
  }

  @Post(':id/dismiss')
  @RequirePermission(P.JOB_EDIT)
  dismiss(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DismissDto) {
    return this.reminders.dismiss(ctx, id, dto.version, dto.reason);
  }
}
