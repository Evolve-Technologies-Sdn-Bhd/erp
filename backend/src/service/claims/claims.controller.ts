import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentContext, RequirePermission } from '../../platform/context/context.decorators';
import type { RequestContext } from '../../platform/context/request-context';
import { ServiceOnGuard } from '../service-on.guard';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { ClaimListQueryDto, CreateClaimDto, EligibleQueryDto, PayClaimDto, ReturnClaimDto, UpdateClaimDto, VersionDto } from './claims.dto';
import { ClaimsQuery } from './claims.query';
import { ClaimsService } from './claims.service';

/** V07 · Claims and V08 · Claim (F5) — /api/v1/service/claims. */
@Controller('service/claims')
@UseGuards(ServiceOnGuard)
export class ServiceClaimsController {
  constructor(
    private readonly query: ClaimsQuery,
    private readonly claims: ClaimsService,
  ) {}

  @Get()
  @RequirePermission(P.VIEW)
  list(@CurrentContext() ctx: RequestContext, @Query() query: ClaimListQueryDto) {
    return this.query.list(ctx, query);
  }

  /** The installer's jobs in the claim period of a day: the fee by rule, and why a job cannot be claimed. */
  @Get('eligible')
  @RequirePermission(P.CLAIM_EDIT)
  eligible(@CurrentContext() ctx: RequestContext, @Query() q: EligibleQueryDto) {
    return this.query.eligible(ctx, q.personId, q.day, q.claimId ?? null);
  }

  @Get(':id')
  @RequirePermission(P.VIEW)
  detail(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(ctx, id);
  }

  @Post()
  @RequirePermission(P.CLAIM_EDIT)
  create(@CurrentContext() ctx: RequestContext, @Body() dto: CreateClaimDto) {
    return this.claims.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.CLAIM_EDIT)
  update(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClaimDto) {
    return this.claims.update(ctx, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission(P.CLAIM_EDIT)
  submit(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.claims.submit(ctx, id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission(P.CLAIM_EDIT)
  cancel(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.claims.cancel(ctx, id, dto.version);
  }

  @Post(':id/approve')
  @RequirePermission(P.CLAIM_APPROVE)
  approve(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.claims.approve(ctx, id, dto.version);
  }

  @Post(':id/send-back')
  @RequirePermission(P.CLAIM_APPROVE)
  sendBack(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnClaimDto) {
    return this.claims.sendBack(ctx, id, dto);
  }

  @Post(':id/pay')
  @RequirePermission(P.CLAIM_APPROVE)
  pay(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayClaimDto) {
    return this.claims.pay(ctx, id, dto);
  }
}
