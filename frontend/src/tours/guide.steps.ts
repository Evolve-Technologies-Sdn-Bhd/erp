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
    text: `Click this icon in the menu on the left: ${groupLabel}.`,
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

/** Another module, from the top icon of the menu rail. */
export const openModule = (module: PageMatch['module'], label: string): TourStep => ({
  target: 'rail:switcher',
  placement: 'right',
  wait: { kind: 'page', to: { module } },
  title: `Go to ${label}`,
  text: `Click the top icon, then ${label}.`,
})

/** From Core's home: a menu group's tile, which opens its first page. */
export const openCore = (tile: string, title: string, to: PageMatch): TourStep => ({ target: 'home:main', page: { module: 'core' }, pick: tile, wait: { kind: 'page', to }, title, text: `Click the ${tile} tile.`, placement: 'top' })

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
