import { Inject, Injectable } from '@nestjs/common';
import type { SalTarget } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ActivityService } from '../../platform/activity/activity.service';
import { ClockService } from '../../platform/clock/clock.service';
import type { RequestContext } from '../../platform/context/request-context';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import { dec, toMoney } from '../../platform/http/decimal';
import { NotFoundError, StaleVersionError, ValidationFailedError } from '../../platform/http/errors';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SALES_PERMISSIONS as P } from '../sales.permissions';
import { SAL_ENTITY, SAL_ROLE } from '../shared/sales.constants';
import type { SaveTargetsDto } from './targets.dto';
import { allocation, cleanAmount, MONTH, monthText, targetChanges, targetErrors } from './targets.rules';

const money = (v: SalTarget['amount']) => (v == null ? null : toMoney(v));

/** S38 · Sales targets (phase 5): a branch's target for a month, split between its salespeople. */
@Injectable()
export class TargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly clock: ClockService,
    private readonly permissions: PermissionRegistry,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /** The active salespeople of a branch, by name. */
  private async agentsOf(tenantId: string) {
    const users = await this.masterData.listUsers(tenantId);
    const agents = users.filter((u) => u.isActive && u.roles.includes(SAL_ROLE.AGENT)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      of: (branchCode: string) => agents.filter((u) => u.branchCodes.includes(branchCode)).map((u) => ({ code: u.code, name: u.name })),
      names: new Map(users.map((u) => [u.code, u.name])),
    };
  }

  /** Every branch the user works in, with its target for the month and its salespeople's. */
  async view(ctx: RequestContext, month?: string) {
    const m = month ?? this.clock.today().slice(0, 7);
    if (!MONTH.test(m)) throw ValidationFailedError.field('month', 'Month must look like 2026-11.');
    const [branches, rows, agents] = await Promise.all([
      this.masterData.listBranches(ctx.tenantId),
      this.prisma.salTarget.findMany({ where: { tenantId: ctx.tenantId, month: m } }),
      this.agentsOf(ctx.tenantId),
    ]);
    const mine = branches.filter((b) => b.isActive && ctx.user.branchCodes.includes(b.code));
    return {
      month: m,
      monthText: monthText(m),
      canManage: this.permissions.has(ctx.user.roles, P.TARGET_MANAGE),
      branches: mine.map((b) => {
        const own = rows.find((r) => r.branchCode === b.code && r.agentCode === '');
        const people = agents.of(b.code);
        // Someone who left the branch keeps their row on the page while it still has a target.
        for (const r of rows) {
          if (r.branchCode === b.code && r.agentCode && r.amount != null && !people.some((p) => p.code === r.agentCode)) people.push({ code: r.agentCode, name: agents.names.get(r.agentCode) ?? r.agentCode });
        }
        const list = people.map((p) => ({ ...p, amount: money(rows.find((r) => r.branchCode === b.code && r.agentCode === p.code)?.amount ?? null) }));
        return {
          code: b.code,
          name: b.name,
          amount: money(own?.amount ?? null),
          version: own?.version ?? 0,
          ...allocation(own?.amount ?? null, list.map((a) => a.amount)),
          agents: list,
        };
      }),
    };
  }

  /** Saves one branch's month as a whole: the branch target and each salesperson's (empty clears one). */
  async save(ctx: RequestContext, dto: SaveTargetsDto) {
    const branch = (await this.masterData.listBranches(ctx.tenantId)).find((b) => b.code === dto.branchCode && b.isActive);
    if (!branch || !ctx.user.branchCodes.includes(branch.code)) throw new NotFoundError('Branch');
    const agents = await this.agentsOf(ctx.tenantId);
    const before = await this.prisma.salTarget.findMany({ where: { tenantId: ctx.tenantId, month: dto.month, branchCode: branch.code } });
    // Salespeople who left the branch may still be cleared.
    const allowed = [...agents.of(branch.code).map((a) => a.code), ...before.filter((r) => r.agentCode).map((r) => r.agentCode)];
    const input = { month: dto.month, amount: cleanAmount(dto.amount), agents: dto.agents.map((a) => ({ agentCode: a.agentCode.trim().toUpperCase(), amount: cleanAmount(a.amount) })) };
    const errors = targetErrors(input, allowed);
    if (errors.length) throw new ValidationFailedError(errors);
    const own = before.find((r) => r.agentCode === '');
    if ((own?.version ?? 0) !== dto.version) throw new StaleVersionError();

    const changes = targetChanges(
      { amount: own?.amount ?? null, agents: new Map(before.filter((r) => r.agentCode).map((r) => [r.agentCode, r.amount])) },
      input,
      agents.names,
    );
    if (changes.length) {
      await this.prisma.$transaction(async (tx) => {
        const key = { tenantId: ctx.tenantId, month: dto.month, branchCode: branch.code };
        const amount = (v: string | null) => (v === null ? null : dec(v));
        let row: SalTarget;
        if (own) {
          // The version guards the branch-month: a save that read an older one is refused.
          const done = await tx.salTarget.updateMany({ where: { id: own.id, version: dto.version }, data: { amount: amount(input.amount), version: { increment: 1 }, updatedBy: ctx.user.code } });
          if (done.count !== 1) throw new StaleVersionError();
          row = own;
        } else {
          row = await tx.salTarget.create({ data: { ...key, agentCode: '', amount: amount(input.amount), createdBy: ctx.user.code, updatedBy: ctx.user.code } });
        }
        for (const a of input.agents) {
          const was = before.find((r) => r.agentCode === a.agentCode);
          if (a.amount === null) {
            if (was) await tx.salTarget.delete({ where: { id: was.id } });
          } else if (was) {
            await tx.salTarget.update({ where: { id: was.id }, data: { amount: dec(a.amount), version: { increment: 1 }, updatedBy: ctx.user.code } });
          } else {
            await tx.salTarget.create({ data: { ...key, agentCode: a.agentCode, amount: dec(a.amount), createdBy: ctx.user.code, updatedBy: ctx.user.code } });
          }
        }
        await this.activity.log(tx, ctx, {
          entityType: SAL_ENTITY.TARGET, entityId: row.id, docNo: `${dto.month} ${branch.code}`.slice(0, 30), action: 'saved',
          message: `${monthText(dto.month)} targets for ${branch.name} changed by ${ctx.user.name}: ${changes.join('; ')}`.slice(0, 500), comment: null,
        });
      });
    }
    return this.view(ctx, dto.month);
  }

  /**
   * The targets that apply to one person for a month: their own (added up over their branches) and the branch's.
   * Read for the Sales home on the phone.
   */
  async forPerson(tenantId: string, month: string, branchCode: string, agentCode: string | null) {
    const rows = await this.prisma.salTarget.findMany({ where: { tenantId, month, OR: [{ branchCode, agentCode: '' }, ...(agentCode ? [{ agentCode }] : [])] } });
    const own = agentCode ? rows.filter((r) => r.agentCode === agentCode && r.amount != null) : [];
    const branch = rows.find((r) => r.branchCode === branchCode && r.agentCode === '')?.amount ?? null;
    return {
      mine: own.length ? own.reduce((s, r) => s.add(r.amount!), dec(0)) : null,
      branch,
    };
  }
}
