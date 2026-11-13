import { Inject, Injectable } from '@nestjs/common';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { ValidationFailedError, type FieldError } from '../../platform/http/errors';
import type { SaleLineInput, SaleLineOption } from './document-lines.service';
import { expandPackage, ITEM_META, type PackageMeta } from './package-lines.rules';

/** A line as the order form sends it: an item with its price, or a package with the number of sets and the gift. */
export interface EnteredLine {
  itemCode?: string;
  packageCode?: string;
  qty: string;
  unitPrice?: string;
  discountPct?: string;
  giftItemCode?: string | null;
}

export interface ExpandedEntry {
  input: SaleLineInput[];
  options: SaleLineOption[];
  meta: PackageMeta[];
  /** For each built line, the entered line it came from. */
  origin: number[];
}

/**
 * Turns what the order form sends into the lines the order keeps (phase 5, F1 part 3): an item line stays as it is,
 * a package becomes its items priced from the package plus its free gifts. Reads packages and prices through the
 * Master Data port; the rules are in package-lines.rules.ts.
 */
@Injectable()
export class PackageLines {
  constructor(@Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort) {}

  async expand(tenantId: string, docDate: string, entered: EnteredLine[]): Promise<ExpandedEntry> {
    const out: ExpandedEntry = { input: [], options: [], meta: [], origin: [] };
    const errors: FieldError[] = [];
    const codes = [...new Set(entered.map((l) => l.packageCode?.trim().toUpperCase()).filter((c): c is string => Boolean(c)))];
    const packages = await Promise.all(codes.map((c) => this.masterData.findPackage(tenantId, c)));
    const found = new Map(codes.map((c, i) => [c, packages[i] ?? null]));
    const itemCodes = [...new Set([...found.values()].flatMap((p) => (p ? [...p.items, ...p.gifts].map((l) => l.itemCode) : [])))];
    const [items, prices] = await Promise.all([
      itemCodes.length ? this.masterData.findItems(tenantId, itemCodes) : Promise.resolve([]),
      Promise.all([...new Set([...found.values()].filter((p) => p).map((p) => p!.priceListCode))].map(async (priceListCode) => ({
        priceListCode,
        rows: await this.masterData.listPrices(tenantId, { priceListCode, itemCodes, onDate: docDate }),
      }))),
    ]);
    const salesUnits = new Map(items.map((i) => [i.code, i.salesUomCode]));

    entered.forEach((l, index) => {
      const packageCode = l.packageCode?.trim().toUpperCase();
      if (!packageCode) {
        if (!l.itemCode?.trim()) { errors.push({ field: `lines[${index}].itemCode`, message: 'Pick an item from Master Data.' }); return; }
        if (l.unitPrice === undefined || l.unitPrice === '') { errors.push({ field: `lines[${index}].unitPrice`, message: 'Enter a price.' }); return; }
        out.input.push({ itemCode: l.itemCode.trim(), qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct });
        out.options.push({});
        out.meta.push(ITEM_META);
        out.origin.push(index);
        return;
      }
      const pkg = found.get(packageCode) ?? null;
      const priceRows = prices.find((p) => p.priceListCode === pkg?.priceListCode)?.rows ?? [];
      const result = expandPackage({ index, packageCode, qty: l.qty, giftItemCode: l.giftItemCode }, pkg, {
        docDate, group: index + 1, salesUnits, prices: new Map(priceRows.map((p) => [`${p.itemCode}|${p.uomCode}`, p.unitPrice])),
      });
      errors.push(...result.errors);
      for (const line of result.lines) {
        out.input.push({ itemCode: line.itemCode, qty: line.qty, unitPrice: line.unitPrice, discountPct: '0' });
        out.options.push({ taxCode: line.taxCode, listPrice: line.listPrice, gift: line.meta.lineKind === 'GIFT' });
        out.meta.push(line.meta);
        out.origin.push(index);
      }
    });
    if (errors.length) throw new ValidationFailedError(errors);
    return out;
  }
}
