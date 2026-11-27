import { Injectable } from '@nestjs/common';
import { ClockService } from '../clock/clock.service';
import { PermissionRegistry } from '../context/permission.registry';
import type { RequestContext } from '../context/request-context';
import { NotFoundError } from '../http/errors';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface Notice {
  /** User codes; repeats and the person who acted are left out. */
  to: string[];
  kind: string;
  title: string;
  body: string;
  /** Where the alert opens, a path in the app ("/sales/orders/…"). */
  link?: string | null;
  entityType?: string;
  entityId?: string;
}

/**
 * Alerts for people (phase 5): the bell in the top bar. Modules write them in the transaction of the change they are
 * about, and choose who gets them; the platform only stores them, finds who holds a permission in a branch, and lets
 * each person read their own. No email is sent.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PermissionRegistry,
    private readonly clock: ClockService,
  ) {}

  /** Active users who hold a permission today through a role, and work in the branch (any branch when null). */
  async whoCan(tenantId: string, permission: string, branchCode: string | null): Promise<string[]> {
    await this.registry.refresh(tenantId);
    const today = this.clock.todayDate();
    const users = await this.prisma.sysUser.findMany({
      where: { tenantId, isActive: true, ...(branchCode && { branches: { some: { branch: { code: branchCode } } } }) },
      select: {
        code: true,
        roles: {
          where: { AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: today } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: today } }] }] },
          select: { role: { select: { code: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    return users.filter((u) => this.registry.has(u.roles.map((r) => r.role.code), permission)).map((u) => u.code);
  }

  /** Active users who hold a role today and work in the branch (any branch when null): an approval step's approvers. */
  async whoHasRole(tenantId: string, roleCode: string, branchCode: string | null): Promise<string[]> {
    const today = this.clock.todayDate();
    const users = await this.prisma.sysUser.findMany({
      where: {
        tenantId, isActive: true, ...(branchCode && { branches: { some: { branch: { code: branchCode } } } }),
        roles: { some: { role: { code: roleCode }, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: today } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: today } }] }] } },
      },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return users.map((u) => u.code);
  }

  /** One alert per person, in the caller's transaction. Returns how many were written. */
  async send(tx: Tx, ctx: RequestContext, n: Notice): Promise<number> {
    const to = [...new Set(n.to.filter(Boolean))].filter((code) => code !== ctx.user.code);
    if (!to.length) return 0;
    await tx.sysNotification.createMany({
      data: to.map((userCode) => ({
        tenantId: ctx.tenantId, userCode, kind: n.kind, title: n.title.slice(0, 200), body: n.body.slice(0, 1000), link: n.link ?? null,
        entityType: n.entityType ?? null, entityId: n.entityId ?? null,
      })),
    });
    return to.length;
  }

  /** The person's latest alerts, unread first counted. */
  async list(ctx: RequestContext) {
    const where = { tenantId: ctx.tenantId, userCode: ctx.user.code };
    const [items, unread] = await Promise.all([
      this.prisma.sysNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.sysNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })),
    };
  }

  async read(ctx: RequestContext, id: string) {
    const r = await this.prisma.sysNotification.updateMany({ where: { id, tenantId: ctx.tenantId, userCode: ctx.user.code, readAt: null }, data: { readAt: this.clock.now() } });
    if (r.count === 0 && !(await this.prisma.sysNotification.count({ where: { id, tenantId: ctx.tenantId, userCode: ctx.user.code } }))) throw new NotFoundError('Notification');
    return this.list(ctx);
  }

  async readAll(ctx: RequestContext) {
    await this.prisma.sysNotification.updateMany({ where: { tenantId: ctx.tenantId, userCode: ctx.user.code, readAt: null }, data: { readAt: this.clock.now() } });
    return this.list(ctx);
  }
}
