import { admin, agent, deliveryOnly, INVOICE, newOrder, NEW_ORDER, ORDER, ORDERS, pickCustomer, release, salesManager, saveDraft, toOrders } from '@/tours/guide.sales'
import { be, confirmText, inbox, openCore, openDoc, openFromHome, openModule, openPage, press, row, status } from '@/tours/guide.steps'
import type { Guide, PageMatch, Tour, TourStep } from '@/tours/types'

/**
 * The demo as guides: the Handbook's demo journeys A–K, step for step (dev mode), for a company with a WMS connected.
 * One story: the data came from the WMS, its stock is live in the ERP, and an order, a purchase, a delivery and an
 * invoice are made on it. They are kept together here, although they go through every module. Neutral words only; a
 * company's own come from its file (GUIDE_VALUES_FILE).
 */

const LAUNCHER = { path: '^/$' }
const WMS_HOME = { code: 'W00' }
const INVENTORY = { code: 'W01' }
const STOCK_LOCATION = { code: 'W02' }
const EPC = { code: 'W03' }
const RECEIVING = { code: 'W04' }
const SHIPPING = { code: 'W05' }
const ITEMS = { path: '^/core/items$' }
const SUPPLIERS = { path: '^/core/suppliers$' }
const CUSTOMERS = { path: '^/core/customers$' }
const CUSTOMER = { path: '^/core/customers/(?!new$)[^/]+$' }
const WAREHOUSES = { path: '^/core/warehouses$' }
const PRICE_LISTS = { path: '^/core/price-lists$' }
const PRICE_LIST = { path: '^/core/price-lists/(?!new$)[^/]+$' }
const DEMAND = { path: '^/purchase/demand$' }
const POS = { path: '^/purchase/orders$' }
const NEW_PO = { path: '^/purchase/orders/new$' }
const PO = { path: '^/purchase/orders/(?!new$)[^/]+$' }
const RECEIPTS = { path: '^/purchase/receipts$' }
const NEW_RECEIPT = { path: '^/purchase/receipts/new$' }
const RECEIPT = { path: '^/purchase/receipts/' }
const DELIVERIES = { path: '^/sales/deliveries$' }
const DELIVERY = { path: '^/sales/deliveries/(?!new$)[^/]+$' }
const INVOICES = { path: '^/sales/invoices$' }
const NEW_INVOICE = { path: '^/sales/invoices/new$' }
const PRINT = { path: '^/sales/invoices/[^/]+/print$' }
const BRANCHES = { path: '^/config/branches$' }
const AGING = { path: '^/sales/reports/customer-aging$' }
const SALES_HOME = { path: '^/sales$' }
const PURCHASE_HOME = { path: '^/purchase$' }

const buyer = (extra: Partial<TourStep> = {}) => be('PURCHASE_BUYER', 'buyer', 'buyer', extra)
const manager = (extra: Partial<TourStep> = {}) => be('PURCHASE_MANAGER', 'purchaseManager', 'purchasing manager', extra)
const purchaseStore = (extra: Partial<TourStep> = {}) => be('STORE', 'purchaseStore', 'store', extra)
const salesStore = (extra: Partial<TourStep> = {}) => be('SALES_STORE', 'store', 'store', extra)
const billing = (extra: Partial<TourStep> = {}) => be('SALES_BILLING', 'billing', 'billing clerk', extra)
const agent3 = (extra: Partial<TourStep> = {}) => be('SALES_AGENT', 'agent3', 'sales agent of another showroom', extra)

/** A module from the launcher. */
const tile = (name: string, module: PageMatch['module'], extra: Partial<TourStep> = {}): TourStep => ({ target: 'launcher:tiles', page: LAUNCHER, pick: name, wait: { kind: 'page', to: { module } }, title: `Open ${name}`, text: `Click the ${name} tile.`, ...extra })
/** Another module, from a module's home. */
const fromHome = (module: PageMatch['module'], label: string): TourStep => ({ target: 'home:switcher', wait: { kind: 'page', to: { module } }, title: `Go to ${label}`, text: `Click the module name, top left, then ${label}.` })
const wmsMenu = (item: string, label: string, to: PageMatch, extra: Partial<TourStep> = {}): TourStep => ({ target: `menu:${item}`, placement: 'right', wait: { kind: 'page', to }, title: `Open ${label}`, text: `Click ${label}.`, ...extra })
const look = (page: PageMatch, title: string, text: string, expect: string, extra: Partial<TourStep> = {}): TourStep => ({ target: 'list', page, title, text, expect, placement: 'top', ...extra })
const trans = (item: string, label: string, to: { path: string }) => openPage('transaction', 'Purchase Transaction', item, label, to)
const pickFrom = (target: string, title: string, field: string, value: string, extra: Partial<TourStep> = {}): TourStep => ({ target, page: NEW_PO, wait: { kind: 'use' }, title, text: `Type ${value}, pick it from the list, then Next.`, type: [{ field, value }], ...extra })
/** A purchase order of one line, saved. */
const newPo = (item: string, qty: string, price: string): TourStep[] => [
  press('Add new PO', { kind: 'page', to: NEW_PO }, 'A new order', 'Click Add new PO.', { page: POS }),
  pickFrom('po:supplier', 'The supplier', 'Supplier', '{supplier}', { placement: 'right' }),
  pickFrom('po:line-item', 'The item', 'Item', item, { placement: 'top' }),
  { target: 'po:line-qty', page: NEW_PO, wait: { kind: 'use' }, title: 'How many', text: 'Type the quantity, then Next.', type: [{ field: 'Quantity', value: qty }], placement: 'top' },
  { target: 'po:line-price', page: NEW_PO, wait: { kind: 'use' }, title: 'The price', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: price }], placement: 'top' },
  press('Save draft', { kind: 'page', to: PO }, 'Save it', 'Click Save draft.', { page: NEW_PO, waiting: 'Waiting for the order to be saved.' }),
]
const releasePo = (title: string): TourStep => press('Release', status('RELEASED'), title, confirmText('Release'), { page: PO, waiting: 'Waiting for it to be released.' })
const { openRequest, approveIt } = inbox({ code: 'P02' })

const base: Pick<Tour, 'module' | 'journey' | 'pages' | 'requires'> = { module: 'wms', journey: true, pages: 'any', requires: ['dev', 'wms'] }
const book: Pick<Guide, 'book'> = { book: 'Demo' }
const from = (letter: string, key: string) => ({ guide: `guide.demo.${letter}`, key })

const DATA: Tour = {
  ...base,
  id: 'guide.demo.a',
  title: 'The data came from the WMS',
  summary: 'Items, suppliers, customers, racks and prices, with the WMS codes.',
  minutes: 4,
  startAt: '/',
  guide: {
    ...book,
    letter: 'A',
    rows: 6,
    cast: 'Administrator',
    values: {
      items: 'Each item, coded with its WMS SKU',
      suppliers: 'Each supplier, with the code the WMS gave it',
      customers: 'The customers of the WMS, and one for walk-in sales',
      customer: 'a customer',
      racks: 'The racks of the WMS',
      priceList: 'a price list',
      prices: 'A price for each item',
    },
  },
  steps: [
    { title: 'The data came from the WMS', text: 'Six steps, as the administrator. Nothing is changed.' },
    admin({ row: 1 }),
    { target: 'launcher:tiles', page: LAUNCHER, title: 'The launcher', text: 'One tile for each module.', expect: 'Core, Purchase, Sales, Service, WMS and Configuration open. A module that is not built yet says Coming soon.', placement: 'top' },

    tile('Core', 'core', { row: 2 }),
    openCore('Items & Units', 'Open the items', ITEMS),
    look(ITEMS, 'The items', 'Look at the codes.', '{items}.'),

    ...row(3, openPage('parties', 'Customers & Suppliers', 'suppliers', 'Suppliers', SUPPLIERS)),
    look(SUPPLIERS, 'The suppliers', 'The ERP kept their codes instead of giving its own numbers.', '{suppliers}.'),

    wmsMenu('customers', 'Customers', CUSTOMERS, { row: 4 }),
    look(CUSTOMERS, 'The customers', 'Look at the codes and the agents.', '{customers}.'),
    { target: 'list', page: CUSTOMERS, pick: '{customer}', wait: { kind: 'page', to: CUSTOMER }, title: 'Open one', text: 'Click {customer}.', placement: 'top' },
    { target: 'page-header', page: CUSTOMER, title: '{customer}', text: 'Its agent is the salesperson who sees it.', expect: 'The customer’s page, with its salesperson under Sales agent.' },

    ...row(5, openPage('warehouses', 'Warehouses & Locations', 'warehouses', 'Warehouses', WAREHOUSES)),
    { target: 'core:locations', page: WAREHOUSES, title: 'The racks', text: 'Click another warehouse’s row to see its own.', expect: '{racks}, marked Read only: racks belong to the WMS.', placement: 'top' },

    ...row(6, openPage('pricing', 'Prices & Tax', 'price-lists', 'Price Lists', PRICE_LISTS)),
    { target: 'list', page: PRICE_LISTS, pick: '{priceList}', wait: { kind: 'page', to: PRICE_LIST }, title: 'Open the price list', text: 'Click {priceList}.', placement: 'top' },
    { target: 'core:prices', page: PRICE_LIST, title: 'The prices', text: 'Each from its own date.', expect: '{prices}.', placement: 'top' },
  ],
}

const WAREHOUSE: Tour = {
  ...base,
  id: 'guide.demo.b',
  title: 'The warehouse, inside the ERP',
  summary: 'Stock, racks, one tag’s story, receivings and shipments, read from the WMS.',
  minutes: 5,
  startAt: '/',
  guide: {
    ...book,
    letter: 'B',
    rows: 7,
    cast: 'Administrator',
    values: {
      attention: 'the items that are low or out of stock',
      warehouse: 'a warehouse',
      warehouse2: 'another warehouse',
      onlyThere: 'Only what is in that warehouse',
      reserved: 'Each rack with what is on it. Tags reserved for a shipment say so',
      epc: 'the EPC of a tag',
      tag: 'In warehouse, its item and rack, and what happened to it: tag generated, received, stocked in, shipped (not yet)',
      receivings: 'Each receiving, with received and scanned-in quantities',
      shipments: 'Each shipment, waiting or shipped',
    },
  },
  steps: [
    { title: 'The warehouse, inside the ERP', text: 'Seven steps, as the administrator. Nothing here can be changed: changes are made in the WMS.' },
    admin({ row: 1 }),
    tile('WMS', 'wms'),
    { target: 'wms:read-only', page: WMS_HOME, optional: true, title: 'Read only', text: 'All of it comes from the WMS.', expect: 'The Read only banner.' },
    { target: 'home:kpis', page: WMS_HOME, title: 'Four cards', text: 'Click one later for the list behind it.', expect: 'Units on hand, below reorder level, receiving to scan in, waiting to ship.' },
    { target: 'home:main', page: WMS_HOME, title: 'The charts', text: 'Below the cards.', expect: 'Needs attention lists {attention}.', placement: 'top' },

    { row: 2, target: 'home:tiles', page: WMS_HOME, pick: 'Inventory', wait: { kind: 'page', to: INVENTORY }, title: 'Open Inventory', text: 'Click the Inventory tile.' },
    look(INVENTORY, 'Stock per item', 'A column per warehouse. The status uses the reorder level from Core.', 'One row per item, and a Total units row.'),
    { target: 'filters', page: INVENTORY, wait: { kind: 'use' }, title: 'One warehouse', text: 'Pick {warehouse2} under Warehouse, then Next.' },
    look(INVENTORY, '{warehouse2}', 'The same list, for one warehouse.', '{onlyThere}.'),

    wmsMenu('stock-location', 'Stock Location', STOCK_LOCATION, { row: 3 }),
    { target: 'filters', page: STOCK_LOCATION, wait: { kind: 'use' }, title: 'One warehouse', text: 'Pick {warehouse} under Warehouse, then Next.' },
    look(STOCK_LOCATION, 'Where it is', 'Each rack and what is on it.', '{reserved}.'),

    wmsMenu('epc-lookup', 'EPC Lookup', EPC, { row: 4 }),
    { target: 'wms:epc', page: EPC, wait: { kind: 'appear', selector: '[data-tour="wms:tag"]' }, waiting: 'Waiting for the tag.', title: 'Look up a tag', text: 'Type the EPC, then click Look up.', type: [{ field: 'EPC', value: '{epc}' }] },
    { target: 'wms:tag', page: EPC, title: 'One tag’s story', text: 'One RFID tag is one unit.', expect: '{tag}.', placement: 'top' },

    wmsMenu('receiving', 'Receiving', RECEIVING, { row: 5 }),
    look(RECEIVING, 'Receivings', 'Anything made on the WMS website shows here too.', '{receivings}.'),

    wmsMenu('shipping', 'Shipping', SHIPPING, { row: 6 }),
    look(SHIPPING, 'Shipments', 'With the customer and the order.', '{shipments}.'),

    { row: 7, target: 'page-actions', page: SHIPPING, pick: 'Open in WMS', optional: true, wait: { kind: 'click' }, title: 'The WMS website', text: 'Click Open in WMS. It opens in a new tab: sign in, open its Inventory, then come back here.' },
    { target: 'page-header', page: SHIPPING, title: 'The same figures', text: 'The WMS website and the ERP’s Inventory read the same tags. Lists here refresh every 15 seconds.', expect: 'The WMS’s Inventory matches the ERP’s.' },
  ],
}

const LIVE: Tour = {
  ...base,
  id: 'guide.demo.c',
  title: 'It’s live: a scan reaches the ERP',
  summary: 'One unit scanned in, and the ERP shows it a few seconds later.',
  minutes: 3,
  startAt: '/wms/inventory',
  guide: { ...book, letter: 'C', rows: 4, cast: 'Administrator, and a handheld', values: { item: 'an item', scan: 'Scan one more unit of it onto a rack with the handheld' } },
  steps: [
    { title: 'It’s live', text: 'Four steps, as the administrator. Have the handheld ready.' },
    admin({ row: 1 }),
    ...openPage('wms', 'Read-only view', 'inventory', 'Inventory', INVENTORY),
    look(INVENTORY, 'Before', 'Note the Total of {item}.', 'Today’s figure.'),

    { row: 2, title: 'Scan one in', text: '{scan}. Then Next.', expect: 'The unit is scanned in, with its EPC.', why: 'The scan is made in the WMS. The ERP never makes or changes a tag.' },

    wmsMenu('stock-location', 'Stock Location', STOCK_LOCATION, { row: 3, text: 'Wait about 15 seconds, then click Stock Location.' }),
    wmsMenu('inventory', 'Inventory', INVENTORY, { title: 'And back', text: 'Click Inventory.' }),
    look(INVENTORY, 'After', 'Look at {item} again.', 'One more than before, and the banner says updated just now.'),

    wmsMenu('epc-lookup', 'EPC Lookup', EPC, { row: 4 }),
    { target: 'wms:epc', page: EPC, wait: { kind: 'appear', selector: '[data-tour="wms:tag"]' }, waiting: 'Waiting for the tag.', title: 'The new tag', text: 'Paste its EPC, then click Look up.' },
    { target: 'wms:tag', page: EPC, title: 'Scanned in just now', text: 'Who scanned it, and when.', expect: 'In warehouse, stocked in a moment ago.', placement: 'top' },
  ],
}

const SELL: Tour = {
  ...base,
  id: 'guide.demo.d',
  title: 'Sell with real stock',
  summary: 'An order on the WMS’s own figures, with one item short.',
  minutes: 5,
  startAt: '/sales/orders',
  guide: {
    ...book,
    letter: 'D',
    rows: 4,
    cast: 'Sales agent',
    values: { mine: 'Only their own customers', customer: 'a customer of yours', item: 'an item in stock', item2: 'an item out of stock', qty: '2', qty2: '5' },
  },
  steps: [
    { title: 'Sell with real stock', text: 'Four steps, as the sales agent.' },
    agent('hqAgent', { row: 1 }),
    ...toOrders(),
    newOrder(),
    { ...pickCustomer(), expect: '{mine}: an agent sees only their own.' },

    { row: 2, target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'Add an item', text: 'Click Add item.' },
    { target: 'item-picker', page: NEW_ORDER, title: 'Live stock', text: 'Each item with its list price and its stock.', expect: 'The figures of the WMS. {item2} shows 0.' },

    {
      row: 3,
      target: 'item-picker',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:line"]' },
      waiting: 'Waiting for the item on the order.',
      title: 'One that is there',
      text: 'Search {item}, tick it, set the quantity to {qty} and click Add 1 item.',
      type: [{ field: 'Search', value: '{item}' }],
    },
    { target: 'so:line', page: NEW_ORDER, title: 'On the order', text: 'At the price of the price list.', expect: '{qty} of {item}, priced.', placement: 'top' },
    { target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'And one that is not', text: 'Click Add item again.' },
    {
      target: 'item-picker',
      page: NEW_ORDER,
      wait: { kind: 'gone', selector: '[data-tour="item-picker"]' },
      waiting: 'Waiting for the item on the order.',
      title: 'Short of stock',
      text: 'Search {item2}, tick it, set the quantity to {qty2} and click Add 1 item.',
      type: [{ field: 'Search', value: '{item2}' }],
      why: 'Short stock warns. It never blocks.',
    },
    { target: 'so:totals', page: NEW_ORDER, title: 'The total', text: 'The prices came from the price list.', expect: 'Two lines, priced.', placement: 'left' },

    { ...deliveryOnly(), row: 4 },
    saveDraft(NEW_ORDER),
    { target: 'page-header', page: ORDER, title: 'A number', text: 'Given on the first save.', expect: 'Draft, with the next order number.' },
    release(),
    { target: 'page-header', page: ORDER, remember: 'order', title: '{order} is released', text: 'The total has the sample tax on it.', expect: 'Released. Where the company uses pre-orders, also Pre-order, because {item2} is short.' },
  ],
}

const BUY: Tour = {
  ...base,
  id: 'guide.demo.e',
  title: 'What to buy',
  summary: 'The shortage shows in Demand, and the buyer orders it.',
  minutes: 4,
  startAt: '/purchase/demand',
  guide: { ...book, letter: 'E', rows: 3, cast: 'Buyer', after: ['D'], values: { supplier: 'its supplier', item2: 'the item that is short', price: '95.00' } },
  steps: [
    { title: 'What to buy', text: 'Three steps, as the buyer, for the shortage of guide D.' },
    buyer({ row: 1 }),
    ...trans('demand', 'Demand', DEMAND),
    { target: 'demand:list', page: DEMAND, title: 'Demand', text: 'Find {item2}.', expect: '{item2} with 0 on hand, what the sales order needs, its supplier and a suggested quantity.', why: 'The stock figures are live from the WMS. Demand adds open sales orders to what is needed, also for an item with plenty on the shelf.', placement: 'top' },

    ...row(2, trans('orders', 'Purchase Order', POS)),
    ...newPo('{item2}', '20', '{price}'),
    { target: 'po:lines', page: PO, remember: 'po', title: '{po}, a draft', text: 'It got its number on the first save.', expect: '20 at {price}, and the tax.', placement: 'top' },

    { ...releasePo('Release it'), row: 3 },
    { target: 'page-header', page: PO, title: '{po} is released', text: 'Under the limit nobody has to approve it.', expect: 'Released.' },
  ],
}

const APPROVAL: Tour = {
  ...base,
  id: 'guide.demo.f',
  title: 'A purchase over the limit needs approval',
  summary: 'The Purchasing Manager approves it, and the buyer releases it.',
  minutes: 6,
  startAt: '/purchase/orders',
  guide: { ...book, letter: 'F', rows: 4, cast: 'Buyer, Purchasing manager', values: { supplier: 'a supplier', item: 'an item', price: '180.00' } },
  steps: [
    { title: 'Over the limit', text: 'Four steps, as two people.' },
    buyer({ row: 1 }),
    ...trans('orders', 'Purchase Order', POS),
    ...newPo('{item}', '100', '{price}'),
    { target: 'po:approval-card', page: PO, remember: 'po', title: '{po} is over the limit', text: 'The button reads Send for approval.', expect: 'It needs approval, and which limit it is over.', placement: 'left' },

    press('Send for approval', { kind: 'appear', selector: '[data-tour="po:approval"]' }, 'Send it', 'Click Send for approval.', { page: PO, row: 2 }),
    { target: 'po:approval', page: PO, wait: status('PENDING_APPROVAL'), waiting: 'Waiting for it to be sent.', title: 'To whom, and why', text: 'Type a note, then click Send for approval.', type: [{ field: 'Note', value: 'Stock for the next two months' }] },
    { target: 'page-header', page: PO, title: 'Waiting', text: 'It is locked while it waits.', expect: 'Pending approval.' },

    manager({ row: 3 }),
    ...openRequest('po', 'The lines, the total and why approval is needed.'),
    approveIt(),

    buyer({ row: 4 }),
    ...trans('orders', 'Purchase Order', POS),
    openDoc(POS, 'po', PO, 'Open the order'),
    releasePo('Approved, so release it'),
    { target: 'page-header', page: PO, title: '{po} is released', text: 'Approving alone does not release it, and nobody approves their own.', expect: 'Released.' },
  ],
}

const RECEIVE: Tour = {
  ...base,
  id: 'guide.demo.g',
  title: 'Receive the goods',
  summary: 'The store receives the order; the WMS does not change yet.',
  minutes: 4,
  startAt: '/purchase/receipts',
  guide: { ...book, letter: 'G', rows: 3, cast: 'Store, Administrator', after: ['E'], from: { po: from('e', 'po') }, values: { po: 'the order from guide E', item2: 'the item ordered' } },
  steps: [
    { title: 'Receive the goods', text: 'Three steps, as two people, for {po} from guide E.' },
    purchaseStore({ row: 1 }),
    ...trans('receipts', 'Goods Receipt', RECEIPTS),
    { target: 'grn:waiting', page: RECEIPTS, pick: '{po} > Receive', wait: { kind: 'page', to: NEW_RECEIPT }, title: 'The goods arrive', text: 'Click Receive on the row of {po}.', placement: 'top' },
    { target: 'grn:lines', page: NEW_RECEIPT, title: 'What was ordered', text: 'Nothing is received yet.', expect: 'Ordered 20, and 20 still open.', placement: 'top' },

    { row: 2, target: 'grn:header', page: NEW_RECEIPT, wait: { kind: 'use' }, must: true, title: 'The supplier’s delivery order', text: 'Type its number under Supplier DO no, then Next.' },
    { target: 'grn:lines', page: NEW_RECEIPT, wait: { kind: 'use' }, title: 'All of it', text: 'Keep 20, pick a rack under Put away to, then Next.', placement: 'top' },
    press('Confirm receipt', status('DONE', 'PARTIAL'), 'Confirm it', confirmText('Confirm receipt'), { page: RECEIPT, waiting: 'Waiting for the receipt to be confirmed.' }),
    { target: 'grn:po', page: RECEIPT, title: 'Confirmed', text: 'The amber note says the stock movement is saved for later.', expect: '{po} is done.', placement: 'left' },

    admin({ row: 3 }),
    openModule('wms', 'WMS'),
    { target: 'home:tiles', page: WMS_HOME, pick: 'Inventory', wait: { kind: 'page', to: INVENTORY }, title: 'Open Inventory', text: 'Click the Inventory tile.' },
    look(INVENTORY, 'Still the same', 'A receipt in the ERP does not reach the WMS yet. Once connected, the WMS scan makes this receipt instead.', '{item2} still has no more than before.'),
  ],
}

const DELIVER: Tour = {
  ...base,
  id: 'guide.demo.h',
  title: 'Deliver and bill',
  summary: 'The order is delivered, and billing makes its invoice.',
  minutes: 6,
  startAt: '/sales/deliveries',
  guide: { ...book, letter: 'H', rows: 4, cast: 'Store, Billing', after: ['D'], from: { order: from('d', 'order') }, values: { order: 'the order from guide D', customer: 'the customer of that order' } },
  steps: [
    { title: 'Deliver and bill', text: 'Four steps, as two people, for {order} from guide D.' },
    salesStore({ row: 1 }),
    ...openPage('transaction', 'Sales Transaction', 'deliveries', 'Delivery Order', DELIVERIES),
    { target: 'dl:waiting', page: DELIVERIES, wait: { kind: 'page', to: DELIVERY }, title: 'Make its delivery order', text: 'On the row of {order}, click Create DO. If it says Waiting for stock, click that, then Create DO anyway.', placement: 'top' },
    { target: 'do:lines', page: DELIVERY, title: 'A delivery order', text: 'For everything still to deliver.', expect: 'Both lines.', placement: 'top' },

    press('Confirm delivery', status('CONFIRMED'), 'Confirm it', confirmText('Confirm delivery'), { page: DELIVERY, row: 2, waiting: 'Waiting for the delivery to be confirmed.' }),
    { target: 'do:progress', page: DELIVERY, title: 'Delivered', text: 'The amber note says the warehouse is not told yet, and WMS stock does not change.', expect: 'Delivered.', placement: 'left' },

    billing({ row: 3 }),
    ...openPage('billing', 'Billing', 'invoices', 'Invoice', INVOICES),
    press('Create from sales order', { kind: 'page', to: NEW_INVOICE }, 'From the order', 'Click Create from sales order.', { page: INVOICES }),
    { target: 'ci:orders', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'The customer and the order', text: 'Type {customer} and pick it. Tick {order} if it is not ticked already. Then Next.', type: [{ field: 'Customer', value: '{customer}' }], placement: 'right' },
    { target: 'ci:create', page: NEW_INVOICE, wait: { kind: 'page', to: INVOICE }, waiting: 'Waiting for the draft.', title: 'Create the draft', text: 'Click Create invoice draft.' },
    { target: 'inv:amounts', page: INVOICE, remember: 'invoice', title: '{invoice}', text: 'Only what was delivered.', expect: 'The order’s total.', placement: 'left' },

    { row: 4, target: 'action:release-invoice', page: INVOICE, wait: status('RELEASED'), waiting: 'Waiting for the invoice to be released.', title: 'Release it', text: confirmText('Release') },
    press('Print', { kind: 'page', to: PRINT }, 'The tax invoice', 'Click Print.', { page: INVOICE }),
    { target: 'print:bar', page: PRINT, wait: { kind: 'page', to: INVOICE }, title: 'On A4', text: 'Look at it, then click Back at the top left.', expect: 'An A4 tax invoice. The e-Invoice is pending: nothing is sent to LHDN.' },
    { target: 'page-header', page: INVOICE, title: 'Released', text: 'Once connected, the WMS shipping scan confirms the delivery instead.', expect: 'Released, and Unpaid.' },
  ],
}

const WHO_SEES: Tour = {
  ...base,
  id: 'guide.demo.i',
  title: 'Who sees what',
  summary: 'An agent’s modules and customers, and the manager’s.',
  minutes: 3,
  startAt: '/',
  guide: { ...book, letter: 'I', rows: 3, cast: 'Sales agent, Sales manager', values: { mine: 'Only the customers whose agent they are' } },
  steps: [
    { title: 'Who sees what', text: 'Three steps, as two people.' },
    agent('hqAgent', { row: 1 }),
    { target: 'launcher:tiles', page: LAUNCHER, title: 'The agent’s modules', text: 'Look at the WMS tile.', expect: 'No access, as for Purchase and Configuration.', placement: 'top' },
    { target: 'no-access', go: '/wms', page: { path: '^/wms$' }, title: 'By its address', text: 'The guide opened /wms by its address.', expect: 'WMS isn’t part of their role.', placement: 'bottom' },

    tile('Core', 'core', { row: 2, go: '/' }),
    openCore('Customers & Suppliers', 'Open the customers', CUSTOMERS),
    look(CUSTOMERS, 'The agent’s customers', 'The list follows the person.', '{mine}.'),

    salesManager('salesManager', { row: 3 }),
    tile('WMS', 'wms', { go: '/' }),
    { target: 'home:kpis', page: WMS_HOME, title: 'The whole warehouse', text: 'The manager sees it, read only.', expect: 'The WMS home, with its figures.' },
  ],
}

const HOMES: Tour = {
  ...base,
  id: 'guide.demo.j',
  title: 'Homes and reports',
  summary: 'The documents of these guides on the homes and in the reports, and a chart of your own.',
  minutes: 4,
  startAt: '/sales',
  guide: { ...book, letter: 'J', rows: 4, cast: 'Sales manager, Buyer', after: ['D', 'E', 'F', 'H'], values: { owes: 'The customer of guide D, with its invoice', spend: 'the orders of guides E and F' } },
  steps: [
    { title: 'Homes and reports', text: 'Four steps, as two people.' },
    salesManager('salesManager', { row: 1 }),
    { target: 'home:kpis', page: SALES_HOME, title: 'The Sales home', text: 'What needs you today.', expect: 'Open orders, to invoice, approvals and customers over their limit.' },
    { target: 'home:main', page: SALES_HOME, title: 'Its charts', text: 'Scroll down to them.', expect: 'The order of guide D under Recent sales orders, and the month’s figure under Ordered by agent.', placement: 'top' },

    ...row(2, openFromHome('sales', 'Reports', 'report-by-customer', 'Sales by customer', { path: '^/sales/reports/by-customer$' })),
    { target: 'page-header', page: { path: '^/sales/reports/by-customer$' }, title: 'Sales by customer', text: 'Look for the customer of guide D.', expect: 'Its order is counted.' },
    wmsMenu('report-customer-aging', 'Customer aging', AGING),
    { target: 'report:by-customer', page: AGING, title: 'Customer aging', text: 'What each customer owes, by how late it is.', expect: '{owes}.', placement: 'top' },

    buyer({ row: 3 }),
    tile('Purchase', 'purchase', { go: '/' }),
    { target: 'home:main', page: PURCHASE_HOME, title: 'The Purchase home', text: 'Its cards and charts.', expect: 'Recent orders has {spend}, and the spend with their supplier.', placement: 'top' },

    { ...fromHome('wms', 'WMS'), row: 4 },
    { target: 'dashboard:add-chart', page: WMS_HOME, wait: { kind: 'appear', selector: '[data-tour="dash:add"]' }, title: 'A chart of your own', text: 'Click Add chart.' },
    { target: 'dash:add', page: WMS_HOME, wait: { kind: 'gone', selector: '[data-tour="dash:add"]' }, waiting: 'Waiting for you to finish.', title: 'Units by item group', text: 'Click Add on Units by item group, then Done.' },
    { target: 'dashboard', page: WMS_HOME, title: 'Your own home', text: 'It stays there next time: each person keeps their own.', expect: 'Your charts · saved to your account.' },
  ],
}

const SHOWROOMS: Tour = {
  ...base,
  id: 'guide.demo.k',
  title: 'Each showroom sees its own',
  summary: 'The branch tree, two showrooms’ agents, and two managers’ figures.',
  minutes: 5,
  startAt: '/config',
  guide: {
    ...book,
    letter: 'K',
    rows: 7,
    cast: 'Administrator, two sales agents, two sales managers',
    values: {
      tree: 'The head office, with its showrooms under it',
      orders: 'Only that showroom’s orders',
      customers: 'Only that showroom’s customers',
      orders3: 'Only the other showroom’s orders',
      agingOne: 'Only the branches this manager works in',
      agingAll: 'The whole company',
      difference: 'Two different figures: each home adds up the person’s own branches',
    },
  },
  steps: [
    { title: 'Each showroom sees its own', text: 'Seven steps, as five people. Switching person is the whole demo.' },
    admin({ row: 1 }),
    { target: 'home:main', page: { module: 'config' }, pick: 'Organisation', wait: { kind: 'page', to: { module: 'config', layout: 'module' } }, title: 'Open Organisation', text: 'Click the Organisation tile.', placement: 'top' },
    { target: 'menu:branches', placement: 'right', wait: { kind: 'page', to: BRANCHES }, title: 'Open Branches', text: 'Click Branches.' },
    { target: 'cfg:branch-tree', page: BRANCHES, title: 'The branches', text: 'Click one to see its address and phone.', expect: '{tree}.', placement: 'right' },

    agent('agent', { row: 2 }),
    { ...look(ORDERS, 'One showroom’s agent', 'The sales orders.', '{orders}.'), go: '/sales/orders' },

    { ...look(CUSTOMERS, 'And their customers', 'The customers in Core.', '{customers}.'), row: 3, go: '/core/customers' },

    agent3({ row: 4 }),
    { ...look(ORDERS, 'Another showroom’s agent', 'The same page.', '{orders3}.'), go: '/sales/orders' },

    salesManager('branchManager', { row: 5 }),
    { target: 'report:kpis', page: AGING, go: '/sales/reports/customer-aging', title: 'A manager of some branches', text: 'Read what is owed and overdue.', expect: '{agingOne}.' },

    salesManager('salesManager', { row: 6 }),
    { target: 'report:kpis', page: AGING, go: '/sales/reports/customer-aging', title: 'A manager of all of them', text: 'Read the same two figures.', expect: '{agingAll}.' },

    { row: 7, target: 'home:kpis', page: SALES_HOME, go: '/sales', title: 'Their homes', text: 'Read the overdue figure on the last card.', expect: 'Every branch, added up.' },
    salesManager('branchManager'),
    { target: 'home:kpis', page: SALES_HOME, go: '/sales', title: 'And the other manager’s', text: 'Read the same card.', expect: '{difference}.', why: 'Someone with several branches can also narrow everything to one, with the branch in the top bar.' },
  ],
}

export const WMS_GUIDES: Tour[] = [DATA, WAREHOUSE, LIVE, SELL, BUY, APPROVAL, RECEIVE, DELIVER, WHO_SEES, HOMES, SHOWROOMS]
