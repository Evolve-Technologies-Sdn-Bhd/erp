import { Injectable } from '@nestjs/common';
import { dec } from '../../platform/http/decimal';
import { PrismaService } from '../../platform/prisma/prisma.service';
import type { PriceRule } from './price-range.rules';

/**
 * The company's price rules, read once per check: the quotation's discount limit, the price range (phase 5) and
 * the strict price list on invoices (Operation Policies). The checks themselves are pure, in price-range.rules.ts.
 */
@Injectable()
export class PriceRules {
  constructor(private readonly prisma: PrismaService) {}

  async load(tenantId: string): Promise<PriceRule & { strictPriceList: boolean; fixed: boolean }> {
    const s = await this.prisma.salSetting.findUnique({
      where: { tenantId },
      select: { fixedPrices: true, priceRange: true, priceBelowPct: true, priceAbovePct: true, discountApprovalPct: true, strictPriceList: true },
    });
    return {
      fixed: s?.fixedPrices ?? false,
      // Fixed prices stand in place of the range.
      range: s?.priceRange && !s.fixedPrices ? { belowPct: s.priceBelowPct.toDecimalPlaces(2).toString(), abovePct: s.priceAbovePct.toDecimalPlaces(2).toString() } : null,
      discountPct: (s?.discountApprovalPct ?? dec(15)).toDecimalPlaces(2).toString(),
      strictPriceList: s?.strictPriceList ?? true,
    };
  }
}
