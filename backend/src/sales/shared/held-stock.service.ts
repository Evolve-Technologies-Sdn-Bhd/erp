import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { dec } from '../../platform/http/decimal';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { openToDeliver } from '../deliveries/delivery.rules';

/** What is held for other orders, per item and warehouse. */
export type Held = (itemCode: string, warehouseCode: string) => Prisma.Decimal;
const NONE: Held = () => dec(0);

/**
 * Stock held for booked installations (phase 5): with "Hold stock for booked installations" on, what an order still has
 * to deliver is held from the moment its installer is booked until it is delivered or taken off the board. Other orders
 * then count what is left; nothing is ever blocked. It is worked out from the orders and their booking (which Service's
 * events keep), never stored, so it cannot drift. A company fact: it counts every branch's orders.
 */
@Injectable()
export class HeldStock {
  constructor(private readonly prisma: PrismaService) {}

  async held(tenantId: string, itemCodes: string[], exceptOrderId?: string): Promise<Held> {
    if (!itemCodes.length) return NONE;
    const on = (await this.prisma.salSetting.findUnique({ where: { tenantId }, select: { holdStock: true } }))?.holdStock;
    if (!on) return NONE;
    const lines = await asSystem(() =>
      this.prisma.salSalesOrderLine.findMany({
        where: {
          tenantId, itemCode: { in: [...new Set(itemCodes)] }, isBuyToOrder: false,
          salesOrder: {
            installBookedAt: { not: null }, isMigrated: false, ...(exceptOrderId && { id: { not: exceptOrderId } }),
            // A booked order back in draft for a revision still needs its stock.
            OR: [{ status: { in: ['RELEASED', 'PARTIAL'] } }, { revisingSince: { not: null }, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } }],
          },
        },
        select: { itemCode: true, orderedQty: true, deliveredQty: true, cancelledQty: true, salesOrder: { select: { warehouseCode: true } } },
      }),
    );
    const map = new Map<string, Prisma.Decimal>();
    for (const l of lines) {
      const key = `${l.itemCode}|${l.salesOrder.warehouseCode}`;
      map.set(key, (map.get(key) ?? dec(0)).add(openToDeliver(l)));
    }
    return (itemCode, warehouseCode) => map.get(`${itemCode}|${warehouseCode}`) ?? dec(0);
  }
}
