import { account, addItem, admin, agent, installDate, newOrder, NEW_ORDER, ORDER, ORDERS, pickCustomer, RECEIPTS, recordPayment, release, saveDraft, toOrders, toReceipts, verifyReceipt } from '@/tours/guide.sales'
import { be, openCore, openDoc, openFromHome, openModule, openPage, status } from '@/tours/guide.steps'
import type { Guide, Tour, TourStep } from '@/tours/types'

/**
 * Service guides: the Handbook's journeys on screen, step for step (dev mode). They carry on with the orders the Sales
 * guides made (Guide.from). Neutral words only; a company's own come from its file (GUIDE_VALUES_FILE).
 */

const JOBS = { path: '^/service/jobs$' }
const JOB = { path: '^/service/jobs/(?!new$)[^/]+$' }
const BOARD = { path: '^/service/board$' }
const SETTINGS = { path: '^/service/settings$' }
const STOCK = { path: '^/service/stock$' }
const CLAIMS = { path: '^/service/claims$' }
const CLAIM = { path: '^/service/claims/(?!new$)[^/]+$' }
const DELIVERIES = { path: '^/sales/deliveries$' }
const DELIVERY = { path: '^/sales/deliveries/(?!new$)[^/]+$' }
const WARRANTIES = { path: '^/service/warranties$' }

/* The clicks the Service guides repeat */

const store = (extra: Partial<TourStep> = {}) => be('SALES_STORE', 'store', 'store', extra)
const toService = (item: string, label: string, to: { path: string }) => openPage('planning', 'Planning', item, label, to)
const toSettings = () => openPage('setup', 'Settings', 'settings', 'Slots and Stages', SETTINGS)

/** From another module: Service's home, then a page of its menu. */
const serviceFrom = (item: string, label: string, to: { path: string }): TourStep[] => [
  openModule('service', 'Service'),
  ...(item === 'board' ? openFromHome('service', 'Planning Board', 'board', label, to) : openFromHome('service', 'Jobs', item, label, to)),
]
/** From Service: Sales' home, then its orders. */
const salesOrdersFrom = (): TourStep[] => [openModule('sales', 'Sales'), ...openFromHome('sales', 'Sales Transaction', 'orders', 'Sales Order', ORDERS)]

/** The job of an order (or a job number) from the list of jobs. */
const findJob = (word: string, rows: Partial<TourStep> = {}): TourStep[] => [
  { target: 'filters', page: JOBS, wait: { kind: 'use' }, title: 'Find the job', text: 'Type it in the search, then Next.', type: [{ field: 'Job', value: `{${word}}` }], ...rows },
  openDoc(JOBS, word, JOB, 'Open the job', { text: `Click the job of {${word}}.` }),
]
/** On the board with a job picked: a free slot on a person. */
const bookSlot = (extra: Partial<TourStep> = {}): TourStep => ({
  target: 'svc:people',
  page: BOARD,
  pick: '{installer}',
  wait: { kind: 'gone', selector: '[data-tour="svc:pick"]' },
  waiting: 'Waiting for the job to be booked.',
  title: 'Book {installer}',
  text: 'Click the free slot, then Book in the question that opens.',
  placement: 'top',
  ...extra,
})
const addPhoto = (extra: Partial<TourStep> = {}): TourStep => ({
  target: 'svc:photos',
  page: JOB,
  wait: { kind: 'appear', selector: '[data-tour="svc:photos"] button' },
  waiting: 'Waiting for the photo.',
  title: 'A photo of the work',
  text: 'Click + Add photo and choose any picture.',
  placement: 'top',
  ...extra,
})
const recordVisit = (text: string, rows: Partial<TourStep> = {}): TourStep[] => [
  { target: 'action:record-visit', page: JOB, wait: { kind: 'appear', selector: '[data-tour="svc:record"]' }, title: 'Record the visit', text: 'Click Record the visit.', ...rows },
  { target: 'svc:record', page: JOB, wait: status('DONE'), waiting: 'Waiting for the visit to be saved.', title: 'What happened', text },
]
const saveJob: TourStep = {
  target: 'action:save-job',
  page: JOB,
  wait: { kind: 'appear', selector: '[data-tour="action:save-job"]:disabled' },
  waiting: 'Waiting for the job to be saved.',
  title: 'Save the job',
  text: 'Click Save.',
}

const base: Pick<Tour, 'module' | 'journey' | 'pages'> = { module: 'service', journey: true, pages: 'any' }
const book: Pick<Guide, 'book'> = { book: 'Field sales' }

const JOB_APPEARS: Tour = {
  ...base,
  id: 'guide.field-sales.b',
  title: 'The installation job appears',
  summary: 'A released order with installation makes its job by itself.',
  requires: ['dev', 'service', 'sales:askInstallation'],
  minutes: 2,
  startAt: '/',
  guide: { ...book, letter: 'B', rows: 2, cast: 'Administrator', after: ['A'], from: { order: { guide: 'guide.field-sales.a', key: 'order' } }, values: { order: 'a released order with installation' } },
  steps: [
    { title: 'The installation job appears', text: 'Two steps, as the administrator. It uses {order}, from guide A.' },

    admin({ row: 1 }),
    { target: 'launcher:tiles', page: { path: '^/$' }, pick: 'Service', wait: { kind: 'page', to: { module: 'service' } }, title: 'Open Service', text: 'Click the Service tile.' },
    { target: 'home:kpis', page: { module: 'service' }, title: 'The Service home', text: 'What needs the office today.', expect: 'Not booked counts the new job.' },
    { target: 'svc:waiting', page: { module: 'service' }, title: 'Waiting to be booked', text: 'Oldest first.', expect: 'The job of {order}, with the date the customer asks for.', placement: 'top' },

    { row: 2, target: 'home:tiles', page: { module: 'service' }, pick: 'Jobs', wait: { kind: 'page', to: JOBS }, title: 'Open Jobs', text: 'Click the Jobs tile.' },
    ...findJob('order'),
    { target: 'svc:site', page: JOB, remember: 'job', title: 'Customer and site', text: 'Nobody typed any of it.', expect: 'The order’s contact, phone and address, and the preferred date.' },
    { target: 'svc:items', page: JOB, title: 'What goes there', text: 'From the order’s lines.', expect: 'The package items and the gift.', placement: 'top' },
  ],
}

const PLANNING: Tour = {
  ...base,
  id: 'guide.field-sales.d',
  title: 'Planning Board: who suits the job, and how long it takes',
  summary: 'People and the sites they go to, a booking, and a job that needs longer.',
  requires: ['dev', 'service', 'sales:askInstallation'],
  minutes: 8,
  startAt: '/service/settings',
  guide: {
    ...book,
    letter: 'D',
    rows: 9,
    cast: 'Administrator',
    after: ['B'],
    from: { order: { guide: 'guide.field-sales.a', key: 'order' } },
    values: { order: 'a released order with installation', installer: 'the first installer', installer2: 'the second installer', installer3: 'the third installer' },
  },
  steps: [
    { title: 'The Planning Board', text: 'Nine steps, as the administrator. It books the job of {order}.', why: 'Steps 2 and 3 change who takes which job. Change them back afterwards if your company wants them otherwise.' },

    admin({ row: 1 }),
    ...toSettings(),
    { target: 'set:people', page: SETTINGS, title: 'People', text: 'Look at Takes and Goes to.', expect: 'Installers take Installation, the technician Service and Repair, and everyone goes to any site, unless it was changed.' },

    { row: 2, target: 'set:people', page: SETTINGS, pick: '{installer2} > Edit', wait: { kind: 'appear', selector: '[data-tour="set:person"]' }, title: 'Edit {installer2}', text: 'Click Edit on the row of {installer2}.' },
    { target: 'set:person', page: SETTINGS, wait: { kind: 'gone', selector: '[data-tour="set:person"]' }, waiting: 'Waiting for it to be saved.', title: 'Also warranty jobs', text: 'Tick Warranty under Takes, then click Save.' },
    { target: 'set:takes', page: SETTINGS, title: 'Who takes which job', text: 'Look at {installer2}.', expect: 'A ✓ under Warranty: an installer who also takes warranty jobs.', placement: 'top' },

    { row: 3, target: 'set:people', page: SETTINGS, pick: '{installer3} > Edit', wait: { kind: 'appear', selector: '[data-tour="set:person"]' }, title: 'Edit {installer3}', text: 'Click Edit on the row of {installer3}.' },
    { target: 'set:person', page: SETTINGS, wait: { kind: 'gone', selector: '[data-tour="set:person"]' }, waiting: 'Waiting for it to be saved.', title: 'Landed houses only', text: 'Under Goes to, keep only Landed house, then click Save.' },
    { target: 'set:people', page: SETTINGS, title: 'Saved', text: 'Look at {installer3}.', expect: 'Goes to: Landed house.' },

    { row: 4, target: 'set:groups', page: SETTINGS, title: 'Slot groups', text: 'How long a job gets. Look at Picked first for.', expect: 'Installation for installations, Service filter for service and repair, Warranty for warranty. Guide J looks at the categories.', placement: 'top' },

    ...toService('jobs', 'Jobs', JOBS).map((s, i) => (i === 0 ? { ...s, row: 5 } : s)),
    ...findJob('order'),
    { target: 'svc:site-type', page: JOB, remember: 'job', wait: { kind: 'use' }, must: true, title: 'The kind of site', text: 'Pick Condo / apartment, then Next.' },
    saveJob,

    { row: 6, target: 'svc:book-link', page: JOB, wait: { kind: 'page', to: BOARD }, title: 'Book it', text: 'Click Book on the board.' },
    { target: 'svc:pick', page: BOARD, title: 'The job is picked', text: 'The board opens on the day the customer asked for.', expect: 'Installation is the slot group.', placement: 'right' },
    { target: 'svc:people', page: BOARD, title: 'Who suits it', text: 'People who do not suit the job are greyed out; the line under the board says why.', expect: '{installer3} does not go to condo / apartment sites; the technician does not take installation jobs.', placement: 'top' },

    bookSlot({ row: 7 }),
    { target: 'svc:people', page: BOARD, title: 'Booked', text: 'The job sits in its slot.', expect: '{job} on {installer}.', placement: 'top' },

    { row: 8, target: 'svc:people', page: BOARD, pick: '{job}', wait: { kind: 'page', to: JOB }, title: 'Open the job', text: 'Click {job} on the board.', placement: 'top' },
    { target: 'action:extend', page: JOB, wait: { kind: 'appear', selector: '[data-tour="svc:extend"]' }, title: 'It needs longer', text: 'In Booking, click Extend the time.', placement: 'left' },
    { target: 'svc:extend', page: JOB, wait: { kind: 'gone', selector: '[data-tour="svc:extend"]' }, waiting: 'Waiting for the time to be extended.', title: 'An hour more', text: 'Set the time an hour later, type a reason such as “Hard water pipe”, then click Extend.' },
    { target: 'svc:booking', page: JOB, title: 'Extended', text: 'On the board its block is longer: nothing new can be booked over it, and a job it runs into is named.', expect: 'Expected done by: the new time · extended, with the reason.', placement: 'left' },

    { row: 9, target: 'rail:footer', page: JOB, pick: 'Service home', wait: { kind: 'page', to: { path: '^/service$' } }, title: 'Service home', text: 'Click the house at the bottom of the menu.', placement: 'right' },
    {
      target: 'home:kpis',
      page: { path: '^/service$' },
      title: 'The Overdue card',
      text: 'Booked jobs past their expected time with the visit not recorded.',
      expect: 'How many are overdue. On the board they have a red outline.',
      why: 'A job stays overdue until its visit is recorded, even if it is extended or moved.',
    },
  ],
}

const VISIT: Tour = {
  ...base,
  id: 'guide.field-sales.e',
  title: 'Record the visit',
  summary: 'The photo, what happened and closing the job.',
  requires: ['dev', 'service', 'sales:askInstallation'],
  minutes: 3,
  startAt: '/service/jobs',
  guide: { ...book, letter: 'E', rows: 3, cast: 'Administrator', after: ['D'], from: { job: { guide: 'guide.field-sales.d', key: 'job' } }, values: { job: 'a booked job' } },
  steps: [
    { title: 'Record the visit', text: 'Three steps, as the administrator, for {job} from guide D. Keep a picture ready: any picture will do.' },

    admin({ row: 1 }),
    ...findJob('job'),
    addPhoto(),

    ...recordVisit('Complete is picked. Pick Paid, and Bank transfer under How, then click Save the visit.', { row: 2 }),
    { target: 'svc:visit', page: JOB, remember: 'job', title: 'What the installer recorded', text: 'If it had been overdue, the activity says it was late.', expect: 'Complete, Paid on site by bank transfer, who recorded it and when.' },

    { row: 3, target: 'action:close-job', page: JOB, wait: status('CLOSED'), waiting: 'Waiting for the job to be closed.', title: 'Close it', text: 'Click Close job: nothing is left to do.' },
    { target: 'page-header', page: JOB, title: 'Closed', text: 'The installer’s phone app will record the visit on site; until then the office does.', expect: 'Closed.' },
  ],
}

const REMINDERS: Tour = {
  ...base,
  id: 'guide.field-sales.f',
  title: 'Service reminders',
  summary: 'Filter changes come due after the installation, and their jobs are made.',
  requires: ['dev', 'service'],
  minutes: 1,
  startAt: '/service/jobs',
  guide: { ...book, letter: 'F', rows: 2, cast: 'Administrator' },
  steps: [
    { title: 'Service reminders', text: 'Two steps, as the administrator.' },

    admin({ row: 1 }),
    ...toService('reminders', 'Reminders', { path: '^/service/reminders$' }),
    { target: 'list', page: { path: '^/service/reminders$' }, title: 'Upcoming', text: 'Started by completed installations.', expect: 'Items with a service interval (filter changes), each with its due date.', placement: 'top' },

    {
      row: 2,
      target: 'action:make-jobs',
      page: { path: '^/service/reminders$' },
      wait: { kind: 'appear', selector: '.erp-toast-body' },
      waiting: 'Waiting for the answer.',
      title: 'Make the jobs',
      text: 'Click Make jobs now. It is safe to click twice; the server also does it every hour.',
    },
    {
      target: 'list',
      page: { path: '^/service/reminders$' },
      title: 'Due within 14 days',
      text: 'The message at the bottom left says what was made.',
      expect: 'A service job for each reminder due within 14 days, Not booked, asking for the due day; or “Nothing due in the next 14 days”.',
      placement: 'top',
    },
  ],
}

const CATEGORIES: Tour = {
  ...base,
  id: 'guide.field-sales.j',
  title: 'Job categories, missing details and alerts',
  summary: 'The categories by site, a move the salesperson hears about, and stock not ready.',
  requires: ['dev', 'service', 'sales:askInstallation', 'sales:reviseOrders'],
  minutes: 8,
  startAt: '/service/settings',
  guide: {
    ...book,
    letter: 'J',
    rows: 7,
    cast: 'Administrator, Sales agent',
    after: ['H', 'I'],
    from: { order: { guide: 'guide.field-sales.h', key: 'order' }, preOrder: { guide: 'guide.field-sales.i', key: 'order' } },
    values: { order: 'an order not booked yet', preOrder: 'a pre-order', installer: 'an installer', address: '8 Jalan Cempaka, Taman Megah', categories: 'Your job categories, each with its slot length and the sites it is for.' },
  },
  steps: [
    { title: 'Job categories and alerts', text: 'Seven steps, as two people. It uses {order} from guide H and {preOrder} from guide I.' },

    admin({ row: 1 }),
    ...toSettings(),
    { target: 'set:groups', page: SETTINGS, title: 'Slot groups are the job categories', text: 'Look at the slot length, the sites and the status.', expect: '{categories}', placement: 'top' },

    ...toService('jobs', 'Jobs', JOBS).map((s, i) => (i === 0 ? { ...s, row: 2 } : s)),
    ...findJob('order'),
    { target: 'svc:missing', page: JOB, optional: true, title: 'Missing before booking', text: 'It never stops the booking.', expect: 'What the office still needs, such as the postcode or the state.' },
    { target: 'svc:address', page: JOB, wait: { kind: 'use' }, must: true, title: 'The site address', text: 'If it is empty, type an address such as {address}, then Next. The job cannot be saved without one.' },
    { target: 'svc:site-type', page: JOB, remember: 'job', wait: { kind: 'use' }, must: true, title: 'The kind of site', text: 'Pick Landed house, then Next.' },
    saveJob,

    { row: 3, target: 'svc:book-link', page: JOB, wait: { kind: 'page', to: BOARD }, title: 'Book it', text: 'Click Book on the board.' },
    { target: 'svc:pick', page: BOARD, wait: { kind: 'use' }, title: 'The slot group list', text: 'Open the list and look, then Next.', expect: 'Installation is picked first; a category that is not for landed houses is not offered.', placement: 'right' },

    bookSlot({ row: 4 }),
    { target: 'svc:people', page: BOARD, title: 'Booked', text: 'The sales order shows the booking too, so a later revision needs approval.', expect: '{job} on {installer}.', placement: 'top' },

    { row: 5, target: 'svc:people', page: BOARD, pick: '{job}', wait: { kind: 'page', to: JOB }, title: 'Open the job', text: 'Click {job} on the board.', placement: 'top' },
    { target: 'svc:book-link', page: JOB, wait: { kind: 'page', to: BOARD }, title: 'Move it', text: 'Click Move.' },
    {
      target: 'svc:people',
      page: BOARD,
      wait: { kind: 'gone', selector: '[data-tour="svc:pick"]' },
      waiting: 'Waiting for the job to be moved.',
      title: 'Another time',
      text: 'Click another free slot, then Move in the question that opens.',
      placement: 'top',
    },

    ...salesOrdersFrom().map((s, i) => (i === 0 ? { ...s, row: 6 } : s)),
    agent('hqAgent'),
    { target: 'alerts', page: ORDERS, wait: { kind: 'page', to: ORDER }, title: 'The salesperson’s alerts', text: 'Click the Alerts tray. Read the alert of {order}, then click it.', expect: 'The job was rescheduled, with the new day, time and installer, and “Please let the customer know”.', placement: 'left' },
    { target: 'page-header', page: ORDER, title: 'It opens the order', text: 'The salesperson tells the customer.' },

    admin({ row: 7 }),
    ...serviceFrom('board', 'Planning Board', BOARD),
    { target: 'svc:not-booked', page: BOARD, pick: '{preOrder}', wait: { kind: 'appear', selector: '[data-tour="svc:pick"]' }, title: 'A job with short stock', text: 'Click the job of {preOrder}.', placement: 'right' },
    { target: 'svc:day', page: BOARD, wait: { kind: 'use' }, title: 'Tomorrow', text: 'Click › until the day is {tomorrow}, then Next.' },
    bookSlot(),
    {
      target: 'svc:people',
      page: BOARD,
      title: 'Stock not ready',
      text: 'The server checks every hour, 24 hours before a job.',
      expect: 'Within the hour: At risk on the job and on the board, and an alert to whoever books jobs and to the salesperson. It clears once the stock is there.',
      placement: 'top',
    },
  ],
}

const CLAIMS_GUIDE: Tour = {
  ...base,
  id: 'guide.field-sales.k',
  title: 'Installer claims',
  summary: 'The fee of a paid, complete job: keyed, checked by Account and paid.',
  requires: ['dev', 'service', 'sales:useReceipts'],
  minutes: 10,
  startAt: '/service/settings',
  guide: {
    ...book,
    letter: 'K',
    rows: 9,
    cast: 'Administrator, Sales agent, Finance manager',
    after: ['A', 'E'],
    from: { order: { guide: 'guide.field-sales.a', key: 'order' }, job: { guide: 'guide.field-sales.e', key: 'job' } },
    values: { order: 'the order of a complete job', job: 'the complete job', installer: 'the installer who did it', group: 'Installation', fee: '120.00', amount: '150.00', bankRef: 'TRX 77901', invoiceNo: 'INV-001', pv: 'PV-1001' },
  },
  steps: [
    { title: 'Installer claims', text: 'Nine steps, as three people. It claims {job}, the job of {order}. Keep a picture ready for the proof and the invoice.' },

    admin({ row: 1 }),
    ...toSettings(),
    { target: 'set:groups', page: SETTINGS, pick: '{group} > Edit', wait: { kind: 'appear', selector: '[data-tour="set:group"]' }, title: 'The {group} category', text: 'Click Edit on the {group} row.', placement: 'top' },
    { target: 'set:group', page: SETTINGS, wait: { kind: 'gone', selector: '[data-tour="set:group"]' }, waiting: 'Waiting for it to be saved.', title: 'The installer’s fee', text: 'Set Installer’s fee per job to {fee} if it is empty, then click Save.' },
    { target: 'set:people', page: SETTINGS, title: 'Who claims fees', text: 'Look at Claims fees.', expect: 'Yes for the installers, No for the technician and the warranty people.' },

    ...salesOrdersFrom().map((s, i) => (i === 0 ? { ...s, row: 2 } : s)),
    agent('agent'),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    ...recordPayment('Type everything still owed (the dialog says how much), pick Balance, add a proof, then Record payment.'),
    { target: 'so:payments', page: ORDER, title: 'Waiting for Account', text: 'Only verified receipts count.', expect: 'The receipt, Waiting to verify.', placement: 'left' },

    account({ row: 3 }),
    ...toReceipts(),
    ...verifyReceipt(),
    { target: 'menu:receipts', placement: 'right', wait: { kind: 'page', to: RECEIPTS }, title: 'Any other receipt?', text: 'Click Official Receipts: an order is paid only when all its receipts are verified.' },
    ...verifyReceipt({ optional: true }),
    { target: 'menu:receipts', placement: 'right', optional: true, page: { path: '^/sales/receipts/[^/]+$' }, wait: { kind: 'page', to: RECEIPTS }, title: 'Back to the receipts', text: 'Click Official Receipts.' },
    { target: 'list', page: RECEIPTS, title: 'All verified', text: 'Nothing of {order} waits any more.', expect: 'The order is Fully paid: only then can its job be claimed.', placement: 'top' },

    admin({ row: 4 }),
    ...serviceFrom('claims', 'Installer Claims', CLAIMS),
    { target: 'action:new-claim', page: CLAIMS, wait: { kind: 'page', to: { path: '^/service/claims/new$' } }, title: 'Start a claim', text: 'Click New claim.' },
    { target: 'claim:who', page: { path: '^/service/claims/new$' }, wait: { kind: 'use' }, must: true, title: 'The installer', text: 'Pick {installer}. Keep today as the day in the period, then Next.' },
    { target: 'claim:jobs', page: { path: '^/service/claims/new$' }, title: 'The period and its jobs', text: 'The 1st–15th is paid on the 25th, the 16th to the month end on the 10th.', expect: 'The jobs done in the period. One that cannot be claimed is greyed out and says why.', placement: 'top' },

    { row: 5, target: 'claim:jobs', page: { path: '^/service/claims/new$' }, wait: { kind: 'use' }, title: 'Another amount', text: 'Jobs that can be claimed are ticked already: keep {job}. Change its amount to {amount}, then Next.', placement: 'top' },
    { target: 'action:save-claim', page: { path: '^/service/claims/new$' }, wait: { kind: 'click' }, title: 'Try to save', text: 'Click Save draft.' },
    { target: 'claim:jobs', page: { path: '^/service/claims/new$' }, wait: { kind: 'use' }, title: 'It asks why', text: 'Another amount than the fee by rule needs a reason. Type one, then Next.', type: [{ field: 'Reason', value: 'Extra piping' }], placement: 'top' },
    { target: 'action:save-claim', page: { path: '^/service/claims/new$' }, wait: { kind: 'page', to: CLAIM }, waiting: 'Waiting for the claim to be saved.', title: 'Save it', text: 'Click Save draft. The claim gets its number.' },

    { row: 6, target: 'claim:invoice', page: CLAIM, remember: 'claim', wait: { kind: 'use' }, title: 'The installer’s invoice', text: 'Type the number, click + Add invoice and choose any PDF or picture, then Next.', type: [{ field: 'Invoice', value: '{invoiceNo}' }], placement: 'top' },
    { target: 'action:submit-claim', page: CLAIM, wait: status('SUBMITTED'), waiting: 'Waiting for the claim to be submitted.', title: 'Submit it', text: 'Click Submit to Account.', why: 'Without the invoice it is refused, unless Self-billed is ticked.' },

    { target: 'menu:claims', placement: 'right', wait: { kind: 'page', to: CLAIMS }, title: 'Submitted', text: 'Click Installer Claims, back to the list.' },
    account({ row: 7 }),
    { target: 'alerts', page: CLAIMS, wait: { kind: 'page', to: CLAIM }, title: 'Account’s alert', text: 'Click the Alerts tray, then the alert of {claim}.', placement: 'left' },
    { target: 'claim:jobs', page: CLAIM, title: 'What is claimed', text: 'Account checks it.', expect: 'The job, the fee by rule, the amount, its reason, and the invoice below.', placement: 'top' },

    { row: 8, target: 'action:approve-claim', page: CLAIM, wait: status('APPROVED'), waiting: 'Waiting for your decision.', title: 'Approve it', text: 'Click Approve.', why: 'Whoever submitted a claim can never approve it. Send back asks what is wrong.' },

    { row: 9, target: 'action:pay-claim', page: CLAIM, wait: { kind: 'appear', selector: '[data-tour="claim:pay"]' }, title: 'Paid', text: 'Click Record payment.' },
    { target: 'claim:pay', page: CLAIM, wait: status('PAID'), waiting: 'Waiting for the payment to be recorded.', title: 'The payment voucher', text: 'Type the PV number, then click Record payment.', type: [{ field: 'Payment voucher', value: '{pv}' }] },
    { target: 'page-header', page: CLAIM, title: '{claim} is paid', text: 'The job cannot be claimed twice.', expect: 'Paid, with the PV number.' },
  ],
}

const STOCK_AND_DELIVERY: Tour = {
  ...base,
  id: 'guide.field-sales.m',
  title: 'Stock for jobs, and the delivery order 24 hours before',
  summary: 'A booked job holds its stock; once the store confirms it, the delivery order makes itself.',
  requires: ['dev', 'service', 'sales:holdStock', 'sales:autoDelivery'],
  minutes: 8,
  startAt: '/sales/orders',
  guide: {
    ...book,
    letter: 'M',
    rows: 6,
    cast: 'Sales agent, Administrator, Store',
    values: { customer: 'a customer of yours', item: 'an item in stock', installer: 'an installer' },
  },
  steps: [
    { title: 'Stock for jobs', text: 'Six steps, as three people.' },

    agent('hqAgent', { row: 1 }),
    ...toOrders(),
    newOrder(),
    pickCustomer(),
    ...addItem('Search {item}, tick it, set the quantity to 2 and click Add 1 item.'),
    installDate('Keep Installation, pick tomorrow ({tomorrow}), then Next.'),
    saveDraft(NEW_ORDER),
    release(),
    { target: 'page-header', page: ORDER, remember: 'order', title: '{order} is released', text: 'Its job waits to be booked.', expect: 'Released.' },

    admin({ row: 2 }),
    ...serviceFrom('board', 'Planning Board', BOARD),
    { target: 'svc:not-booked', page: BOARD, pick: '{order}', wait: { kind: 'appear', selector: '[data-tour="svc:pick"]' }, title: 'Pick the job', text: 'Click the job of {order}.', placement: 'right' },
    { target: 'svc:day', page: BOARD, wait: { kind: 'use' }, title: 'Tomorrow', text: 'Click › until the day is {tomorrow}, then Next.' },
    bookSlot({ why: 'In a slot less than 24 hours from now, its delivery order is made as soon as the store confirms. A later slot gets it at the hourly check, 24 hours before.' }),
    { target: 'svc:unfinished', page: BOARD, optional: true, title: 'Unfinished', text: 'People with an old job not finished say so under their name.', expect: 'Unfinished, with the job’s number.', placement: 'right' },

    ...salesOrdersFrom().map((s, i) => (i === 0 ? { ...s, row: 3 } : s)),
    agent('hqAgent'),
    newOrder({ title: 'Another order' }),
    pickCustomer(),
    { target: 'action:add-item', page: NEW_ORDER, wait: { kind: 'appear', selector: '[data-tour="item-picker"]' }, title: 'What others see', text: 'Click Add item.' },
    {
      target: 'item-picker',
      page: NEW_ORDER,
      wait: { kind: 'gone', selector: '[data-tour="item-picker"]' },
      waiting: 'Waiting for you to close it.',
      title: 'Held for the booked job',
      text: 'Search {item} and look at In stock, then click Cancel.',
      expect: 'What is left, with at least 2 held.',
      type: [{ field: 'Search', value: '{item}' }],
    },

    store({ row: 4 }),
    ...serviceFrom('stock', 'Stock for Jobs', STOCK),
    { target: 'svc:stock-day', page: STOCK, title: 'Tomorrow’s jobs', text: 'The store checks what each booked job needs.', expect: 'The job of {order}, with Needed, On hand, Held by earlier jobs and Free.', placement: 'top' },

    { row: 5, target: 'svc:stock-day', page: STOCK, pick: '{order} > Confirm stock', wait: { kind: 'click' }, title: 'Confirm the stock', text: 'Click Confirm stock on the job of {order}.', placement: 'left' },
    ...toService('jobs', 'Jobs', JOBS),
    ...findJob('order'),
    {
      target: 'svc:stock',
      page: JOB,
      title: 'Its delivery order',
      text: 'Made by itself a few seconds after the store confirmed.',
      expect: 'Delivery order, with its number. Not there yet? Wait a few seconds and open the job again. In a slot more than 24 hours away it comes at the hourly check.',
      why: 'A job not confirmed 24 hours before is At risk and gets no delivery order.',
      placement: 'left',
    },

    ...salesOrdersFrom().map((s, i) => (i === 0 ? { ...s, row: 6 } : s)),
    agent('hqAgent'),
    openDoc(ORDERS, 'order', ORDER, 'Open the order'),
    { target: 'action:revise', page: ORDER, title: 'No more revisions', text: 'Point at Revise.', expect: 'Revise is grey and names the delivery order.' },
  ],
}

const SIGNED_DELIVERY: Tour = {
  ...base,
  id: 'guide.field-sales.n',
  title: 'The signed delivery order, and parts coming back',
  summary: 'Collected, signed, the visit with a part returned, and a customer who does not sign.',
  requires: ['dev', 'service', 'sales:signedDelivery'],
  minutes: 9,
  startAt: '/sales/deliveries',
  guide: {
    ...book,
    letter: 'N',
    rows: 7,
    cast: 'Administrator, Store, Management',
    after: ['M'],
    from: { order: { guide: 'guide.field-sales.m', key: 'order' } },
    values: { order: 'the order from guide M', item: 'an item of the order', months: '12', signer: 'Puan Salmah' },
  },
  steps: [
    { title: 'The signed delivery order', text: 'Seven steps, as three people. It uses {order}, from guide M. Keep a picture ready: it stands in for the signed paper and the photos.' },

    admin({ row: 1 }),
    openModule('core', 'Core'),
    openCore('Items & Units', 'Open the items', { path: '^/core/items$' }),
    { target: 'filters', page: { path: '^/core/items$' }, wait: { kind: 'use' }, title: 'Find the item', text: 'Type its code in the search, then Next.', type: [{ field: 'Search', value: '{item}' }] },
    { target: 'list', page: { path: '^/core/items$' }, pick: '{item}', wait: { kind: 'page', to: { path: '^/core/items/(?!new$)[^/]+$' } }, title: 'Open it', text: 'Click its code.', placement: 'top' },
    { target: 'core:warranty', page: { path: '^/core/items/(?!new$)[^/]+$' }, wait: { kind: 'use' }, title: 'A warranty', text: 'Type the months, then Next.', type: [{ field: 'Warranty', value: '{months}' }], why: 'A complete installation registers it from then on (guide P).' },
    {
      target: 'action:save-item',
      page: { path: '^/core/items/(?!new$)[^/]+$' },
      wait: { kind: 'appear', selector: '[data-tour="action:save-item"]:disabled' },
      waiting: 'Waiting for the item to be saved.',
      title: 'Save the item',
      text: 'Click Save changes.',
    },

    openModule('sales', 'Sales'),
    ...openFromHome('sales', 'Sales Transaction', 'deliveries', 'Delivery Order', DELIVERIES),
    store({ row: 2 }),
    { target: 'dl:list', page: DELIVERIES, pick: '{order}', wait: { kind: 'page', to: DELIVERY }, title: 'Open the delivery order', text: 'Click the delivery order of {order}.', placement: 'top' },
    {
      target: 'action:collect',
      page: DELIVERY,
      remember: 'delivery',
      wait: { kind: 'appear', selector: '[data-tour="action:record-signature"]' },
      waiting: 'Waiting for it to be collected.',
      title: 'The installer collects',
      text: 'Click Mark collected, then Mark collected in the question that opens.',
    },
    { target: 'do:signature', page: DELIVERY, title: 'Collected', text: 'It can no longer be changed. Check in takes the goods back.', expect: 'Collected, waiting for the signature.' },

    { row: 3, target: 'action:record-signature', page: DELIVERY, wait: { kind: 'appear', selector: '[data-tour="do:sign"]' }, title: 'The customer signs', text: 'Click Record signature.' },
    {
      target: 'do:sign',
      page: DELIVERY,
      wait: status('CONFIRMED'),
      waiting: 'Waiting for the signature to be recorded.',
      title: 'Who signed',
      text: 'Type who signed, add any picture as the signed paper, then click Record signature.',
      type: [{ field: 'Signed by', value: '{signer}' }],
    },
    { target: 'do:signature', page: DELIVERY, title: 'Delivered', text: 'The order is Done, and its invoice is drafted for billing.', expect: 'Delivered, signed by {signer}.' },

    admin({ row: 4 }),
    ...serviceFrom('jobs', 'Jobs', JOBS),
    ...findJob('order'),
    addPhoto(),
    ...recordVisit('Complete is picked. Pick Not paid, say why, type 1 under Parts coming back, then click Save the visit.'),
    { target: 'svc:returns', page: JOB, remember: 'job', title: 'Parts coming back', text: 'The store receives them.', expect: '1 {item}, not received yet.', placement: 'left' },

    store({ row: 5 }),
    ...toService('returns', 'Returned Parts', { path: '^/service/returns$' }),
    { target: 'list', page: { path: '^/service/returns$' }, pick: '{job} > Receive', wait: { kind: 'appear', selector: '[data-tour="svc:receive"]' }, title: 'Receive it', text: 'Click Receive on {job}.', placement: 'top' },
    { target: 'svc:receive', page: { path: '^/service/returns$' }, wait: { kind: 'gone', selector: '[data-tour="svc:receive"]' }, waiting: 'Waiting for it to be received.', title: 'Good or damaged', text: 'Type 1 under Good and 0 under Damaged, then click Receive.', why: 'Something missing needs a note. Stock in the warehouse system changes only when it is scanned there.' },
    { target: 'list', page: { path: '^/service/returns$' }, title: 'Received', text: 'By whom, too.', expect: '1 good.', placement: 'top' },

    ...[openModule('sales', 'Sales'), ...openFromHome('sales', 'Sales Transaction', 'deliveries', 'Delivery Order', DELIVERIES)].map((s, i) => (i === 0 ? { ...s, row: 6 } : s)),
    {
      target: 'dl:list',
      page: DELIVERIES,
      wait: { kind: 'page', to: DELIVERY },
      title: 'Another installation',
      text: 'Open the draft delivery order of another installation.',
      why: 'None there? Pause, make one by hand with the Handbook’s journey M (steps 1, 2 and 5), come back here and Resume.',
      placement: 'top',
    },
    {
      target: 'action:collect',
      page: DELIVERY,
      remember: 'second',
      wait: { kind: 'appear', selector: '[data-tour="action:refuse"]' },
      waiting: 'Waiting for it to be collected.',
      title: 'Collected',
      text: 'Click Mark collected, then Mark collected in the question that opens.',
    },
    { target: 'do:signature', page: DELIVERY, title: '{second} is collected', text: 'At the site, the customer does not want to sign.' },
    { target: 'action:refuse', page: DELIVERY, wait: { kind: 'appear', selector: '[data-tour="do:sign"]' }, title: 'The customer does not sign', text: 'Click Not signed.' },
    {
      target: 'do:sign',
      page: DELIVERY,
      wait: { kind: 'gone', selector: '[data-tour="action:refuse"]' },
      waiting: 'Waiting for it to be sent to Management.',
      title: 'Why, with a photo',
      text: 'Type why, add any picture, then click Send to Management.',
      type: [{ field: 'Why', value: 'Nobody home to sign' }],
    },
    { target: 'do:signature', page: DELIVERY, title: 'Not signed', text: '{second} waits for Management.', expect: 'Not signed: waiting for Management.' },

    { target: 'menu:deliveries', placement: 'right', wait: { kind: 'page', to: DELIVERIES }, title: 'Back to the list', text: 'Click Delivery Order.' },
    be('MANAGEMENT', 'management', 'manager', { row: 7 }),
    { target: 'alerts', page: DELIVERIES, wait: { kind: 'page', to: DELIVERY }, title: 'Management’s alert', text: 'Click the Alerts tray, then the alert of {second}.', placement: 'left' },
    { target: 'action:accept-unsigned', page: DELIVERY, wait: { kind: 'appear', selector: '[data-tour="do:sign"]' }, title: 'Accept it', text: 'Click Accept unsigned.' },
    { target: 'do:sign', page: DELIVERY, wait: status('CONFIRMED'), waiting: 'Waiting for it to be accepted.', title: 'Your decision', text: 'Type a note if you like, then click Accept unsigned.' },
    { target: 'do:signature', page: DELIVERY, title: 'Delivered, not signed', text: 'Whoever recorded the refusal can never accept it.', expect: 'Accepted without a signature, with the manager’s name.' },
  ],
}

const WARRANTY: Tour = {
  ...base,
  id: 'guide.field-sales.p',
  title: 'Warranty',
  summary: 'The unit registered by the visit, its serial number, and a claim decided and repaired.',
  requires: ['dev', 'service'],
  minutes: 6,
  startAt: '/service/jobs',
  guide: {
    ...book,
    letter: 'P',
    rows: 4,
    cast: 'Administrator',
    after: ['N'],
    from: { order: { guide: 'guide.field-sales.m', key: 'order' } },
    values: { order: 'the order from guide M', installer: 'the warranty person', part: 'a part' },
  },
  steps: [
    { title: 'Warranty', text: 'Four steps, as the administrator. The visit of guide N registered the unit of {order}.' },

    admin({ row: 1 }),
    ...toService('warranties', 'Warranties', WARRANTIES),
    { target: 'filters', page: WARRANTIES, wait: { kind: 'use' }, title: 'Find the unit', text: 'Type the order, the customer’s phone or the serial number, press Enter, then Next.', type: [{ field: 'Search', value: '{order}' }] },
    { target: 'list', page: WARRANTIES, title: 'The unit', text: 'Covered from the installation.', expect: 'Its months of cover. Waiting for payment until guide O, then Active.', placement: 'top' },

    { row: 2, target: 'list', page: WARRANTIES, pick: '{order} > Serial', wait: { kind: 'appear', selector: '[data-tour="svc:warranty-ask"]' }, title: 'Its serial number', text: 'Click Serial.', placement: 'top' },
    { target: 'svc:warranty-ask', page: WARRANTIES, wait: { kind: 'gone', selector: '[data-tour="svc:warranty-ask"]' }, waiting: 'Waiting for it to be saved.', title: 'Type it', text: 'Type the serial number, then click Save.', type: [{ field: 'Serial', value: '{newSerial}' }] },
    { target: 'list', page: WARRANTIES, pick: '{order} > New claim', wait: { kind: 'appear', selector: '[data-tour="svc:warranty-ask"]' }, title: 'A claim', text: 'Click New claim.', placement: 'top' },
    { target: 'svc:warranty-ask', page: WARRANTIES, wait: { kind: 'page', to: JOB }, waiting: 'Waiting for the warranty job.', title: 'What is wrong', text: 'Type the problem, then click Add warranty job.', type: [{ field: 'What', value: 'Handle is loose' }] },
    { target: 'page-header', page: JOB, remember: 'job', title: 'A warranty job', text: 'At the same site, with the problem as its note.', expect: 'Not booked.' },

    { row: 3, target: 'action:assess', page: JOB, wait: { kind: 'appear', selector: '[data-tour="svc:assess"]' }, title: 'Decide the claim', text: 'Click Decide the claim.', placement: 'left' },
    { target: 'svc:assess', page: JOB, wait: { kind: 'gone', selector: '[data-tour="svc:assess"]' }, waiting: 'Waiting for the decision.', title: 'Covered', text: 'Pick Covered, then click Save the decision.', why: 'Chargeable asks why and points to a sales order; Rejected asks why and cancels the job.' },
    { target: 'svc:warranty', page: JOB, title: 'Decided', text: 'It never blocks the booking.', expect: 'Covered, with your name.', placement: 'left' },

    { row: 4, target: 'svc:book-link', page: JOB, wait: { kind: 'page', to: BOARD }, title: 'Book it', text: 'Click Book on the board.' },
    { target: 'svc:day', page: BOARD, wait: { kind: 'use' }, title: 'Tomorrow', text: 'Click › until the day is {tomorrow}, then Next.' },
    bookSlot(),
    { target: 'svc:people', page: BOARD, pick: '{job}', wait: { kind: 'page', to: JOB }, title: 'Open the job', text: 'Click {job} on the board.', placement: 'top' },
    addPhoto(),
    ...recordVisit('Complete is picked. Pick No charge, add {part} under Parts used, then click Save the visit.'),
    { target: 'svc:parts', page: JOB, title: 'Parts used', text: 'Recorded only: stock is not taken yet.', expect: 'The part you added.', placement: 'left' },
  ],
}

export const SERVICE_GUIDES: Tour[] = [JOB_APPEARS, PLANNING, VISIT, REMINDERS, CATEGORIES, CLAIMS_GUIDE, STOCK_AND_DELIVERY, SIGNED_DELIVERY, WARRANTY]
