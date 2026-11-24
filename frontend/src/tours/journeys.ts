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
      why: 'Short stock never stops an order. Where the company makes pre-orders, it marks the whole order a pre-order until the stock arrives. Stock is held from the moment the installer is booked.',
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
    {
      target: 'action:whatsapp',
      page: { path: ORDER_PAGE },
      optional: true,
      title: '1 · Sales: send it to the customer',
      text: 'WhatsApp opens a chat with the customer, the order’s summary already written. The ERP sends nothing by itself: the salesperson reads it and presses Send there.',
    },
    {
      target: 'action:revise',
      page: { path: ORDER_PAGE },
      optional: true,
      title: '1 · Sales: a change after submitting',
      text: 'Where the company allows it, the salesperson can still revise the order until it is delivered: products, address, contact or price. The number stays, and the earlier version is kept to look at.',
      why: 'After the installer is booked, or when a price changes, the Sales Manager approves the revision.',
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
      text: "The slot group is the job category: only those for this job's type and kind of site are listed, and the usual one is picked first. Its length is the time the job is expected to take. Pick another if this one needs longer.",
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
      target: 'svc:stock-job',
      go: '/service/stock',
      page: { code: 'V09' },
      optional: true,
      title: '4 · Warehouse: confirm the stock',
      text: 'The warehouse sees tomorrow’s jobs, what each needs and what is free once earlier jobs have theirs, and confirms each one.',
      why: 'Where the company uses it, the delivery order of a confirmed job is made by itself 24 hours before, and the order can no longer be revised. A job not confirmed by then is marked At risk.',
      placement: 'top',
    },
    {
      target: 'account',
      placement: 'left',
      wait: { kind: 'user', role: 'SALES_STORE', sameBranchAs: 'order' },
      title: '4 · Warehouse: be the store',
      text: 'Switch to {people}: they make and confirm delivery orders at the order’s branch.',
      why: 'If the stock is not there 24 hours before the installation, the job is marked At risk, and the office and the salesperson get an alert. Not built yet: transfers between branches with approval.',
    },
    {
      target: 'dl:waiting',
      go: '/sales/deliveries',
      page: { code: 'S15' },
      handover: true,
      wait: { kind: 'page', to: { path: '^/sales/deliveries/[^/]+$' } },
      title: '4 · Warehouse: make the delivery order',
      text: 'Find order {order} on the waiting list and press its button: Create DO, or the delivery order already made for it. When stock is short: Waiting for stock, then Create DO anyway.',
      why: 'Short stock only warns: the warehouse decides whether to deliver what there is.',
    },
    {
      target: 'page-header',
      page: { path: '^/sales/deliveries/[^/]+$' },
      remember: 'delivery',
      title: '4 · Warehouse: the delivery order',
      text: 'What goes, to whom and with which installer. Where the customer signs, it is first collected, and delivered only with the signature.',
    },
    {
      target: 'action:collect',
      page: { path: '^/sales/deliveries/[^/]+$' },
      optional: true,
      handover: true,
      wait: { kind: 'gone', selector: '[data-tour="action:collect"]' },
      title: '4 · Warehouse: the installer collects',
      text: 'Press Mark collected and confirm, when the installer takes the goods. A postponed job’s goods are checked back in here.',
      why: 'Not built yet: the pick list from the WMS, and the installer collecting the stock by scan.',
    },
    {
      target: 'action:confirm-delivery',
      page: { path: '^/sales/deliveries/[^/]+$' },
      optional: true,
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
      why: 'Not built yet: the installer’s phone app, where they accept the job, take the photos and get the customer’s signature on the screen.',
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
      text: 'Press Record the visit: Complete, whether the customer paid on site, what was done, and any parts coming back to the store.',
    },
    {
      target: 'action:record-signature',
      go: '@delivery',
      page: { path: '^/sales/deliveries/[^/]+$' },
      optional: true,
      handover: true,
      wait: { kind: 'appear', selector: `${HEADER} [data-status="CONFIRMED"]` },
      title: '5 · Installer: the customer signs',
      text: 'Press Record signature: who signed, and a photo of the signed delivery order. Only now is it delivered.',
      why: 'A customer who does not sign needs a reason and a photo, and Management accepts it or sends it back. Where the company uses it, the invoice is drafted now for billing.',
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
      why: 'Whoever recorded a receipt can never verify it.',
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
      go: '/service/claims',
      page: { code: 'V07' },
      title: '7 · The installer’s claim',
      text: 'Installers claim a fee for each complete, fully paid job, twice a month, with their own invoice. The office keys the claim, Account checks and approves it, then records the payment.',
      why: 'Whoever submitted a claim can never approve it. A job recorded more than 72 hours after its expected finish gets no fee, unless someone enters an amount with a reason.',
      placement: 'top',
    },
    {
      target: 'list',
      go: '/service/reminders',
      page: { code: 'V06' },
      title: '7 · After-sales: service reminders',
      text: 'The completed installation started a reminder for each item with a service interval, such as a filter change. 14 days before it is due, a service job is made for the office to book.',
      placement: 'top',
    },
    {
      target: 'list',
      go: '/service/warranties',
      page: { code: 'V11' },
      title: '7 · After-sales: warranties',
      text: 'Items with a warranty in Core are registered when their installation is complete, and become active once the order is fully paid. New claim makes a warranty job, and the office decides: covered, chargeable or rejected.',
      why: 'A unit is found by the customer’s phone, the order or its serial number.',
      placement: 'top',
    },

    /* Stage 8 · Management */
    {
      target: 'home:kpis',
      go: '/service',
      page: { code: 'V01' },
      title: '8 · Management: keeping watch',
      text: 'The Overdue card counts booked jobs past their expected finish with no visit recorded. Alerts in the top bar tell the right people about postponed and moved jobs, and stock that is not ready. Every change is in each document’s activity and the audit trail.',
      why: 'Management also decides a delivery order the customer did not sign, and cancelling an order after its delivery order.',
    },
    {
      title: 'Done: one order, every department',
      text: 'You followed order {order} from the salesperson through scheduling, the warehouse, the installation and Account to after-sales. Each part also has its own shorter tour under Help.',
    },
  ],
}

export const JOURNEYS: Tour[] = [ORDER_TO_AFTER_SALES]
