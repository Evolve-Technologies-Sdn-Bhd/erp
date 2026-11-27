import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { ServiceOnGuard } from '../service-on.guard';
import { listOf } from './booking.rules';

/**
 * The job categories (the active slot groups) for whoever keys a sales order (phase 5, 27 Nov 2026): the salesperson
 * picks one with the installation, and the job is booked with it. Signed in only: a salesperson holds no Service
 * permission, and a category's name, length and sites are not confidential. Read only.
 */
@Controller('service/categories')
@UseGuards(ServiceOnGuard)
export class ServiceCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentContext() ctx: RequestContext) {
    const groups = await this.prisma.svcSlotGroup.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return {
      items: groups
        .filter((g) => listOf(g.jobTypes).length)
        .map((g) => ({ code: g.code, name: g.name, minutes: g.slotMinutes, jobTypes: listOf(g.jobTypes), siteTypes: listOf(g.siteTypes) })),
    };
  }
}
