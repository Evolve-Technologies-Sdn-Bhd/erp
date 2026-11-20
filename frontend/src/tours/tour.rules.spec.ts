import { describe, expect, it } from 'vitest'
import {
  atStep,
  declinedWelcome,
  finished,
  freshTutorial,
  isInteractive,
  isSensitiveLabel,
  isSensitiveTargetId,
  leftTour,
  offersWelcome,
  pageMatches,
  readTutorial,
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
