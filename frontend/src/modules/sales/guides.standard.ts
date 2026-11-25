import { account, addItem, admin, agent, approve, approveIt, askApproval, CUSTOMER, CUSTOMERS, deliveryOnly, INVOICE, newOrder, NEW_ORDER, openRequest, ORDER, ORDERS, pickCustomer, reject, release, salesManager, saveDraft, toOrders } from '@/tours/guide.sales'
import { be, confirmText, openCore, openDoc, openFromHome, openModule, openPage, press, row, status } from '@/tours/guide.steps'
import type { Guide, Tour, TourStep } from '@/tours/types'

/**
 * The standard Sales flow as guides: the Handbook's Sales journeys A–M, step for step (dev mode). Amounts are left to
 * the screen where they depend on the company's tax rate.
 */

const ENQUIRIES = { path: '^/sales/enquiries$' }
const NEW_ENQUIRY = { path: '^/sales/enquiries/new$' }
const ENQUIRY = { path: '^/sales/enquiries/(?!new$)[^/]+$' }
const QUOTATIONS = { path: '^/sales/quotations$' }
const NEW_QUOTATION = { path: '^/sales/quotations/new$' }
const QUOTATION = { path: '^/sales/quotations/(?!new$)[^/]+$' }
const DELIVERIES = { path: '^/sales/deliveries$' }
const DELIVERY = { path: '^/sales/deliveries/(?!new$)[^/]+$' }
const INVOICES = { path: '^/sales/invoices$' }
const NEW_INVOICE = { path: '^/sales/invoices/new$' }
const CANCELS = { path: '^/sales/cancel-orders$' }
const NEW_CANCEL = { path: '^/sales/cancel-orders/new$' }
const CANCEL = { path: '^/sales/cancel-orders/(?!new$)[^/]+$' }
const PROFORMAS = { path: '^/sales/proformas$' }
const PROFORMA = { path: '^/sales/proformas/[^/]+$' }
const RETURNS = { path: '^/sales/returns$' }
const NEW_RETURN = { path: '^/sales/returns/new$' }
const RETURN = { path: '^/sales/returns/(?!new$)[^/]+$' }
const DEBIT_NOTES = { path: '^/sales/debit-notes$' }
const NEW_DEBIT_NOTE = { path: '^/sales/debit-notes/new$' }
const DEBIT_NOTE = { path: '^/sales/debit-notes/(?!new$)[^/]+$' }
const CASH_SALES = { path: '^/sales/cash-sales$' }
const CASH_SALE = { path: '^/sales/cash-sales/' }
const ITEMS = { path: '^/core/items$' }
const ITEM = { path: '^/core/items/(?!new$)[^/]+$' }
const PO = { path: '^/purchase/orders/(?!new$)[^/]+$' }
const CREDIT = { path: '^/sales/settings/credit-control$' }
const EXCLUDED = { path: '^/sales/settings/excluded-items$' }
const TEMPLATES = { path: '^/sales/settings/email-templates$' }

const billing = (extra: Partial<TourStep> = {}) => be('SALES_BILLING', 'billing', 'billing clerk', extra)
const store = (extra: Partial<TourStep> = {}) => be('SALES_STORE', 'store', 'store', extra)
const trans = (item: string, label: string, to: { path: string }) => openPage('transaction', 'Sales Transaction', item, label, to)
const bill = (item: string, label: string, to: { path: string }) => openPage('billing', 'Billing', item, label, to)
const policy = (item: string, label: string, to: { path: string }) => openPage('policies', 'Operation Policies', item, label, to)
const released = (title: string, text = confirmText('Release'), page?: { path: string }): TourStep => press('Release', status('RELEASED'), title, text, { page, waiting: 'Waiting for it to be released.' })

/** The item picker on a form that is not the order's. */
const pickItem = (button: string, page: { path: string }, line: string, text: string): TourStep[] => [
  { target: button, page, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'Add an item', text: 'Click the button.' },
  { target: 'item-picker', page, wait: { kind: 'appear', selector: line }, waiting: 'Waiting for the item on the document.', title: 'Pick the item', text, type: [{ field: 'Search', value: '{item}' }] },
]

const base: Pick<Tour, 'module' | 'journey' | 'pages'> = { module: 'sales', journey: true, pages: 'any' }
const book: Pick<Guide, 'book'> = { book: 'Sales' }
const from = (letter: string, key: string) => ({ guide: `guide.sales.${letter}`, key })

const ENQUIRY_TO_ORDER: Tour = {
  ...base,
  id: 'guide.sales.a',
  title: 'Enquiry, quotation, sales order',
  summary: 'From the first question to a released order.',
  requires: ['dev', 'sales:useEnquiries'],
  minutes: 7,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'A', rows: 6, cast: 'Sales agent', values: { customer: 'a customer of yours', item: 'an item' } },
  steps: [
    { title: 'Enquiry, quotation, sales order', text: 'Six steps, as a sales agent.' },
    agent('hqAgent', { row: 1 }),
    ...trans('enquiries', 'Enquiry', ENQUIRIES),
    { target: 'action:new-enquiry', page: ENQUIRIES, wait: { kind: 'page', to: NEW_ENQUIRY }, title: 'A new enquiry', text: 'Click Add new enquiry.' },
    { target: 'eq:customer', page: NEW_ENQUIRY, wait: { kind: 'use' }, title: 'Who asks', text: 'Type {customer}, pick it from the list, then Next.', type: [{ field: 'Customer', value: '{customer}' }], placement: 'right' },
    { target: 'eq:card', page: NEW_ENQUIRY, title: 'From Master Data', text: 'Look at the card.', expect: 'The customer’s credit limit, what they owe and their price list.', placement: 'left' },
    { target: 'eq:type', page: NEW_ENQUIRY, wait: { kind: 'use' }, must: true, title: 'The type', text: 'Pick a type, then Next.' },
    { target: 'eq:from', page: NEW_ENQUIRY, wait: { kind: 'use' }, must: true, title: 'Where it came from', text: 'Pick any source, then Next.' },
    { target: 'eq:description', page: NEW_ENQUIRY, wait: { kind: 'use' }, title: 'What they want', text: 'Type it, then Next.', type: [{ field: 'Description', value: 'Two for the new office' }] },
    ...pickItem('eq:add-item', NEW_ENQUIRY, 'input[aria-label^="Quantity of"]', 'Search {item}, tick it, set the quantity to 2 and click Add 1 item.'),

    press('Save and forward to agent', { kind: 'page', to: ENQUIRY }, 'Save and forward', 'Click Save and forward to agent.', { row: 2, page: NEW_ENQUIRY }),
    { target: 'page-header', page: ENQUIRY, remember: 'enquiry', title: '{enquiry}', text: 'Its number restarts every month.', expect: 'Forwarded.' },

    press('Create quotation', { kind: 'page', to: QUOTATION }, 'Quote it', 'Click Create quotation.', { row: 3, page: ENQUIRY }),
    { target: 'qt:totals', page: QUOTATION, remember: 'quotation', title: 'A draft quotation', text: 'Revision 0, with the enquiry’s item.', expect: '2 × the price list price, and the tax. The enquiry becomes Quoted.', placement: 'left' },

    { row: 4, target: 'qt:valid', page: QUOTATION, wait: { kind: 'use' }, title: 'Valid until', text: 'Click the calendar, then Clear. Then Next.' },
    press('Release', { kind: 'appear', selector: '[data-tour="qt:valid"] [role="alert"]' }, 'Try to release', confirmText('Release'), { page: QUOTATION, waiting: 'Waiting for the message under the date.' }),
    { target: 'qt:valid', page: QUOTATION, wait: { kind: 'use' }, must: true, title: 'It needs the date', text: 'Pick a day two weeks from now, then Next.', expect: 'A message: releasing needs a valid-until date.' },
    released('Release it', undefined, QUOTATION),
    press('Email', { kind: 'click' }, 'Email it', 'Click Email.', { page: QUOTATION }),
    { target: 'page-header', page: QUOTATION, title: 'Released and sent', text: 'It is locked now. No real email leaves the app.', expect: 'Released, and a message: Sent.' },

    press('Transfer to sales order', { kind: 'page', to: ORDER }, 'Turn it into an order', 'Click Transfer to sales order, then All lines.', { row: 5, page: QUOTATION }),
    { target: 'so:lines', page: ORDER, remember: 'order', title: 'A draft sales order', text: 'At the quoted price. The quotation reads Ordered.', expect: 'The item at the quotation’s price.', placement: 'top' },

    { row: 6, target: 'so:installation', page: ORDER, optional: true, wait: { kind: 'use' }, title: 'No installation', text: 'Pick Delivery only, then Next.' },
    release({ target: 'page-actions', pick: 'Release' }),
    { target: 'page-header', page: ORDER, title: '{order} is released', text: 'It is now on the Delivery Order waiting list.', expect: 'Released.' },
  ],
}

const QUOTATION_APPROVAL: Tour = {
  ...base,
  id: 'guide.sales.b',
  title: 'Quotation: approval, revise, lost',
  summary: 'A discount the Sales Manager approves, a new revision and a lost quotation.',
  requires: ['dev', 'sales:freePrices'],
  minutes: 8,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'B', rows: 5, cast: 'Sales agent, Sales manager', values: { customer: 'a customer of yours', customer2: 'another customer of yours', item: 'an item' } },
  steps: [
    { title: 'A quotation that needs approval', text: 'Five steps, as two people.' },
    agent('hqAgent', { row: 1 }),
    ...trans('quotations', 'Quotation', QUOTATIONS),
    { target: 'action:new-quotation', page: QUOTATIONS, wait: { kind: 'page', to: NEW_QUOTATION }, title: 'A new quotation', text: 'Click Add new quotation.' },
    { target: 'qt:customer', page: NEW_QUOTATION, wait: { kind: 'use' }, title: 'The customer', text: 'Type {customer}, pick it from the list, then Next.', type: [{ field: 'Customer', value: '{customer}' }], placement: 'right' },
    { target: 'qt:valid', page: NEW_QUOTATION, wait: { kind: 'use' }, must: true, title: 'Valid until', text: 'Pick a day two weeks from now if it is empty, then Next.' },
    ...pickItem('qt:add-line', NEW_QUOTATION, '[data-tour="qt:line"]', 'Search {item}, tick it, set the quantity to 5 and click Add 1 item.'),
    { target: 'qt:line', page: NEW_QUOTATION, wait: { kind: 'use' }, title: 'A 20% discount', text: 'Type the discount, then Next.', type: [{ field: 'Discount', value: '20' }], placement: 'top' },
    press('Save draft', { kind: 'page', to: QUOTATION }, 'Save it', 'Click Save draft.', { page: NEW_QUOTATION }),
    { target: 'qt:approval', page: QUOTATION, remember: 'quotation', title: 'It needs approval', text: '{quotation} cannot be released like this.', expect: 'The discount is above the limit (or the price is outside the range, where the company uses one). Request approval first.', placement: 'top' },

    { row: 2, target: 'qt:approval', page: QUOTATION, wait: { kind: 'use' }, title: 'Say why', text: 'Type a reason, then Next.', type: [{ field: 'Reason', value: 'Opening order for a new reseller' }], placement: 'top' },
    { target: 'qt:approval', page: QUOTATION, pick: 'Request approval', wait: status('PENDING_APPROVAL'), waiting: 'Waiting for the request to be sent.', title: 'Ask for approval', text: 'Click Request approval.', placement: 'top' },
    { target: 'page-header', page: QUOTATION, title: 'Waiting', text: 'It is locked until someone decides.', expect: 'Pending approval.' },

    ...approve('salesManager', 'quotation', 3, 'The reason, the lines and the estimated margin. The agent never sees the margin.'),

    agent('hqAgent', { row: 4 }),
    ...trans('quotations', 'Quotation', QUOTATIONS),
    openDoc(QUOTATIONS, 'quotation', QUOTATION, 'Open the quotation'),
    released('Release it', undefined, QUOTATION),
    press('Revise', status('DRAFT'), 'Revise it', confirmText('Revise'), { page: QUOTATION, waiting: 'Waiting for the new revision.' }),
    { target: 'page-header', page: QUOTATION, title: 'Revision 1', text: 'Under the same number.', expect: 'Draft. Revision 0 stays read only, under History.' },

    ...row(5, trans('quotations', 'Quotation', QUOTATIONS)),
    { target: 'action:new-quotation', page: QUOTATIONS, wait: { kind: 'page', to: NEW_QUOTATION }, title: 'One more', text: 'Click Add new quotation.' },
    { target: 'qt:customer', page: NEW_QUOTATION, wait: { kind: 'use' }, title: 'Another customer', text: 'Type {customer2}, pick it from the list, then Next.', type: [{ field: 'Customer', value: '{customer2}' }], placement: 'right' },
    { target: 'qt:valid', page: NEW_QUOTATION, wait: { kind: 'use' }, must: true, title: 'Valid until', text: 'Pick a day two weeks from now if it is empty, then Next.' },
    ...pickItem('qt:add-line', NEW_QUOTATION, '[data-tour="qt:line"]', 'Search {item}, tick it, keep the quantity at 1 and click Add 1 item.'),
    press('Save draft', { kind: 'page', to: QUOTATION }, 'Save it', 'Click Save draft.', { page: NEW_QUOTATION }),
    released('Release it', undefined, QUOTATION),
    press('Mark as lost', { kind: 'appear', selector: '[data-tour="reason-dialog"]' }, 'The customer bought elsewhere', 'Click Mark as lost.', { page: QUOTATION }),
    { target: 'reason-dialog', page: QUOTATION, pick: 'Mark as lost', wait: { kind: 'click' }, title: 'Try with no reason', text: 'Click Mark as lost with the reason empty.' },
    { target: 'reason-dialog', page: QUOTATION, wait: status('LOST'), waiting: 'Waiting for it to be marked.', title: 'A reason is required', text: 'Type why, then click Mark as lost.', type: [{ field: 'Why', value: 'Bought from another supplier' }] },
    { target: 'page-header', page: QUOTATION, title: 'Lost', text: 'The reason counts in the Quotation conversion report.', expect: 'Lost.' },
  ],
}

const OVER_LIMIT: Tour = {
  ...base,
  id: 'guide.sales.c',
  title: 'Over the credit limit: rejected, then approved',
  summary: 'An order over the customer’s limit, sent back once and approved the second time.',
  requires: ['dev'],
  minutes: 10,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'C', rows: 7, cast: 'Finance manager, Sales agent, Sales manager', values: { customer: 'a customer of yours', item: 'an item', limit: '5000', price: 'a price near the list', qty: '20' } },
  steps: [
    { title: 'Over the credit limit', text: 'Seven steps, as three people.' },
    account({ row: 1 }),
    openModule('core', 'Core'),
    openCore('Customers & Suppliers', 'Open the customers', CUSTOMERS),
    { target: 'filters', page: CUSTOMERS, wait: { kind: 'use' }, title: 'Find the customer', text: 'Type it in the search, then Next.', type: [{ field: 'Search', value: '{customer}' }] },
    { target: 'list', page: CUSTOMERS, pick: '{customer}', wait: { kind: 'page', to: CUSTOMER }, title: 'Open it', text: 'Click its code.', placement: 'top' },
    { target: 'core:credit-limit', page: CUSTOMER, wait: { kind: 'use' }, title: 'The credit limit', text: 'Type the limit, then Next.', type: [{ field: 'Credit limit', value: '{limit}' }], why: 'Only the Finance Manager and the administrator can change credit.' },
    { target: 'action:save-customer', page: CUSTOMER, wait: { kind: 'appear', selector: '[data-tour="action:save-customer"]:disabled' }, waiting: 'Waiting for the customer to be saved.', title: 'Save it', text: 'Click Save changes. The change is logged with the old and new values.' },

    openModule('sales', 'Sales'),
    ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS),
    agent('hqAgent', { row: 2 }),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}, tick it, set the quantity to {qty} and click Add 1 item.'),
    { target: 'so:price', page: NEW_ORDER, when: ['sales:freePrices'], wait: { kind: 'use' }, title: 'The price', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: '{price}' }] },
    deliveryOnly(),
    saveDraft(NEW_ORDER),
    { target: 'so:approval', page: ORDER, remember: 'order', title: 'Credit check did not pass', text: '{order} cannot be released like this.', expect: 'Over the credit limit, with what the customer owes and their other open orders counted in. There is no Release button.', placement: 'top' },

    ...askApproval('Long-standing customer, paying this week', { reason: 3 }),

    ...reject('salesManager', 'order', 4, 'Ask for a deposit first'),

    agent('hqAgent', { row: 5 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'page-header', page: ORDER, title: 'Back in draft', text: 'There is no Rejected status in Sales.', expect: 'Draft, with the manager’s comment under the title.' },
    ...askApproval('The deposit is on its way'),

    ...approve('salesManager', 'order', 6, 'The request again, with the new note.'),

    agent('hqAgent', { row: 7 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    release(),
    { target: 'page-header', page: ORDER, title: '{order} is released', text: 'It waits for its delivery (guide D).', expect: 'Released.' },
  ],
}

const PART_DELIVERY: Tour = {
  ...base,
  id: 'guide.sales.d',
  title: 'Deliver part of an order',
  summary: 'Never more than the balance, and the rest stays open.',
  requires: ['dev'],
  minutes: 3,
  startAt: '/sales/deliveries',
  guide: { ...book, letter: 'D', rows: 3, cast: 'Store', after: ['C'], from: { order: from('c', 'order') }, values: { order: 'a released order', tooMany: '21', part: '15' } },
  steps: [
    { title: 'Deliver part of an order', text: 'Three steps, as the store, for {order} from guide C.' },
    store({ row: 1 }),
    ...trans('deliveries', 'Delivery Order', DELIVERIES),
    { target: 'dl:waiting', page: DELIVERIES, pick: '{order}', wait: { kind: 'use' }, title: 'The waiting list', text: 'Find {order}, then Next.', placement: 'top' },
    { target: 'dl:waiting', page: DELIVERIES, wait: { kind: 'page', to: DELIVERY }, title: 'Create its delivery order', text: 'On the row of {order}, click Create DO. If it says Waiting for stock, click that, then Create DO anyway.', placement: 'top' },
    { target: 'do:lines', page: DELIVERY, remember: 'delivery', title: 'A delivery order', text: 'For the whole balance.', expect: 'The item, with its balance.', placement: 'top' },

    { row: 2, target: 'do:lines', page: DELIVERY, wait: { kind: 'use' }, title: 'One too many', text: 'Type the quantity, then Next.', type: [{ field: 'Deliver now', value: '{tooMany}' }], placement: 'top' },
    press('Save draft', { kind: 'click' }, 'Try to save', 'Click Save draft.', { page: DELIVERY }),
    { row: 3, target: 'do:lines', page: DELIVERY, wait: { kind: 'use' }, title: 'Refused', text: 'Deliver now cannot be more than the balance. Type {part} instead, then Next.', type: [{ field: 'Deliver now', value: '{part}' }], placement: 'top' },
    press('Confirm delivery', status('CONFIRMED'), 'Confirm it', confirmText('Confirm delivery'), { page: DELIVERY, waiting: 'Waiting for the delivery to be confirmed.' }),
    { target: 'do:progress', page: DELIVERY, title: 'Delivered', text: 'The amber note says the warehouse is not told yet.', expect: 'The order is Partial, and how many are still to go.', placement: 'left' },
  ],
}

const INVOICE_APPROVALS: Tour = {
  ...base,
  id: 'guide.sales.e',
  title: 'An invoice that needs approval',
  summary: 'Only what was delivered is invoiced, and a price or the credit limit may need approval first.',
  requires: ['dev'],
  minutes: 8,
  startAt: '/sales/invoices',
  guide: { ...book, letter: 'E', rows: 5, cast: 'Billing, Sales manager, Finance manager', after: ['D'], from: { order: from('c', 'order') }, values: { order: 'the order from guide C', customer: 'the customer of that order' } },
  steps: [
    { title: 'An invoice that needs approval', text: 'Five steps, as three people, for {order} from guide C.' },
    billing({ row: 1 }),
    ...bill('invoices', 'Invoice', INVOICES),
    press('Create from sales order', { kind: 'page', to: NEW_INVOICE }, 'From the order', 'Click Create from sales order.', { page: INVOICES }),
    { target: 'ci:orders', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'The customer and the order', text: 'Type {customer} and pick it. Tick {order} if it is not ticked already. Then Next.', type: [{ field: 'Customer', value: '{customer}' }], placement: 'right' },
    { target: 'ci:create', page: NEW_INVOICE, wait: { kind: 'page', to: INVOICE }, waiting: 'Waiting for the draft.', title: 'Create the draft', text: 'Only what was delivered can be invoiced. Click Create invoice draft.' },
    { target: 'inv:approval', page: INVOICE, remember: 'invoice', title: 'Approval needed', text: '{invoice} cannot be released like this.', expect: 'Over the credit limit, and below the price list unless the price was already approved on the order.', placement: 'top' },

    { row: 2, target: 'inv:approval', page: INVOICE, wait: { kind: 'use' }, title: 'Say why', text: 'Type a reason, then Next.', type: [{ field: 'Reason', value: 'As agreed on the order' }], placement: 'top' },
    { target: 'inv:approval', page: INVOICE, pick: 'Request approval', wait: status('PENDING_APPROVAL'), waiting: 'Waiting for the request to be sent.', title: 'Ask for approval', text: 'Click Request approval. A price is decided first, then the credit.', placement: 'top' },

    salesManager('salesManager', { row: 3 }),
    ...openRequest('invoice', 'The price against the price list.', { optional: true }),
    approveIt({ optional: true }),
    { title: 'The price', text: 'Where the price was already approved on the order, nothing of {invoice} waits for the Sales Manager. Otherwise it is approved now, and the credit is next.' },

    account({ row: 4 }),
    ...openRequest('invoice', 'What the customer owes, and what the limit is.'),
    approveIt(),

    billing({ row: 5 }),
    ...bill('invoices', 'Invoice', INVOICES),
    openDoc(INVOICES, 'invoice', INVOICE, 'Open the invoice'),
    { target: 'action:release-invoice', page: INVOICE, wait: status('RELEASED'), waiting: 'Waiting for the invoice to be released.', title: 'Release it', text: confirmText('Release') },
    press('Print', { kind: 'page', to: { path: '^/sales/invoices/[^/]+/print$' } }, 'The tax invoice', 'Click Print.', { page: INVOICE }),
    { target: 'print:bar', page: { path: '^/sales/invoices/[^/]+/print$' }, wait: { kind: 'page', to: INVOICE }, title: 'On A4', text: 'Look at it, then click Back at the top left.', expect: 'An A4 tax invoice, with the e-Invoice pending.' },
    press('Email to customer', { kind: 'click' }, 'Email it', 'Click Email to customer.', { page: INVOICE }),
    { target: 'page-header', page: INVOICE, title: 'Released and sent', text: 'Nobody approves their own request: billing’s inbox never shows this invoice.', expect: 'Released, Unpaid, due in 30 days, and a message: Sent.' },
  ],
}

const CANCEL_BALANCE: Tour = {
  ...base,
  id: 'guide.sales.f',
  title: 'Cancel the undelivered balance',
  summary: 'The agent drafts it, the Sales Manager releases it.',
  requires: ['dev'],
  minutes: 4,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'F', rows: 3, cast: 'Sales agent, Sales manager', after: ['D'], from: { order: from('c', 'order') }, values: { order: 'the order from guide C' } },
  steps: [
    { title: 'Cancel the balance', text: 'Three steps, as two people, for {order} from guide C.' },
    agent('hqAgent', { row: 1 }),
    ...trans('cancel-orders', 'Cancel Order', CANCELS),
    press('New cancellation', { kind: 'page', to: NEW_CANCEL }, 'A new cancellation', 'Click New cancellation.', { page: CANCELS }),
    { target: 'co:header', page: NEW_CANCEL, wait: { kind: 'use' }, title: 'Which order, and why', text: 'Pick {order} and a reason, then Next.' },
    { target: 'co:lines', page: NEW_CANCEL, title: 'What is cancelled', text: 'Only what was not delivered.', expect: 'Ordered, delivered, and the rest to cancel.', placement: 'top' },
    press('Save draft', { kind: 'page', to: CANCEL }, 'Save it', 'Click Save draft.', { page: NEW_CANCEL }),
    { target: 'page-header', page: CANCEL, remember: 'cancel', title: '{cancel}', text: 'The agent cannot release it.', expect: 'Draft, with Release cancellation greyed out.' },

    salesManager('salesManager', { row: 2 }),
    press('Release cancellation', status('RELEASED'), 'Release it', confirmText('Release cancellation'), { page: CANCEL, waiting: 'Waiting for it to be released.' }),
    { target: 'page-header', page: CANCEL, title: 'Released', text: 'Nothing is posted to accounts.', expect: 'Released.' },

    ...row(3, toOrders()),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'page-header', page: ORDER, title: '{order}', text: 'Nothing is left to deliver.', expect: 'Balance cancelled.' },
  ],
}

const DEPOSIT: Tour = {
  ...base,
  id: 'guide.sales.g',
  title: 'A deposit: delivery on hold, then used on the invoice',
  summary: 'A proforma asks for a deposit; delivery waits for it, and the invoice knocks it off.',
  requires: ['dev'],
  minutes: 10,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'G', rows: 6, cast: 'Sales agent, Billing, Store', values: { customer: 'a customer of yours', item: 'an item in stock' } },
  steps: [
    { title: 'A deposit first', text: 'Six steps, as three people.' },
    agent('hqAgent', { row: 1 }),
    ...toOrders(),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}, tick it, set the quantity to 2 and click Add 1 item.'),
    deliveryOnly(),
    saveDraft(NEW_ORDER),
    release(),
    { target: 'so:totals', page: ORDER, remember: 'order', title: '{order} is released', text: 'Its total is what the deposit is worked out from.', expect: 'Released.', placement: 'left' },

    billing({ row: 2 }),
    ...bill('proformas', 'Proforma Invoice', PROFORMAS),
    press('New proforma', { kind: 'appear', selector: '[data-tour="pf:pick"]' }, 'Ask for a deposit', 'Click New proforma.', { page: PROFORMAS }),
    { target: 'pf:pick', page: PROFORMAS, pick: '{order}', wait: { kind: 'page', to: PROFORMA }, title: 'For which order', text: 'Click {order}.' },
    { target: 'pf:header', page: PROFORMA, remember: 'proforma', wait: { kind: 'use' }, title: '30%, and by when', text: 'Keep Deposit % at 30, pick a Pay by date, then Next.' },
    { target: 'pf:value', page: PROFORMA, title: 'What is asked', text: 'It is a payment request only: nothing goes to accounts or LHDN.', expect: 'The deposit, 30% of the order.', placement: 'left' },
    press('Release', status('SENT'), 'Release it', confirmText('Release'), { page: PROFORMA, waiting: 'Waiting for it to be released.' }),
    press('Email to customer', { kind: 'click' }, 'Email it', 'Click Email to customer.', { page: PROFORMA }),

    store({ row: 3 }),
    ...trans('deliveries', 'Delivery Order', DELIVERIES),
    { target: 'dl:waiting', page: DELIVERIES, wait: { kind: 'page', to: DELIVERY }, title: 'Create its delivery order', text: 'On the row of {order}, click Deposit, then Create DO anyway: it can be prepared, not confirmed.', placement: 'top' },
    { target: 'page-actions', page: DELIVERY, remember: 'delivery', title: 'On hold', text: 'Look at Confirm delivery and at the red note.', expect: 'Delivery is on hold until the deposit is paid: Confirm delivery is greyed out.' },

    billing({ row: 4 }),
    ...bill('proformas', 'Proforma Invoice', PROFORMAS),
    openDoc(PROFORMAS, 'proforma', PROFORMA, 'Open the proforma'),
    { target: 'pf:stub', page: PROFORMA, wait: status('PAID'), waiting: 'Waiting for the payment.', title: 'The deposit is paid', text: 'Click Record payment (Finance stub). It stands in for Finance, in dev mode only.' },
    { target: 'page-header', page: PROFORMA, title: 'Paid', text: 'Delivery can go ahead.', expect: 'Paid.' },

    store({ row: 5 }),
    ...trans('deliveries', 'Delivery Order', DELIVERIES),
    { target: 'dl:list', page: DELIVERIES, pick: '{order}', wait: { kind: 'page', to: DELIVERY }, title: 'Open the delivery order', text: 'Click the delivery order of {order}.', placement: 'top' },
    press('Confirm delivery', status('CONFIRMED'), 'Confirm it', confirmText('Confirm delivery'), { page: DELIVERY, waiting: 'Waiting for the delivery to be confirmed.' }),
    { target: 'do:progress', page: DELIVERY, title: 'Delivered', text: 'All of it.', expect: 'The order is Done.', placement: 'left' },

    billing({ row: 6 }),
    ...bill('invoices', 'Invoice', INVOICES),
    press('Create from sales order', { kind: 'page', to: NEW_INVOICE }, 'From the order', 'Click Create from sales order.', { page: INVOICES }),
    { target: 'ci:orders', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'The customer and the order', text: 'Type {customer} and pick it. Tick {order} if it is not ticked already. Then Next.', type: [{ field: 'Customer', value: '{customer}' }], placement: 'right' },
    { target: 'ci:create', page: NEW_INVOICE, wait: { kind: 'page', to: INVOICE }, waiting: 'Waiting for the draft.', title: 'Create the draft', text: 'Click Create invoice draft.' },
    { target: 'action:release-invoice', page: INVOICE, remember: 'invoice', wait: status('RELEASED'), waiting: 'Waiting for the invoice to be released.', title: 'Release {invoice}', text: confirmText('Release') },
    { target: 'inv:amounts', page: INVOICE, title: 'The deposit is used', text: 'Once, on the order’s next invoice. The proforma reads Used.', expect: 'The invoice total, less the deposit, is the balance due.', placement: 'left' },
  ],
}

const SALES_RETURN: Tour = {
  ...base,
  id: 'guide.sales.h',
  title: 'A return from a released invoice',
  summary: 'The agent drafts it, the store receives the goods, and the invoice’s balance drops.',
  requires: ['dev'],
  minutes: 5,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'H', rows: 3, cast: 'Sales agent, Store, Billing', after: ['G'], from: { invoice: from('g', 'invoice') }, values: { invoice: 'a released invoice' } },
  steps: [
    { title: 'A sales return', text: 'Three steps, as three people, from {invoice} of guide G.' },
    agent('hqAgent', { row: 1 }),
    ...bill('returns', 'Sales Return', RETURNS),
    press('New return', { kind: 'appear', selector: '[data-tour="sr:pick"]' }, 'Goods come back', 'Click New return.', { page: RETURNS }),
    { target: 'sr:pick', page: RETURNS, pick: '{invoice}', wait: { kind: 'page', to: NEW_RETURN }, title: 'From which invoice', text: 'Click {invoice}. Type its number in the search if it is not shown.' },
    { target: 'sr:header', page: NEW_RETURN, wait: { kind: 'use' }, title: 'Why, and where to', text: 'Pick a reason, and Back to stock under Return goods to. Then Next.' },
    { target: 'sr:lines', page: NEW_RETURN, wait: { kind: 'use' }, title: 'How many', text: 'Type the quantity, then Next.', type: [{ field: 'Return now', value: '1' }], placement: 'top' },
    press('Save draft', { kind: 'page', to: RETURN }, 'Save it', 'Click Save draft.', { page: NEW_RETURN }),
    { target: 'sr:credit', page: RETURN, remember: 'return', title: '{return}', text: 'Receiving goods back is the store’s job: the agent’s Release return is greyed out.', expect: 'What the customer gets back, with the tax.', placement: 'left' },

    store({ row: 2 }),
    press('Release return', status('RELEASED'), 'The goods are back', confirmText('Release return'), { page: RETURN, waiting: 'Waiting for it to be released.' }),
    { target: 'page-header', page: RETURN, title: 'Released', text: 'The stock in and the credit note wait for Inventory and Finance.', expect: 'Released.' },

    billing({ row: 3 }),
    ...bill('invoices', 'Invoice', INVOICES),
    openDoc(INVOICES, 'invoice', INVOICE, 'Open the invoice'),
    { target: 'inv:amounts', page: INVOICE, title: 'Less to pay', text: 'The return is listed beside Credited.', expect: 'The balance due is lower by the credit.', placement: 'left' },
  ],
}

const DEBIT: Tour = {
  ...base,
  id: 'guide.sales.i',
  title: 'A debit note for a missed charge',
  summary: 'An extra charge on a released invoice. It never moves stock.',
  requires: ['dev'],
  minutes: 4,
  startAt: '/sales/invoices',
  guide: { ...book, letter: 'I', rows: 3, cast: 'Billing', after: ['G'], from: { invoice: from('g', 'invoice') }, values: { invoice: 'a released invoice', item: 'a charge or an item', charge: '50.00' } },
  steps: [
    { title: 'A debit note', text: 'Three steps, as billing, on {invoice} of guide G.' },
    billing({ row: 1 }),
    ...bill('debit-notes', 'Debit Note', DEBIT_NOTES),
    press('New debit note', { kind: 'page', to: NEW_DEBIT_NOTE }, 'A missed charge', 'Click New debit note.', { page: DEBIT_NOTES }),
    { target: 'dn:invoice', page: NEW_DEBIT_NOTE, wait: { kind: 'use' }, must: true, title: 'On which invoice', text: 'Pick {invoice}, then Next.' },
    ...pickItem('dn:add-charge', NEW_DEBIT_NOTE, '[data-tour="dn:line"]', 'Search {item}, tick it, keep the quantity at 1 and click Add 1 item.'),
    { target: 'dn:line', page: NEW_DEBIT_NOTE, wait: { kind: 'use' }, title: 'The charge', text: 'Type the price, then Next.', type: [{ field: 'Unit price', value: '{charge}' }], placement: 'top' },
    press('Save draft', { kind: 'page', to: DEBIT_NOTE }, 'Save it', 'Click Save draft.', { page: NEW_DEBIT_NOTE }),
    { target: 'dn:totals', page: DEBIT_NOTE, remember: 'debitNote', title: '{debitNote}', text: 'No stock moves.', expect: 'The charge and its tax.', placement: 'left' },

    { ...released('Release it', undefined, DEBIT_NOTE), row: 2 },
    { target: 'page-header', page: DEBIT_NOTE, title: 'Released', text: 'It is locked.', expect: 'Released.' },

    ...row(3, bill('invoices', 'Invoice', INVOICES)),
    openDoc(INVOICES, 'invoice', INVOICE, 'Open the invoice'),
    { target: 'inv:amounts', page: INVOICE, title: 'More to pay', text: 'The debit note is listed.', expect: 'The balance due is higher by the charge and its tax.', placement: 'left' },
  ],
}

const CASH: Tour = {
  ...base,
  id: 'guide.sales.j',
  title: 'A cash sale at the counter',
  summary: 'Tax included, money received and change, and one document for all of it.',
  requires: ['dev'],
  minutes: 4,
  startAt: '/sales/cash-sales',
  guide: { ...book, letter: 'J', rows: 3, cast: 'Administrator', values: { item: 'an item in stock', short: '50.00', enough: '100.00' } },
  steps: [
    { title: 'A cash sale', text: 'Three steps, as the administrator.' },
    admin({ row: 1 }),
    ...bill('cash-sales', 'Cash Sales', CASH_SALES),
    { target: 'action:new-cash-sale', page: CASH_SALES, wait: { kind: 'page', to: CASH_SALE }, title: 'A new cash sale', text: 'Click the button.' },
    { target: 'cs:scan', page: CASH_SALE, wait: { kind: 'appear', selector: '[data-tour="cs:line"]' }, waiting: 'Waiting for the item.', title: 'Scan the item', text: 'Type its code and press Enter, as a scanner does.', type: [{ field: 'Scan', value: '{item}' }] },
    { target: 'cs:totals', page: CASH_SALE, title: 'What to pay', text: 'The customer is C-CASH, with no credit check.', expect: 'The price with the tax included in it.', placement: 'left' },

    { row: 2, target: 'cs:payment', page: CASH_SALE, wait: { kind: 'use' }, title: 'Not enough', text: 'Cash is picked. Type the amount received, then Next.', type: [{ field: 'Amount received', value: '{short}' }], placement: 'top' },
    { target: 'action:take-payment', page: CASH_SALE, wait: { kind: 'click' }, title: 'Try to release', text: 'Click Take payment and release.' },
    { target: 'cs:payment', page: CASH_SALE, wait: { kind: 'use' }, title: 'It is refused', text: 'While there is a balance it cannot be released. Type enough, then Next.', type: [{ field: 'Amount received', value: '{enough}' }], placement: 'top' },

    { row: 3, target: 'cs:own', page: CASH_SALE, wait: { kind: 'use' }, title: 'Its own e-Invoice?', text: 'Pick yes, look, then pick no again and click Next.', expect: 'An own e-Invoice asks the buyer’s name and TIN. Without it, the sale goes into the monthly consolidated e-Invoice, due the 7th of next month.' },
    { target: 'action:take-payment', page: CASH_SALE, wait: status('RELEASED'), waiting: 'Waiting for the sale to be released.', title: 'Take the money', text: 'Click Take payment and release, then the same in the question that opens.' },
    { target: 'cs:totals', page: CASH_SALE, title: 'Done', text: 'The sale, the payment and the stock out, on one document.', expect: 'Paid, with the change to give.', placement: 'left' },
  ],
}

const BUY_TO_ORDER: Tour = {
  ...base,
  id: 'guide.sales.k',
  title: 'Buy to order: Sales and Purchase together',
  summary: 'An order drafts its purchase order by itself, and the goods received show on the order.',
  requires: ['dev'],
  minutes: 12,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'K', rows: 7, cast: 'Administrator, Sales agent, Buyer, Store', values: { customer: 'a customer of yours', item: 'an item with a supplier', cost: '95.00' } },
  steps: [
    { title: 'Buy to order', text: 'Seven steps, as four people. The two modules talk only through events, every 5 seconds.' },
    admin({ row: 1 }),
    openModule('core', 'Core'),
    openCore('Items & Units', 'Open the items', ITEMS),
    { target: 'filters', page: ITEMS, wait: { kind: 'use' }, title: 'Find the item', text: 'Type its code in the search, then Next.', type: [{ field: 'Search', value: '{item}' }] },
    { target: 'list', page: ITEMS, pick: '{item}', wait: { kind: 'page', to: ITEM }, title: 'Open it', text: 'Click its code.', placement: 'top' },
    { target: 'core:buy-to-order', page: ITEM, wait: { kind: 'use' }, title: 'Buy to order', text: 'Turn on Buy to order only, then Next.' },
    { target: 'action:save-item', page: ITEM, wait: { kind: 'appear', selector: '[data-tour="action:save-item"]:disabled' }, waiting: 'Waiting for the item to be saved.', title: 'Save it', text: 'Click Save changes.' },

    openModule('sales', 'Sales'),
    ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS),
    agent('hqAgent', { row: 2 }),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}, tick it, set the quantity to 3 and click Add 1 item.'),
    deliveryOnly(),
    saveDraft(NEW_ORDER),
    release(),
    { target: 'page-header', page: ORDER, remember: 'order', title: '{order} is released', text: 'Purchase drafts a purchase order for it within a few seconds.' },
    { target: 'menu:orders', placement: 'right', wait: { kind: 'page', to: ORDERS }, title: 'Give it 5 seconds', text: 'Click Sales Order.' },
    openDoc(ORDERS, 'order', ORDER, 'Open it again'),
    { target: 'so:lines', page: ORDER, title: 'Its purchase order', text: 'Not there yet? Open the order again from the list.', expect: 'A PO number under the line: Purchase drafted it when the order was released.', placement: 'top' },

    be('PURCHASE_BUYER', 'buyer', 'buyer', { row: 3, go: '/purchase/orders', why: 'Purchase Order is open for the buyer: the sales agent has no access there.' }),
    { target: 'list', page: { path: '^/purchase/orders$' }, pick: '{order}', wait: { kind: 'page', to: PO }, title: 'Open its purchase order', text: 'Click the draft whose source is {order} · auto.', placement: 'top' },
    { target: 'po:lines', page: PO, remember: 'po', wait: { kind: 'use' }, title: '{po}', text: 'If the price is 0, type it. Then Next.', type: [{ field: 'Unit price', value: '{cost}' }], expect: 'The item and quantity of the order, for its supplier.', placement: 'top' },
    press('Release', status('RELEASED'), 'Release it', confirmText('Release'), { page: PO, waiting: 'Waiting for it to be released.' }),

    be('STORE', 'purchaseStore', 'store', { row: 4 }),
    press('Receive goods', { kind: 'page', to: { path: '^/purchase/receipts/' } }, 'The goods arrive', 'Click Receive goods.', { page: PO }),
    { target: 'grn:header', page: { path: '^/purchase/receipts/' }, wait: { kind: 'use' }, title: 'The supplier’s delivery order', text: 'Type its number under Supplier DO no, then Next.' },
    { target: 'grn:lines', page: { path: '^/purchase/receipts/' }, wait: { kind: 'use' }, title: 'Count what arrived', text: 'Keep all 3, pick a rack under Put away to, then Next.', placement: 'top' },
    press('Save draft', { kind: 'page', to: { path: '^/purchase/receipts/(?!new$)[^/]+$' } }, 'Save it', 'Click Save draft.', { page: { path: '^/purchase/receipts/' } }),
    press('Confirm receipt', status('DONE', 'PARTIAL'), 'Confirm it', confirmText('Confirm receipt'), { page: { path: '^/purchase/receipts/' }, waiting: 'Waiting for the receipt to be confirmed.' }),

    agent('hqAgent', { row: 5, go: '/sales/orders' }),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'so:lines', page: ORDER, title: 'Received', text: 'Not there yet? Open the order again after 5 seconds.', expect: 'In green, the PO and received. The activity says the goods can be delivered.', placement: 'top' },

    store({ row: 6 }),
    ...trans('deliveries', 'Delivery Order', DELIVERIES),
    { target: 'dl:waiting', page: DELIVERIES, title: 'Ready to deliver', text: 'Find {order} on the waiting list.', expect: 'A green Received chip and Create DO.', placement: 'top' },

    admin({ row: 7 }),
    openModule('core', 'Core'),
    openCore('Items & Units', 'Open the items', ITEMS),
    { target: 'filters', page: ITEMS, wait: { kind: 'use' }, title: 'Find the item', text: 'Type its code in the search, then Next.', type: [{ field: 'Search', value: '{item}' }] },
    { target: 'list', page: ITEMS, pick: '{item}', wait: { kind: 'page', to: ITEM }, title: 'Open it', text: 'Click its code.', placement: 'top' },
    { target: 'core:buy-to-order', page: ITEM, wait: { kind: 'use' }, title: 'As it was', text: 'Turn off Buy to order only, then Next.' },
    { target: 'action:save-item', page: ITEM, wait: { kind: 'appear', selector: '[data-tour="action:save-item"]:disabled' }, waiting: 'Waiting for the item to be saved.', title: 'Save it', text: 'Click Save changes.' },
  ],
}

const FLOW_AND_POLICIES: Tour = {
  ...base,
  id: 'guide.sales.l',
  title: 'Document flow and policies',
  summary: 'Every document of one order, a credit block, an excluded item, numbers and email templates.',
  requires: ['dev'],
  minutes: 9,
  startAt: '/sales/orders',
  guide: {
    ...book,
    letter: 'L',
    rows: 5,
    cast: 'Sales agent, Administrator',
    after: ['C', 'G', 'H', 'I'],
    from: { order: from('g', 'order') },
    values: { order: 'the order from guide G', customer: 'the customer over the limit (guide C)', item: 'an item', qty: '20', item2: 'another item', branch: 'your branch', template: 'Invoice' },
  },
  steps: [
    { title: 'Document flow and policies', text: 'Five steps, as two people.' },
    agent('hqAgent', { row: 1 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    press('Document flow', { kind: 'page', to: { path: '^/sales/orders/[^/]+/flow$' } }, 'Its documents', 'Click Document flow.', { page: ORDER }),
    { target: 'flow:chain', page: { path: '^/sales/orders/[^/]+/flow$' }, title: 'In order', text: 'Each opens its document.', expect: 'Proforma, order, delivery, invoice and return, plus the debit note.' },

    admin({ row: 2 }),
    ...policy('credit-control', 'Credit Control', CREDIT),
    { target: 'cc:rules', page: CREDIT, wait: { kind: 'use' }, title: 'Block instead', text: 'For Sales Order, pick Block under Over credit limit, then Next.', placement: 'top' },
    press('Save policy', { kind: 'appear', selector: '[data-tour="page-actions"] button.erp-btn-add:disabled' }, 'Save it', 'Click Save policy.', { page: CREDIT, waiting: 'Waiting for the policy to be saved.' }),
    ...toOrders(),
    agent('hqAgent'),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}, tick it, set the quantity to {qty} and click Add 1 item.'),
    saveDraft(NEW_ORDER),
    { target: 'so:approval', page: ORDER, title: 'Blocked', text: 'It is kept as a draft, but nobody can approve it away.', expect: 'Policy for Sales Order: block, with the limit and the numbers. There is no Request approval and no Release.', placement: 'top' },
    press('Delete draft', { kind: 'page', to: ORDERS }, 'Take it away', 'Click Delete draft, then Delete draft again in the question that opens.', { page: ORDER, waiting: 'Waiting for the draft to be deleted.' }),
    admin(),
    ...policy('credit-control', 'Credit Control', CREDIT),
    { target: 'cc:rules', page: CREDIT, wait: { kind: 'use' }, title: 'As it was', text: 'For Sales Order, pick Require approval again, then Next.', placement: 'top' },
    press('Save policy', { kind: 'appear', selector: '[data-tour="page-actions"] button.erp-btn-add:disabled' }, 'Save it', 'Click Save policy.', { page: CREDIT, waiting: 'Waiting for the policy to be saved.' }),

    ...row(3, policy('excluded-items', 'Excluded Items', EXCLUDED)),
    { target: 'ex:form', page: EXCLUDED, wait: { kind: 'use' }, title: 'Not for sale here', text: 'Pick {item2}, {branch} and a reason, then Next.', placement: 'left' },
    { target: 'ex:form', page: EXCLUDED, pick: 'Add exclusion', wait: { kind: 'click' }, title: 'Exclude it', text: 'Click Add exclusion.', placement: 'left' },
    { target: 'ex:list', page: EXCLUDED, title: 'Excluded', text: 'From today, for that branch.', expect: 'A row for {item2}, with your reason.', placement: 'top' },
    ...toOrders(),
    agent('hqAgent'),
    newOrder(),
    pickCustomer(),
    { target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'What the agent sees', text: 'Click Add item.' },
    { target: 'item-picker', page: NEW_ORDER, wait: { kind: 'gone', selector: '[data-tour="item-picker"]' }, waiting: 'Waiting for you to close it.', title: 'Greyed out', text: 'Search {item2} and look, then click Cancel.', expect: '{item2} cannot be ticked, with your reason.', type: [{ field: 'Search', value: '{item2}' }] },
    admin(),
    ...policy('excluded-items', 'Excluded Items', EXCLUDED),
    { target: 'ex:list', page: EXCLUDED, pick: '{item2} > Remove', wait: { kind: 'click' }, title: 'As it was', text: 'Click Remove, then Remove again in the question that opens.', placement: 'top' },

    ...row(4, policy('document-types', 'Document Types', { path: '^/sales/settings/document-types$' })),
    { target: 'dt:numbers', page: { path: '^/sales/settings/document-types$' }, title: 'Numbering', text: 'Read the table.', expect: 'The enquiry’s EQ-YYMM-#### restarting monthly, and the next number of each document.', placement: 'top' },

    ...row(5, policy('email-templates', 'Email Templates', TEMPLATES)),
    { target: 'et:list', page: TEMPLATES, pick: '{template}', wait: { kind: 'click' }, title: 'The invoice email', text: 'Click {template}.', placement: 'right' },
    { target: 'et:preview', page: TEMPLATES, title: 'The preview', text: 'With real values.', expect: 'The subject and text the customer would get.', placement: 'left' },
    press('Send test to me', { kind: 'click' }, 'Send a test', 'Click Send test to me.', { page: TEMPLATES }),
    { target: 'page-header', page: TEMPLATES, title: 'Sent', text: 'No real email leaves the app: it is logged.', expect: 'A message: Sent.' },
  ],
}

const REPORT_TABS = [
  ['by-customer', 'Sales by customer'],
  ['by-item', 'Sales by item'],
  ['open-orders', 'Open orders'],
  ['quotation-conversion', 'Quotation conversion'],
  ['customer-aging', 'Customer aging'],
  ['invoice-register', 'Invoice register'],
  ['e-invoice-status', 'e-Invoice status'],
] as const

const REPORTS: Tour = {
  ...base,
  id: 'guide.sales.m',
  title: 'Reports and the Sales home',
  summary: 'Seven reports, and charts of your own.',
  requires: ['dev'],
  minutes: 6,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'M', rows: 4, cast: 'Sales manager, Sales agent', values: { mine: 'Only their own customers' } },
  steps: [
    { title: 'Reports and the home', text: 'Four steps, as two people.' },
    salesManager('salesManager', { row: 1 }),
    ...REPORT_TABS.flatMap(([key, label], i): TourStep[] => {
      const to = { path: `^/sales/reports/${key}$` }
      return i === 0 ? openPage('reports', 'Reports', `report-${key}`, label, to) : [{ target: `menu:report-${key}`, placement: 'right', wait: { kind: 'page', to }, title: label, text: `Click ${label}.` }]
    }),
    { target: 'page-header', page: { path: '^/sales/reports/' }, optional: true, title: 'All of them', text: 'The documents of the guides are in them: the lost quotation in Quotation conversion, the unpaid invoice in Customer aging.', expect: 'Filters kept in the address, and Export to Excel for a CSV.' },

    agent('hqAgent', { row: 2 }),
    { target: 'menu:report-open-orders', placement: 'right', wait: { kind: 'page', to: { path: '^/sales/reports/open-orders$' } }, title: 'Open orders', text: 'Click Open orders.' },
    { title: 'The agent’s own', text: 'Every report follows the data scope.', expect: '{mine}.' },

    salesManager('salesManager', { row: 3 }),
    { target: 'rail:footer', pick: 'Sales home', placement: 'right', wait: { kind: 'page', to: { path: '^/sales$' } }, title: 'The Sales home', text: 'Click the house at the bottom of the menu.' },
    { target: 'dashboard:add-chart', page: { path: '^/sales$' }, wait: { kind: 'appear', selector: '[data-tour="dash:add"]' }, title: 'Add charts', text: 'Click Add chart.' },
    { target: 'dash:add', page: { path: '^/sales$' }, wait: { kind: 'gone', selector: '[data-tour="dash:add"]' }, waiting: 'Waiting for you to finish.', title: 'Two charts', text: 'Click Add on Top customers and on What customers owe, by age, then Done.' },
    { target: 'dashboard', page: { path: '^/sales$' }, pick: '3 cols', wait: { kind: 'click' }, title: 'Three columns', text: 'Click 3 cols.' },
    { target: 'dashboard', page: { path: '^/sales$' }, title: 'Your own home', text: 'It follows you to any computer.', expect: 'Your charts · saved to your account.' },

    { row: 4, target: 'dashboard', page: { path: '^/sales$' }, pick: 'Clear', wait: { kind: 'appear', selector: '[data-tour="dash:reset"]' }, title: 'Clear them', text: 'Click Clear, then Clear again in the question that opens.' },
    { target: 'dash:reset', page: { path: '^/sales$' }, wait: { kind: 'gone', selector: '[data-tour="dash:reset"]' }, waiting: 'Waiting for the charts.', title: 'The defaults', text: 'Click Put back the default charts.' },
    { target: 'dashboard', page: { path: '^/sales$' }, title: 'Back', text: 'As for everyone who has not chosen their own.', expect: 'Default charts.' },
  ],
}

export const SALES_STANDARD_GUIDES: Tour[] = [ENQUIRY_TO_ORDER, QUOTATION_APPROVAL, OVER_LIMIT, PART_DELIVERY, INVOICE_APPROVALS, CANCEL_BALANCE, DEPOSIT, SALES_RETURN, DEBIT, CASH, BUY_TO_ORDER, FLOW_AND_POLICIES, REPORTS]
