import type { Tour } from '@/tours/types'

/**
 * Guided tours for Sales (T2), from the Handbook's Sales journeys: the home (M), an order from customer to lines (B),
 * deciding an approval (A) and a cash sale at the counter (I). They work on any company's data: no document numbers
 * or amounts. A tour never writes: it walks the person through filling a form, then points at Save or Release and
 * leaves pressing them to the person (tour.rules.ts → sensitive).
 */

const SALES_HOME: Tour = {
  id: 'sales.home',
  title: 'Your Sales home',
  summary: 'What the cards count, the charts you choose and where your approvals wait.',
  module: 'sales',
  pages: ['S01'],
  permission: 'sales.view',
  minutes: 1,
  startAt: '/sales',
  steps: [
    {
      target: 'home:tiles',
      page: { code: 'S01' },
      title: 'The menu groups',
      text: 'Each tile opens a group of pages: Sales Transaction for enquiries, quotations, orders and deliveries; Billing for invoices, cash sales, debit notes and returns; Operation Policies for the settings.',
    },
    {
      target: 'home:kpis',
      page: { code: 'S01' },
      title: 'Four numbers to watch',
      text: 'Open sales orders, what is delivered but not yet invoiced, what waits for your approval, and customers over their limit. Click a card to open the list behind it.',
    },
    {
      target: 'dashboard',
      page: { code: 'S01' },
      title: 'Your own charts',
      text: 'Below the cards are charts you choose. Add chart, move them with ‹ and ›, and pick 2 or 3 columns. They are saved to your account, so they follow you to any computer.',
      why: 'Every chart follows what you may see: an agent’s charts show only their own customers.',
    },
    {
      target: 'approvals',
      page: { code: 'S01' },
      title: 'Approvals',
      text: 'Credit, discount and price requests waiting for you, with a count. The tour “Approve a request” shows how to decide one.',
    },
    {
      target: 'help',
      title: 'More Sales tours',
      text: 'Make a sales order, Approve a request and Ring up a cash sale are under Help, on the pages they belong to.',
    },
  ],
}

const ORDER_CREATE: Tour = {
  id: 'sales.order.create',
  title: 'Make a sales order',
  summary: 'From the customer to the lines and the totals. You fill in a real form; saving stays your choice.',
  module: 'sales',
  pages: ['S10', 'S11'],
  permission: 'sales.order.edit',
  minutes: 3,
  startAt: '/sales/orders',
  steps: [
    {
      target: 'status-tabs',
      page: { code: 'S10' },
      title: 'Sales orders, by status',
      text: 'Draft, waiting for approval, released, partly delivered and done. Click a tab to see only those.',
    },
    {
      target: 'action:new-order',
      page: { code: 'S10' },
      wait: { kind: 'page', to: { path: '^/sales/orders/new$' } },
      title: 'Start a new order',
      text: 'Click Add new order.',
    },
    {
      target: 'so:customer',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'fill' },
      title: 'Pick the customer',
      text: 'Type a customer code or name and pick from the list. Their price list, credit term and address come with them.',
      why: 'Only active customers can be ordered for. A prospect is added in Core first.',
      placement: 'right',
    },
    {
      target: 'so:header',
      page: { path: '^/sales/orders/new$' },
      title: 'The order’s details',
      text: 'Order date, when the customer wants it, their PO reference and the delivery address. Your branch and you as the agent are filled in for you.',
    },
    {
      target: 'action:add-item',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'appear', selector: '[data-tour="item-picker"]' },
      title: 'Add an item',
      text: 'Click Add item. In the window that opens, search by code, name or barcode, tick an item, set the quantity and click Add. It shows the list price, the last price to this customer and the stock at your branch.',
      why: 'Items not for sale, or excluded for your branch, are greyed out with the reason. Short stock only warns.',
    },
    {
      target: 'item-picker',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'appear', selector: '[data-tour="so:line"]' },
      waiting: 'Waiting for the item on the order.',
      title: 'Tick an item, then Add',
      text: 'Search by code, name or barcode, tick an item, set the quantity and click Add.',
    },
    {
      target: 'so:lines',
      page: { path: '^/sales/orders/new$' },
      title: 'Your lines',
      text: 'Change the quantity, price or discount on any line. Add package and Add voucher sit next to Add item.',
      why: 'A price or discount outside the company’s rules needs the Sales Manager’s approval before the order can be released.',
    },
    {
      target: 'so:totals',
      page: { path: '^/sales/orders/new$' },
      title: 'Totals',
      text: 'A preview while you type. The server works out the real totals when the order is saved.',
      placement: 'left',
    },
    {
      target: 'action:save-draft',
      page: { path: '^/sales/orders/new$' },
      title: 'Saving is yours to do',
      text: 'Save draft stores the order and gives it its number. The tour does not save for you: click it yourself when the order is real. A draft can still be changed or deleted.',
    },
    {
      page: { path: '^/sales/orders/' },
      title: 'After saving',
      text: 'Release locks the order and checks the customer’s credit. Over their limit, the order waits for approval: you give a reason and request it. Released orders appear on the Delivery Order waiting list.',
    },
  ],
}

const APPROVE: Tour = {
  id: 'sales.approvals',
  title: 'Approve a request',
  summary: 'Where requests wait for you, what to look at, and what happens when you decide.',
  module: 'sales',
  pages: ['S02'],
  permission: 'sales.view',
  minutes: 2,
  startAt: '/sales/approvals',
  steps: [
    {
      target: 'approvals:tabs',
      page: { code: 'S02' },
      title: 'Waiting for you',
      text: 'Requests waiting for you, and those you approved or rejected. The count also shows on the Approvals link in every Sales top bar.',
    },
    {
      target: 'approvals:list',
      page: { code: 'S02' },
      title: 'Each request',
      text: 'A card says what is asked and why, who asked and the amount. Click one to see it on the right.',
      placement: 'right',
    },
    {
      target: 'approvals:detail',
      page: { code: 'S02' },
      title: 'What to look at',
      text: 'What the policy found (credit used, overdue, or a discount or price against the list) and the note from whoever asked. Open the document to see all of it.',
      placement: 'left',
    },
    {
      target: 'approvals:decide',
      page: { code: 'S02' },
      optional: true,
      title: 'Approve or reject',
      text: 'Write a comment, then Approve or Reject. The tour does not decide for you. A rejected document goes back to draft with your comment.',
      why: 'Whoever asked for an approval can never approve it themselves.',
    },
    {
      page: { code: 'S02' },
      title: 'After you approve',
      text: 'The document goes back to whoever asked, who then releases it. Approving alone does not release anything.',
    },
  ],
}

const CASH_SALE: Tour = {
  id: 'sales.cash-sale',
  title: 'Ring up a cash sale',
  summary: 'A sale at the counter: items, payment and change. Releasing stays your choice.',
  module: 'sales',
  pages: ['S23', 'S24'],
  permission: 'sales.cash_sale.edit',
  minutes: 2,
  startAt: '/sales/cash-sales',
  steps: [
    {
      target: 'action:new-cash-sale',
      page: { code: 'S23' },
      wait: { kind: 'page', to: { path: '^/sales/cash-sales/new$' } },
      title: 'Start a cash sale',
      text: 'Click New cash sale.',
    },
    {
      target: 'cs:customer',
      page: { path: '^/sales/cash-sales/new$' },
      title: 'The walk-in customer',
      text: 'A cash sale is for the walk-in cash customer. Prices include tax, and there is no credit check: the customer pays on the spot.',
    },
    {
      target: 'cs:scan',
      page: { path: '^/sales/cash-sales/new$' },
      wait: { kind: 'appear', selector: '[data-tour="cs:line"]' },
      waiting: 'Waiting for an item on the sale.',
      title: 'Scan or search',
      text: 'Scan a barcode, or type an item code and press Enter. Or click Search items, tick an item and click Add.',
    },
    {
      target: 'cs:payment',
      page: { path: '^/sales/cash-sales/new$' },
      wait: { kind: 'fill' },
      title: 'How they pay',
      text: 'Pick how the customer pays and type the amount received. The change is worked out for you.',
    },
    {
      target: 'cs:totals',
      page: { path: '^/sales/cash-sales/new$' },
      title: 'The balance must be 0',
      text: 'To pay, paid and the balance. The sale can only be released when nothing is left to pay.',
      placement: 'left',
    },
    {
      target: 'action:take-payment',
      page: { path: '^/sales/cash-sales/new$' },
      title: 'Releasing is yours to do',
      text: 'Take payment and release records the sale, the payment and the stock out in one go. The tour does not press it: do it yourself when the sale is real.',
      why: 'Without the buyer’s name and TIN, the sale goes into the month’s consolidated e-Invoice.',
    },
  ],
}

export const SALES_TOURS: Tour[] = [SALES_HOME, ORDER_CREATE, APPROVE, CASH_SALE]
