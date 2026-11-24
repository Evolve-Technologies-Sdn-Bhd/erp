import { dec } from '../../platform/http/decimal';

/**
 * The stock of booked jobs (phase 5): a booked job holds its items, the earlier slot first, so a later job counts what
 * the earlier ones leave. The warehouse confirms each job's stock before its delivery order is made; confirming is
 * their word, so it is allowed even where the figures say short. Pure functions, tested in stock.rules.spec.ts.
 */

export interface BookedJob {
  id: string;
  docNo: string;
  jobDate: string;
  slotStart: number;
  warehouseCode: string | null;
  items: { itemCode: string; itemName: string; qty: string; uomCode: string }[];
}

export interface ItemStock {
  itemCode: string;
  itemName: string;
  uomCode: string;
  needed: string;
  onHand: string;
  /** Held by jobs booked earlier from the same warehouse. */
  earlier: string;
  /** On hand less what earlier jobs hold, never below 0. */
  free: string;
  short: boolean;
}

/** Whether a goes before b: by day, then slot, then number. */
export function goesFirst(a: Pick<BookedJob, 'jobDate' | 'slotStart' | 'docNo'>, b: Pick<BookedJob, 'jobDate' | 'slotStart' | 'docNo'>): boolean {
  if (a.jobDate !== b.jobDate) return a.jobDate < b.jobDate;
  if (a.slotStart !== b.slotStart) return a.slotStart < b.slotStart;
  return a.docNo < b.docNo;
}

/** Each stock item of the job once, with what is needed, on hand, held by earlier jobs and free. */
export function itemStock(job: BookedJob, others: BookedJob[], onHand: (itemCode: string, warehouseCode: string | null) => string, isStock: (itemCode: string) => boolean): ItemStock[] {
  const earlier = others.filter((o) => o.id !== job.id && o.warehouseCode === job.warehouseCode && goesFirst(o, job));
  const out = new Map<string, ItemStock>();
  for (const i of job.items.filter((x) => isStock(x.itemCode))) {
    const before = out.get(i.itemCode);
    const needed = dec(before?.needed ?? 0).add(dec(i.qty));
    const held = earlier.flatMap((o) => o.items).filter((x) => x.itemCode === i.itemCode).reduce((s, x) => s.add(dec(x.qty)), dec(0));
    const left = dec(onHand(i.itemCode, job.warehouseCode)).sub(held);
    const free = left.gt(0) ? left : dec(0);
    out.set(i.itemCode, {
      itemCode: i.itemCode, itemName: i.itemName, uomCode: i.uomCode, needed: needed.toString(), onHand: dec(onHand(i.itemCode, job.warehouseCode)).toString(),
      earlier: held.toString(), free: free.toString(), short: free.lt(needed),
    });
  }
  return [...out.values()];
}

/** "CH-DIN-01: 1 free (2 held by earlier jobs), 2 needed". Null when everything is there. */
export function shortText(rows: ItemStock[]): string | null {
  const short = rows.filter((r) => r.short);
  if (!short.length) return null;
  return short.map((r) => `${r.itemCode}: ${dec(r.earlier).gt(0) ? `${r.free} free (${r.earlier} held by earlier jobs)` : `${r.free} in stock`}, ${r.needed} needed`).join('; ');
}

/** Why a job within 24 hours is not ready, or null. Confirmed by the warehouse is ready, whatever the figures say. */
export function notReady(j: { confirms: boolean; confirmed: boolean; short: string | null }): string | null {
  if (j.confirms && j.confirmed) return null;
  if (j.short) return j.short;
  return j.confirms ? 'the warehouse has not confirmed the stock' : null;
}

/** The delivery order is asked for once the warehouse has confirmed, for a job from a sales order that has none yet. */
export function deliveryDue(j: { confirms: boolean; confirmed: boolean; salesOrderId: string | null; deliveryNo: string | null }): boolean {
  return j.confirms && j.confirmed && j.salesOrderId !== null && j.deliveryNo === null;
}
