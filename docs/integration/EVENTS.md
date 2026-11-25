# Events between modules

Modules never call each other’s tables. When something happens that another module cares about, the module writes an **event** to the outbox table (`sys_outbox`) in the same database transaction as the change. A dispatcher then delivers it. If the receiving module is not built or not connected yet, the event simply waits — nothing is lost and the user is never blocked.

## Naming

`<module>.<document>.<what happened>` in past tense, lower case: `purchase.order.released`.

## Envelope (every event)

```json
{
  "id": "uuid",
  "name": "purchase.order.released",
  "version": 1,
  "tenantId": "uuid",
  "occurredAt": "2026-09-23T03:02:00Z",
  "actor": { "userCode": "LMY" },
  "correlationId": "uuid",
  "aggregateType": "PUR_ORDER",
  "aggregateId": "uuid",
  "payload": { }
}
```

Payloads carry **codes and snapshots**, not internal IDs only: document number, branch code, supplier/customer code, and per line `itemCode`, `uomCode`, `qty`, `warehouseCode`. Quantities and money are strings (`"95.0000"`, `"4180.00"`). Dates are `"2026-09-29"`.

## Two kinds of consumer

| | Receiving system | Module listener |
|---|---|---|
| Who | Inventory/WMS, Finance, LHDN e-Invoice (not connected yet) | Another ERP module that reacts too: Purchase ↔ Sales |
| Registered with | `OutboxConsumers.subscribe(event, handler, fn)` | `OutboxConsumers.listen(event, handler, fn)` |
| Effect on the event | Delivery marks it `DISPATCHED` | Never changes its status |
| Progress kept in | `sys_event_handled` (event id + handler) | `sys_event_handled` (event id + handler) |

Screens read the event status to say "Inventory is not connected yet" or "Accounting posting: queued". A module listener must not change that, so `purchase.goods.received` stays queued for Inventory even after Sales has used it.

## Purchase publishes

| Event | When | Main payload | Who listens |
|---|---|---|---|
| `purchase.request.submitted` | PRQ submitted | prqNo, lines | — |
| `purchase.order.released` | PO released | poNo, supplierCode, expectedDate, warehouseCode, lines | WMS (expected receipts), Finance (commitments) — later |
| `purchase.order.balance_cancelled` | PCO released | pcoNo, poNo, supplierCode, salesOrderNo, poStatus, value, lines (itemCode, uomCode, qty) | **Sales** (buy-to-order status); WMS later |
| `purchase.goods.received` | GRN confirmed | grnNo, poNo, supplierCode, supplierDo, branchCode, receivedDate, salesOrderNo, lines with condition, warehouse and location | **Sales** (buy-to-order status); Inventory / WMS (stock in) later |
| `purchase.buy_to_order.handled` | Purchase has answered a `sales.order.released` with buy-to-order lines | soNo, autoDraft, lines (soLineNo, itemCode, poNo or null, problem or null) | **Sales** (PO number on the order line) |
| `purchase.invoice.approved` | PI approved | piNo, supplierInvoiceNo, amounts, dueDate | Finance (payable) — later |
| `purchase.return.released` | PRT released | prtNo, grnNo, lines | Inventory / WMS (stock out), Finance (credit expected) — later |
| `purchase.debit_note.released` | PDN released | pdnNo, piNo, amount | Finance — later |
| `purchase.cash_purchase.released` | CP released | cpNo, paidBy, lines | Inventory / WMS, Finance — later |

## Purchase listens to

| Event | From | What Purchase does |
|---|---|---|
| `sales.order.released` | Sales | **Buy-to-order:** if “Auto-draft a PO for buy-to-order sales lines” is on, drafts one PO per preferred supplier (contract price, else last price), created by System for the branch buyer and linked to the sales order. Lines sold in another unit than Purchase buys in are left to the buyer. Always answers with `purchase.buy_to_order.handled`. **Demand:** adds the order's lines to `pur_sales_demand`, Purchase's copy of open sales-order needs (P04, P06). A revised order (Sales, phase 5) comes again with `revision` above 1 and nothing delivered or cancelled: lines it no longer has are dropped |
| `sales.shipment.requested` | Sales | Lowers the open quantity in `pur_sales_demand`, by the sales-order line (`soLineNo`) |
| `sales.order.balance_cancelled` | Sales | Lowers the open quantity in `pur_sales_demand`, by the sales-order line (`lineNo`). Also when the system cancels an order with no receipt and no delivery order (phase 5) |
| `wms.goods.received` | WMS (later) | Creates and confirms the GRN automatically; the GRN screen becomes read-only |
| `mes.material.required` | MES (later) | Adds a line to the demand list |
| `finance.payment.made` | Finance (later) | Marks the purchase invoice Paid |

## Sales publishes

| Event | When | Main payload | Who listens |
|---|---|---|---|
| `sales.order.released` | SO released; a revised order again with the next revision (phase 5). Service keeps agentCode, agentName and warehouseCode on the job | soNo, revision (1 for the first release), docDate, branchCode, customerCode, customerName, agentCode, agentName, contactName, deliveryAddress, deliveryPostcode, deliveryState (kept only with the installation option asked; else null), total, deliveryWantedBy, warehouseCode, lines (lineNo, itemCode, uomCode, qty, isBuyToOrder, lineKind, packageCode), vouchers (voucherNo, amount, taxCode, taxAmount), installation (option, preferredDate, afterStock; null when Sales does not ask), preOrder (phase 5: released with short stock while pre-orders are on) | **Purchase** (buy-to-order PO, demand); **Service** (an installation job) |
| `sales.order.balance_cancelled` | Cancel order released | cancelNo, soNo, branchCode, warehouseCode, customerCode, reason, orderClosed, lines (lineNo = sales-order line, itemCode, uomCode, qty, isBuyToOrder, purchaseOrderNo) | **Purchase** (demand); Purchase is also warned for buy-to-order lines |
| `sales.shipment.requested` | DO confirmed | doNo, soNo, branchCode, warehouseCode, customerCode, deliverTo, vehicle, driver, consignmentNote, lines (lineNo = DO line, soLineNo = sales-order line, itemCode, uomCode, qty) | **Purchase** (demand); Inventory (stock out) later |
| `sales.invoice.released` | Invoice released | invoiceNo, docDate, dueDate, branchCode, customer code, name and TIN, currency, subtotal, discountTotal, taxTotal, rounding, total, salesOrderNo, deliveryNos, depositApplied, proformaNo, lines | Finance (receivable), LHDN e-Invoice — later |
| `sales.return.released` | Sales return released | returnNo, invoiceNo, customerCode, branchCode, reason, stockIn (goodsTo, warehouseCode, locationCode), creditNote (method, amounts, originalInvoiceNo), lines | Inventory (stock in), Finance and LHDN (credit note) — later |
| `sales.debit_note.released` | Debit note released | debitNoteNo, invoiceNo, customerCode, branchCode, reason, dueDate, subtotal, taxTotal, total, lines | Finance, LHDN — later |
| `sales.cash_sale.released` | Cash sale released | saleNo, docDate, branchCode, warehouseCode, customerCode, payment (method, reference, received, change, total), eInvoice (OWN with buyer name and TIN, or CONSOLIDATED with its due date), totals, lines | Finance (receipt), Inventory (stock out), LHDN — later |

## Sales listens to

| Event | From | What Sales does |
|---|---|---|
| `purchase.buy_to_order.handled` | Purchase | Puts the PO number on each buy-to-order order line, or the reason there is none, and writes it in the order's activity |
| `purchase.goods.received` | Purchase | Adds the received quantity to the order lines on that PO (`purchaseReceivedQty`); received but not delivered goods count as ready on the delivery waiting list |
| `purchase.order.balance_cancelled` | Purchase | Adds the cancelled quantity to the order lines on that PO (`purchaseCancelledQty`), counting only what the order is short |
| `mdm.customer.created` | Core | When the payload names an enquiry (`enquiryNo`) that has no customer yet, links it to the new customer so it can be quoted, and writes that in the enquiry's activity (Phase 3 decision 7) |
| `service.job.booked` | Service | Keeps the installer's booking on the order (`installBooking`, "Thu, 1 Oct · 10 AM – 12 PM · Hafiz Rahman") with a line in its activity; a revision after booking needs the Sales Manager (phase 5) |
| `service.job.unbooked`, `service.job.cancelled` | Service | Clears the booking on the order, with a line in its activity |
| `service.job.delivery_due` | Service | With *Make the delivery order for the installation* on: drafts the delivery order for what the order still has to deliver, or says why not (phase 5). Asked each hour, or at once when the warehouse picked and signed (`picked`); answered with `sales.delivery.drafted` |
| `service.job.goods_back` | Service | Checks the collected delivery order back in: the goods of a postponed job are all at the store again (phase 5) |

Sales never bumps the order's version for these: they are Purchase's and Service's facts, not edits.

## Core publishes

Purchase and Sales read master data through `MasterDataPort` and keep no copy, so they need none of these events. The exception is Sales' prospect link. Documents keep their snapshots whatever changes. Payloads carry the code, the record after the change and the list of changed fields.

| Event | When | Main payload | Who listens |
|---|---|---|---|
| `mdm.item.created` / `mdm.item.updated` | Item saved, including status changes | code, item, changedFields | WMS, MES — later |
| `mdm.customer.created` / `mdm.customer.updated` | Customer saved | code, customer, changedFields; `created` may carry enquiryNo, and `addedFrom: SALES_ORDER` when a salesperson added it from an order (phase 5) | **Sales** (`created` with enquiryNo: links the enquiry's prospect); WMS (outbound), Finance — later |
| `mdm.supplier.created` / `mdm.supplier.updated` | Supplier saved, including its contract prices | code, supplier, changedFields | WMS (inbound), Finance — later |
| `mdm.price_list.updated` | Price list or its prices saved, including a new list (`created: true`) and Deactivate or Activate | code, price list with all its dated prices, changedFields | — |
| `mdm.tax_code.updated` | Tax code added or changed, a rate added or a waiting rate removed (`created: true` for a new code) | code, the code with every rate period, changedFields | Finance — later |
| `mdm.uom.updated`, `mdm.warehouse.updated` | Unit or warehouse saved | code, record, changedFields | WMS, MES — later |
| `mdm.reference.updated` | Item group, customer category, area or credit term saved | code (the name), list, entry, changedFields | — |
| `mdm.<record>.deleted` | A record that nothing used was deleted | code, the record as it was | WMS, MES — later |

### Sales: official receipts (phase 5)

| Event | When | Main payload | Who listens |
|---|---|---|---|
| `sales.delivery.drafted`, `sales.delivery.removed` | A delivery order of an order with installation is drafted, or that draft is deleted (phase 5) | doNo, doId, salesOrderId, salesOrderNo | **Service** (the job's delivery order) |
| `sales.delivery.delivered` | A delivery order of an order with installation is delivered (phase 5) | doNo, doId, salesOrderId, salesOrderNo, how (SIGNED, UNSIGNED, CONFIRMED), signerName | **Service** (the job is delivered) |
| `sales.receipt.verified` | Account verified an official receipt against the bank or card settlement | orNo, receivedOn, kind (DEPOSIT, BALANCE), method, amount, verifiedRef, salesOrderId, salesOrderNo, customerCode, branchCode, order: { total, verified, status: UNPAID, DEPOSIT or FULLY_PAID } | Service (`service.job-payment`); Finance and the accounting system — later |

## Service publishes

The Service module (phase 5) runs only where the server has `SERVICE_MODULE=on`.

| Event | When | Main payload | Who listens |
|---|---|---|---|
| `service.job.created` | A job made from a released order or added by the office | jobNo, jobType, typeLabel, branchCode, customerCode, salesOrderNo or null, preferredDate, afterStock | Phone app, Sales (the job on the order) — later |
| `service.job.booked` | A job booked or moved on the Planning Board | jobNo, jobType, personId, personName, date, start and end (minutes from midnight), moved, salesOrderId, salesOrderNo, bookingText | **Sales** (the booking on the order); phone app — later |
| `service.job.delivery_due` | A booked job from a sales order is within 24 hours and the warehouse has confirmed its stock; each hour until it has a delivery order. Where the warehouse picks and signs: at once | jobNo, salesOrderId, salesOrderNo, date, start, end, personName, picked, bookingText | **Sales** (drafts the delivery order) |
| `service.job.goods_back` | The store received all the goods of a postponed job that was picked (phase 5) | jobNo, salesOrderId, salesOrderNo, receivedBy | **Sales** (checks the delivery order in) |
| `service.parts.returned` | The store received a part an installer brought back (phase 5) | jobNo, itemCode, uomCode, warehouseCode, goodQty, damagedQty, reason (UNUSED, POSTPONED, EXCHANGE), location or null, grnNo or null | Inventory (later) |
| `service.warranty.registered` | A complete installation registered its units under warranty (phase 5) | jobNo, salesOrderNo, customerCode, units: itemCode, qty, startOn, endOn, status | None yet |
| `service.job.unbooked` | A booked job taken off the board, or its visit postponed | jobNo, salesOrderId, salesOrderNo, reason | **Sales** (clears the booking) |
| `service.job.done` | A visit recorded as complete or partly done | jobNo, jobType, personId, personName, date, result, paidStatus, salesOrderNo, customerCode | Fees and commission (F5) — later |
| `service.job.extended` | The office gave a booked job longer (F3 part 4) | jobNo, personId, personName, date, from and to (minutes from midnight), reason, runsInto (the later jobs it now runs into) | Phone app — later |
| `service.job.cancelled` | The office cancelled a job not done yet (a booked one frees its slot), or a revised order dropped installation | jobNo, jobType, customerCode, salesOrderId, salesOrderNo, reason | **Sales** (clears the booking) |
| `service.claim.approved` | Account approved an installer's claim (F5) | claimNo, personId, personName, periodStart, periodEnd, payOn, invoiceNo, selfBilled, total, lines (jobNo, salesOrderNo, amount) | Finance — later |
| `service.claim.paid` | Account recorded its payment voucher | claimNo, personId, personName, paidOn, paymentRef, total | Finance — later |

## Service listens to

| Event | From | What Service does |
|---|---|---|
| `sales.order.released` | Sales | An order released with the Installation option makes an installation job, *Not booked*, with the customer's preferred date or *after stock arrives*, its items and the delivery address. Delivery only, collect, and companies whose Sales does not ask make none. Once per order (`svc_job` is unique on the order). A revised order released again (`revision` above 1) updates its job not done yet: items, contact, address and, while not booked, the preferred date; a revision without installation cancels the job |
| `sales.delivery.drafted`, `sales.delivery.removed` | Sales | The order's job keeps, or drops, its delivery order's number (phase 5) |
| `sales.delivery.delivered` | Sales | The order's job is delivered: no longer unfinished for a missing signature (phase 5) |
| `sales.order.balance_cancelled` | Sales | When the order closed: its job, not done yet, is cancelled (phase 5) |
| `sales.receipt.verified` | Sales | The order's jobs keep where its payment stands (Unpaid, Deposit paid, Fully paid, paid and total), with a line on each job's activity |

## Alerts are not events

Alerts for people (phase 5, `sys_notification`, the *Alerts* button in the top bar) are written by the module that
makes the change, in the same transaction, for the people it picks. They are not outbox events and nobody listens to
them: an order to be cancelled or cancelled automatically (`sales.order.lapsing`, `sales.order.lapsed`), a job
postponed, rescheduled or at risk (`service.job.postponed`, `service.job.moved`, `service.job.at_risk`).

## Listener names

Stored in `sys_event_handled.handler`. The seed marks its own history as handled under these names, in the same transaction as the seeded events, so a running API never replays it.

| Listener | Event |
|---|---|
| `purchase.draft-po-for-buy-to-order` | `sales.order.released` |
| `purchase.sales-demand-order` | `sales.order.released` |
| `purchase.sales-demand-shipped` | `sales.shipment.requested` |
| `purchase.sales-demand-cancelled` | `sales.order.balance_cancelled` |
| `sales.buy-to-order-po` | `purchase.buy_to_order.handled` |
| `sales.buy-to-order-received` | `purchase.goods.received` |
| `sales.buy-to-order-cancelled` | `purchase.order.balance_cancelled` |
| `sales.prospect-link` | `mdm.customer.created` |
| `sales.install-booked` | `service.job.booked` |
| `sales.install-unbooked` | `service.job.unbooked` |
| `sales.install-delivery` | `service.job.delivery_due` |
| `sales.install-goods-back` | `service.job.goods_back` |
| `service.job-delivery`, `service.job-delivery-removed`, `service.job-delivered` | `sales.delivery.drafted`, `sales.delivery.removed`, `sales.delivery.delivered` (only with `SERVICE_MODULE=on`) |
| `service.job-order-closed` | `sales.order.balance_cancelled` (only with `SERVICE_MODULE=on`) |
| `sales.invoice-delivered` | `sales.delivery.delivered` (Sales' own: drafts the invoice where the company asks for it) |
| `sales.install-cancelled` | `service.job.cancelled` |
| `service.job-from-order` | `sales.order.released` (only with `SERVICE_MODULE=on`) |
| `service.job-payment` | `sales.receipt.verified` (only with `SERVICE_MODULE=on`) |

## Rules for the dispatcher

- Deliver at least once; every consumer must be idempotent. Each (event, handler) is recorded in `sys_event_handled` in the same transaction as the handler's own changes, so a redelivery is a no-op.
- Receiving systems: the event is claimed with `FOR UPDATE SKIP LOCKED`; a failure is retried with backoff (5 s, doubling, at most 1 hour); after 10 failures the event is marked `FAILED` so someone can see it. Events nobody subscribes to stay `PENDING`.
- Module listeners: the next event is found with a plain read, then only that event is locked and checked again, so two API instances never handle it twice and user transactions writing new events are never held up. A failure is retried with the same backoff; after 10 failures the event is parked for that listener and an error is logged (kept in memory in phase 1, at most 200 per listener, so a restart tries again).
- A listener that needs something not there yet (a delivery for an order whose release has not been handled) refuses the event, so it is retried later.
- Delivery to receiving systems and to module listeners have separate budgets per round, so a backlog in one never holds up the other.
- Phase 1: an in-process poller (`@nestjs/schedule`) every `OUTBOX_INTERVAL_MS` (5 s), switched by `OUTBOX_DISPATCH`. Later: Redis/BullMQ as in the SDD.
