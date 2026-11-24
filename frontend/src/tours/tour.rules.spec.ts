import { describe, expect, it } from 'vitest'
import {
  atStep,
  declinedWelcome,
  docNoIn,
  fillText,
  fitsPart,
  peopleFor,
  type Person,
  finished,
  freshTutorial,
  guideGroups,
  guideWords,
  isInteractive,
  isSensitiveLabel,
  isSensitiveTargetId,
  leftTour,
  madeWords,
  offersWelcome,
  pageMatches,
  readTutorial,
  rowAt,
  stepLabel,
  tourProblems,
  toursFor,
} from './tour.rules'
import type { Tour } from './types'

const tour = (over: Partial<Tour> = {}): Tour => ({
  id: 'sales.order.create',
  title: 'Make a sales order',
  summary: 'From customer to release.',
  module: 'sales',
  pages: ['S10', 'S11'],
  minutes: 3,
  steps: [{ title: 'Start', text: 'Here.' }],
  ...over,
})

describe('the tour never presses a real action', () => {
  it('knows the buttons that change records, send something out or cannot be undone', () => {
    for (const label of [
      'Release',
      'Approve RM 46,200.00',
      'Reject · back to draft',
      'Post',
      'Delete draft',
      'Remove',
      'Record payment',
      'Pay',
      'Verify',
      'Confirm delivery',
      'Send for approval',
      'Send back',
      'Email to supplier',
      'E-mail',
      'Award',
      'Cancel balance',
      'Cancel receipt',
      'Submit',
      'Deactivate',
      'Block',
      'Discontinue',
      'Revoke all sessions',
      'Unlock',
      'Reset to starter',
      'Load 12 rows',
      'Mark as complete',
      'Record the visit',
      'Save draft',
      'Save changes',
      'Create quotation',
      'Transfer to sales order',
      'Convert to PO',
      'Import',
      'Book',
      'Extend',
      'Dismiss',
      'Close job',
      'Make jobs now',
      'Take off the board',
    ]) {
      expect(isSensitiveLabel(label), label).toBe(true)
    }
  })

  it('leaves alone the words that only name a place or a state, and plain dialog buttons', () => {
    for (const label of ['Approvals', 'Released', 'Payments', 'Confirmed', 'Blocked', 'Download', 'Cancel', 'Close', 'Not now', 'Next', 'Saved', 'Add line', 'Add item', 'Search items', 'Open', 'Search pages', '']) {
      expect(isSensitiveLabel(label), label).toBe(false)
    }
  })

  it('reads words only on short action labels, so a customer named Post Office never blocks a job card', () => {
    expect(isSensitiveLabel('JB-0007 · Installation · Post Office Kampung Baru · asks for 21 Nov')).toBe(false)
    expect(isSensitiveLabel('Booking')).toBe(false)
    expect(isSensitiveLabel('Approve RM 46,200.00')).toBe(true)
  })

  it('reads action ids the same way; menu and other ids are places', () => {
    expect(isSensitiveTargetId('action:release')).toBe(true)
    expect(isSensitiveTargetId('action:send-for-approval')).toBe(true)
    expect(isSensitiveTargetId('action:delete')).toBe(true)
    expect(isSensitiveTargetId('action:new')).toBe(false)
    expect(isSensitiveTargetId('action:save-draft')).toBe(true)
    expect(isSensitiveTargetId('action:take-payment')).toBe(true)
    expect(isSensitiveTargetId('action:add-line')).toBe(false)
    expect(isSensitiveTargetId('menu:email-templates')).toBe(false)
    expect(isSensitiveTargetId('rail:billing')).toBe(false)
  })

  it('refuses a tour that waits for a sensitive action to be pressed, but lets it explain one', () => {
    const waits = tour({ steps: [{ target: 'action:release', title: 'Release', text: 'Click Release.', wait: { kind: 'click' } }] })
    expect(tourProblems(waits)).toEqual([expect.stringContaining('"action:release" changes records')])
    const explains = tour({ steps: [{ target: 'action:release', title: 'Release', text: 'Release sends it to the customer.' }] })
    expect(tourProblems(explains)).toEqual([])
  })

  it('counts clicking, filling, opening and going to a page as using the element; pointing and reading are not', () => {
    expect(isInteractive({ title: 't', text: 't', wait: { kind: 'click' } })).toBe(true)
    expect(isInteractive({ title: 't', text: 't', wait: { kind: 'fill' } })).toBe(true)
    expect(isInteractive({ title: 't', text: 't', wait: { kind: 'appear', selector: '.p-dialog' } })).toBe(true)
    expect(isInteractive({ title: 't', text: 't', wait: { kind: 'page', to: { layout: 'module' } } })).toBe(true)
    expect(isInteractive({ title: 't', text: 't', wait: { kind: 'hover' } })).toBe(false)
    expect(isInteractive({ title: 't', text: 't' })).toBe(false)
  })
})

describe('journeys', () => {
  const people: Person[] = [
    { code: 'AG1', name: 'Agent One', roles: ['SALES_AGENT'], branchCodes: ['HQ'] },
    { code: 'ST1', name: 'Store HQ', roles: ['SALES_STORE'], branchCodes: ['HQ'] },
    { code: 'ST2', name: 'Store Showrooms', roles: ['SALES_STORE'], branchCodes: ['KD', 'PG'] },
    { code: 'BOSS', name: 'Boss', roles: ['ADMIN', 'SALES_STORE'], branchCodes: ['HQ', 'KD', 'PG'] },
  ]

  it('names who can play a part, at the document’s branch when it matters', () => {
    expect(peopleFor(people, 'SALES_STORE')).toBe('Store HQ, Store Showrooms or Boss')
    expect(peopleFor(people, 'SALES_STORE', 'KD')).toBe('Store Showrooms or Boss')
    expect(peopleFor(people, 'SALES_AGENT')).toBe('Agent One')
    expect(peopleFor(people, 'FINANCE_MANAGER')).toBe('someone with that role')
    expect(fitsPart(people[2], 'SALES_STORE', 'KD')).toBe(true)
    expect(fitsPart(people[1], 'SALES_STORE', 'KD')).toBe(false)
    expect(fitsPart(null, 'ADMIN')).toBe(false)
  })

  it('fills in what the journey knows, and reads document numbers from page titles', () => {
    expect(fillText('Open the job for order {order}.', { order: 'SO-0012' })).toBe('Open the job for order SO-0012.')
    expect(fillText('Switch to {people}.', {})).toBe('Switch to .')
    expect(docNoIn('Sales order SO-0012')).toBe('SO-0012')
    expect(docNoIn('Official receipt OR-2611-0003')).toBe('OR-2611-0003')
    expect(docNoIn('Job JB-0007')).toBe('JB-0007')
    expect(docNoIn('New sales order')).toBe('New sales order')
  })

  const journey = (steps: Tour['steps'], over: Partial<Tour> = {}) => tour({ id: 'journey.test', journey: true, requires: ['dev'], pages: 'any', steps, ...over })

  it('lets a hand-over point at a real action, and only while waiting for its outcome', () => {
    expect(tourProblems(journey([{ target: 'action:release', title: 'Release', text: 'Press it.', handover: true, wait: { kind: 'appear', selector: '[data-status="RELEASED"]' } }]))).toEqual([])
    expect(tourProblems(journey([{ target: 'action:release', title: 'Release', text: 'Press it.', handover: true, wait: { kind: 'click' } }]))).toEqual([
      'journey.test step 1: a hand-over waits for an outcome (page, appear or gone)',
    ])
  })

  it('switches person only in a journey, which needs dev mode, and uses only what was remembered before', () => {
    const switchTo = { target: 'account', title: 'Switch', text: 'Switch.', wait: { kind: 'user' as const, role: 'SALES_STORE', sameBranchAs: 'order' } }
    expect(tourProblems(tour({ steps: [{ ...switchTo, wait: { kind: 'user', role: 'ADMIN' } }] }))).toEqual(['sales.order.create step 1: only a journey switches person'])
    expect(tourProblems(journey([switchTo]))).toEqual(['journey.test step 1: "order" is not remembered before this step'])
    expect(tourProblems(journey([{ target: 'page-header', title: 'Order', text: 'Saved.', remember: 'order' }, switchTo, { title: 'Back', text: 'Back.', go: '@order' }]))).toEqual([])
    expect(tourProblems(journey([{ title: 'Back', text: 'Back.', go: '@job' }]))).toEqual(['journey.test step 1: "@job" is not remembered before this step'])
    expect(tourProblems(journey([{ title: 'Hi', text: 'Hi.' }], { requires: [] }))).toEqual(["journey.test: a journey switches person, so it needs 'dev'"])
  })
})

describe('checking a tour', () => {
  it('passes a well-formed tour', () => {
    expect(tourProblems(tour())).toEqual([])
  })

  it('names each problem with the tour and the step', () => {
    const bad = tour({
      id: 'Sales Order',
      pages: [],
      steps: [
        { title: '', text: 'x' },
        { title: 'Click', text: 'x', wait: { kind: 'click' } },
        { title: 'Page', text: 'x', wait: { kind: 'page', to: {} } },
        { title: 'Regex', text: 'x', page: { path: '([' } },
        { title: 'Appear', text: 'x', target: 'list', wait: { kind: 'appear', selector: ' ' } },
        { title: 'Optional', text: 'x', optional: true },
      ],
    })
    expect(tourProblems(bad)).toEqual([
      '"Sales Order" is not a tour id (lower case, dots or dashes)',
      "Sales Order: pages is empty; use 'any'",
      'Sales Order step 1: needs a title and a text',
      'Sales Order step 2: a click step needs a target',
      'Sales Order step 3: an empty page check matches every page',
      'Sales Order step 4: "([" is not a valid path pattern',
      'Sales Order step 5: appear needs a selector',
      'Sales Order step 6: optional only makes sense with a target',
    ])
  })
})

describe('pages', () => {
  const here = { path: '/sales/orders', layout: 'module', module: 'sales', code: 'S10' }

  it('matches on every part given', () => {
    expect(pageMatches({ path: '^/sales/orders$' }, here)).toBe(true)
    expect(pageMatches({ layout: 'module', module: 'sales' }, here)).toBe(true)
    expect(pageMatches({ layout: 'module-home' }, here)).toBe(false)
    expect(pageMatches({ module: 'purchase' }, here)).toBe(false)
    expect(pageMatches({ code: 'S11' }, here)).toBe(false)
    expect(pageMatches({ layout: 'bare' }, { path: '/' })).toBe(true)
  })

  it('lists the tours for this page first, and only those the person may take', () => {
    const welcome = tour({ id: 'welcome', pages: 'any', module: undefined })
    const order = tour()
    const po = tour({ id: 'purchase.order.create', module: 'purchase', pages: ['P09'], permission: 'purchase.order.edit' })
    const can = (p: string) => p !== 'purchase.order.edit'
    expect(toursFor([welcome, order, po], here, can)).toEqual({ onThisPage: [welcome, order], more: [] })
    expect(toursFor([welcome, order, po], { path: '/' }, () => true)).toEqual({ onThisPage: [welcome], more: [order, po] })
  })

  it('offers a tour that needs a feature only where it is switched on', () => {
    const board = tour({ id: 'service.board', module: 'service', pages: ['V02'], requires: ['service'] })
    const on = (t: Tour) => (t.requires ?? []).every((r) => r === 'service')
    expect(toursFor([board], { path: '/service/board', code: 'V02' }, () => true, on).onThisPage).toEqual([board])
    expect(toursFor([board], { path: '/service/board', code: 'V02' }, () => true, () => false).onThisPage).toEqual([])
    expect(tourProblems(tour({ requires: ['service', 'mes'] }))).toEqual(['sales.order.create: needs "mes", which no feature check knows'])
  })
})

describe('progress', () => {
  it('offers the welcome to a first-time person with Tutorial mode on, until they start it or say no', () => {
    const fresh = freshTutorial()
    expect(offersWelcome(fresh, false)).toBe(true)
    expect(offersWelcome(fresh, true)).toBe(false)
    expect(offersWelcome({ ...fresh, mode: false }, false)).toBe(false)
    expect(offersWelcome(atStep(fresh, 'welcome', 0, '/'), false)).toBe(false)
    expect(offersWelcome(leftTour(atStep(fresh, 'welcome', 2, '/')), false)).toBe(false)
    expect(declinedWelcome(fresh)).toEqual({ ...fresh, welcomeSeen: true, mode: false })
  })

  it('remembers the step and page of a tour left mid-way, and clears it when finished', () => {
    const mid = atStep(freshTutorial(), 'sales.order.create', 3, '/sales/orders/new', true)
    expect(mid.active).toEqual({ tourId: 'sales.order.create', step: 3, path: '/sales/orders/new', paused: true })
    expect(mid.welcomeSeen).toBe(false)
    const done = finished(finished(mid, 'sales.order.create'), 'sales.order.create')
    expect(done).toMatchObject({ done: ['sales.order.create'], active: null })
  })

  it('reads whatever comes back safely', () => {
    expect(readTutorial(null)).toEqual(freshTutorial())
    expect(readTutorial({ mode: false, welcomeSeen: true, done: ['welcome', 'welcome', 'Bad'], active: { tourId: 'welcome', step: 2, path: 'x' } })).toEqual({
      mode: false,
      welcomeSeen: true,
      done: ['welcome'],
      active: null,
    })
  })

  it('counts steps as the person sees them', () => {
    expect(stepLabel(3, 8)).toBe('Step 3 of 8')
    expect(stepLabel(9, 8)).toBe('Step 9 of 9')
  })
})

describe('guides: the Handbook on screen', () => {
  const guide = (over: Partial<Tour> = {}): Tour =>
    tour({
      id: 'guide.field-sales.a',
      journey: true,
      requires: ['dev'],
      pages: 'any',
      guide: { book: 'Field sales', letter: 'A', rows: 2, cast: 'Agent', values: { item: 'an item' } },
      steps: [
        { title: 'Start', text: 'Two steps.' },
        { row: 1, target: 'account', wait: { kind: 'user', role: 'SALES_AGENT', as: 'agent' }, title: 'Be the agent', text: 'Pick {people}.' },
        { target: 'so:line', wait: { kind: 'use' }, title: 'Type', text: 'Pick {item}.', type: [{ field: 'Phone', value: '{newPhone}' }] },
        { row: 2, target: 'action:release', wait: { kind: 'gone', selector: '.x' }, title: 'Release', text: 'Click Release.', remember: 'order' },
        { title: 'Done', text: '{order}' },
      ],
      ...over,
    })

  it('lets the highlighted button be a real one, which a tour never may', () => {
    expect(tourProblems(guide())).toEqual([])
    const asTour = tour({ steps: [{ target: 'action:release', wait: { kind: 'click' }, title: 'Release', text: 'Click.' }] })
    expect(tourProblems(asTour).join()).toContain('changes records')
  })

  it('needs the demo, a module, and the Handbook steps once each in order', () => {
    expect(tourProblems(guide({ requires: [] })).join()).toContain("needs 'dev'")
    expect(tourProblems(guide({ module: undefined })).join()).toContain('belongs to a module')
    expect(tourProblems(guide({ guide: { ...guide().guide!, rows: 3 } })).join()).toContain('should be 1 to 3')
    expect(tourProblems(guide({ steps: [...guide().steps, { handover: true, target: 'list', wait: { kind: 'page', to: { path: '^/x' } }, title: 'x', text: 'x' }] })).join()).toContain('no hand-over')
  })

  it('refuses a word nothing fills in, such as a misspelt one', () => {
    expect(tourProblems(guide({ steps: guide().steps.map((s) => ({ ...s, text: s.text.replace('{item}', '{itm}') })) })).join()).toContain('nothing fills in {itm}')
    // A document is known only from the step that remembers it.
    expect(tourProblems(guide({ steps: [{ title: 'Early', text: '{order}' }, ...guide().steps] })).join()).toContain('nothing fills in {order}')
  })

  it('counts the Handbook steps, not the clicks', () => {
    expect([0, 1, 2, 3, 4].map((i) => rowAt(guide(), i))).toEqual([0, 1, 1, 2, 2])
  })

  it('uses the words of the company over the neutral ones, the guide’s own last', () => {
    const made = madeWords(new Date('2026-11-24T10:00:00'), () => 0)
    expect(made).toMatchObject({ newName: 'Puan Salmah Ismail', newPhone: '011-0000 0000', tomorrow: '25 Nov 2026', nextWeek: '1 Dec 2026' })
    expect(guideWords(guide(), {}, made)).toMatchObject({ item: 'an item', newName: 'Puan Salmah Ismail' })
    expect(guideWords(guide(), { common: { item: 'X', agent: 'AG1' }, 'guide.field-sales.a': { item: 'Y' } }, made)).toMatchObject({ item: 'Y', agent: 'AG1' })
  })

  it('lists guides by module, the one open now first, with how many are done', () => {
    const b = guide({ id: 'guide.field-sales.b', guide: { ...guide().guide!, letter: 'B' } })
    const s = guide({ id: 'guide.service.a', module: 'service', guide: { ...guide().guide!, book: 'Service' } })
    const groups = guideGroups([s, b, guide()], ['sales', 'service'], undefined, (t) => t.id === 'guide.field-sales.b')
    expect(groups.map((g) => [g.module, g.done, g.total])).toEqual([['sales', 1, 2], ['service', 0, 1]])
    expect(groups[0]!.books[0]!.guides.map((t) => t.guide!.letter)).toEqual(['A', 'B'])
    expect(guideGroups([s, b], ['sales', 'service'], 'service', () => false)[0]!.module).toBe('service')
  })
})
