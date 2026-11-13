import { Injectable } from '@nestjs/common';
import { Prisma, type MdmPackage, type MdmPackageGift, type MdmPackageItem } from '@prisma/client';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { NotFoundError } from '../../platform/http/errors';
import { ListQueryDto } from '../../platform/http/list-query.dto';
import { pageArgs, statusFromKey, statusKey, toListResponse, type StatusCounts } from '../../platform/http/list';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { RecordUsageRegistry } from '../../platform/usage/record-usage.registry';
import { deleteRefusal } from '../usage/usage.rules';
import { CORE_ENTITY } from '../core.constants';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import {
  endRefusal,
  GIFT_RULE_LABEL,
  linesText,
  PACKAGE_STATUSES,
  packageStatus,
  priceWarning,
  spreadPrice,
  STATUS_LABEL,
  type GiftRule,
  type PackageAction,
  type PackageStatus,
} from './packages.rules';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** C15 packages and C16 package (CLAUDE.md → Phase 5). Reads mdm_ tables only. */
@Injectable()
export class PackagesQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly permissions: PermissionRegistry,
    private readonly clock: ClockService,
    private readonly usage: RecordUsageRegistry,
  ) {}

  /** Status is worked out from the dates, so each tab is a date filter. */
  private statusWhere(status: PackageStatus, today: string): Prisma.MdmPackageWhereInput {
    const t = day(today);
    if (status === 'SCHEDULED') return { runsFrom: { gt: t }, OR: [{ endedOn: null }, { endedOn: { gte: t } }] };
    if (status === 'ENDED') return { OR: [{ runsUntil: { lt: t } }, { endedOn: { lt: t } }] };
    return { runsFrom: { lte: t }, AND: [{ OR: [{ runsUntil: null }, { runsUntil: { gte: t } }] }, { OR: [{ endedOn: null }, { endedOn: { gte: t } }] }] };
  }

  async list(ctx: RequestContext, query: ListQueryDto) {
    const tenantId = ctx.tenantId;
    const today = this.clock.today();
    const q = query.q?.trim();
    const base: Prisma.MdmPackageWhereInput = { tenantId, ...(q && { OR: [{ code: { contains: q } }, { name: { contains: q } }] }) };
    const status = statusFromKey(query.status, PACKAGE_STATUSES);
    const where = status ? { AND: [base, this.statusWhere(status, today)] } : base;
    const [rows, total, ...perStatus] = await Promise.all([
      this.prisma.mdmPackage.findMany({ where, orderBy: { code: 'asc' }, ...pageArgs(query) }),
      this.prisma.mdmPackage.count({ where }),
      ...PACKAGE_STATUSES.map((s) => this.prisma.mdmPackage.count({ where: { AND: [base, this.statusWhere(s, today)] } })),
    ]);
    const lines = await this.lines(tenantId, rows.map((r) => r.code));
    const items = await Promise.all(
      rows.map(async (p) => {
        const own = lines.items.filter((l) => l.packageCode === p.code);
        const spread = await this.spread(tenantId, p, own, today);
        const gifts = lines.gifts.filter((g) => g.packageCode === p.code);
        // Sales orders that carry the package, from the record-usage check (Core never reads sal_ tables).
        const usage = await this.usage.check({ tenantId, kind: 'PACKAGE', code: p.code });
        return {
          ...this.fields(p, today),
          itemsText: linesText(own),
          normalValue: spread.normalValue.toFixed(2),
          saves: spread.missing.length ? null : spread.saves.toFixed(2),
          orders: usage.documents,
          giftText: p.giftRule === 'NONE' ? 'None' : p.giftRule === 'CHOOSE_ONE' ? `Choose 1 of ${gifts.length}` : linesText(gifts),
        };
      }),
    );
    const statusCounts: StatusCounts = { all: perStatus.reduce((a, n) => a + n, 0) };
    PACKAGE_STATUSES.forEach((s, i) => (statusCounts[statusKey(s)] = perStatus[i]!));
    return toListResponse(items, total, query, statusCounts);
  }

  async detail(ctx: RequestContext, id: string) {
    const tenantId = ctx.tenantId;
    const today = this.clock.today();
    const p = await this.load(ctx, id);
    const [lines, activity] = await Promise.all([this.lines(tenantId, [p.code]), this.activity.listFor(tenantId, CORE_ENTITY.PACKAGE, p.id)]);
    const spread = await this.spread(tenantId, p, lines.items, today);
    const names = await this.prisma.mdmItem.findMany({
      where: { tenantId, code: { in: [...lines.items, ...lines.gifts].map((l) => l.itemCode) } },
      select: { id: true, code: true, name: true },
    });
    const item = new Map(names.map((i) => [i.code, i]));
    const status = packageStatus(this.dates(p), today);
    const allowedActions: PackageAction[] = [];
    const refusals: Partial<Record<PackageAction, string>> = {};
    if (this.permissions.has(ctx.user.roles, P.PRICE_LIST_EDIT)) {
      if (status === 'ENDED') refusals.edit = `${p.code} has ended, so it is kept as it was.`;
      else allowedActions.push('edit');
      const end = endRefusal(p.code, status, this.dates(p).endedOn);
      if (end) refusals.end = end;
      else allowedActions.push('end');
      const remove = await this.deleteRefusal(tenantId, p.code);
      if (remove) refusals.delete = remove;
      else allowedActions.push('delete');
    }
    return {
      ...this.fields(p, today),
      giftRuleLabel: GIFT_RULE_LABEL[p.giftRule as GiftRule],
      normalValue: spread.normalValue.toFixed(2),
      saves: spread.missing.length ? null : spread.saves.toFixed(2),
      priceWarning: priceWarning(spread),
      items: lines.items.map((l, i) => {
        const s = spread.lines[i]!;
        return {
          itemId: item.get(l.itemCode)?.id ?? null,
          itemCode: l.itemCode,
          itemName: item.get(l.itemCode)?.name ?? l.itemCode,
          qty: l.qty.toFixed(4),
          uomCode: l.uomCode,
          listPrice: spread.missing.includes(l.itemCode) ? null : s.listValue.div(l.qty).toDecimalPlaces(2).toFixed(2),
          listValue: s.listValue.toFixed(2),
          unitPrice: spread.missing.length ? null : s.unitPrice.toFixed(4),
          amount: spread.missing.length ? null : s.amount.toFixed(2),
        };
      }),
      gifts: lines.gifts.map((g) => ({ itemId: item.get(g.itemCode)?.id ?? null, itemCode: g.itemCode, itemName: item.get(g.itemCode)?.name ?? g.itemCode, qty: g.qty.toFixed(4), uomCode: g.uomCode })),
      activity,
      allowedActions,
      refusals,
    };
  }

  /** A package on any sales order cannot be deleted (it can be ended); null when nothing uses it. */
  async deleteRefusal(tenantId: string, code: string): Promise<string | null> {
    return deleteRefusal('PACKAGE', code, await this.usage.check({ tenantId, kind: 'PACKAGE', code }));
  }

  async load(ctx: RequestContext, id: string): Promise<MdmPackage> {
    const p = await this.prisma.mdmPackage.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!p) throw new NotFoundError('Package');
    return p;
  }

  async lines(tenantId: string, codes: string[]): Promise<{ items: MdmPackageItem[]; gifts: MdmPackageGift[] }> {
    const where = { tenantId, packageCode: { in: codes } };
    const [items, gifts] = await Promise.all([
      this.prisma.mdmPackageItem.findMany({ where, orderBy: { sortOrder: 'asc' } }),
      this.prisma.mdmPackageGift.findMany({ where, orderBy: { sortOrder: 'asc' } }),
    ]);
    return { items, gifts };
  }

  /** Each item's price on the package's price list today (the latest dated price on or before today). */
  async spread(tenantId: string, p: Pick<MdmPackage, 'priceListCode' | 'packagePrice'>, items: Pick<MdmPackageItem, 'itemCode' | 'qty' | 'uomCode'>[], today: string) {
    const prices = await this.prisma.mdmPriceListItem.findMany({
      where: { tenantId, priceListCode: p.priceListCode, itemCode: { in: items.map((i) => i.itemCode) }, validFrom: { lte: day(today) } },
      orderBy: { validFrom: 'desc' },
    });
    return spreadPrice(
      p.packagePrice,
      items.map((i) => ({ itemCode: i.itemCode, qty: i.qty, uomCode: i.uomCode, listPrice: prices.find((x) => x.itemCode === i.itemCode && x.uomCode === i.uomCode)?.unitPrice ?? null })),
    );
  }

  dates(p: MdmPackage) {
    return { runsFrom: isoDay(p.runsFrom), runsUntil: p.runsUntil ? isoDay(p.runsUntil) : null, endedOn: p.endedOn ? isoDay(p.endedOn) : null };
  }

  private fields(p: MdmPackage, today: string) {
    const dates = this.dates(p);
    const status = packageStatus(dates, today);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      uomCode: p.uomCode,
      salesTaxCode: p.salesTaxCode,
      priceListCode: p.priceListCode,
      packagePrice: p.packagePrice.toFixed(2),
      giftRule: p.giftRule as GiftRule,
      ...dates,
      status,
      statusLabel: STATUS_LABEL[status],
      version: p.version,
    };
  }
}
