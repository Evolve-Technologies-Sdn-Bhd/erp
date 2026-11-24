import type { ModuleKey } from '@/modules/registry'

/**
 * Guided tours (Help): short walks through the real screens. A tour points at elements marked data-tour="…", explains
 * them, and waits for the person to do the harmless part themselves (open a page, point at a menu, open a dropdown).
 * It never presses a button that changes records (tour.rules.ts → sensitive).
 *
 * A guide (Tour.guide, dev mode only) is a Handbook journey on screen: the same steps, the same clicks. There the
 * highlighted button works, also one that changes records, because practising it is the point; the person still presses
 * it, and every other button stays blocked.
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
  /**
   * switches to a person holding this role (journeys, dev mode). With sameBranchAs, also working at the branch of a
   * document remembered earlier, so the next person can see it. In a guide, `as` names the word that holds the exact
   * person's code ('agent'); without that word anyone with the role will do.
   */
  | { kind: 'user'; role: string; sameBranchAs?: string; as?: string }
  /** something on screen goes away after it was there (a picked job once it is booked) */
  | { kind: 'gone'; selector: string }
  /** uses the highlighted part (types, picks, looks around in it), then clicks Next; with `type` or `must`, Next waits until it is filled in */
  | { kind: 'use' }

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
  /**
   * A real action (Save, Release, Book, Verify …). The tour explains it; the person chooses "I'll do it now", which
   * gives the page back to them, presses the real button themselves, and the tour carries on when it sees the outcome
   * (the wait: a page, something appearing or going away). The tour itself never presses it.
   */
  handover?: boolean
  /** Opens this page when the step starts: a path, or '@key' for a page remembered earlier in the journey */
  go?: string
  /** Guides: what to type, shown as rows with a copy button */
  type?: { field: string; value: string }[]
  /** Guides: Next waits until the highlighted field is filled in (a step with `type` always does) */
  must?: boolean
  /** Guides: the Handbook's "You should see" */
  expect?: string
  /**
   * Guides: the link or button inside the target to highlight, by its words ("{order}"): a document's number in a list,
   * a request's card; or "{order} > Receive", that button in the row or card naming {order}. When it is not there the
   * whole target is highlighted, or an optional step is left out.
   */
  pick?: string
  /** Guides: the Handbook step this starts (several clicks may make one step) */
  row?: number
  /** Remembers the page this step shows on (and its document number and branch) under this key */
  remember?: string
}

export interface Guide {
  /** The Handbook section: 'Field sales', 'Sales' … */
  book: string
  letter: string
  /** How many steps the Handbook journey has; the box counts these, not the clicks */
  rows: number
  /** Who plays: 'Admin, Sales agent' */
  cast: string
  /** Letters of the same book's guides that make what this one uses, as Help says it: "After A" */
  after?: string[]
  /** A document an earlier guide remembered on this device (its id and key); `values` has the words without it */
  from?: Record<string, { guide: string; key: string }>
  values?: Record<string, string>
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
  /**
   * A journey: one document through several people. It carries on when the person changes (dev mode), and its place
   * is kept on this device rather than with one person. Needs 'dev' in requires.
   */
  journey?: boolean
  /**
   * A Handbook journey as a guide (dev mode): its book and letter, its number of Handbook steps, who plays in it, and
   * the neutral words its texts fill in where the company's own file (GUIDE_VALUES_FILE) gives none.
   */
  guide?: Guide
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
