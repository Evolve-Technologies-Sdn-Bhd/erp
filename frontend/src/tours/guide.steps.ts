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

/** Another module, from the top icon of the menu rail. */
export const openModule = (module: PageMatch['module'], label: string): TourStep => ({
  target: 'rail:switcher',
  placement: 'right',
  wait: { kind: 'page', to: { module } },
  title: `Go to ${label}`,
  text: `Click the top icon, then ${label}.`,
})

/** A document's status chip in its header: what a real button leads to. */
export const status = (...codes: string[]): StepWait => ({ kind: 'appear', selector: codes.map((c) => `[data-tour="page-header"] [data-status="${c}"]`).join(', ') })
