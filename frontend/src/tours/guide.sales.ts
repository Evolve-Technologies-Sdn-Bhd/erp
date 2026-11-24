import { be, openPage, status } from './guide.steps'
import type { TourStep } from './types'

/** The clicks in Sales that several guides repeat, in Sales' own guides and in Service's. */

export const NEW_ORDER = { path: '^/sales/orders/new$' }
export const ORDER = { path: '^/sales/orders/(?!new$)[^/]+$' }
export const ORDERS = { code: 'S10' }
export const RECEIPT = { path: '^/sales/receipts/[^/]+$' }
export const RECEIPTS = { code: 'S35' }
export const INVOICE = { path: '^/sales/invoices/(?!new$)[^/]+$' }
export const CUSTOMER = { path: '^/core/customers/(?!new$)[^/]+$' }
export const CUSTOMERS = { path: '^/core/customers$' }
export const FLOW = { code: 'S34' }

/* The clicks the Sales guides repeat */

export const admin = (extra: Partial<TourStep> = {}) => be('ADMIN', 'admin', 'administrator', extra)
export const agent = (as: 'agent' | 'hqAgent', extra: Partial<TourStep> = {}) => be('SALES_AGENT', as, 'sales agent', extra)
/** A request goes to the branch's own manager where it has one. */
export const salesManager = (as: 'salesManager' | 'branchManager', extra: Partial<TourStep> = {}) => be('SALES_MANAGER', as, 'sales manager', extra)
export const account = (extra: Partial<TourStep> = {}) => be('FINANCE_MANAGER', 'account', 'finance manager', extra)

export const toSalesFlow = () => openPage('policies', 'Operation Policies', 'sales-flow', 'Sales Flow', FLOW)
export const toOrders = () => openPage('transaction', 'Sales Transaction', 'orders', 'Sales Order', ORDERS)
export const toReceipts = () => openPage('billing', 'Billing', 'receipts', 'Official Receipts', RECEIPTS)

export const newOrder = (extra: Partial<TourStep> = {}): TourStep => ({ target: 'action:new-order', page: ORDERS, wait: { kind: 'page', to: NEW_ORDER }, title: 'Start the order', text: 'Click Add new order.', ...extra })
export const pickCustomer = (): TourStep => ({
  target: 'so:customer',
  page: NEW_ORDER,
  wait: { kind: 'use' },
  title: 'Pick the customer',
  text: 'Type {customer}, pick it from the list, then Next.',
  type: [{ field: 'Customer', value: '{customer}' }],
  placement: 'right',
})
export const addItem = (text = 'Search {item}, tick it, keep the quantity at 1 and click Add 1 item.'): TourStep[] => [
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
export const installDate = (text: string): TourStep => ({ target: 'so:install-date', page: NEW_ORDER, wait: { kind: 'use' }, must: true, title: 'The preferred date', text })
/** A saved order's changes: Save draft is grey again once they are saved. */
export const saveDraft = (page: typeof NEW_ORDER, extra: Partial<TourStep> = {}): TourStep => ({
  target: 'action:save-draft',
  page,
  wait: page === NEW_ORDER ? { kind: 'page', to: ORDER } : { kind: 'appear', selector: '[data-tour="action:save-draft"]:disabled' },
  waiting: 'Waiting for the order to be saved.',
  title: 'Save the draft',
  text: 'Click Save draft.',
  ...extra,
})
export const release = (extra: Partial<TourStep> = {}): TourStep => ({
  target: 'action:release',
  page: ORDER,
  wait: status('RELEASED'),
  waiting: 'Waiting for the order to be released.',
  title: 'Release it',
  text: 'Click Release, then Release again in the question that opens.',
  ...extra,
})
/** Account opens a receipt of the order and verifies it against the bank. */
export const verifyReceipt = (extra: Partial<TourStep> = {}, rows: Partial<TourStep> = {}): TourStep[] => [
  { target: 'list', page: RECEIPTS, pick: '{order}', wait: { kind: 'page', to: RECEIPT }, title: 'Open the receipt', text: 'Click the receipt of {order}.', ...extra, ...rows },
  { target: 'action:verify-receipt', page: RECEIPT, wait: { kind: 'appear', selector: '[data-tour="rc:verify"]' }, title: 'Verify it', text: 'Click Verify.', ...extra },
  {
    target: 'rc:verify',
    page: RECEIPT,
    wait: status('VERIFIED'),
    waiting: 'Waiting for it to be verified.',
    title: 'The bank reference',
    text: 'Type the reference, then click Verify.',
    type: [{ field: 'Bank', value: '{bankRef}' }],
    ...extra,
  },
]
/** Record a payment on the order's Payments card. */
export const recordPayment = (text: string, type?: TourStep['type'], row?: number): TourStep[] => [
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
