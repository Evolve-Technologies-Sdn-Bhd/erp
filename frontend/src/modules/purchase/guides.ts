import { be, confirmText, inbox, openDoc, openPage, press, row, status } from '@/tours/guide.steps'
import type { Guide, Tour, TourStep } from '@/tours/types'

/**
 * Purchase as guides: the Handbook's Purchase journeys A–L, step for step (dev mode). One order runs through A to H and
 * J, from the demand list to its document flow. Amounts with tax are left to the screen.
 */

const DEMAND = { path: '^/purchase/demand$' }
const REQUESTS = { path: '^/purchase/requests$' }
const REQUEST = { path: '^/purchase/requests/(?!new$)[^/]+$' }
const NEW_RFQ = { path: '^/purchase/rfqs/new$' }
const RFQ = { path: '^/purchase/rfqs/(?!new$)[^/]+$' }
const ORDERS = { path: '^/purchase/orders$' }
const NEW_ORDER = { path: '^/purchase/orders/new$' }
const ORDER = { path: '^/purchase/orders/(?!new$)[^/]+$' }
const ORDER_FLOW = { path: '^/purchase/orders/[^/]+/flow$' }
const RECEIPTS = { path: '^/purchase/receipts$' }
const NEW_RECEIPT = { path: '^/purchase/receipts/new$' }
const RECEIPT = { path: '^/purchase/receipts/' }
const INVOICES = { path: '^/purchase/invoices$' }
const NEW_INVOICE = { path: '^/purchase/invoices/new$' }
const INVOICE = { path: '^/purchase/invoices/(?!new$)[^/]+$' }
const CANCELS = { path: '^/purchase/cancel-orders$' }
const NEW_CANCEL = { path: '^/purchase/cancel-orders/new$' }
const CANCEL = { path: '^/purchase/cancel-orders/(?!new$)[^/]+$' }
const RETURNS = { path: '^/purchase/returns$' }
const NEW_RETURN = { path: '^/purchase/returns/new$' }
const RETURN = { path: '^/purchase/returns/(?!new$)[^/]+$' }
const DEBIT_NOTES = { path: '^/purchase/debit-notes$' }
const NEW_DEBIT_NOTE = { path: '^/purchase/debit-notes/new$' }
const DEBIT_NOTE = { path: '^/purchase/debit-notes/' }
const CASH_LIST = { path: '^/purchase/cash-purchases$' }
const NEW_CASH = { path: '^/purchase/cash-purchases/new$' }
const CASH = { path: '^/purchase/cash-purchases/(?!new$)[^/]+$' }
const RULES = { path: '^/purchase/settings/approval-rules$' }
const DOC_TYPES = { path: '^/purchase/settings/document-types$' }
const TEMPLATES = { path: '^/purchase/settings/email-templates$' }
const HOME = { path: '^/purchase$' }

const store = (extra: Partial<TourStep> = {}) => be('STORE', 'purchaseStore', 'store', extra)
const buyer = (extra: Partial<TourStep> = {}) => be('PURCHASE_BUYER', 'buyer', 'buyer', extra)
const manager = (extra: Partial<TourStep> = {}) => be('PURCHASE_MANAGER', 'purchaseManager', 'purchasing manager', extra)
const trans = (item: string, label: string, to: { path: string }) => openPage('transaction', 'Purchase Transaction', item, label, to)
const bill = (item: string, label: string, to: { path: string }) => openPage('billing', 'Supplier Billing', item, label, to)
const policy = (item: string, label: string, to: { path: string }) => openPage('policies', 'Operation Policies', item, label, to)
const toOrders = () => trans('orders', 'Purchase Order', ORDERS)
const { openRequest, approveIt, rejectIt } = inbox({ code: 'P02' })

const released = (title: string, page: { path: string }, extra: Partial<TourStep> = {}): TourStep => press('Release', status('RELEASED'), title, confirmText('Release'), { page, waiting: 'Waiting for it to be released.', ...extra })
/** A field with a picker: typed, then picked from its list. */
const pickIn = (target: string, page: { path: string }, title: string, field: string, value: string, extra: Partial<TourStep> = {}): TourStep => ({
  target,
  page,
  wait: { kind: 'use' },
  title,
  text: `Type ${value}, pick it from the list, then Next.`,
  type: [{ field, value }],
  ...extra,
})
/** A settings page is saved once its Save button is grey again. */
const SAVED = { kind: 'appear', selector: '[data-tour="page-actions"] .erp-btn-primary:disabled' } as const

const base: Pick<Tour, 'module' | 'journey' | 'pages' | 'requires'> = { module: 'purchase', journey: true, pages: 'any', requires: ['dev'] }
const book: Pick<Guide, 'book'> = { book: 'Purchase' }
const from = (letter: string, key: string) => ({ guide: `guide.purchase.${letter}`, key })
const ORDER_OF_B = { from: { order: from('b', 'order') }, values: { order: 'the order from guide B' } }

const DEMAND_TO_REQUEST: Tour = {
  ...base,
  id: 'guide.purchase.a',
  title: 'From demand to a purchase request',
  summary: 'What has to be bought, asked for by the store, taken up by the buyer.',
  minutes: 5,
  startAt: '/purchase/demand',
  guide: { ...book, letter: 'A', rows: 3, cast: 'Store, Buyer', values: { item: 'an item that needs buying', qty: '20' } },
  steps: [
    { title: 'What to buy', text: 'Three steps, as two people. The order these guides make runs on through B to H, and J.' },
    store({ row: 1 }),
    ...trans('demand', 'Demand', DEMAND),
    {
      target: 'demand:list',
      page: DEMAND,
      wait: { kind: 'appear', selector: '[data-tour="page-actions"] .erp-btn-primary:not(:disabled)' },
      waiting: 'Waiting for you to tick an item.',
      title: 'What needs buying',
      text: 'Tick {item}. If its row is greyed out, tick another.',
      expect: 'A greyed row is covered already, by an order or a request.',
      placement: 'top',
    },
    press('Raise request for selected', { kind: 'page', to: REQUEST }, 'Ask for it', 'Click Raise request for selected.', { page: DEMAND }),
    { target: 'req:qty', page: REQUEST, remember: 'request', wait: { kind: 'use' }, title: 'A draft request', text: 'Type the quantity, then Next.', type: [{ field: 'Quantity', value: '{qty}' }], expect: 'The item, with a suggested quantity.', placement: 'top' },

    { row: 2, target: 'req:needed', page: REQUEST, wait: { kind: 'use' }, must: true, title: 'Needed by', text: 'Pick a day two weeks from now, then Next.' },
    { target: 'req:reason', page: REQUEST, wait: { kind: 'use' }, title: 'Why', text: 'Type the reason, then Next.', type: [{ field: 'Reason', value: 'For the customer orders' }] },
    press('Submit to Purchasing', status('SUBMITTED'), 'Submit it', 'Click Submit to Purchasing.', { page: REQUEST, waiting: 'Waiting for it to be submitted.' }),
    { target: 'page-header', page: REQUEST, title: '{request}', text: 'It waits for a buyer.', expect: 'Submitted.' },

    buyer({ row: 3 }),
    ...trans('requests', 'Purchase Request', REQUESTS),
    openDoc(REQUESTS, 'request', REQUEST, 'Open the request'),
    press('Ask suppliers (RFQ)', { kind: 'page', to: NEW_RFQ }, 'Ask suppliers', 'Click Ask suppliers (RFQ).', { page: REQUEST }),
    { target: 'page-header', page: NEW_RFQ, title: 'A new request for quote', text: 'It asks for the items of {request}. Guide B sends it; the request is Converted then.', expect: 'New request for quote, from {request}.' },
  ],
}

const RFQ_AWARD: Tour = {
  ...base,
  id: 'guide.purchase.b',
  title: 'Ask two suppliers, compare, award',
  summary: 'Two replies side by side, and the dearer one chosen with a reason.',
  minutes: 7,
  startAt: '/purchase/requests',
  guide: {
    ...book,
    letter: 'B',
    rows: 3,
    cast: 'Buyer',
    after: ['A'],
    from: { request: from('a', 'request') },
    values: { request: 'the request from guide A', supplier1: 'a supplier', supplier2: 'another supplier', price1: '78.00', price2: '75.00' },
  },
  steps: [
    { title: 'Ask two suppliers', text: 'Three steps, as the buyer, for {request} from guide A.' },
    buyer({ row: 1 }),
    ...trans('requests', 'Purchase Request', REQUESTS),
    openDoc(REQUESTS, 'request', REQUEST, 'Open the request'),
    press('Ask suppliers (RFQ)', { kind: 'page', to: NEW_RFQ }, 'Ask suppliers', 'Click Ask suppliers (RFQ).', { page: REQUEST }),
    { target: 'rfq:suppliers', page: NEW_RFQ, wait: { kind: 'use' }, title: 'Two suppliers', text: 'Add {supplier1} and {supplier2}: type each and pick it from the list. Take any other off with its ×. Then Next.', placement: 'bottom' },
    press('Send to suppliers', { kind: 'page', to: RFQ }, 'Send it', 'Click Send to suppliers.', { page: NEW_RFQ, waiting: 'Waiting for it to be sent.' }),
    { target: 'page-header', page: RFQ, remember: 'rfq', title: '{rfq} is sent', text: 'The emails are in the email log; none leaves the app.', expect: 'Waiting.' },

    { row: 2, target: 'rfq:compare', page: RFQ, pick: '{supplier1}', wait: { kind: 'appear', selector: '[data-tour="rfq:reply"]' }, title: 'The first reply', text: 'Click Record reply under {supplier1}.', placement: 'bottom' },
    {
      target: 'rfq:reply',
      page: RFQ,
      wait: { kind: 'gone', selector: '[data-tour="rfq:reply"]' },
      waiting: 'Waiting for the reply to be saved.',
      title: 'What they quote',
      text: 'Type both, then click Save reply.',
      type: [{ field: 'Unit price', value: '{price1}' }, { field: 'Delivery time', value: '7' }],
    },
    { target: 'rfq:compare', page: RFQ, pick: '{supplier2}', wait: { kind: 'appear', selector: '[data-tour="rfq:reply"]' }, title: 'The second reply', text: 'Click Record reply under {supplier2}.', placement: 'bottom' },
    {
      target: 'rfq:reply',
      page: RFQ,
      wait: { kind: 'gone', selector: '[data-tour="rfq:reply"]' },
      waiting: 'Waiting for the reply to be saved.',
      title: 'Cheaper, a week later',
      text: 'Type both, then click Save reply.',
      type: [{ field: 'Unit price', value: '{price2}' }, { field: 'Delivery time', value: '14' }],
    },
    { target: 'rfq:compare', page: RFQ, title: 'Side by side', text: 'Compare the two columns.', expect: 'Both filled, {supplier2} marked lowest. The RFQ is Ready to compare.', placement: 'top' },

    { row: 3, target: 'rfq:compare', page: RFQ, wait: { kind: 'use' }, title: 'The dearer one', text: 'In the last line, pick Award under {supplier1}. Then Next.', placement: 'top' },
    press('Award and create PO', { kind: 'appear', selector: '[data-tour="rfq:reason"] [role="alert"]' }, 'Try with no reason', 'Click Award and create PO.', { page: RFQ, waiting: 'Waiting for the message.' }),
    { target: 'rfq:reason', page: RFQ, wait: { kind: 'use' }, title: 'A reason is needed', text: 'Type why, then Next.', type: [{ field: 'Reason', value: 'Delivers a week sooner' }], expect: 'A message: the chosen supplier is not the cheapest.', placement: 'top' },
    press('Award and create PO', { kind: 'page', to: ORDER }, 'Award it', 'Click Award and create PO.', { page: RFQ, waiting: 'Waiting for the purchase order.' }),
    { target: 'po:lines', page: ORDER, remember: 'order', title: '{order}, a draft', text: 'For {supplier1}. The RFQ is Awarded.', expect: 'The quantity asked at {price1}, and the tax.', placement: 'top' },
  ],
}

const RELEASE_AND_REJECT: Tour = {
  ...base,
  id: 'guide.purchase.c',
  title: 'Release one order, and one is sent back',
  summary: 'Under the limit the buyer releases; over it the Purchasing Manager decides.',
  minutes: 8,
  startAt: '/purchase/orders',
  guide: {
    ...book,
    letter: 'C',
    rows: 4,
    cast: 'Buyer, Purchasing manager',
    after: ['B'],
    ...ORDER_OF_B,
    values: { ...ORDER_OF_B.values, supplier2: 'a supplier', item2: 'another item', price: '760.00' },
  },
  steps: [
    { title: 'Release, and an order sent back', text: 'Four steps, as two people. The first is for {order} from guide B.' },
    buyer({ row: 1 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    released('Release it', ORDER),
    { target: 'page-header', page: ORDER, title: 'Released', text: 'Under the limit nobody has to approve it. The supplier is emailed, when Master Data has its address.', expect: 'Released.' },

    ...row(2, toOrders()),
    press('Add new PO', { kind: 'page', to: NEW_ORDER }, 'A second order', 'Click Add new PO.', { page: ORDERS }),
    pickIn('po:supplier', NEW_ORDER, 'The supplier', 'Supplier', '{supplier2}', { placement: 'right' }),
    pickIn('po:line-item', NEW_ORDER, 'The item', 'Item', '{item2}', { placement: 'top' }),
    { target: 'po:line-qty', page: NEW_ORDER, wait: { kind: 'use' }, title: 'How many', text: 'Type the quantity, then Next.', type: [{ field: 'Quantity', value: '15' }], placement: 'top' },
    { target: 'po:line-price', page: NEW_ORDER, wait: { kind: 'use' }, title: 'The price', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: '{price}' }], placement: 'top' },
    press('Save draft', { kind: 'page', to: ORDER }, 'Save it', 'Click Save draft.', { page: NEW_ORDER, waiting: 'Waiting for the order to be saved.' }),
    { target: 'po:approval-card', page: ORDER, remember: 'order2', title: '{order2} is over the limit', text: 'The button reads Send for approval.', expect: 'It needs approval, and which limit it is over.', placement: 'left' },
    press('Send for approval', { kind: 'appear', selector: '[data-tour="po:approval"]' }, 'Send it', 'Click Send for approval.', { page: ORDER }),
    { target: 'po:approval', page: ORDER, wait: status('PENDING_APPROVAL'), waiting: 'Waiting for it to be sent.', title: 'To whom, and why', text: 'Type a note, then click Send for approval.', type: [{ field: 'Note', value: 'Stock for the new showroom' }] },
    { target: 'page-header', page: ORDER, title: 'Waiting', text: 'It is locked until someone decides.', expect: 'Pending approval.' },

    manager({ row: 3 }),
    ...openRequest('order2', 'The lines, the total and why approval is needed.'),
    ...rejectIt('Order 10 for now'),

    buyer({ row: 4 }),
    ...toOrders(),
    openDoc(ORDERS, 'order2', ORDER, 'Open the order'),
    { target: 'page-header', page: ORDER, title: 'Back in draft', text: 'The manager’s comment is under the title.', expect: 'Draft, and “Order 10 for now”.' },
    { target: 'po:line-qty', page: ORDER, wait: { kind: 'use' }, title: 'Fewer', text: 'Type 10, then Next.', type: [{ field: 'Quantity', value: '10' }], placement: 'top' },
    press('Save draft', { kind: 'appear', selector: '[data-tour="page-actions"] .erp-btn-secondary:disabled' }, 'Save it', 'Click Save draft.', { page: ORDER, waiting: 'Waiting for the order to be saved.' }),
    released('Now under the limit', ORDER),
    { target: 'page-header', page: ORDER, title: '{order2} is released', text: 'Nobody approves their own order: one the manager sends never reaches their own inbox.', expect: 'Released.' },
  ],
}

const PART_RECEIPT: Tour = {
  ...base,
  id: 'guide.purchase.d',
  title: 'Receive part of an order',
  summary: 'Never more than was ordered, and the rest stays open.',
  minutes: 4,
  startAt: '/purchase/receipts',
  guide: { ...book, letter: 'D', rows: 3, cast: 'Store', after: ['C'], ...ORDER_OF_B, values: { ...ORDER_OF_B.values, tooMany: '21', part: '15' } },
  steps: [
    { title: 'Receive part of an order', text: 'Three steps, as the store, for {order}, released in guide C.' },
    store({ row: 1 }),
    ...trans('receipts', 'Goods Receipt', RECEIPTS),
    { target: 'grn:waiting', page: RECEIPTS, pick: '{order} > Receive', wait: { kind: 'page', to: NEW_RECEIPT }, title: 'The goods arrive', text: 'Click Receive on the row of {order}.', placement: 'top' },
    { target: 'grn:lines', page: NEW_RECEIPT, title: 'What was ordered', text: 'Nothing is received yet.', expect: 'Receiving now is filled with what is still open: all of it.', placement: 'top' },

    { row: 2, target: 'grn:lines', page: NEW_RECEIPT, wait: { kind: 'use' }, title: 'One too many', text: 'Type the quantity, then Next.', type: [{ field: 'Receiving now', value: '{tooMany}' }], placement: 'top' },
    press('Save draft', { kind: 'click' }, 'Try to save', 'Click Save draft.', { page: NEW_RECEIPT }),

    { row: 3, target: 'grn:lines', page: NEW_RECEIPT, wait: { kind: 'use' }, title: 'Refused', text: 'Receiving now cannot be more than the open quantity. Type {part}, pick a rack under Put away to, then Next.', type: [{ field: 'Receiving now', value: '{part}' }], placement: 'top' },
    { target: 'grn:header', page: NEW_RECEIPT, wait: { kind: 'use' }, must: true, title: 'The supplier’s delivery order', text: 'Type its number under Supplier DO no, then Next.' },
    press('Confirm receipt', status('DONE', 'PARTIAL'), 'Confirm it', confirmText('Confirm receipt'), { page: RECEIPT, waiting: 'Waiting for the receipt to be confirmed.' }),
    { target: 'grn:po', page: RECEIPT, remember: 'receipt', title: '{receipt} is confirmed', text: 'The amber note says the stock moves once Inventory is connected.', expect: 'The order is Partial, with the rest still open.', placement: 'left' },
  ],
}

const THREE_WAY_MATCH: Tour = {
  ...base,
  id: 'guide.purchase.e',
  title: 'Supplier invoices and the three-way match',
  summary: 'One that agrees, and one with a higher price that the manager accepts.',
  minutes: 9,
  startAt: '/purchase/invoices',
  guide: {
    ...book,
    letter: 'E',
    rows: 4,
    cast: 'Buyer, Purchasing manager',
    after: ['D'],
    ...ORDER_OF_B,
    values: { ...ORDER_OF_B.values, supplier1: 'its supplier', part: '10', price1: '78.00', dearer: '81.50' },
  },
  steps: [
    { title: 'The three-way match', text: 'Four steps, as two people, for {order}, received in guide D.' },
    buyer({ row: 1 }),
    ...bill('invoices', 'Purchase Invoice', INVOICES),
    press('Record supplier invoice', { kind: 'page', to: NEW_INVOICE }, 'Their invoice', 'Click Record supplier invoice.', { page: INVOICES }),
    pickIn('pi:supplier', NEW_INVOICE, 'The supplier', 'Supplier', '{supplier1}', { placement: 'right' }),
    { target: 'pi:po', page: NEW_INVOICE, wait: { kind: 'use' }, must: true, title: 'The order', text: 'Pick {order} if it is not picked already, then Next.' },
    { target: 'pi:no', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'Their number', text: 'Type it, then Next. A supplier’s number is only taken once.', type: [{ field: 'Their invoice no', value: '{newBill}' }] },
    { target: 'pi:lines', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'What they billed', text: 'Type {part} as the billed quantity, keep the price, then Next.', type: [{ field: 'Billed quantity', value: '{part}' }], placement: 'top' },
    press('Record invoice', { kind: 'page', to: INVOICE }, 'Record it', 'Click Record invoice.', { page: NEW_INVOICE, waiting: 'Waiting for the match.' }),
    { target: 'pi:match', page: INVOICE, remember: 'invoice', title: 'Ordered, received, billed', text: 'They are matched against what was received.', expect: 'All three agree.', placement: 'top' },

    press('Record RM', status('APPROVED'), 'Accept it', 'Click Record RM….', { row: 2, page: INVOICE, waiting: 'Waiting for it to be recorded.' }),
    { target: 'page-header', page: INVOICE, title: '{invoice}', text: 'The payable is queued for Finance.', expect: 'Approved.' },

    ...row(3, bill('invoices', 'Purchase Invoice', INVOICES)),
    press('Record supplier invoice', { kind: 'page', to: NEW_INVOICE }, 'The rest, dearer', 'Click Record supplier invoice.', { page: INVOICES }),
    pickIn('pi:supplier', NEW_INVOICE, 'The supplier', 'Supplier', '{supplier1}', { placement: 'right' }),
    { target: 'pi:po', page: NEW_INVOICE, wait: { kind: 'use' }, must: true, title: 'The order', text: 'Pick {order} if it is not picked already, then Next.' },
    { target: 'pi:no', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'Their number', text: 'Type it, then Next.', type: [{ field: 'Their invoice no', value: '{newBill2}' }] },
    { target: 'pi:lines', page: NEW_INVOICE, wait: { kind: 'use' }, title: 'A higher price', text: 'Type {dearer} as the billed unit price instead of {price1}, then Next.', type: [{ field: 'Billed unit price', value: '{dearer}' }], placement: 'top' },
    press('Record invoice', { kind: 'page', to: INVOICE }, 'Record it', 'Click Record invoice.', { page: NEW_INVOICE, waiting: 'Waiting for the match.' }),
    { target: 'pi:match', page: INVOICE, remember: 'invoice2', title: 'Outside the tolerance', text: 'Each price may differ by 2% at most.', expect: 'The price is over by more than that, in red.', placement: 'top' },
    { target: 'pi:choice', page: INVOICE, wait: { kind: 'use' }, title: 'What should we record?', text: 'Pick Accept as billed, then Next.', placement: 'top' },
    press('Send for approval', status('PENDING_APPROVAL'), 'Ask for approval', 'Click Send for approval.', { page: INVOICE, waiting: 'Waiting for it to be sent.' }),

    manager({ row: 4 }),
    ...openRequest('invoice2', 'Ordered, received and billed, and the extra amount. The button names what is accepted.'),
    approveIt({ text: 'Click Approve RM….' }),
    { title: 'Accepted', text: '{invoice2} is Approved now, and queued for Finance.' },
  ],
}

const CANCEL_BALANCE: Tour = {
  ...base,
  id: 'guide.purchase.f',
  title: 'Cancel a balance that will never arrive',
  summary: 'The buyer drafts it, the Purchasing Manager releases it.',
  minutes: 4,
  startAt: '/purchase/orders',
  guide: { ...book, letter: 'F', rows: 2, cast: 'Buyer, Purchasing manager', after: ['D'], ...ORDER_OF_B },
  steps: [
    { title: 'Cancel the balance', text: 'Two steps, as two people, for {order}.' },
    buyer({ row: 1 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    press('Cancel balance', { kind: 'page', to: NEW_CANCEL }, 'The rest will not come', 'Click Cancel balance.', { page: ORDER }),
    { target: 'pco:reason', page: NEW_CANCEL, wait: { kind: 'use' }, must: true, title: 'Why', text: 'Pick a reason, then Next.' },
    { target: 'pco:lines', page: NEW_CANCEL, title: 'What is cancelled', text: 'Only what was not received.', expect: 'What is still open, to be cancelled.', placement: 'top' },
    press('Save draft', { kind: 'page', to: CANCEL }, 'Save it', 'Click Save draft.', { page: NEW_CANCEL, waiting: 'Waiting for it to be saved.' }),
    { target: 'page-header', page: CANCEL, remember: 'cancel', title: '{cancel}', text: 'The buyer cannot release it.', expect: 'Draft. There is no Release cancellation button.' },

    manager({ row: 2 }),
    ...trans('cancel-orders', 'Cancel Order', CANCELS),
    openDoc(CANCELS, 'cancel', CANCEL, 'Open the draft'),
    press('Release cancellation', status('RELEASED'), 'Release it', confirmText('Release cancellation'), { page: CANCEL, waiting: 'Waiting for it to be released.' }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'page-header', page: ORDER, title: '{order}', text: 'The supplier is told by email, when Master Data has its address.', expect: 'Done, with the balance cancelled.' },
  ],
}

const RETURN_GOODS: Tour = {
  ...base,
  id: 'guide.purchase.g',
  title: 'Return goods to the supplier',
  summary: 'The store drafts it, the buyer sends it and settles it with the supplier’s credit note.',
  minutes: 6,
  startAt: '/purchase/returns',
  guide: { ...book, letter: 'G', rows: 3, cast: 'Store, Buyer', after: ['D'], from: { receipt: from('d', 'receipt') }, values: { receipt: 'the goods receipt from guide D', tooMany: '16', part: '2' } },
  steps: [
    { title: 'A purchase return', text: 'Three steps, as two people, from {receipt} of guide D.' },
    store({ row: 1 }),
    ...bill('returns', 'Purchase Return', RETURNS),
    press('New return', { kind: 'page', to: NEW_RETURN }, 'Goods go back', 'Click New return.', { page: RETURNS }),
    { target: 'prt:grn', page: NEW_RETURN, wait: { kind: 'use' }, must: true, title: 'What they came in on', text: 'Pick {receipt}, then Next.' },
    { target: 'prt:reason', page: NEW_RETURN, wait: { kind: 'use' }, must: true, title: 'Why', text: 'Pick a reason, then Next.' },
    { target: 'prt:lines', page: NEW_RETURN, wait: { kind: 'use' }, title: 'One too many', text: 'Type the quantity, then Next.', type: [{ field: 'Return quantity', value: '{tooMany}' }], placement: 'top' },
    press('Save draft', { kind: 'click' }, 'Try to save', 'Click Save draft.', { page: NEW_RETURN }),
    { target: 'prt:lines', page: NEW_RETURN, wait: { kind: 'use' }, title: 'Refused', text: 'Never more than was received, less what went back before. Type {part}, then Next.', type: [{ field: 'Return quantity', value: '{part}' }], placement: 'top' },
    { target: 'prt:photos', page: NEW_RETURN, wait: { kind: 'use' }, title: 'A photo', text: 'Click + Add photo and pick any picture, then Next.', placement: 'top' },
    press('Save draft', { kind: 'page', to: RETURN }, 'Save it', 'Click Save draft.', { page: NEW_RETURN, waiting: 'Waiting for it to be saved.' }),
    { target: 'prt:credit', page: RETURN, remember: 'return', title: '{return}', text: 'A draft: the buyer releases it.', expect: 'The credit to expect, with the tax.', placement: 'left' },

    buyer({ row: 2 }),
    press('Release return', status('RELEASED'), 'Send it back', confirmText('Release return'), { page: RETURN, waiting: 'Waiting for it to be released.' }),
    { target: 'page-header', page: RETURN, title: 'Released', text: 'The supplier is told by email, when Master Data has its address.', expect: 'Waiting for credit.' },

    press('Record credit note', { kind: 'appear', selector: '[data-tour="prt:settle"]' }, 'Their credit note comes', 'Click Record credit note.', { row: 3, page: RETURN }),
    { target: 'prt:settle', page: RETURN, wait: status('SETTLED'), waiting: 'Waiting for it to be settled.', title: 'Settle it', text: 'Type its number, then click Settle return.', type: [{ field: 'Their credit note no', value: 'CN-1001' }] },
    { target: 'page-header', page: RETURN, title: 'Settled', text: 'The credit is logged against their invoice.', expect: 'Settled.' },
  ],
}

const DEBIT_NOTE_GUIDE: Tour = {
  ...base,
  id: 'guide.purchase.h',
  title: 'A supplier debit note: an extra charge',
  summary: 'A charge that is not on the order needs the Purchasing Manager.',
  minutes: 5,
  startAt: '/purchase/debit-notes',
  guide: {
    ...book,
    letter: 'H',
    rows: 3,
    cast: 'Buyer, Purchasing manager',
    after: ['E'],
    from: { invoice: from('e', 'invoice') },
    values: { invoice: 'the invoice from guide E', supplier1: 'its supplier', charge: 'a charge or another item', chargePrice: '60.00' },
  },
  steps: [
    { title: 'An extra charge', text: 'Three steps, as two people, on {invoice} of guide E.' },
    buyer({ row: 1 }),
    ...bill('debit-notes', 'Debit Note', DEBIT_NOTES),
    press('Record debit note', { kind: 'page', to: NEW_DEBIT_NOTE }, 'Their debit note', 'Click Record debit note.', { page: DEBIT_NOTES }),
    pickIn('pdn:supplier', NEW_DEBIT_NOTE, 'The supplier', 'Supplier', '{supplier1}', { placement: 'right' }),
    { target: 'pdn:invoice', page: NEW_DEBIT_NOTE, wait: { kind: 'use' }, must: true, title: 'Which invoice', text: 'Pick {invoice}, then Next.' },
    { target: 'pdn:no', page: NEW_DEBIT_NOTE, wait: { kind: 'use' }, title: 'Their number', text: 'Type it, then Next.', type: [{ field: 'Their debit note no', value: '{newBill}' }] },
    pickIn('pdn:line-item', NEW_DEBIT_NOTE, 'The charge', 'Item', '{charge}', { placement: 'top' }),
    { target: 'pdn:line-price', page: NEW_DEBIT_NOTE, wait: { kind: 'use' }, title: 'How much', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: '{chargePrice}' }], placement: 'top' },
    { target: 'pdn:check', page: NEW_DEBIT_NOTE, title: 'Checked against the order', text: 'So the button reads Send for approval.', expect: 'This charge is not on the purchase order.', placement: 'left' },

    press('Send for approval', status('PENDING_APPROVAL'), 'Ask for approval', confirmText('Send for approval'), { row: 2, page: DEBIT_NOTE, waiting: 'Waiting for it to be sent.' }),
    { target: 'page-header', page: DEBIT_NOTE, remember: 'debitNote', title: '{debitNote}', text: 'The Purchasing Manager decides.', expect: 'Pending approval.' },

    manager({ row: 3 }),
    ...openRequest('debitNote', 'The charge, and what the invoice comes to with it.'),
    approveIt({ text: 'Click Approve RM….' }),
    { title: 'Released', text: '{debitNote} is released and queued for Finance.' },
  ],
}

const CASH_PURCHASE: Tour = {
  ...base,
  id: 'guide.purchase.i',
  title: 'A cash purchase: a small buy with no order',
  summary: 'Up to the limit, and only with a photo of the receipt.',
  minutes: 5,
  startAt: '/purchase/cash-purchases',
  guide: { ...book, letter: 'I', rows: 3, cast: 'Store, Buyer', values: { shop: 'a shop', item: 'an item', price: '40.00', tooMany: '30', qty: '2' } },
  steps: [
    { title: 'A cash purchase', text: 'Three steps, as two people.' },
    store({ row: 1 }),
    ...bill('cash-purchases', 'Cash Purchase', CASH_LIST),
    press('New cash purchase', { kind: 'page', to: NEW_CASH }, 'Bought over the counter', 'Click New cash purchase.', { page: CASH_LIST }),
    pickIn('cp:supplier', NEW_CASH, 'The shop', 'Supplier', '{shop}', { placement: 'right' }),
    { target: 'cp:receipt-no', page: NEW_CASH, wait: { kind: 'use' }, title: 'Their receipt', text: 'Petty cash is picked. Type the receipt’s number, then Next.', type: [{ field: 'Their receipt no', value: 'R-5501' }] },
    pickIn('cp:line-item', NEW_CASH, 'The item', 'Item', '{item}', { placement: 'top' }),
    { target: 'cp:line-price', page: NEW_CASH, wait: { kind: 'use' }, title: 'The price', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: '{price}' }], placement: 'top' },
    { target: 'cp:line-qty', page: NEW_CASH, wait: { kind: 'use' }, title: 'Too many', text: 'Type the quantity, then Next.', type: [{ field: 'Quantity', value: '{tooMany}' }], placement: 'top' },
    press('Save draft', { kind: 'click' }, 'Try to save', 'Click Save draft.', { page: NEW_CASH }),
    { target: 'cp:checks', page: NEW_CASH, title: 'Over the limit', text: 'It is refused: raise a purchase order for that.', expect: 'Over the RM 1,000.00 limit, in red.', placement: 'left' },

    { row: 2, target: 'cp:line-qty', page: NEW_CASH, wait: { kind: 'use' }, title: 'A small buy', text: 'Type {qty}, then Next.', type: [{ field: 'Quantity', value: '{qty}' }], placement: 'top' },
    { target: 'cp:photo', page: NEW_CASH, wait: { kind: 'use' }, title: 'The receipt photo', text: 'Click + Add photo and pick any picture, then Next.', why: 'It cannot be released without one.', placement: 'left' },
    press('Save draft', { kind: 'page', to: CASH }, 'Save it', 'Click Save draft.', { page: NEW_CASH, waiting: 'Waiting for it to be saved.' }),
    { target: 'cp:checks', page: CASH, remember: 'cash', title: '{cash}', text: 'The store cannot release it.', expect: 'Every check is green.', placement: 'left' },

    buyer({ row: 3 }),
    released('Release it', CASH),
    { target: 'page-header', page: CASH, title: 'Released', text: 'The goods count as received, and the petty cash as spent.', expect: 'Released.' },
  ],
}

const ORDER_STORY: Tour = {
  ...base,
  id: 'guide.purchase.j',
  title: 'Document flow: the whole story of one order',
  summary: 'Every document of one order, and its quantities.',
  minutes: 2,
  startAt: '/purchase/orders',
  guide: { ...book, letter: 'J', rows: 2, cast: 'Buyer', after: ['F', 'G', 'H'], ...ORDER_OF_B },
  steps: [
    { title: 'One order’s story', text: 'Two steps, as the buyer, for {order}.' },
    buyer({ row: 1 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'linked-docs', page: ORDER, pick: 'Open full document flow', wait: { kind: 'page', to: ORDER_FLOW }, title: 'Its documents', text: 'Click Open full document flow.', placement: 'left' },
    { target: 'po-flow:chain', page: ORDER_FLOW, title: 'In order', text: 'Each opens its document.', expect: 'The request, the RFQ, the order, its receipt and invoices, the cancel order, the return and the debit note.' },

    { row: 2, target: 'po-flow:quantity', page: ORDER_FLOW, title: 'The quantities', text: 'Read the table.', expect: 'Ordered, received, cancelled and returned. On the right, what waits for Finance and Inventory.', placement: 'top' },
  ],
}

const SETTINGS: Tour = {
  ...base,
  id: 'guide.purchase.k',
  title: 'Settings: approval rules, numbers, emails',
  summary: 'Only the Purchasing Manager changes them, and every change is kept.',
  minutes: 6,
  startAt: '/purchase/orders',
  guide: { ...book, letter: 'K', rows: 4, cast: 'Buyer, Purchasing manager', values: { limit: '12000', limitBack: '10000', badSubject: 'Order {po.numbr}', template: 'Purchase order to supplier' } },
  steps: [
    { title: 'Purchase settings', text: 'Four steps, as two people.' },
    buyer({ row: 1 }),
    ...policy('approval-rules', 'Approval Rules', RULES),
    { target: 'page-header', page: RULES, title: 'Read only', text: 'Look at the top right.', expect: 'Only the Purchasing Manager can change these.' },

    manager({ row: 2 }),
    { target: 'ar:limit', page: RULES, wait: { kind: 'use' }, title: 'A higher limit', text: 'Type the new limit for purchase orders, then Next.', type: [{ field: 'limit', value: '{limit}' }], placement: 'bottom' },
    press('Save changes', SAVED, 'Save it', 'Click Save changes.', { page: RULES, waiting: 'Waiting for it to be saved.' }),
    { target: 'ar:limit', page: RULES, wait: { kind: 'use' }, title: 'As it was', text: 'Type the old limit again, then Next.', type: [{ field: 'limit', value: '{limitBack}' }], placement: 'bottom' },
    press('Save changes', SAVED, 'Save it', 'Click Save changes.', { page: RULES, waiting: 'Waiting for it to be saved.' }),
    { target: 'ar:history', page: RULES, title: 'Change history', text: 'A change counts for new documents only.', expect: 'Two lines: up, and back down.', placement: 'left' },

    ...row(3, policy('document-types', 'Document Types', DOC_TYPES)),
    { target: 'pdt:numbers', page: DOC_TYPES, wait: { kind: 'use' }, title: 'Try to go back', text: 'In the Purchase order row, type 1 under Next no. Then Next.', placement: 'top' },
    press('Save changes', { kind: 'click' }, 'Try to save', 'Click Save changes.', { page: DOC_TYPES }),
    press('Discard', SAVED, 'Refused', 'Numbers are never used again. Click Discard.', { page: DOC_TYPES, waiting: 'Waiting for the old number.' }),

    ...row(4, policy('email-templates', 'Email Templates', TEMPLATES)),
    { target: 'pet:list', page: TEMPLATES, pick: '{template}', wait: { kind: 'click' }, title: 'The order email', text: 'Click {template}.', placement: 'right' },
    { target: 'pet:fields', page: TEMPLATES, wait: { kind: 'use' }, title: 'Put in a field', text: 'Click any field, then Next.', expect: 'It is added to the message.', placement: 'left' },
    { target: 'pet:subject', page: TEMPLATES, wait: { kind: 'use' }, title: 'A field that does not exist', text: 'Type the subject, then Next.', type: [{ field: 'Subject', value: '{badSubject}' }], placement: 'bottom' },
    press('Save template', { kind: 'appear', selector: '[data-tour="pet:subject"] .text-note-error-text' }, 'Try to save', 'Click Save template.', { page: TEMPLATES, waiting: 'Waiting for the message under the subject.' }),
    press('Send test email', { kind: 'click' }, 'Refused', 'Nothing was saved. Click Send test email: the template is as it was again.', { page: TEMPLATES }),
    { target: 'pet:last', page: TEMPLATES, title: 'Sent', text: 'No real email leaves the app: it is logged.', expect: 'The test, under Last sent.', placement: 'left' },
  ],
}

const HOME_CHARTS: Tour = {
  ...base,
  id: 'guide.purchase.l',
  title: 'The Purchase home, with your own charts',
  summary: 'Four cards, and charts each person picks for themselves.',
  minutes: 4,
  startAt: '/purchase/orders',
  guide: { ...book, letter: 'L', rows: 4, cast: 'Buyer, Purchasing manager' },
  steps: [
    { title: 'The Purchase home', text: 'Four steps, as two people.' },
    buyer({ row: 1 }),
    { target: 'rail:footer', pick: 'Purchase home', placement: 'right', wait: { kind: 'page', to: HOME }, title: 'The Purchase home', text: 'Click the house at the bottom of the menu.' },
    { target: 'dashboard', page: HOME, title: 'Cards and charts', text: 'Read the cards and the charts below.', expect: 'Open orders, what waits to be received, invoices to match, and what waits for you. Buy soon comes from the stock.' },

    { row: 2, target: 'dashboard:add-chart', page: HOME, wait: { kind: 'appear', selector: '[data-tour="dash:add"]' }, title: 'Add charts', text: 'Click Add chart.' },
    { target: 'dash:add', page: HOME, wait: { kind: 'gone', selector: '[data-tour="dash:add"]' }, waiting: 'Waiting for you to finish.', title: 'Two charts', text: 'Click Add on Purchase orders by status and on What we owe suppliers, by age, then Done.' },
    { target: 'dashboard', page: HOME, pick: '3 cols', wait: { kind: 'click' }, title: 'Three columns', text: 'Click 3 cols.' },
    { target: 'dashboard', page: HOME, title: 'Your own home', text: 'It follows you to any computer.', expect: 'Your charts · saved to your account.' },

    manager({ row: 3 }),
    { target: 'dashboard', page: HOME, title: 'Someone else’s home', text: 'Each person has their own.', expect: 'Default charts.' },

    buyer({ row: 4 }),
    { target: 'dashboard', page: HOME, pick: 'Clear', wait: { kind: 'appear', selector: '[data-tour="dash:reset"]' }, title: 'Clear them', text: 'Click Clear, then Clear again in the question that opens.' },
    { target: 'dash:reset', page: HOME, wait: { kind: 'gone', selector: '[data-tour="dash:reset"]' }, waiting: 'Waiting for the charts.', title: 'The defaults', text: 'Click Put back the default charts.' },
    { target: 'dashboard', page: HOME, title: 'Back', text: 'The cards were never gone.', expect: 'Default charts.' },
  ],
}

export const PURCHASE_GUIDES: Tour[] = [DEMAND_TO_REQUEST, RFQ_AWARD, RELEASE_AND_REJECT, PART_RECEIPT, THREE_WAY_MATCH, CANCEL_BALANCE, RETURN_GOODS, DEBIT_NOTE_GUIDE, CASH_PURCHASE, ORDER_STORY, SETTINGS, HOME_CHARTS]
