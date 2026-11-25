import { dec, type DecimalInput } from '../../platform/http/decimal';
import type { FieldError } from '../../platform/http/errors';
import { netUnitPrice } from './price-range.rules';

/**
 * Fixed prices (phase 5, the Sales Support answer): with the Sales Flow switch on, nobody types a price or a discount on
 * a quotation or a sales order. The price is the customer's price list; what lowers it is a voucher. Package items and
 * gifts are priced by their package. It stands in place of the price range. Pure, tested in fixed-prices.rules.spec.ts.
 */
export interface FixedPriceLine {
  itemCode: string;
  unitPrice: DecimalInput;
  discountPct: DecimalInput;
  listPrice: DecimalInput | null;
  lineKind?: string;
}

const money = (v: DecimalInput) => dec(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A line of any other price than the list's is refused. `kept` are the lines the document already had, or came with
 * from its quotation: such a line keeps its price, so a document from before the switch or before a new price is never stuck.
 */
export function fixedPriceErrors(lines: FixedPriceLine[], kept: Pick<FixedPriceLine, 'itemCode' | 'unitPrice' | 'discountPct'>[] = []): FieldError[] {
  const errors: FieldError[] = [];
  lines.forEach((l, i) => {
    if (l.lineKind && l.lineKind !== 'ITEM') return;
    const net = netUnitPrice(l);
    if (kept.some((k) => k.itemCode === l.itemCode && netUnitPrice(k).eq(net))) return;
    const field = `lines[${i}].unitPrice`;
    if (l.listPrice === null) errors.push({ field, message: `${l.itemCode} has no price on the customer's price list. Ask the office to add one in Core.` });
    else if (!dec(l.unitPrice).eq(dec(l.listPrice)) || dec(l.discountPct).gt(0)) {
      errors.push({ field, message: `The price comes from the price list (RM ${money(l.listPrice)}). Use a voucher to lower it.` });
    }
  });
  return errors;
}
