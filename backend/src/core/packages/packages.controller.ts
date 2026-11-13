import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import { CreatePackageDto, PackageVersionDto, UpdatePackageDto } from './dto/package.dto';
import { PackagesQuery } from './packages.query';
import { PackagesService } from './packages.service';

/**
 * C15 packages, C16 package — /api/v1/core/packages (phase 5). A package is priced like a price list, so the same
 * permission changes it: core.price_list.edit.
 */
@Controller('core/packages')
export class CorePackagesController {
  constructor(
    private readonly query: PackagesQuery,
    private readonly packages: PackagesService,
  ) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ListQueryDto) {
    return this.query.list(ctx, query);
  }

  @Post()
  @RequirePermission(P.PRICE_LIST_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreatePackageDto) {
    return this.packages.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  detail(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(ctx, id);
  }

  @Patch(':id')
  @RequirePermission(P.PRICE_LIST_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.update(ctx, id, dto);
  }

  @Post(':id/end')
  @RequirePermission(P.PRICE_LIST_EDIT)
  end(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PackageVersionDto) {
    return this.packages.end(ctx, id, dto.version);
  }

  @Delete(':id')
  @RequirePermission(P.PRICE_LIST_EDIT)
  remove(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: PackageVersionDto) {
    return this.packages.remove(ctx, id, q.version);
  }
}
