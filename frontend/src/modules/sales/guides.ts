import { be, openDoc, openFromHome, openModule, openPage, status } from '@/tours/guide.steps'
import type { Guide, Tour, TourStep } from '@/tours/types'

/**
 * Sales guides: the Handbook's journeys on screen, step for step (dev mode). Neutral words only; a company's own people
 * and items come from its file (GUIDE_VALUES_FILE). Each Handbook step starts where `row` says so.
 */

const NEW_ORDER = { path: '^/sales/orders/new$' }
const ORDER = { path: '^/sales/orders/(?!new$)[^/]+$' }
const ORDERS = { code: 'S10' }
const RECEIPT = { path: '^/sales/receipts/[^/]+$' }
const RECEIPTS = { code: 'S35' }
const INVOICE = { path: '^/sales/invoices/(?!new$)[^/]+$' }
const CUSTOMER = { path: '^/core/customers/(?!new$)[^/]+$' }
const CUSTOMERS = { path: '^/core/customers$' }
const FLOW = { code: 'S34' }

/* The clicks the Sales guides repeat */

const admin = (extra: Partial<TourStep> = {}) => be('ADMIN', 'admin', 'administrator', extra)
const agent = (as: 'agent' | 'hqAgent', extra: Partial<TourStep> = {}) => be('SALES_AGENT', as, 'sales agent', extra)
/** A request goes to the branch's own manager where it has one. */
const salesManager = (as: 'salesManager' | 'branchManager', extra: Partial<TourStep> = {}) => be('SALES_MANAGER', as, 'sales manager', extra)
const account = (extra: Partial<TourStep> = {}) => be('FINANCE_MANAGER', 'account', 'finance manager', extra)

const toSalesFlow = () => openPage('policies', 'Operation Policies', 'sales-flow', 'Sales Flow', FLOW)
const toOrders = () => openPage('transaction', 'Sales Transaction', 'orders', 'Sales Order', ORDERS)
const toReceipts = () => openPage('billing', 'Billing', 'receipts', 'Official Receipts', RECEIPTS)

/** Sales Flow: a switch to turn on, and Save changes (nothing to save when it is on already). */
const switchOn = (card: string, title: string, text: string, expect: string): TourStep[] => [
  { target: `flow:${card}`, page: FLOW, wait: { kind: 'use' }, title, text },
  {
    target: 'action:save-flow',
    page: FLOW,
    wait: { kind: 'appear', selector: '[data-tour="action:save-flow"]:disabled' },
    waiting: 'Waiting for the changes to be saved.',
    title: 'Save the changes',
    text: 'Click Save changes.',
  },
  { target: 'flow:changes', page: FLOW, title: 'Recent changes', text: 'Every change of these settings is kept here.', expect, placement: 'top' },
]

const newOrder = (extra: Partial<TourStep> = {}): TourStep => ({ target: 'action:new-order', page: ORDERS, wait: { kind: 'page', to: NEW_ORDER }, title: 'Start the order', text: 'Click Add new order.', ...extra })
const pickCustomer = (): TourStep => ({
  target: 'so:customer',
  page: NEW_ORDER,
  wait: { kind: 'use' },
  title: 'Pick the customer',
  text: 'Type {customer}, pick it from the list, then Next.',
  type: [{ field: 'Customer', value: '{customer}' }],
  placement: 'right',
})
const addItem = (text = 'Search {item}, tick it, keep the quantity at 1 and click Add 1 item.'): TourStep[] => [
  { target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'Add an item', text: 'Click Add item.' },
  {
    target: 'item-picker',
    page: NEW_ORDER,
    wait: { kind: 'appear', selector: '[data-tour="so:line"]' },
    waiting: 'Waiting for the item on the order.',
    title: 'Pick the item',
    text,
    type: [{ field: 'Search', value: '{item}' }],
  },
]
const installDate = (text: string): TourStep => ({ target: 'so:install-date', page: NEW_ORDER, wait: { kind: 'use' }, must: true, title: 'The preferred date', text })
/** A saved order's changes: Save draft is grey again once they are saved. */
const saveDraft = (page: typeof NEW_ORDER, extra: Partial<TourStep> = {}): TourStep => ({
  target: 'action:save-draft',
  page,
  wait: page === NEW_ORDER ? { kind: 'page', to: ORDER } : { kind: 'appear', selector: '[data-tour="action:save-draft"]:disabled' },
  waiting: 'Waiting for the order to be saved.',
  title: 'Save the draft',
  text: 'Click Save draft.',
  ...extra,
})
const release = (extra: Partial<TourStep> = {}): TourStep => ({
  target: 'action:release',
  page: ORDER,
  wait: status('RELEASED'),
  waiting: 'Waiting for the order to be released.',
  title: 'Release it',
  text: 'Click Release, then Release again in the question that opens.',
  ...extra,
})
const askApproval = (reason: string, rows: { reason?: number; request?: number } = {}): TourStep[] => [
  { row: rows.reason, target: 'so:approval', page: ORDER, wait: { kind: 'use' }, title: 'Say why', text: 'Type a reason for the approver, then Next.', type: [{ field: 'Reason', value: reason }], placement: 'top' },
  {
    target: 'action:request-approval',
    page: ORDER,
    wait: status('PENDING_APPROVAL'),
    waiting: 'Waiting for the request to be sent.',
    title: 'Ask for approval',
    text: 'Click Request approval.',
  },
]
/** The Sales Manager approves the order in Approvals. */
const approve = (as: 'salesManager' | 'branchManager', row: number, expect: string): TourStep[] => [
  salesManager(as, { row }),
  { target: 'approvals', wait: { kind: 'page', to: { code: 'S02' } }, title: 'Open Approvals', text: 'Click Approvals in the top bar.' },
  {
    target: 'approvals:list',
    page: { code: 'S02' },
    pick: '{order}',
    wait: { kind: 'click' },
    title: 'Pick the request',
    text: 'Click the card of {order}.',
    placement: 'right',
  },
  { target: 'approvals:detail', page: { code: 'S02' }, title: 'What is asked', text: 'Read the request and its details.', expect, placement: 'left' },
  {
    target: 'approvals:approve',
    page: { code: 'S02' },
    wait: { kind: 'appear', selector: '.erp-toast-body[data-tone="done"]' },
    waiting: 'Waiting for your decision.',
    title: 'Approve it',
    text: 'Click Approve.',
  },
]
/** Record a payment on the order's Payments card. */
const recordPayment = (text: string, type?: TourStep['type'], row?: number): TourStep[] => [
  {
    row,
    target: 'action:record-payment',
    page: ORDER,
    wait: { kind: 'appear', selector: '[data-tour="receipt-dialog"]' },
    title: 'Record a payment',
    text: 'Click Record payment on the Payments card.',
  },
  {
    target: 'receipt-dialog',
    page: ORDER,
    wait: { kind: 'gone', selector: '[data-tour="receipt-dialog"]' },
    waiting: 'Waiting for the payment to be recorded.',
    title: 'The payment and its proof',
    text,
    type,
  },
]

const FIELD_SALES: Pick<Guide, 'book'> = { book: 'Field sales' }

const HOUSEHOLD_ORDER: Tour = {
  id: 'guide.field-sales.a',
  title: 'A household order with a package',
  summary: 'A new household, a package with its free gift, a voucher and an installation.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'sales:askInstallation', 'sales:agentsAddCustomers'],
  minutes: 6,
  startAt: '/sales/orders',
  guide: {
    book: 'Field sales',
    letter: 'A',
    rows: 7,
    cast: 'Administrator, Sales agent',
    values: {
      package: 'a package that is running',
      address: '8 Jalan Cempaka, Taman Megah, Petaling Jaya',
      postcode: '47810',
      state: 'Selangor',
      voucherAmount: '50.00',
      voucherEffect: 'RM 50.00 and the tax on it',
    },
  },
  steps: [
    {
      title: 'A household order with a package',
      text: 'Seven steps, as two people: the administrator and a sales agent. Click what is highlighted; the guide follows you.',
      why: 'The highlighted buttons are real, so this makes one order and one customer on the demo.',
    },

    /* 1 · Administrator: Sales › Operation Policies › Sales Flow */
    be('ADMIN', 'admin', 'administrator', { row: 1 }),
    ...openPage('policies', 'Operation Policies', 'sales-flow', 'Sales Flow', { code: 'S34' }),
    {
      target: 'flow:customers',
      page: { code: 'S34' },
      title: 'The Customers card',
      text: 'Look at this card.',
      expect: '“Salespeople add new customers on the order” is on.',
    },
    {
      target: 'flow:prices',
      page: { code: 'S34' },
      title: 'The Prices card',
      text: 'Look at this card.',
      expect: '“Salespeople set prices within a range” is on or off: it decides journey C.',
    },
    {
      target: 'flow:installation',
      page: { code: 'S34' },
      title: 'The Installation card',
      text: 'Look at this card.',
      expect: '“Ask for an installation option on the order” is on.',
      placement: 'top',
    },

    /* 2 · Sales agent: a new order and a new household */
    be('SALES_AGENT', 'agent', 'sales agent', { row: 2 }),
    ...openPage('transaction', 'Sales Transaction', 'orders', 'Sales Order', { code: 'S10' }),
    {
      target: 'action:new-order',
      page: { code: 'S10' },
      wait: { kind: 'page', to: NEW_ORDER },
      title: 'Start the order',
      text: 'Click Add new order.',
    },
    {
      target: 'so:new-customer',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="new-customer"]' },
      title: 'A new household',
      text: 'Click + New customer, under the customer field.',
      placement: 'right',
    },
    {
      target: 'new-customer',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:customer"][data-filled="true"]' },
      waiting: 'Waiting for the customer to be added.',
      title: 'Add the household',
      text: 'Type these, then click Add customer.',
      type: [
        { field: 'Name', value: '{newName}' },
        { field: 'Phone', value: '{newPhone}' },
        { field: 'Address', value: '{address}' },
      ],
    },
    {
      target: 'so:customer',
      page: NEW_ORDER,
      title: 'The customer is on the order',
      text: 'Core made the customer and gave it its number.',
      expect: 'The new customer is picked, with the next C- number and cash terms (0 days).',
      why: 'A phone number already on file is refused, with that customer’s code.',
      placement: 'right',
    },

    /* 3 · the package */
    {
      row: 3,
      target: 'action:add-package',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="package-picker"]' },
      title: 'Add a package',
      text: 'Click Add package.',
    },
    {
      target: 'pk:cards',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="pk:chosen"]' },
      waiting: 'Waiting for you to pick a package.',
      title: 'Pick the package',
      text: 'Picture cards under category tabs. Click {package}.',
    },
    {
      target: 'pk:chosen',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      title: 'What it includes',
      text: 'Read the terms under the cards.',
      expect: 'What the package includes and its warranty, with the system’s price. The price on a poster is never used.',
    },

    /* 4 · the gift, sets and adding it */
    {
      row: 4,
      target: 'pk:chosen',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      title: 'Sets and the free gift',
      text: 'Keep Sets at 1. If the package lets the customer choose, pick the free gift; otherwise it comes with it.',
    },
    {
      target: 'pk:add',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:line"]' },
      waiting: 'Waiting for the package on the order.',
      title: 'Put it on the order',
      text: 'Click Add package.',
    },
    {
      target: 'so:lines',
      page: NEW_ORDER,
      title: 'The package on the order',
      text: 'Look at the lines.',
      expect: 'One package line with its items under it, and the gift at 0.00.',
      placement: 'top',
    },

    /* 5 · the voucher */
    {
      row: 5,
      target: 'action:add-voucher',
      page: NEW_ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:voucher"]' },
      title: 'Add a voucher',
      text: 'Click Add voucher.',
    },
    {
      target: 'so:voucher',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      title: 'Type the voucher',
      text: 'Type these in the highlighted row, then Next.',
      type: [
        { field: 'Voucher no.', value: '{newVoucher}' },
        { field: 'Amount', value: '{voucherAmount}' },
      ],
      placement: 'top',
    },
    {
      target: 'so:totals',
      page: NEW_ORDER,
      title: 'The total drops',
      text: 'The voucher lowers the amount taxed.',
      expect: 'The total is lower by {voucherEffect}.',
      placement: 'left',
    },

    /* 6 · the installation, save and release */
    {
      row: 6,
      target: 'so:postcode',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      title: 'The installer’s address',
      text: 'Type the postcode, then Next.',
      type: [{ field: 'Postcode', value: '{postcode}' }],
    },
    {
      target: 'so:state',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      must: true,
      title: 'The state',
      text: 'Pick {state}, then Next.',
    },
    {
      target: 'so:installation',
      page: NEW_ORDER,
      title: 'Keep Installation',
      text: 'The order asks for installation, delivery only or collect. Leave it on Installation.',
    },
    {
      target: 'so:install-date',
      page: NEW_ORDER,
      wait: { kind: 'use' },
      must: true,
      title: 'The customer’s preferred date',
      text: 'Pick a day this week or next, then Next. The office books the installer later.',
      why: 'With every item in stock a date is needed. With an item short it is not: it waits for the stock.',
    },
    {
      target: 'action:save-draft',
      page: NEW_ORDER,
      wait: { kind: 'page', to: ORDER },
      waiting: 'Waiting for the order to be saved.',
      title: 'Save the draft',
      text: 'Click Save draft. The order gets its number.',
    },
    {
      target: 'action:release',
      page: ORDER,
      wait: status('RELEASED'),
      waiting: 'Waiting for the order to be released.',
      title: 'Release it',
      text: 'Click Release, then Release again in the question that opens.',
    },
    {
      target: 'page-header',
      page: ORDER,
      remember: 'order',
      title: '{order} is released',
      text: 'Look at the top of the order.',
      expect: 'Released, and the buttons are now for what comes after the order.',
    },
    {
      target: 'so:install-date',
      page: ORDER,
      title: 'What the customer asked for',
      text: 'The installation is on the order. It is a wish: the office books the installer and the time.',
      expect: 'The date you picked, or “After stock arrives” if you left it empty and an item is short.',
    },
    {
      target: 'so:pre-order',
      page: ORDER,
      optional: true,
      title: 'A pre-order',
      text: 'An item is short at this branch, so the whole order waits for the stock.',
      expect: 'Pre-order · waiting for stock, with what is short.',
      why: 'The Handbook’s journey I carries on from here.',
      placement: 'top',
    },

    /* 7 · Administrator: the new household in Core */
    be('ADMIN', 'admin', 'administrator', { row: 7 }),
    openModule('core', 'Core'),
    {
      target: 'home:main',
      page: { module: 'core' },
      optional: true,
      wait: { kind: 'page', to: { path: '^/core/customers$' } },
      title: 'Open the customers',
      text: 'Click the Customers card.',
      placement: 'top',
    },
    {
      target: 'filters',
      page: { path: '^/core/customers$' },
      wait: { kind: 'use' },
      title: 'Find the household',
      text: 'Type its name in the search, then Next.',
      type: [{ field: 'Search', value: '{newName}' }],
    },
    {
      target: 'list',
      page: { path: '^/core/customers$' },
      wait: { kind: 'page', to: { path: '^/core/customers/(?!new$)[^/]+$' } },
      title: 'Open it',
      text: 'Click its code.',
      expect: 'A To complete chip beside the name.',
      placement: 'top',
    },
    {
      target: 'core:to-complete',
      page: { path: '^/core/customers/(?!new$)[^/]+$' },
      title: 'Added from an order',
      text: 'The office checks the details and fills in what is missing.',
      expect: 'A banner saying who added it, and from which kind of document.',
    },
    {
      target: 'action:mark-complete',
      page: { path: '^/core/customers/(?!new$)[^/]+$' },
      wait: { kind: 'gone', selector: '[data-tour="action:mark-complete"]' },
      waiting: 'Waiting for it to be marked.',
      title: 'Mark it as complete',
      text: 'Click Mark as complete.',
    },
    {
      target: 'page-header',
      page: { path: '^/core/customers/(?!new$)[^/]+$' },
      title: 'Done: order {order}',
      text: 'The household is complete and its order is on its way to the office.',
      expect: 'The To complete banner and button are gone.',
    },
  ],
}

const PRICE_OUTSIDE: Tour = {
  id: 'guide.field-sales.c',
  title: 'A price outside the range',
  summary: 'A price below the range needs the Sales Manager before the order can be released.',
  module: 'sales',
  journey: true,
  pages: 'any',
  // Its first step turns the range on and its last turns it off, so it is offered to a company that sells in the field.
  requires: ['dev', 'sales:askInstallation'],
  minutes: 6,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'C',
    rows: 7,
    cast: 'Administrator, Sales agent, Sales manager',
    values: { customer: 'a customer of yours', item: 'an item', price: 'a price 15% or more below the list' },
  },
  steps: [
    { title: 'A price outside the range', text: 'Seven steps, as three people. The salesperson sets a price too low, and the Sales Manager decides.' },

    admin({ row: 1 }),
    ...toSalesFlow(),
    ...switchOn(
      'prices',
      'The Prices card',
      'If it is off, turn on “Salespeople set prices within a range of the price list”. Keep 10% below and 20% above, then Next.',
      'The line for the price range, if you turned it on now.',
    ),

    agent('agent', { row: 2 }),
    ...toOrders(),
    newOrder(),
    pickCustomer(),
    ...addItem(),
    { target: 'so:price', page: NEW_ORDER, wait: { kind: 'use' }, title: 'A lower price', text: 'Type the unit price, then Next.', type: [{ field: 'Unit price', value: '{price}' }] },
    {
      target: 'so:line-note',
      page: NEW_ORDER,
      title: 'The line says so',
      text: 'Look under the line.',
      expect: 'The price list price, and that this is below it. The range is checked when you save.',
    },

    saveDraft(NEW_ORDER, { row: 3 }),
    {
      target: 'so:approval',
      page: ORDER,
      remember: 'order',
      title: 'Price needs approval',
      text: 'The order is saved as {order}.',
      expect: '“Price needs approval”, with how far below the price list it is and what is allowed. There is no Release button.',
      placement: 'top',
    },

    ...askApproval('Matching a competitor', { reason: 4 }),
    { target: 'page-header', page: ORDER, title: 'Waiting for the Sales Manager', text: 'The order is locked until someone decides.', expect: 'Pending approval.' },

    ...approve('branchManager', 5, 'The price reason, and the note the salesperson typed.'),

    agent('agent', { row: 6 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    release(),
    { target: 'page-header', page: ORDER, title: '{order} is released', text: 'The price was approved once.', expect: 'Released. An invoice at that same price does not ask again.' },

    admin({ row: 7 }),
    ...toSalesFlow(),
    ...switchOn(
      'prices',
      'The Prices card',
      'Turn the range off again, unless your company has decided to use it. Then Next.',
      'The line for the price range, if you turned it off. Orders are then priced freely again.',
    ),
  ],
}

const PAYMENTS: Tour = {
  id: 'guide.field-sales.g',
  title: 'Payments: official receipts',
  summary: 'The salesperson records a payment with its proof, and Account verifies it or sends it back.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'service', 'sales:useReceipts'],
  minutes: 8,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'G',
    rows: 10,
    cast: 'Administrator, Sales agent, Finance manager',
    after: ['A'],
    from: { order: { guide: 'guide.field-sales.a', key: 'order' } },
    values: { order: 'a released order', deposit: '500.00', balance: '100.00', corrected: '150.00', bankRef: 'TRX 77812' },
  },
  steps: [
    { title: 'Payments: official receipts', text: 'Ten steps, as three people. It uses {order}, from guide A. Keep a picture ready to be the payment slip: any picture will do.' },

    admin({ row: 1 }),
    ...toSalesFlow(),
    ...switchOn(
      'payments',
      'The Payments card',
      'If it is off, turn on “Salespeople record payments as official receipts”. Then Next.',
      'The line for official receipts, if you turned it on now. Billing has Official Receipts.',
    ),

    agent('agent', { row: 2 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'so:payments', page: ORDER, title: 'The Payments card', text: 'What the customer has paid, as Account sees it.', expect: 'Unpaid, verified RM 0.00, and Still owed the order total.', placement: 'left' },

    ...recordPayment('Type the amount, keep Deposit, pick Bank transfer, click + Add proof and choose a picture, then Record payment.', [{ field: 'Amount (RM)', value: '{deposit}' }], 3),
    {
      target: 'so:payments',
      page: ORDER,
      title: 'Waiting for Account',
      text: 'Without a proof it asks for one, and more than the order owes is refused.',
      expect: 'The next OR number, Waiting to verify, and RM {deposit} waiting for Account.',
      placement: 'left',
    },

    account({ row: 4 }),
    ...toReceipts(),
    { target: 'status-tabs', page: RECEIPTS, title: 'What waits for Account', text: 'The page opens on Waiting to verify.', expect: 'The receipt is listed, with how much waits for Account to check against the bank.' },

    openDoc(RECEIPTS, 'order', RECEIPT, 'Open the receipt', { row: 5, text: 'Click the receipt of {order}.' }),
    { target: 'rc:proof', page: RECEIPT, remember: 'receipt', title: 'Look at the proof', text: 'Each receipt must match a bank transaction or a card settlement slip.', expect: 'The picture of the slip. Click it later to open it.' },
    { target: 'action:verify-receipt', page: RECEIPT, wait: { kind: 'appear', selector: '[data-tour="rc:verify"]' }, title: 'Verify it', text: 'Click Verify.' },
    {
      target: 'rc:verify',
      page: RECEIPT,
      wait: status('VERIFIED'),
      waiting: 'Waiting for it to be verified.',
      title: 'The bank reference',
      text: 'Type the reference, then click Verify.',
      type: [{ field: 'Bank', value: '{bankRef}' }],
    },
    { target: 'rc:order', page: RECEIPT, title: 'Verified', text: 'The receipt says by whom, when, and the reference.', expect: 'On the Sales order card: Deposit paid, RM {deposit} verified.', placement: 'left' },

    agent('agent', { row: 6 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'so:payments', page: ORDER, title: 'The salesperson sees it too', text: 'The order’s activity has a line for each step.', expect: 'Deposit paid, the receipt Verified, and what is still owed.', placement: 'left' },

    admin({ row: 7 }),
    openModule('service', 'Service'),
    ...openFromHome('service', 'Jobs', 'jobs', 'Jobs', { path: '^/service/jobs$' }),
    { target: 'filters', page: { path: '^/service/jobs$' }, wait: { kind: 'use' }, title: 'Find the job', text: 'Type the order number in the search, then Next.', type: [{ field: 'Job', value: '{order}' }] },
    openDoc({ path: '^/service/jobs$' }, 'order', { path: '^/service/jobs/(?!new$)[^/]+$' }, 'Open the job', { text: 'Click the job of {order}.' }),
    {
      target: 'svc:links',
      page: { path: '^/service/jobs/(?!new$)[^/]+$' },
      title: 'Linked documents',
      text: 'Service heard it from Sales; it reads no Sales tables.',
      expect: 'Order payment: Deposit paid, RM {deposit} of the total.',
      placement: 'left',
    },

    openModule('sales', 'Sales'),
    ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS),
    agent('agent', { row: 8 }),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    ...recordPayment('Type the amount, pick Balance and Cash (banked in), add a proof, then Record payment.', [{ field: 'Amount (RM)', value: '{balance}' }]),
    { target: 'so:payments', page: ORDER, title: 'A second receipt', text: 'Each payment is its own receipt.', expect: 'A second receipt, Waiting to verify.', placement: 'left' },

    account({ row: 9 }),
    ...toReceipts(),
    openDoc(RECEIPTS, 'order', RECEIPT, 'Open it', { text: 'Click the receipt of {order}.' }),
    { target: 'action:send-back', page: RECEIPT, wait: { kind: 'appear', selector: '[data-tour="reason-dialog"]' }, title: 'Send it back', text: 'Click Send back.' },
    {
      target: 'reason-dialog',
      page: RECEIPT,
      wait: status('RETURNED'),
      waiting: 'Waiting for it to be sent back.',
      title: 'What is wrong',
      text: 'Type what is wrong, then click Send back.',
      type: [{ field: 'What', value: 'The slip shows RM {corrected}' }],
    },
    { target: 'page-header', page: RECEIPT, title: 'Sent back', text: 'It waits for the salesperson now.', expect: 'Sent back, and the reason under it.' },

    agent('agent', { row: 10 }),
    { target: 'action:correct-receipt', page: RECEIPT, wait: { kind: 'appear', selector: '[data-tour="receipt-dialog"]' }, title: 'Correct it', text: 'Click Correct and send again.' },
    {
      target: 'receipt-dialog',
      page: RECEIPT,
      wait: status('WAITING'),
      waiting: 'Waiting for it to be sent again.',
      title: 'The right amount',
      text: 'Change the amount, then click Send again.',
      type: [{ field: 'Amount (RM)', value: '{corrected}' }],
    },
    { target: 'page-header', page: RECEIPT, title: 'Sent again', text: 'Its activity says it was corrected and sent again.', expect: 'Waiting to verify again.', why: 'Whoever recorded a receipt never verifies it.' },
  ],
}

const REVISIONS: Tour = {
  id: 'guide.field-sales.h',
  title: 'A change after submitting: order revisions',
  summary: 'A released order is changed under the same number; a price change needs the Sales Manager.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'sales:reviseOrders', 'sales:askInstallation'],
  minutes: 8,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'H',
    rows: 8,
    cast: 'Administrator, Sales agent, Sales manager',
    values: { customer: 'a customer of yours', item: 'an item in stock', price: 'a little less than the price list' },
  },
  steps: [
    { title: 'A change after submitting', text: 'Eight steps, as three people. The salesperson changes a released order twice.' },

    admin({ row: 1 }),
    ...toSalesFlow(),
    {
      target: 'flow:orders',
      page: FLOW,
      title: 'The Orders card',
      text: 'Look at this card.',
      expect: '“Salespeople revise a released order until it is delivered” is on. Pre-orders and WhatsApp are yours to see too; the automatic cancel is off.',
    },

    agent('hqAgent', { row: 2 }),
    ...toOrders(),
    newOrder(),
    pickCustomer(),
    ...addItem(),
    installDate('Keep Installation, pick a day next week, then Next.'),
    saveDraft(NEW_ORDER),
    release(),
    { target: 'page-header', page: ORDER, remember: 'order', title: '{order} is released', text: 'Look under the title and at the buttons.', expect: 'Released, Revision 1 under the title, and a Revise button.' },

    { row: 3, target: 'action:revise', page: ORDER, wait: { kind: 'appear', selector: '[data-tour="reason-dialog"]' }, title: 'Revise it', text: 'Click Revise.' },
    {
      target: 'reason-dialog',
      page: ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:revision"]' },
      waiting: 'Waiting for the revision to start.',
      title: 'Why it is revised',
      text: 'Type why, then click Start revision.',
      type: [{ field: 'Why', value: 'Customer wants 2' }],
    },
    { target: 'so:revision', page: ORDER, title: 'Revision 2 is in draft', text: 'The order keeps its number and can be changed again.', expect: 'Revision 2 is in draft, with the reason.' },

    { row: 4, target: 'so:qty', page: ORDER, wait: { kind: 'use' }, title: 'Two of them', text: 'Change the quantity, then Next.', type: [{ field: 'Quantity', value: '2' }] },
    saveDraft(ORDER),
    release(),
    {
      target: 'so:revisions',
      page: ORDER,
      title: 'The Revisions card',
      text: 'No approval was needed: the price did not change and nobody is booked.',
      expect: 'What revision 2 changed. View shows revision 1 as it was.',
      placement: 'left',
    },

    { row: 5, target: 'action:revise', page: ORDER, wait: { kind: 'appear', selector: '[data-tour="reason-dialog"]' }, title: 'Revise it again', text: 'Click Revise.' },
    {
      target: 'reason-dialog',
      page: ORDER,
      wait: { kind: 'appear', selector: '[data-tour="so:revision"]' },
      waiting: 'Waiting for the revision to start.',
      title: 'Why it is revised',
      text: 'Type why, then click Start revision.',
      type: [{ field: 'Why', value: 'Small discount' }],
    },
    { target: 'so:price', page: ORDER, wait: { kind: 'use' }, title: 'A lower price', text: 'Change the unit price, then Next.', type: [{ field: 'Unit price', value: '{price}' }] },
    saveDraft(ORDER),
    { target: 'so:approval', page: ORDER, title: 'Revision needs approval', text: 'A price changed.', expect: '“Revision needs approval: a price changed”. There is no Release button.', placement: 'top' },

    ...askApproval('Agreed with the customer', { reason: 6 }),
    { target: 'page-header', page: ORDER, title: 'Waiting for the Sales Manager', text: 'The order is locked until someone decides.', expect: 'Pending approval.' },

    ...approve('salesManager', 7, 'Which price changed, and why.'),

    agent('hqAgent', { row: 8 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    release(),
    { target: 'page-header', page: ORDER, title: 'Done: {order}', text: 'The installation job has the 2 units too.', expect: 'Released, Revision 3.', why: 'Once a delivery order, invoice, proforma or cancel order is made, Revise is greyed out and says why.' },
  ],
}

const PRE_ORDER: Tour = {
  id: 'guide.field-sales.i',
  title: 'Short stock: a pre-order',
  summary: 'An order with an item out of stock waits for it, as a whole.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'sales:preOrders', 'sales:askInstallation'],
  minutes: 3,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'I',
    rows: 3,
    cast: 'Sales agent',
    values: { customer: 'a customer of yours', item: 'an item with none in stock' },
  },
  steps: [
    { title: 'Short stock: a pre-order', text: 'Three steps, as a sales agent.' },

    agent('hqAgent', { row: 1 }),
    ...toOrders(),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}. It shows none in stock: tick it anyway, keep 1 and click Add 1 item.'),
    { target: 'so:installation', page: NEW_ORDER, title: 'Keep Installation, no date', text: 'Leave the preferred date empty this time.' },
    saveDraft(NEW_ORDER),
    { target: 'so:stock-note', page: ORDER, title: 'The stock note', text: 'Short stock never blocks.', expect: 'The order will be released as a pre-order, as a whole.', placement: 'top' },

    release({ row: 2 }),
    { target: 'so:pre-order', page: ORDER, remember: 'order', title: 'A pre-order', text: '{order} waits for the stock. No installation date was needed.', expect: 'Pre-order · waiting for stock, with what was short.', placement: 'top' },

    { row: 3, target: 'menu:orders', placement: 'right', wait: { kind: 'page', to: ORDERS }, title: 'Back to the list', text: 'Click Sales Order.' },
    { target: 'sl:pre-orders', page: ORDERS, wait: { kind: 'appear', selector: '[data-tour="sl:pre-orders"] input:checked' }, title: 'Only the pre-orders', text: 'Tick Pre-orders only.' },
    {
      target: 'list',
      page: ORDERS,
      title: 'The pre-orders',
      text: 'When the stock arrives the chip turns to Pre-order · stock arrived; nobody releases it again.',
      expect: 'Each with its chip, {order} among them.',
      placement: 'top',
    },
  ],
}

const WHATSAPP: Tour = {
  id: 'guide.field-sales.l',
  title: 'Send the order to the customer on WhatsApp',
  summary: 'WhatsApp opens with the order written out; you press Send there.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'sales:shareWhatsapp'],
  minutes: 4,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'L',
    rows: 3,
    cast: 'Administrator, Sales agent',
    after: ['H'],
    from: { order: { guide: 'guide.field-sales.h', key: 'order' } },
    values: { customer: 'the customer of the order', order: 'a released order' },
  },
  steps: [
    { title: 'The order on WhatsApp', text: 'Three steps. It uses {order}, from guide H.' },

    admin({ row: 1 }),
    openModule('core', 'Core'),
    { target: 'home:main', page: { module: 'core' }, wait: { kind: 'page', to: CUSTOMERS }, title: 'Open the customers', text: 'Click the Customers card.', placement: 'top' },
    { target: 'filters', page: CUSTOMERS, wait: { kind: 'use' }, title: 'Find the customer', text: 'Type it in the search, then Next.', type: [{ field: 'Search', value: '{customer}' }] },
    { target: 'list', page: CUSTOMERS, pick: '{customer}', wait: { kind: 'page', to: CUSTOMER }, title: 'Open it', text: 'Click its code.', placement: 'top' },
    {
      target: 'core:phone',
      page: CUSTOMER,
      wait: { kind: 'use' },
      must: true,
      title: 'Your own number',
      text: 'Change the phone to your own number, then Next.',
      why: 'The sample numbers may belong to real people.',
    },
    {
      target: 'action:save-customer',
      page: CUSTOMER,
      wait: { kind: 'appear', selector: '[data-tour="action:save-customer"]:disabled' },
      waiting: 'Waiting for the customer to be saved.',
      title: 'Save the customer',
      text: 'Click Save changes.',
    },

    agent('hqAgent', { row: 2 }),
    openModule('sales', 'Sales'),
    ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'action:whatsapp', page: ORDER, wait: { kind: 'click' }, title: 'WhatsApp', text: 'Click WhatsApp. It opens in a new tab; come back here after you have looked.' },
    {
      target: 'page-header',
      page: ORDER,
      title: 'What WhatsApp shows',
      text: 'Nothing is sent until you press Send there.',
      expect: 'WhatsApp on your number, with the message written: greeting, order number, date, items, total and the installation.',
    },

    { row: 3, target: 'so:print', page: ORDER, wait: { kind: 'page', to: { path: '^/sales/orders/[^/]+/print$' } }, title: 'The A4 order', text: 'Click Print.' },
    {
      target: 'print:bar',
      page: { path: '^/sales/orders/[^/]+/print$' },
      title: 'Save it as a PDF',
      text: 'After this guide: press Print here, choose Save as PDF, and attach the file in WhatsApp.',
      expect: 'The A4 order. The WhatsApp link carries text only, so the PDF is attached by hand.',
    },
  ],
}

const INVOICE_PAID: Tour = {
  id: 'guide.field-sales.o',
  title: 'The drafted invoice, paid by receipts',
  summary: 'Billing releases the invoice the system drafted, and the verified receipt pays it.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'service', 'sales:autoInvoice', 'sales:receiptsPayInvoices', 'sales:useReceipts'],
  minutes: 5,
  startAt: '/sales/orders',
  guide: {
    ...FIELD_SALES,
    letter: 'O',
    rows: 3,
    cast: 'Billing, Sales agent, Finance manager',
    after: ['M', 'N'],
    from: { order: { guide: 'guide.field-sales.m', key: 'order' } },
    values: { order: 'the order from guide M', bankRef: 'TRX 77813' },
  },
  steps: [
    {
      title: 'The drafted invoice',
      text: 'Three steps, as three people. The system drafted the invoice of {order} when its delivery order was signed (guides M and N).',
      why: 'Without those, there is no alert to open: take them first.',
    },

    be('SALES_BILLING', 'billing', 'billing clerk', { row: 1 }),
    {
      target: 'alerts',
      wait: { kind: 'page', to: INVOICE },
      title: 'Open the alert',
      text: 'Click the Alerts tray, then the alert “… to check and release” of {order}.',
      placement: 'left',
    },
    {
      target: 'action:release-invoice',
      page: INVOICE,
      remember: 'invoice',
      wait: status('RELEASED'),
      waiting: 'Waiting for the invoice to be released.',
      title: 'Release {invoice}',
      text: 'Check the lines, click Release, then Release again in the question that opens.',
    },
    { target: 'inv:amounts', page: INVOICE, title: 'Released', text: 'The customer owes this invoice.', expect: 'The balance due is the invoice total, less any receipt already verified.', placement: 'left' },

    agent('hqAgent', { row: 2 }),
    ...toOrders(),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    ...recordPayment('Type everything still owed (the dialog says how much), pick Balance and Bank transfer, add a proof, then Record payment.'),
    { target: 'so:payments', page: ORDER, title: 'Waiting for Account', text: 'Only verified receipts count.', expect: 'The receipt, Waiting to verify.', placement: 'left' },

    account({ row: 3 }),
    ...toReceipts(),
    openDoc(RECEIPTS, 'order', RECEIPT, 'Open the receipt', { text: 'Click the receipt of {order}.' }),
    { target: 'action:verify-receipt', page: RECEIPT, wait: { kind: 'appear', selector: '[data-tour="rc:verify"]' }, title: 'Verify it', text: 'Click Verify.' },
    {
      target: 'rc:verify',
      page: RECEIPT,
      wait: status('VERIFIED'),
      waiting: 'Waiting for it to be verified.',
      title: 'The bank reference',
      text: 'Type the reference, then click Verify.',
      type: [{ field: 'Bank', value: '{bankRef}' }],
    },
    { target: 'rc:order', page: RECEIPT, title: 'Fully paid', text: 'The order is paid in full.', expect: 'On the Sales order card: Fully paid.', placement: 'left' },
    ...openPage('billing', 'Billing', 'invoices', 'Invoice', { path: '^/sales/invoices$' }),
    openDoc({ path: '^/sales/invoices$' }, 'invoice', INVOICE, 'Open the invoice'),
    { target: 'inv:payments', page: INVOICE, title: 'Paid by the receipt', text: 'The books stay in your accounting system.', expect: 'The official receipt is listed here, and the balance due is 0.00.', why: 'A deposit paid before the invoice counts when the invoice is released.', placement: 'top' },
  ],
}

export const SALES_GUIDES: Tour[] = [HOUSEHOLD_ORDER, PRICE_OUTSIDE, PAYMENTS, REVISIONS, PRE_ORDER, WHATSAPP, INVOICE_PAID]
