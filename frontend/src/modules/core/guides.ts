import { account, admin, agent, newOrder, NEW_ORDER, ORDERS } from '@/tours/guide.sales'
import { be, confirmText, openCore, openFromHome, openModule, openPage, press, row } from '@/tours/guide.steps'
import type { Guide, PageMatch, Tour, TourStep } from '@/tours/types'

/**
 * Core as guides: the Handbook's Core journeys A–J, step for step (dev mode). Master data is kept here and the other
 * modules read it, so most of them end in Sales or Purchase. Neutral words only; a company's own come from its file.
 */

const HOME = { path: '^/core$' }
const ITEMS = { path: '^/core/items$' }
const NEW_ITEM = { path: '^/core/items/new$' }
const ITEM = { path: '^/core/items/(?!new$)[^/]+$' }
const CUSTOMERS = { path: '^/core/customers$' }
const NEW_CUSTOMER = { path: '^/core/customers/new$' }
const CUSTOMER = { path: '^/core/customers/(?!new$)[^/]+$' }
const SUPPLIERS = { path: '^/core/suppliers$' }
const SUPPLIER = { path: '^/core/suppliers/(?!new$)[^/]+$' }
const PRICE_LISTS = { path: '^/core/price-lists$' }
const PRICE_LIST = { path: '^/core/price-lists/(?!new$)[^/]+$' }
const PACKAGES = { path: '^/core/packages$' }
const NEW_PACKAGE = { path: '^/core/packages/new$' }
const PACKAGE = { path: '^/core/packages/(?!new$)[^/]+$' }
const TAX_CODES = { path: '^/core/tax-codes$' }
const REFERENCE = { path: '^/core/reference$' }
const WAREHOUSES = { path: '^/core/warehouses$' }
const IMPORT = { path: '^/core/import$' }
const POS = { path: '^/purchase/orders$' }
const NEW_PO = { path: '^/purchase/orders/new$' }

const buyer = (extra: Partial<TourStep> = {}) => be('PURCHASE_BUYER', 'buyer', 'buyer', extra)
const manager = (extra: Partial<TourStep> = {}) => be('PURCHASE_MANAGER', 'purchaseManager', 'purchasing manager', extra)
/** Whoever sets up packages: a company's own person, else the administrator. */
const support = (extra: Partial<TourStep> = {}) => be('ADMIN', 'support', 'person who sets up packages', extra)

const items = () => openPage('catalog', 'Items & Units', 'items', 'Items', ITEMS)
const customers = () => openPage('parties', 'Customers & Suppliers', 'customers', 'Customers', CUSTOMERS)
const suppliers = () => openPage('parties', 'Customers & Suppliers', 'suppliers', 'Suppliers', SUPPLIERS)
const priceLists = () => openPage('pricing', 'Prices & Tax', 'price-lists', 'Price Lists', PRICE_LISTS)
const taxCodes = () => openPage('pricing', 'Prices & Tax', 'tax-codes', 'Tax Codes', TAX_CODES)
const warehouses = () => openPage('warehouses', 'Warehouses & Locations', 'warehouses', 'Warehouses', WAREHOUSES)
/** A record in a list, by its code. */
const open = (list: PageMatch, code: string, to: PageMatch, extra: Partial<TourStep> = {}): TourStep => ({ target: 'list', page: list, pick: code, wait: { kind: 'page', to }, title: `Open ${code}`, text: `Click ${code}.`, placement: 'top', ...extra })
const addNew = (what: string, list: PageMatch, to: PageMatch, extra: Partial<TourStep> = {}): TourStep => ({ target: 'core:new', page: list, wait: { kind: 'page', to }, title: `A new ${what}`, text: `Click Add new ${what}.`, ...extra })
/** Saved once the button is grey again. */
const save = (page: PageMatch, label = 'Save changes', extra: Partial<TourStep> = {}): TourStep =>
  press(label, { kind: 'appear', selector: '[data-tour="page-actions"] .erp-btn-primary:disabled' }, 'Save it', `Click ${label}.`, { page, waiting: 'Waiting for it to be saved.', ...extra })
/** A new order of the agent's, with nothing on it yet. */
const toNewOrder = (): TourStep[] => [openModule('sales', 'Sales'), ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS), newOrder()]
const pickOnOrder = (value: string, expect?: string): TourStep => ({ target: 'so:customer', page: NEW_ORDER, wait: { kind: 'use' }, title: 'The customer', text: `Type ${value}, pick it from the list, then Next.`, type: [{ field: 'Customer', value }], expect, placement: 'right' })
/** The item picker on the new order, only to look. */
const lookUpItem = (value: string, expect: string): TourStep[] => [
  { target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'What Sales offers', text: 'Click Add item.' },
  { target: 'item-picker', page: NEW_ORDER, wait: { kind: 'gone', selector: '[data-tour="item-picker"]' }, waiting: 'Waiting for you to close it.', title: 'What Sales shows', text: `Search ${value}, look at it, then click Cancel.`, type: [{ field: 'Search', value }], expect },
]
const addPriceRow: TourStep = { target: 'core:prices', page: PRICE_LIST, pick: 'Add price', wait: { kind: 'appear', selector: '[data-tour="core:prices"] input[placeholder^="Type an item"]' }, title: 'A new price', text: 'Click Add price.', placement: 'top' }

const base: Pick<Tour, 'module' | 'journey' | 'pages' | 'requires'> = { module: 'core', journey: true, pages: 'any', requires: ['dev'] }
const book: Pick<Guide, 'book'> = { book: 'Core' }

const CORE_HOME: Tour = {
  ...base,
  id: 'guide.core.a',
  title: 'The Core home',
  summary: 'What is kept here, what needs attention, and who may change it.',
  minutes: 2,
  startAt: '/core',
  guide: { ...book, letter: 'A', rows: 3, cast: 'Administrator, Sales agent', values: { item: 'an item' } },
  steps: [
    { title: 'The Core home', text: 'Three steps, as two people. Nothing is changed.' },
    admin({ row: 1 }),
    { target: 'core:cards', page: HOME, title: 'What is kept here', text: 'Purchase and Sales read all of it.', expect: 'A card for items, customers, suppliers, price lists, tax codes, units and warehouses, with how many.', placement: 'bottom' },

    { row: 2, target: 'core:attention', page: HOME, title: 'Needs attention', text: 'Checked when the page opens. Each line opens its records.', expect: 'What an e-Invoice would miss: classification codes, TIN and ID numbers.', placement: 'top' },
    { target: 'core:recent', page: HOME, title: 'Recently changed', text: 'Every change, with who made it.', expect: 'The latest changes, newest first.', placement: 'top' },

    agent('hqAgent', { row: 3 }),
    openCore('Items & Units', 'Open the items', ITEMS),
    open(ITEMS, '{item}', ITEM),
    { target: 'page-actions', page: ITEM, title: 'Only to look', text: 'An agent reads master data and never changes it.', expect: 'Back, and no Save. The fields are grey.' },
  ],
}

const E_INVOICE: Tour = {
  ...base,
  id: 'guide.core.b',
  title: 'Fill the e-Invoice gaps',
  summary: 'A supplier, a customer and an item, and the home counts drop.',
  minutes: 5,
  startAt: '/core',
  guide: { ...book, letter: 'B', rows: 4, cast: 'Administrator', values: { supplier: 'a supplier', customer: 'a customer', item: 'an item' } },
  steps: [
    { title: 'Fill the e-Invoice gaps', text: 'Four steps, as the administrator. The numbers are made up: put the real ones later.' },
    admin({ row: 1 }),
    { target: 'core:attention', page: HOME, title: 'Before', text: 'Note the counts.', expect: 'How many items, suppliers and customers miss something.', placement: 'top' },
    openCore('Customers & Suppliers', 'Open Customers & Suppliers', CUSTOMERS),
    ...suppliers(),
    open(SUPPLIERS, '{supplier}', SUPPLIER),
    { target: 'sup:tax', page: SUPPLIER, wait: { kind: 'use' }, title: 'Its tax identity', text: 'Type both, then Next.', type: [{ field: 'TIN', value: '{newTin}' }, { field: 'ID number', value: '{newId}' }], placement: 'top' },
    save(SUPPLIER),
    { target: 'core:activity', page: SUPPLIER, title: 'Logged', text: 'At the bottom of the list.', expect: 'Changed TIN and ID number, each with its old and new value.', placement: 'left' },

    ...row(2, customers()),
    open(CUSTOMERS, '{customer}', CUSTOMER),
    { target: 'cus:tax', page: CUSTOMER, wait: { kind: 'use' }, title: 'The same on a customer', text: 'Type both, then Next.', type: [{ field: 'TIN', value: '{newTin}' }, { field: 'ID number', value: '{newId}' }], placement: 'top' },
    save(CUSTOMER),

    ...row(3, items()),
    open(ITEMS, '{item}', ITEM),
    { target: 'itm:general', page: ITEM, wait: { kind: 'use' }, title: 'The classification', text: 'Pick one under e-Invoice classification, then Next.', placement: 'top' },
    save(ITEM),

    { row: 4, target: 'rail:footer', pick: 'Core home', placement: 'right', wait: { kind: 'page', to: HOME }, title: 'Back to the home', text: 'Click the house at the bottom of the menu.' },
    { target: 'core:attention', page: HOME, title: 'After', text: 'The gaps warn. They never stop a sale or a purchase.', expect: 'One less in each of the three counts.', placement: 'top' },
  ],
}

const NEW_CUSTOMER_GUIDE: Tour = {
  ...base,
  id: 'guide.core.c',
  title: 'A new customer, from Core to Sales',
  summary: 'Added in Core, offered to its salesperson at once, and to nobody else’s.',
  minutes: 4,
  startAt: '/core/customers',
  guide: { ...book, letter: 'C', rows: 3, cast: 'Administrator, two sales agents', values: { branch: 'its branch', agentName: 'its salesperson', priceListName: 'a price list' } },
  steps: [
    { title: 'A new customer', text: 'Three steps, as three people.' },
    admin({ row: 1 }),
    ...customers(),
    addNew('customer', CUSTOMERS, NEW_CUSTOMER),
    { target: 'cus:general', page: NEW_CUSTOMER, wait: { kind: 'use' }, title: 'Who they are', text: 'Type the name. Pick {branch} under Branch and {agentName} under Sales agent. Then Next.', type: [{ field: 'Name', value: '{newName}' }], placement: 'top' },
    { target: 'cus:credit', page: NEW_CUSTOMER, wait: { kind: 'use' }, title: 'Their terms', text: 'Pick {priceListName} under Price list, if it is not picked. Keep the credit term and no limit. Then Next.', placement: 'top' },
    press('Save customer', { kind: 'page', to: CUSTOMER }, 'Save it', 'Click Save customer.', { page: NEW_CUSTOMER, waiting: 'Waiting for the customer to be saved.' }),
    { target: 'page-header', page: CUSTOMER, remember: 'customer', title: '{customer}', text: 'The number is given on save, and never changes.', expect: 'Active, with the next C- number.' },

    agent('hqAgent', { row: 2 }),
    ...toNewOrder(),
    pickOnOrder('{newName}', 'Offered at once, with its credit term.'),

    agent('agent', { row: 3 }),
    { target: 'filters', go: '/core/customers', page: CUSTOMERS, wait: { kind: 'use' }, title: 'Another salesperson', text: 'Type the name in the search, then Next.', type: [{ field: 'Search', value: '{newName}' }] },
    { target: 'list', page: CUSTOMERS, title: 'Not theirs', text: 'A salesperson sees only their own customers.', expect: 'No customers match.', placement: 'top' },
  ],
}

const NEW_ITEM_GUIDE: Tour = {
  ...base,
  id: 'guide.core.d',
  title: 'A new item, from Core to Sales and Purchase',
  summary: 'Added, priced, and offered in both.',
  minutes: 6,
  startAt: '/core/items',
  guide: {
    ...book,
    letter: 'D',
    rows: 4,
    cast: 'Administrator, Sales agent, Buyer',
    values: { group: 'a group', unit: 'a unit', tax: 'a tax code', supplier: 'a supplier', priceList: 'a price list', customer: 'a customer of yours' },
  },
  steps: [
    { title: 'A new item', text: 'Four steps, as three people. It makes one sample item.' },
    admin({ row: 1 }),
    ...items(),
    addNew('item', ITEMS, NEW_ITEM),
    { target: 'itm:general', page: NEW_ITEM, wait: { kind: 'use' }, title: 'What it is', text: 'Type both. Pick {group} under Item group and {unit} under Base unit. Then Next.', type: [{ field: 'Item code', value: '{newItem}' }, { field: 'Name', value: 'Sample item' }], placement: 'top' },
    { target: 'itm:buying', page: NEW_ITEM, wait: { kind: 'use' }, title: 'Buying it', text: 'Pick {tax} under Purchase tax. Type {supplier} under Preferred supplier and pick it. Then Next.', placement: 'top' },
    { target: 'itm:selling', page: NEW_ITEM, wait: { kind: 'use' }, title: 'Selling it', text: 'Turn on Can be sold and pick {tax} under Sales tax. Then Next.', placement: 'top' },
    press('Save item', { kind: 'page', to: ITEM }, 'Save it', 'Click Save item.', { page: NEW_ITEM, waiting: 'Waiting for the item to be saved.' }),
    { target: 'page-header', page: ITEM, title: '{newItem}', text: 'A code never changes, and is never used again.', expect: 'Active.' },

    ...row(2, priceLists()),
    open(PRICE_LISTS, '{priceList}', PRICE_LIST),
    addPriceRow,
    { target: 'core:prices', page: PRICE_LIST, wait: { kind: 'use' }, title: 'What it costs', text: 'In the new row: type {newItem} and pick it, then type 45.00 as its price. Then Next.', placement: 'top' },
    save(PRICE_LIST),

    agent('hqAgent', { row: 3 }),
    ...toNewOrder(),
    pickOnOrder('{customer}'),
    ...lookUpItem('{newItem}', 'RM 45.00, and 0 in stock: nothing is scanned in yet.'),

    buyer({ row: 4 }),
    { target: 'page-actions', go: '/purchase/orders', page: POS, pick: 'Add new PO', wait: { kind: 'page', to: NEW_PO }, title: 'And Purchase', text: 'Click Add new PO.' },
    { target: 'po:supplier', page: NEW_PO, wait: { kind: 'use' }, title: 'Its supplier', text: 'Type {supplier}, pick it from the list, then Next.', type: [{ field: 'Supplier', value: '{supplier}' }], placement: 'right' },
    { target: 'po:line-item', page: NEW_PO, wait: { kind: 'use' }, title: 'The same item', text: 'Type {newItem}, pick it from the list, then Next.', type: [{ field: 'Item', value: '{newItem}' }], placement: 'top' },
    { target: 'po:lines', page: NEW_PO, title: 'Both read it', text: 'Nothing is saved here: leave this page when you like.', expect: '{newItem}, with its tax.', placement: 'top' },
  ],
}

const WHO_MAY: Tour = {
  ...base,
  id: 'guide.core.e',
  title: 'Who may change what',
  summary: 'The buyer, the Purchasing Manager, Finance and an agent on the same records.',
  minutes: 5,
  startAt: '/core/suppliers',
  guide: { ...book, letter: 'E', rows: 4, cast: 'Buyer, Purchasing manager, Finance manager, Sales agent', values: { supplier: 'a supplier', item: 'an item of theirs', price: '42.00', customer: 'a customer', limit: '50000.00' } },
  steps: [
    { title: 'Who may change what', text: 'Four steps, as four people.' },
    buyer({ row: 1 }),
    ...suppliers(),
    open(SUPPLIERS, '{supplier}', SUPPLIER),
    { target: 'sup:contact', page: SUPPLIER, wait: { kind: 'use' }, title: 'The buyer changes a supplier', text: 'Type the phone, then Next.', type: [{ field: 'Phone', value: '{newMobile}' }], placement: 'top' },
    save(SUPPLIER),
    { target: 'sup:contracts', page: SUPPLIER, title: 'But not its contract prices', text: 'A contract price lets an order skip the request for quote.', expect: 'No Add contract price button.', placement: 'top' },

    manager({ row: 2 }),
    { target: 'sup:contracts', page: SUPPLIER, pick: 'Add contract price', wait: { kind: 'appear', selector: '[data-tour="sup:contracts"] input[placeholder^="Type an item"]' }, title: 'The Purchasing Manager does', text: 'Click Add contract price.', placement: 'top' },
    { target: 'sup:contracts', page: SUPPLIER, wait: { kind: 'use' }, title: 'The agreed price', text: 'In the new row: type {item} and pick it, then type {price} as its unit price. Then Next.', placement: 'top' },
    save(SUPPLIER),

    account({ row: 3 }),
    ...customers(),
    open(CUSTOMERS, '{customer}', CUSTOMER),
    { target: 'cus:general', page: CUSTOMER, title: 'Finance cannot change this', text: 'The name, the branch, the salesperson.', expect: 'Grey fields.', placement: 'top' },
    { target: 'core:credit-limit', page: CUSTOMER, wait: { kind: 'use' }, title: 'Only the credit', text: 'Type the limit, then Next.', type: [{ field: 'Credit limit', value: '{limit}' }] },
    save(CUSTOMER),

    agent('hqAgent', { row: 4 }),
    { target: 'cus:credit', page: CUSTOMER, title: 'And an agent only reads', text: 'The same customer.', expect: 'The new limit, and every field grey.', placement: 'top' },
    { target: 'page-actions', page: CUSTOMER, title: 'No Save', text: 'Nothing here can be changed by an agent.', expect: 'Only Back.' },
  ],
}

const LATER: Tour = {
  ...base,
  id: 'guide.core.f',
  title: 'Changes that wait for their date',
  summary: 'A tax rate and a price from next week; today’s stay until then.',
  minutes: 6,
  startAt: '/core/tax-codes',
  guide: { ...book, letter: 'F', rows: 4, cast: 'Administrator, Sales agent', values: { tax: 'a tax code', priceList: 'a price list', item: 'an item', price: '99.00', today: 'today’s price and tax', customer: 'a customer of yours' } },
  steps: [
    { title: 'Changes that wait', text: 'Four steps, as two people. The last one takes both back.' },
    admin({ row: 1 }),
    ...taxCodes(),
    { target: 'tax:list', page: TAX_CODES, pick: '{tax} > New rate', wait: { kind: 'appear', selector: '[data-tour="tax:rate"]' }, title: 'A new rate', text: 'Click New rate on {tax}.', placement: 'top' },
    { target: 'tax:rate', page: TAX_CODES, wait: { kind: 'gone', selector: '[data-tour="tax:rate"]' }, waiting: 'Waiting for the rate.', title: 'From next week', text: 'Type these, then click Add rate.', type: [{ field: 'Rate', value: '8' }, { field: 'From', value: '{nextWeek}' }, { field: 'Name', value: 'Sales tax 8%' }] },
    { target: 'tax:list', page: TAX_CODES, title: 'It waits', text: 'A rate is never edited in place.', expect: 'Today’s rate, then 8% from {nextWeek}.', placement: 'top' },

    ...row(2, priceLists()),
    open(PRICE_LISTS, '{priceList}', PRICE_LIST),
    addPriceRow,
    { target: 'core:prices', page: PRICE_LIST, wait: { kind: 'use' }, title: 'A price from next week', text: 'In the new row: type {item} and pick it, type {price}, and {nextWeek} under From. Then Next.', placement: 'top' },
    save(PRICE_LIST),
    { target: 'core:prices', page: PRICE_LIST, title: 'It waits too', text: 'Both prices of {item} are on the list.', expect: 'A Waiting chip on the new one.', placement: 'top' },

    agent('hqAgent', { row: 3 }),
    ...toNewOrder(),
    pickOnOrder('{customer}'),
    ...lookUpItem('{item}', 'Still {today}.'),

    admin({ row: 4 }),
    { target: 'tax:list', go: '/core/tax-codes', page: TAX_CODES, pick: '{tax}', wait: { kind: 'appear', selector: '[data-tour="tax:code"]' }, title: 'Take the rate back', text: 'Click {tax}.', placement: 'top' },
    { target: 'tax:code', page: TAX_CODES, wait: { kind: 'gone', selector: '[data-tour="tax:code"]' }, waiting: 'Waiting for you to close it.', title: 'Remove 8%', text: 'Click the × on 8%, then Remove in the question that opens. Then click Cancel.', why: 'It has not started, so nothing has used it.' },
    ...priceLists(),
    open(PRICE_LISTS, '{priceList}', PRICE_LIST),
    { target: 'core:prices', page: PRICE_LIST, wait: { kind: 'use' }, title: 'And the price', text: 'Click the × on the waiting price, then Next.', placement: 'top' },
    save(PRICE_LIST),
    { target: 'core:prices', page: PRICE_LIST, title: 'As before', text: 'Prices that have started stay on the list for old documents.', expect: 'No Waiting chip.', placement: 'top' },
  ],
}

const REFUSED: Tour = {
  ...base,
  id: 'guide.core.g',
  title: 'Why something cannot be deleted or blocked',
  summary: 'Each refusal names the documents that stand in the way.',
  minutes: 4,
  startAt: '/core/items',
  guide: { ...book, letter: 'G', rows: 5, cast: 'Administrator', values: { item: 'an item on open orders', customer: 'a customer with open orders', priceList: 'a price list in use', warehouse: 'a warehouse in use', group: 'a group in use' } },
  steps: [
    { title: 'Why not', text: 'Five steps, as the administrator. Nothing is changed.' },
    admin({ row: 1 }),
    ...items(),
    open(ITEMS, '{item}', ITEM),
    { target: 'core:in-use', page: ITEM, title: 'In use', text: 'Purchase and Sales answer this.', expect: 'How many documents use it, and the open ones.', placement: 'left' },
    { target: 'page-actions', page: ITEM, title: 'Block and Discontinue', text: 'Point at Discontinue.', expect: 'Grey, naming the open documents. There is no Delete.' },

    ...row(2, customers()),
    open(CUSTOMERS, '{customer}', CUSTOMER),
    { target: 'page-actions', page: CUSTOMER, title: 'A customer with open orders', text: 'Point at Block.', expect: 'Grey, naming the open documents.' },

    ...row(3, priceLists()),
    open(PRICE_LISTS, '{priceList}', PRICE_LIST),
    { target: 'page-actions', page: PRICE_LIST, title: 'A price list in use', text: 'Point at Deactivate.', expect: 'Grey, naming the customers who have it.' },

    ...row(4, warehouses()),
    { target: 'core:warehouses', page: WAREHOUSES, pick: '{warehouse}', wait: { kind: 'appear', selector: '[data-tour="wh:dialog"]' }, title: 'A warehouse', text: 'Click {warehouse}.', placement: 'top' },
    { target: 'wh:dialog', page: WAREHOUSES, wait: { kind: 'gone', selector: '[data-tour="wh:dialog"]' }, waiting: 'Waiting for you to close it.', title: 'In use as well', text: 'Read it, then click Cancel.', expect: 'It is on open documents, and Active cannot be turned off.' },

    ...row(5, openPage('setup', 'Setup', 'reference', 'Reference Lists', REFERENCE)),
    { target: 'ref:list', page: REFERENCE, pick: '{group}', wait: { kind: 'appear', selector: '[data-tour="ref:dialog"]' }, title: 'A list entry', text: 'Click {group}.', placement: 'top' },
    { target: 'ref:dialog', page: REFERENCE, wait: { kind: 'gone', selector: '[data-tour="ref:dialog"]' }, waiting: 'Waiting for you to close it.', title: 'Inactive instead', text: 'Read it, then click Cancel.', expect: 'What uses it, and no Delete button.' },
  ],
}

const LISTS: Tour = {
  ...base,
  id: 'guide.core.h',
  title: 'Lists and warehouses',
  summary: 'A credit term a customer then uses, and a warehouse Purchase can pick.',
  minutes: 5,
  startAt: '/core/reference',
  guide: { ...book, letter: 'H', rows: 4, cast: 'Administrator, Buyer', values: { customer: 'a customer', branch: 'a branch' } },
  steps: [
    { title: 'Lists and warehouses', text: 'Four steps, as two people.' },
    admin({ row: 1 }),
    ...openPage('setup', 'Setup', 'reference', 'Reference Lists', REFERENCE),
    { target: 'status-tabs', page: REFERENCE, pick: 'Credit terms', wait: { kind: 'click' }, title: 'The credit terms', text: 'Click Credit terms.' },
    press('Add credit term', { kind: 'appear', selector: '[data-tour="ref:dialog"]' }, 'A new one', 'Click Add credit term.', { page: REFERENCE }),
    { target: 'ref:dialog', page: REFERENCE, wait: { kind: 'gone', selector: '[data-tour="ref:dialog"]' }, waiting: 'Waiting for the term.', title: 'How long to pay', text: 'Type both, then click Add credit term.', type: [{ field: 'Name', value: '{newDays} days' }, { field: 'Days to pay', value: '{newDays}' }] },
    { target: 'ref:list', page: REFERENCE, title: 'On the list', text: 'Used by nothing yet, so it can still be deleted.', expect: '{newDays} days.', placement: 'top' },

    ...row(2, customers()),
    open(CUSTOMERS, '{customer}', CUSTOMER),
    { target: 'cus:credit', page: CUSTOMER, wait: { kind: 'use' }, title: 'A customer uses it', text: 'Pick {newDays} days under Credit term, then Next.', placement: 'top' },
    save(CUSTOMER),

    ...row(3, warehouses()),
    press('Add warehouse', { kind: 'appear', selector: '[data-tour="wh:dialog"]' }, 'A new warehouse', 'Click Add warehouse.', { page: WAREHOUSES }),
    { target: 'wh:dialog', page: WAREHOUSES, wait: { kind: 'gone', selector: '[data-tour="wh:dialog"]' }, waiting: 'Waiting for the warehouse.', title: 'Its code and name', text: 'Type both, pick {branch} under Branch, then click Add warehouse.', type: [{ field: 'Code', value: '{newWarehouse}' }, { field: 'Name', value: 'Sample warehouse' }] },
    { target: 'core:warehouses', page: WAREHOUSES, title: 'No racks yet', text: 'Racks come from the WMS.', expect: '{newWarehouse}, with 0 locations.', placement: 'top' },

    buyer({ row: 4 }),
    { target: 'page-actions', go: '/purchase/orders', page: POS, pick: 'Add new PO', wait: { kind: 'page', to: NEW_PO }, title: 'Purchase offers it', text: 'Click Add new PO.' },
    { target: 'po:deliver-to', page: NEW_PO, wait: { kind: 'use' }, title: 'Deliver to', text: 'Open the list, then Next.', expect: 'Sample warehouse is in it. Nothing is saved here.' },
  ],
}

const IMPORT_GUIDE: Tour = {
  ...base,
  id: 'guide.core.i',
  title: 'Import customers from a file',
  summary: 'Checked first, then only the good rows are loaded.',
  minutes: 4,
  startAt: '/core/import',
  guide: { ...book, letter: 'I', rows: 3, cast: 'Administrator', values: { file: 'a file made from the template', rows: 'New rows, rows that update a record, and the problems, each with why', loaded: 'What was added and updated. A row with a problem was left out' } },
  steps: [
    { title: 'Import from a file', text: 'Three steps, as the administrator. Suppliers, items and prices work the same way.' },
    admin({ row: 1 }),
    ...openPage('setup', 'Setup', 'import', 'Import', IMPORT),
    { target: 'imp:file', page: IMPORT, pick: 'Download the template', wait: { kind: 'click' }, title: 'The columns', text: 'Click Download the template. Excel opens it.' },

    { row: 2, target: 'imp:file', page: IMPORT, wait: { kind: 'appear', selector: '[data-tour="imp:rows"]' }, waiting: 'Waiting for a file.', title: 'Upload a file', text: 'Click Choose a CSV file and pick {file}.' },
    { target: 'imp:rows', page: IMPORT, title: 'Checked, nothing saved', text: 'Read the last column.', expect: '{rows}.', placement: 'top' },

    { row: 3, target: 'imp:buttons', page: IMPORT, pick: 'Load', wait: { kind: 'appear', selector: '[data-tour="imp:buttons"] button:last-child:not(.erp-btn-primary)' }, waiting: 'Waiting for the rows to load.', title: 'Load the good rows', text: 'Click Load.', placement: 'left' },
    { target: 'imp:rows', page: IMPORT, title: 'Loaded', text: 'Download rows with problems gives the rest, to fix and upload again.', expect: '{loaded}.', placement: 'top' },
  ],
}

const PACKAGE_GUIDE: Tour = {
  ...base,
  id: 'guide.core.j',
  title: 'A package for the month',
  summary: 'Set up with a free gift, offered to the salespeople, then ended.',
  minutes: 5,
  startAt: '/core/packages',
  guide: { ...book, letter: 'J', rows: 4, cast: 'Whoever sets up packages, Sales agent', values: { item: 'an item', price: 'a price below its list price', gift: 'a gift', customer: 'a customer of yours' } },
  steps: [
    { title: 'A package for the month', text: 'Four steps, as two people.' },
    support({ row: 1 }),
    ...openPage('pricing', 'Prices & Tax', 'packages', 'Packages', PACKAGES),
    addNew('package', PACKAGES, NEW_PACKAGE),
    { target: 'pkg:general', page: NEW_PACKAGE, wait: { kind: 'use' }, title: 'Its name and dates', text: 'Type both. It runs from today; keep the rest. Then Next.', type: [{ field: 'Code', value: '{newPackage}' }, { field: 'Name shown', value: 'Sample package of the month' }], placement: 'top' },
    { target: 'pkg:items', page: NEW_PACKAGE, pick: 'Add item', wait: { kind: 'appear', selector: '[data-tour="pkg:items"] input[placeholder^="Type an item"]' }, title: 'What is in it', text: 'Click Add item.', placement: 'top' },
    { target: 'pkg:items', page: NEW_PACKAGE, wait: { kind: 'use' }, title: 'One price for all of it', text: 'Type {item} and pick it. Then type {price} under Package price. Then Next.', placement: 'top' },
    { target: 'pkg:gift', page: NEW_PACKAGE, wait: { kind: 'appear', selector: '[data-tour="pkg:gift"] table' }, title: 'A free gift', text: 'Pick These gifts, always.', placement: 'top' },
    { target: 'pkg:gift', page: NEW_PACKAGE, pick: 'Add gift', wait: { kind: 'appear', selector: '[data-tour="pkg:gift"] input[placeholder^="Type an item"]' }, title: 'Which gift', text: 'Click Add gift.', placement: 'top' },
    { target: 'pkg:gift', page: NEW_PACKAGE, wait: { kind: 'use' }, title: 'Which gift', text: 'Type {gift} and pick it. Then Next.', placement: 'top' },
    press('Save package', { kind: 'page', to: PACKAGE }, 'Save it', 'Click Save package.', { page: NEW_PACKAGE, waiting: 'Waiting for the package to be saved.' }),

    { row: 2, target: 'pkg:items', page: PACKAGE, title: 'What the customer saves', text: 'The price is spread over the items by their list value.', expect: 'The normal value, what the customer saves, and each item’s price in the package.', placement: 'top' },

    agent('hqAgent', { row: 3 }),
    ...toNewOrder(),
    pickOnOrder('{customer}'),
    { target: 'action:add-package', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="package-picker"]' }, title: 'Salespeople can sell it', text: 'Click Add package.' },
    { target: 'package-picker', page: NEW_ORDER, wait: { kind: 'gone', selector: '[data-tour="package-picker"]' }, waiting: 'Waiting for you to close it.', title: 'Sample package of the month', text: 'Find it among the cards and click it. Read it, then click Cancel.', expect: 'The package, its price and its gift.' },

    support({ row: 4 }),
    { target: 'list', go: '/core/packages', page: PACKAGES, pick: '{newPackage}', wait: { kind: 'page', to: PACKAGE }, title: 'Open it', text: 'Click {newPackage}.', placement: 'top' },
    press('End now', { kind: 'appear', selector: '[data-tour="pkg:ended"]' }, 'End it', confirmText('End now'), { page: PACKAGE, waiting: 'Waiting for it to be ended.' }),
    { target: 'pkg:ended', page: PACKAGE, title: 'Today is its last day', text: 'Orders that have it keep it.', expect: 'Ended early, with today as its last day.' },
  ],
}

export const CORE_GUIDES: Tour[] = [CORE_HOME, E_INVOICE, NEW_CUSTOMER_GUIDE, NEW_ITEM_GUIDE, WHO_MAY, LATER, REFUSED, LISTS, IMPORT_GUIDE, PACKAGE_GUIDE]
