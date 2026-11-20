import type { Tour } from './types'

/**
 * Journeys: one document through several people, switching person at each hand-off (dev mode), so the roles show what
 * each may do. Every real action is a hand-over: the person presses it, the tour watches for the outcome.
 *
 * "One order, every department" follows the field-sales process a client drew in eight stages (sales, submission,
 * scheduling, warehouse, installation, account, after-sales, management), using only what the ERP does today.
 * Stages the ERP does not do yet are said so in the steps, not shown as if they worked. Neutral words only: client
 * names never go in this repo.
 */

const ORDER_PAGE = '^/sales/orders/(?!new$)[^/]+$'
const HEADER = '[data-tour="page-header"]'

export const ORDER_TO_AFTER_SALES: Tour = {
  id: 'journey.order-to-after-sales',
  title: 'One order, every department',
  summary:
    'Follow one household order from the salesperson to scheduling, the warehouse, the installation, Account and after-sales, switching person at each hand-off.',
  module: 'sales',
  journey: true,
  pages: 'any',
  requires: ['dev', 'service', 'sales:askInstallation', 'sales:useReceipts'],
  minutes: 15,
  startAt: '/sales/orders',
  steps: [
    {
      title: 'One order, every department',
      text: 'You will be several people in turn: a salesperson, the office, the warehouse and Account. At each hand-off the tour asks you to switch person in the top-right menu, so you see what each role can and cannot do.',
      why: 'Every Save, Release, Book or Verify is yours to press. The tour hands the page over to you and carries on when it sees it done.',
    },

    /* Stage 1 · Sales: the order with the customer */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'SALES_AGENT' },
      title: '1 · Sales: be a salesperson',
      text: 'Switch to {people} in the top-right menu. A salesperson keys orders with the customer, and sees only their own customers.',
    },
    {
      target: 'action:new-order',
      go: '/sales/orders',
      page: { code: 'S10' },
      wait: { kind: 'page', to: { path: '^/sales/orders/new$' } },
      title: '1 · Sales: start the order',
      text: 'Click Add new order. The salesperson makes the sales order straight away, with the customer.',
    },
    {
      target: 'so:new-customer',
      page: { path: '^/sales/orders/new$' },
      optional: true,
      title: '1 · Sales: a new household?',
      text: '+ New customer adds them with a name, a phone and an address, ready at once on cash terms. The office completes them later.',
      placement: 'right',
    },
    {
      target: 'so:customer',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'fill' },
      title: '1 · Sales: pick the customer',
      text: 'Type a name or code and pick from the list.',
      placement: 'right',
    },
    {
      target: 'action:add-package',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'appear', selector: '[data-tour="package-picker"]' },
      title: '1 · Sales: add the package',
      text: 'Click Add package. In the window, pick the package, choose the free gift if it offers one, and click Add package.',
      why: 'The price always comes from the system, never from a poster.',
    },
    {
      target: 'package-picker',
      page: { path: '^/sales/orders/new$' },
      wait: { kind: 'appear', selector: '[data-tour="so:line"]' },
      waiting: 'Waiting for the package on the order.',
      title: 'Pick a package, then Add package',
      text: 'Pick the package, choose the free gift if it offers one, and click Add package.',
    },
    {
      target: 'so:install-date',
      page: { path: '^/sales/orders/new$' },
      optional: true,
      wait: { kind: 'fill' },
      title: '1 · Sales: the installation date',
      text: 'Keep Installation and pick the day the customer prefers. The office confirms the installer and the slot.',
      why: 'If an item is short, no date is needed: skip this step, and the order waits for stock.',
    },
    {
      target: 'action:save-draft',
      page: { path: '^/sales/orders/new$' },
      handover: true,
      wait: { kind: 'page', to: { path: ORDER_PAGE } },
      title: '1 · Sales: save the order',
      text: 'Press Save draft. The order gets its number.',
    },
    {
      target: 'page-header',
      page: { path: ORDER_PAGE },
      remember: 'order',
      title: '1 · Sales: order {order}',
      text: 'Saved as a draft. Nothing has gone to the office or the warehouse yet, and the salesperson can still change it.',
    },

    /* Stage 2 · Submission */
    {
      target: 'action:release',
      page: { path: ORDER_PAGE },
      handover: true,
      wait: { kind: 'appear', selector: `${HEADER} [data-status="RELEASED"]` },
      title: '2 · Submit: release the order',
      text: 'Press Release and confirm. The order is submitted and locked, and an installation job is made for the office.',
      why: 'Not built yet: stock reserved on submission, and the separate pre-order when nothing is in stock. Short stock only warns for now.',
    },
    {
      target: 'action:record-payment',
      page: { path: ORDER_PAGE },
      optional: true,
      handover: true,
      wait: { kind: 'appear', selector: '[data-tour="so:payments"] [data-status="WAITING"]' },
      title: '1 · Sales: upload the payment proof',
      text: 'Press Record payment: Deposit, how it was paid, the amount and the day, and add a photo of the slip. It gets an OR number and waits for Account.',
      why: 'Only receipts Account has verified count as paid.',
      placement: 'left',
    },

    /* Stage 3 · Office: review and scheduling */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'ADMIN' },
      title: '3 · Office: be the scheduler',
      text: 'Switch to {people}. In the process the Sales Admin or Branch Admin schedules installations; in this demo the administrator does it.',
    },
    {
      target: 'svc:waiting',
      go: '/service',
      page: { code: 'V01' },
      title: '3 · Office: the job is waiting',
      text: 'Releasing order {order} made an installation job here, not booked, with the customer’s address, the items and the preferred date. Nobody retyped it.',
      placement: 'right',
    },
    {
      target: 'svc:not-booked',
      go: '/service/board',
      page: { code: 'V02' },
      wait: { kind: 'appear', selector: '[data-tour="svc:pick"]' },
      waiting: 'Waiting for you to pick the job.',
      title: '3 · Office: pick the job',
      text: 'Click the job for order {order}. A star means the customer asked for this day.',
      placement: 'right',
    },
    {
      target: 'svc:pick',
      page: { code: 'V02' },
      title: '3 · Office: how long it takes',
      text: 'The slot group picked first suits the job type, such as Standard for installations: that is the time the job is expected to take. Pick another if this one needs longer.',
      placement: 'right',
    },
    {
      target: 'svc:people',
      page: { code: 'V02' },
      handover: true,
      wait: { kind: 'gone', selector: '[data-tour="svc:pick"]' },
      title: '3 · Office: book it',
      text: 'Click a free slot on someone who can take the job, and confirm. People greyed out say why they cannot.',
      why: 'The board shares one view across the branches each person works in.',
      placement: 'left',
    },
    {
      page: { code: 'V02' },
      title: '3 · Office: booked',
      text: 'The job has a person, a day and an expected finish. If it runs late, Extend the time on the job with a reason; past its expected finish with no visit recorded, it shows as overdue.',
    },

    /* Stage 4 · Warehouse */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'SALES_STORE', sameBranchAs: 'order' },
      title: '4 · Warehouse: be the store',
      text: 'Switch to {people}: they make and confirm delivery orders at the order’s branch.',
      why: 'Not built yet: the delivery order made by itself 24 hours before the installation, which then locks the order; transfers between branches with approval; the At Risk flag.',
    },
    {
      target: 'dl:waiting',
      go: '/sales/deliveries',
      page: { code: 'S15' },
      handover: true,
      wait: { kind: 'page', to: { path: '^/sales/deliveries/[^/]+$' } },
      title: '4 · Warehouse: make the delivery order',
      text: 'Find order {order} on the waiting list and press its button: Create DO, or Waiting for stock when stock is short, then Create DO anyway.',
      why: 'Short stock only warns: the warehouse decides whether to deliver what there is.',
    },
    {
      target: 'action:confirm-delivery',
      page: { path: '^/sales/deliveries/[^/]+$' },
      handover: true,
      wait: { kind: 'appear', selector: `${HEADER} [data-status="CONFIRMED"]` },
      title: '4 · Warehouse: release the goods',
      text: 'Check what is going and press Confirm delivery.',
      why: 'Not built yet: the pick list from the WMS, and the installer collecting the stock by scan.',
    },

    /* Stage 5 · Installer */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'ADMIN' },
      title: '5 · Installer: the office records the visit',
      text: 'Installers have no ERP sign-in yet, so the office records their visit for them. Switch to {people}.',
      why: 'Not built yet: the installer’s phone app, where they accept the job, take the photos and get the customer’s signature.',
    },
    {
      target: 'list',
      go: '/service/jobs?status=booked',
      page: { code: 'V03' },
      wait: { kind: 'page', to: { code: 'V04', path: '^/service/jobs/(?!new$)' } },
      title: '5 · Installer: open the job',
      text: 'Open the job for order {order}.',
      placement: 'top',
    },
    {
      target: 'svc:photos',
      page: { code: 'V04' },
      remember: 'job',
      handover: true,
      wait: { kind: 'appear', selector: '[data-tour="svc:photos"] button[title^="Open "]' },
      title: '5 · Installer: a photo of the work',
      text: 'Press + Add photo and pick a photo of the finished installation.',
    },
    {
      target: 'action:record-visit',
      page: { code: 'V04' },
      handover: true,
      wait: { kind: 'appear', selector: `${HEADER} [data-status="DONE"]` },
      title: '5 · Installer: record the visit',
      text: 'Press Record the visit: Complete, whether the customer paid on site, and what was done.',
      why: 'Not built yet: the customer signing the digital delivery order, and unused parts going back to the warehouse.',
    },

    /* Stage 6 · Account */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'FINANCE_MANAGER' },
      title: '6 · Account: be Account',
      text: 'Switch to {people}. Account checks every payment against the bank.',
    },
    {
      target: 'list',
      go: '/sales/receipts?status=waiting',
      page: { code: 'S35' },
      wait: { kind: 'page', to: { code: 'S36' } },
      title: '6 · Account: open the receipt',
      text: 'Open the receipt for order {order}.',
      placement: 'top',
    },
    {
      target: 'rc:proof',
      page: { code: 'S36' },
      title: '6 · Account: check the proof',
      text: 'The slip or settlement the salesperson attached. Check it against the bank before deciding.',
    },
    {
      target: 'page-actions',
      page: { code: 'S36' },
      handover: true,
      wait: { kind: 'appear', selector: `${HEADER} [data-status="VERIFIED"]` },
      title: '6 · Account: verify it',
      text: 'Press Verify and type the bank transaction or settlement reference. Or Send back with what is wrong.',
      why: 'Whoever recorded a receipt can never verify it. Not built yet: installer claims with their invoice, checked by Account.',
    },

    /* Stage 7 · After-sales */
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'ADMIN' },
      title: '7 · After-sales: back to the office',
      text: 'Switch to {people}.',
    },
    {
      target: 'svc:links',
      go: '@job',
      page: { code: 'V04' },
      optional: true,
      title: '7 · The payment reached the job',
      text: 'Order payment shows what Account verified. Service heard it from Sales; nobody keyed it in twice.',
      placement: 'left',
    },
    {
      target: 'list',
      go: '/service/reminders',
      page: { code: 'V06' },
      title: '7 · After-sales: service reminders',
      text: 'The completed installation started a reminder for each item with a service interval, such as a filter change. 14 days before it is due, a service job is made for the office to book.',
      why: 'Not built yet: warranty registered after installation and full verified payment, and the warranty claim process. Warranty jobs can be added by hand.',
      placement: 'top',
    },

    /* Stage 8 · Management */
    {
      target: 'home:kpis',
      go: '/service',
      page: { code: 'V01' },
      title: '8 · Management: keeping watch',
      text: 'The Overdue card counts booked jobs past their expected finish with no visit recorded. Every change on the way is in each document’s activity and the audit trail.',
      why: 'Not built yet: order changes after submission by role, cancellation after the delivery order by Management, and the unsigned delivery order exception.',
    },
    {
      title: 'Done: one order, every department',
      text: 'You followed order {order} from the salesperson through scheduling, the warehouse, the installation and Account to after-sales. Each part also has its own shorter tour under Help.',
    },
  ],
}

export const JOURNEYS: Tour[] = [ORDER_TO_AFTER_SALES]
