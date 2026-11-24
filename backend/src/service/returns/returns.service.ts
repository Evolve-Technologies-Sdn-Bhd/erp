import { Injectable } from '@nestjs/common';
import type { Prisma, SvcJob, SvcReturn } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toQty } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { pageArgs, toListResponse } from '../../platform/http/list';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SVC_ENTITY, SVC_EVENT } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { receivedText, receiveErrors, type ReturnLine } from './returns.rules';
import type { ReceiveReturnDto } from './returns.dto';

export const returnView = (r: SvcReturn) => ({
  id: r.id, jobId: r.jobId, jobNo: r.jobNo, customerName: r.customerName, personName: r.personName, branchCode: r.branchCode, warehouseCode: r.warehouseCode,
  itemCode: r.itemCode, itemName: r.itemName, uomCode: r.uomCode, qty: toQty(r.qty),
  goodQty: r.goodQty ? toQty(r.goodQty) : null, damagedQty: r.damagedQty ? toQty(r.damagedQty) : null, note: r.note,
  receivedAt: r.receivedAt?.toISOString() ?? null, receivedBy: r.receivedBy, createdAt: r.createdAt.toISOString(), version: r.version,
  receivedText: r.receivedAt ? receivedText(r.qty.toString(), (r.goodQty ?? dec(0)).toString(), (r.damagedQty ?? dec(0)).toString()) : null,
});

/** V10 · Returned Parts (phase 5): what installers say comes back, and what the store received. */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly outbox: OutboxWriter,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
  ) {}

  async list(ctx: RequestContext, query: ListQueryDto) {
    const q = query.q?.trim();
    const base: Prisma.SvcReturnWhereInput = {
      tenantId: ctx.tenantId,
      ...(q && { OR: [{ jobNo: { contains: q } }, { customerName: { contains: q } }, { itemCode: { contains: q } }, { personName: { contains: q } }] }),
    };
    const status = query.status === 'received' ? { receivedAt: { not: null } } : query.status === 'expected' ? { receivedAt: null } : {};
    const where = { ...base, ...status };
    const [rows, total, all, expected] = await Promise.all([
      this.prisma.svcReturn.findMany({ where, orderBy: [{ createdAt: 'desc' }, { itemCode: 'asc' }], ...pageArgs(query) }),
      this.prisma.svcReturn.count({ where }),
      this.prisma.svcReturn.count({ where: base }),
      this.prisma.svcReturn.count({ where: { ...base, receivedAt: null } }),
    ]);
    const canReceive = this.permissions.has(ctx.user.roles, P.STOCK_CONFIRM);
    return toListResponse(rows.map((r) => ({ ...returnView(r), canReceive: canReceive && !r.receivedAt })), total, query, { all, expected, received: all - expected });
  }

  /** Listed at the visit, in its transaction. */
  async add(tx: Tx, ctx: RequestContext, job: SvcJob & { items: { itemCode: string; itemName: string; uomCode: string }[] }, lines: ReturnLine[]): Promise<string | null> {
    const back = lines.filter((l) => dec(l.qty).gt(0));
    if (!back.length) return null;
    for (const l of back) {
      const item = job.items.find((i) => i.itemCode === l.itemCode)!;
      const data = { qty: dec(l.qty), personName: job.personName, warehouseCode: job.warehouseCode };
      await tx.svcReturn.upsert({
        where: { jobId_itemCode: { jobId: job.id, itemCode: l.itemCode } },
        update: {},
        create: { tenantId: ctx.tenantId, branchCode: job.branchCode, jobId: job.id, jobNo: job.docNo, customerName: job.customerName, itemCode: l.itemCode, itemName: item.itemName, uomCode: item.uomCode, createdBy: ctx.user.code, ...data },
      });
    }
    return back.map((l) => `${dec(l.qty).toString()} ${l.itemCode}`).join(', ');
  }

  async receive(ctx: RequestContext, id: string, dto: ReceiveReturnDto) {
    const r = await this.prisma.svcReturn.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!r) throw new NotFoundError('Returned part');
    if (r.receivedAt) throw new BusinessRuleError('ALREADY_RECEIVED', `${r.itemCode} from ${r.jobNo} was already received by ${r.receivedBy}.`);
    const errors = receiveErrors(dto, r.qty.toString());
    if (errors.length) throw new ValidationFailedError(errors);
    const text = receivedText(r.qty.toString(), dto.goodQty, dto.damagedQty);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.svcReturn.updateMany({
        where: { id: r.id, tenantId: ctx.tenantId, version: dto.version, receivedAt: null },
        data: { goodQty: dec(dto.goodQty), damagedQty: dec(dto.damagedQty), note: dto.note?.trim() || null, receivedAt: this.clock.now(), receivedBy: ctx.user.name, version: { increment: 1 } },
      });
      if (done.count === 0) throw new StaleVersionError();
      await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: r.jobId, docNo: r.jobNo, action: 'part_returned', message: `${r.itemCode} back at the store: ${text}, received by ${ctx.user.name}`, comment: dto.note?.trim() || null });
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.PARTS_RETURNED, aggregateType: SVC_ENTITY.JOB, aggregateId: r.jobId,
        payload: { jobNo: r.jobNo, itemCode: r.itemCode, uomCode: r.uomCode, warehouseCode: r.warehouseCode, goodQty: toQty(dto.goodQty), damagedQty: toQty(dto.damagedQty) },
      }]);
    });
    return returnView(await this.prisma.svcReturn.findFirstOrThrow({ where: { id: r.id } }));
  }
}
