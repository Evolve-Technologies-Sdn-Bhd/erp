import type { PageMatch, StepWait, TourStep } from './types'

/**
 * The clicks every guide repeats, so each guide reads like its Handbook journey: be a person, go to a module, open a
 * page from the menu.
 */

/** "Who": switch person, top right. `as` is the word holding the exact person's code. */
export const be = (role: string, as: string, who: string, extra: Partial<TourStep> = {}): TourStep => ({
  target: 'account',
  placement: 'left',
  wait: { kind: 'user', role, as },
  title: `Be the ${who}`,
  text: 'Click your name, top right, and pick {people}.',
  ...extra,
})

/** "Where": the menu group, then the page. A group that is open already needs no click. */
export const openPage = (group: string, groupLabel: string, item: string, label: string, to: PageMatch): TourStep[] => [
  {
    target: `rail:${group}`,
    placement: 'right',
    optional: true,
    wait: { kind: 'appear', selector: `[data-tour="menu:${item}"]` },
    waiting: 'Waiting for you to click it.',
    title: `Open ${groupLabel}`,
    text: `Click this group in the menu on the left: ${groupLabel}.`,
  },
  {
    target: `menu:${item}`,
    placement: 'right',
    wait: { kind: 'page', to },
    title: `Open ${label}`,
    text: `Click ${label}.`,
  },
]

/** From a module's home: the tile of a menu group, then the page. */
export const openFromHome = (module: PageMatch['module'], tile: string, item: string, label: string, to: PageMatch): TourStep[] => [
  {
    target: 'home:tiles',
    page: { module },
    pick: tile,
    wait: { kind: 'page', to: { module, layout: 'module' } },
    title: `Open ${tile}`,
    text: `Click the ${tile} tile.`,
  },
  {
    target: `menu:${item}`,
    placement: 'right',
    wait: { kind: 'page', to },
    title: `Open ${label}`,
    text: `Click ${label}.`,
  },
]

/** Another module, from the round module button in the top bar. */
export const openModule = (module: PageMatch['module'], label: string): TourStep => ({
  target: 'rail:switcher',
  placement: 'bottom',
  wait: { kind: 'page', to: { module } },
  title: `Go to ${label}`,
  text: `Click the round button in the top bar, then ${label}.`,
})

/** From Core's home: a menu group's tile, which opens its first page. */
export const openCore = (tile: string, title: string, to: PageMatch): TourStep => ({ target: 'home:main', page: { module: 'core' }, pick: tile, wait: { kind: 'page', to }, title, text: `Click the ${tile} tile.`, placement: 'top' })

/** One of the buttons at the top right of a page, by its words. */
export const press = (label: string, wait: StepWait, title: string, text: string, extra: Partial<TourStep> = {}): TourStep => ({ target: 'page-actions', pick: label, wait, title, text, ...extra })

/** A document in a list, by the word that holds its number. */
export const openDoc = (list: PageMatch, word: string, to: PageMatch, title: string, extra: Partial<TourStep> = {}): TourStep => ({
  target: 'list',
  page: list,
  pick: `{${word}}`,
  wait: { kind: 'page', to },
  title,
  text: `Click {${word}} in the list.`,
  ...extra,
})

/** A document's status chip in its header: what a real button leads to. */
export const status = (...codes: string[]): StepWait => ({ kind: 'appear', selector: codes.map((c) => `[data-tour="page-header"] [data-status="${c}"]`).join(', ') })

/** The question that opens after a real button: "Click Release, then Release again in the question that opens." */
export const confirmText = (button: string) => `Click ${button}, then ${button} again in the question that opens.`

/** A run of steps whose first one starts a Handbook step. */
export const row = (n: number, steps: TourStep[]): TourStep[] => steps.map((s, i) => (i === 0 ? { ...s, row: n } : s))

/** The steps in a module's Approvals page. */
export const inbox = (page: PageMatch) => ({
  /** The request of a document, opened in Approvals. With optional, left out when nothing of it waits for this person. */
  openRequest: (word: string, expect: string, extra: Partial<TourStep> = {}): TourStep[] => [
    { target: 'approvals', wait: { kind: 'page', to: page }, title: 'Open Approvals', text: 'Click Approvals in the top bar.' },
    { target: 'approvals:list', page, pick: `{${word}}`, wait: { kind: 'click' }, title: 'Pick the request', text: `Click the card of {${word}}.`, placement: 'right', ...extra },
    { target: 'approvals:decide', page, title: 'What is asked', text: 'Read the request and its details above.', expect, placement: 'left', ...(extra.optional && { optional: true }) },
  ],
  approveIt: (extra: Partial<TourStep> = {}): TourStep => ({
    target: 'approvals:approve',
    page,
    wait: { kind: 'gone', selector: '[data-tour="approvals:approve"]' },
    waiting: 'Waiting for your decision.',
    title: 'Approve it',
    text: 'Click Approve.',
    ...extra,
  }),
  /** Rejected with a comment, which the requester then sees. */
  rejectIt: (comment: string): TourStep[] => [
    { target: 'approvals:comment', page, wait: { kind: 'use' }, title: 'Say why', text: 'Type a comment, then Next.', type: [{ field: 'Your comment', value: comment }], placement: 'left' },
    { target: 'approvals:decide', pick: 'Reject', page, wait: { kind: 'gone', selector: '[data-tour="approvals:approve"]' }, waiting: 'Waiting for your decision.', title: 'Reject it', text: 'Click Reject.', placement: 'left' },
  ],
})
