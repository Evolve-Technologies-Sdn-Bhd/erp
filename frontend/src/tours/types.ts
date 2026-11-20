import type { ModuleKey } from '@/modules/registry'

/**
 * Guided tours (Help): short walks through the real screens. A tour points at elements marked data-tour="…", explains
 * them, and waits for the person to do the harmless part themselves (open a page, point at a menu, open a dropdown).
 * It never presses a button that changes records (tour.rules.ts → sensitive).
 */

/** A page, by what the router knows about it. Every part given must match. */
export interface PageMatch {
  /** A regular expression the path must match, e.g. '^/sales/orders$' */
  path?: string
  layout?: 'bare' | 'module-home' | 'module'
  module?: ModuleKey
  /** Screen code from SCREENS.md, e.g. 'S11' */
  code?: string
}

/** What moves a step on. Without one, the person clicks Next. */
export type StepWait =
  | { kind: 'next' }
  /** clicks the highlighted element (never one that changes records) */
  | { kind: 'click' }
  /** points at the highlighted element (on touch screens Next shows instead) */
  | { kind: 'hover' }
  /** reaches a page, through the highlighted menu, tile or link */
  | { kind: 'page'; to: PageMatch }
  /** makes something appear: a dropdown, a dialog, a chip (a CSS selector) */
  | { kind: 'appear'; selector: string }
  /** fills in the highlighted field */
  | { kind: 'fill' }

export type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** data-tour id of the element to highlight. Left out: the box shows in the middle of the screen. */
  target?: string
  title: string
  text: string
  /** The rule behind it, shown under the text ("Over your limit the button reads Send for approval.") */
  why?: string
  wait?: StepWait
  /** What the box says while it waits, when the default ("Waiting for you to open it.") does not fit */
  waiting?: string
  /** The page this step is on. Leaving it pauses the tour, with Go back. */
  page?: PageMatch
  /** Left out quietly when its element is not on the screen (a part of the page the person does not have). */
  optional?: boolean
  placement?: Placement
}

export interface Tour {
  /** "welcome", "sales.order.create" (saved in sys_user_tutorial) */
  id: string
  title: string
  summary: string
  /** The module whose Help lists it; left out: the whole app */
  module?: ModuleKey
  /** Screen codes where Help lists it under "On this page"; 'any' for every page */
  pages: string[] | 'any'
  /** Only offered to people holding this permission */
  permission?: string
  /**
   * Only offered where these are switched on (tour.rules → REQUIREMENTS): the Service module, a connected WMS, or a
   * Sales Flow switch. A company that does not use a feature never sees its tour.
   */
  requires?: string[]
  minutes: number
  /** Where it starts; starting it from another page goes there first */
  startAt?: string
  steps: TourStep[]
}

/** Where the person is, as the step and page checks need it. */
export interface Here {
  path: string
  layout?: string
  module?: string
  code?: string
}
