import { Injectable } from '@nestjs/common';
import type { Prisma, SvcJob, SvcJobItem, SvcReturn } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toQty } from '../../platform/http/decimal';
import { BusinessRuleError, NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { pageArgs, toListResponse } from '../../platform/http/list';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { NumberingService } from '../../platform/numbering/numbering.service';
import { OutboxWriter } from '../../platform/outbox/outbox.writer';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { SVC_DOC_TYPE, SVC_ENTITY, SVC_EVENT, SVC_SEQUENCES } from '../service.constants';
import { SERVICE_PERMISSIONS as P } from '../service.permissions';
import { goodsOf } from '../stock/stock.rules';
import { postponedGoods, receivedText, receiveErrors, RETURN_REASON_LABEL, returnLocation, type ReturnLine } from './returns.rules';
import type { ReceiveReturnDto } from './returns.dto';

export const returnView = (r: SvcReturn) => ({
  id: r.id, jobId: r.jobId, jobNo: r.jobNo, customerName: r.customerName, personName: r.personName, branchCode: r.branchCode, warehouseCode: r.warehouseCode,
  itemCode: r.itemCode, itemName: r.itemName, uomCode: r.uomCode, qty: toQty(r.qty),
  goodQty: r.goodQty ? toQty(r.goodQty) : null, damagedQty: r.damagedQty ? toQty(r.damagedQty) : null, note: r.note,
  reason: r.reason, reasonLabel: RETURN_REASON_LABEL[r.reason] ?? r.reason, location: r.location, grnNo: r.grnNo,
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
    private readonly numbering: NumberingService,
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
  async add(tx: Tx, ctx: RequestContext, job: SvcJob & { items: { itemCode: string; itemName: string; uomCode: string }[] }, lines: ReturnLine[], reason = 'UNUSED', visitNo = 0): Promise<string | null> {
    const back = lines.filter((l) => dec(l.qty).gt(0));
    if (!back.length) return null;
    for (const l of back) {
      const item = job.items.find((i) => i.itemCode === l.itemCode)!;
      const data = { qty: dec(l.qty), personName: job.personName, warehouseCode: job.warehouseCode };
      await tx.svcReturn.upsert({
        where: { jobId_itemCode_reason_visitNo: { jobId: job.id, itemCode: l.itemCode, reason, visitNo } },
        update: {},
        create: { tenantId: ctx.tenantId, branchCode: job.branchCode, jobId: job.id, jobNo: job.docNo, customerName: job.customerName, itemCode: l.itemCode, itemName: item.itemName, uomCode: item.uomCode, reason, visitNo, createdBy: ctx.user.code, ...data },
      });
    }
    return back.map((l) => `${dec(l.qty).toString()} ${l.itemCode}`).join(', ');
  }

  /** The goods picked for a job that was postponed, all of them (phase 5). */
  addPostponed(tx: Tx, ctx: RequestContext, job: SvcJob & { items: SvcJobItem[] }, stockItems: { code: string; type: string }[], visitNo: number): Promise<string | null> {
    const goods = postponedGoods(goodsOf(job).map((i) => ({ itemCode: i.itemCode, qty: i.qty.toString() })), (c) => stockItems.find((i) => i.code === c)?.type === 'STOCK');
    return this.add(tx, ctx, job, goods, 'POSTPONED', visitNo);
  }

  /** The faulty unit of a one-to-one exchange (phase 5). */
  addExchange(tx: Tx, ctx: RequestContext, job: SvcJob & { items: SvcJobItem[] }): Promise<string | null> {
    return this.add(tx, ctx, job, job.items.map((i) => ({ itemCode: i.itemCode, qty: i.qty.toString() })), 'EXCHANGE');
  }

  async receive(ctx: RequestContext, id: string, dto: ReceiveReturnDto) {
    const r = await this.prisma.svcReturn.findFirst({ where: { tenantId: ctx.tenantId, id } });
    if (!r) throw new NotFoundError('Returned part');
    if (r.receivedAt) throw new BusinessRuleError('ALREADY_RECEIVED', `${r.itemCode} from ${r.jobNo} was already received by ${r.receivedBy}.`);
    const errors = receiveErrors(dto, r.qty.toString());
    if (errors.length) throw new ValidationFailedError(errors);
    const text = receivedText(r.qty.toString(), dto.goodQty, dto.damagedQty);
    const setting = await this.prisma.svcSetting.findUnique({ where: { tenantId: ctx.tenantId } });
    const location = setting?.pickAndSign || r.reason === 'EXCHANGE' ? returnLocation({ reason: r.reason, damagedQty: dto.damagedQty }, setting?.warrantyLocation ?? 'WNTY') : null;
    await this.prisma.$transaction(async (tx) => {
      // An exchanged unit is received on its own goods receipt number.
      const grnNo = r.reason === 'EXCHANGE' ? await this.nextGrn(tx, ctx.tenantId) : null;
      const done = await tx.svcReturn.updateMany({
        where: { id: r.id, tenantId: ctx.tenantId, version: dto.version, receivedAt: null },
        data: { goodQty: dec(dto.goodQty), damagedQty: dec(dto.damagedQty), note: dto.note?.trim() || null, receivedAt: this.clock.now(), receivedBy: ctx.user.name, location, grnNo, version: { increment: 1 } },
      });
      if (done.count === 0) throw new StaleVersionError();
      await this.activity.log(tx, ctx, { entityType: SVC_ENTITY.JOB, entityId: r.jobId, docNo: r.jobNo, action: 'part_returned', message: `${r.itemCode} back at the store: ${text}, received by ${ctx.user.name}${grnNo ? ` on ${grnNo}` : ''}${location ? `, to location ${location}` : ''}`, comment: dto.note?.trim() || null });
      await this.outbox.publish(tx, ctx, [{
        name: SVC_EVENT.PARTS_RETURNED, aggregateType: SVC_ENTITY.JOB, aggregateId: r.jobId,
        payload: { jobNo: r.jobNo, itemCode: r.itemCode, uomCode: r.uomCode, warehouseCode: r.warehouseCode, goodQty: toQty(dto.goodQty), damagedQty: toQty(dto.damagedQty), reason: r.reason, location, grnNo },
      }]);
      if (r.reason === 'POSTPONED' && !(await tx.svcReturn.count({ where: { tenantId: ctx.tenantId, jobId: r.jobId, reason: 'POSTPONED', receivedAt: null } }))) {
        const job = await tx.svcJob.findFirst({ where: { tenantId: ctx.tenantId, id: r.jobId }, select: { docNo: true, salesOrderId: true, salesOrderNo: true } });
        if (job) {
          await this.outbox.publish(tx, ctx, [{
            name: SVC_EVENT.GOODS_BACK, aggregateType: SVC_ENTITY.JOB, aggregateId: r.jobId,
            payload: { jobNo: job.docNo, salesOrderId: job.salesOrderId, salesOrderNo: job.salesOrderNo, receivedBy: ctx.user.name },
          }]);
        }
      }
    });
    return returnView(await this.prisma.svcReturn.findFirstOrThrow({ where: { id: r.id } }));
  }

  /** The numbers of the goods receipts are made the first time one is needed. */
  private async nextGrn(tx: Tx, tenantId: string): Promise<string> {
    const s = SVC_SEQUENCES.find((x) => x.docType === SVC_DOC_TYPE.EXCHANGE_GRN)!;
    await tx.sysNumberSequence.upsert({
      where: { tenantId_docType: { tenantId, docType: s.docType } },
      update: {},
      create: { tenantId, module: 'service', docType: s.docType, name: s.name, prefix: s.prefix, digits: s.digits },
    });
    return this.numbering.next(tx, tenantId, s.docType, { date: this.clock.today() });
  }
}
