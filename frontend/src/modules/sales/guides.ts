import { be, openModule, openPage, status } from '@/tours/guide.steps'
import type { Tour } from '@/tours/types'

/**
 * Sales guides: the Handbook's journeys on screen, step for step (dev mode). Neutral words only; a company's own people
 * and items come from its file (GUIDE_VALUES_FILE). Each Handbook step starts where `row` says so.
 */

const NEW_ORDER = { path: '^/sales/orders/new$' }
const ORDER = { path: '^/sales/orders/(?!new$)[^/]+$' }

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
      text: 'Type these, then click Next here.',
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

export const SALES_GUIDES: Tour[] = [HOUSEHOLD_ORDER]
