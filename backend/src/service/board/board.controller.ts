import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { GeneralSettingsDto, PersonDto, SlotGroupDto, UpdatePersonDto, UpdateSlotGroupDto } from '../settings/settings.dto';
import { ServiceSettingsService } from '../settings/settings.service';
import { BoardQuery } from './board.query';

class BoardDateQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must look like 2026-10-01.' })
  date?: string;
}

/** V02 · Planning Board — /api/v1/service/board. */
@Controller('service/board')
@UseGuards(ServiceOnGuard)
export class ServiceBoardController {
  constructor(private readonly board: BoardQuery) {}

  @Get()
  @RequirePermission(P.VIEW)
  view(@CurrentContext() ctx: RequestContext, @Query() query: BoardDateQuery) {
    return this.board.board(ctx, query.date);
  }
}

/** V05 · Slots and Stages — /api/v1/service/settings: people and slot groups. */
@Controller('service/settings')
@UseGuards(ServiceOnGuard)
export class ServiceSettingsController {
  constructor(private readonly settings: ServiceSettingsService) {}

  @Get()
  @RequirePermission(P.VIEW)
  view(@CurrentContext() ctx: RequestContext) {
    return this.settings.view(ctx);
  }

  @Put('general')
  @RequirePermission(P.SETTINGS_MANAGE)
  saveGeneral(@CurrentContext() ctx: RequestContext, @Body() dto: GeneralSettingsDto) {
    return this.settings.saveGeneral(ctx, dto);
  }

  @Post('people')
  @RequirePermission(P.SETTINGS_MANAGE)
  addPerson(@CurrentContext() ctx: RequestContext, @Body() dto: PersonDto) {
    return this.settings.addPerson(ctx, dto);
  }

  @Patch('people/:id')
  @RequirePermission(P.SETTINGS_MANAGE)
  updatePerson(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePersonDto) {
    return this.settings.updatePerson(ctx, id, dto);
  }

  @Post('slot-groups')
  @RequirePermission(P.SETTINGS_MANAGE)
  addSlotGroup(@CurrentContext() ctx: RequestContext, @Body() dto: SlotGroupDto) {
    return this.settings.addSlotGroup(ctx, dto);
  }

  @Patch('slot-groups/:id')
  @RequirePermission(P.SETTINGS_MANAGE)
  updateSlotGroup(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlotGroupDto) {
    return this.settings.updateSlotGroup(ctx, id, dto);
  }
}
