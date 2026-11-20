import type { Here, PageMatch, StepWait, Tour, TourStep } from './types'

/**
 * Pure rules of the guided tours, kept apart from the DOM so they can be tested (tour.rules.spec.ts).
 */

/* ── Safety: the tour shows real actions, it never performs them ─────────────────────────────────────────────────── */

/**
 * Buttons whose words say they write something, change records for real, send something out or cannot be undone.
 * Saving and creating count too: a tour never writes, so a practice run leaves no draft and uses up no number. The tour
 * may point at them and explain them; it never lets them be pressed while it runs. Pausing or leaving the tour gives
 * the page back, so doing it stays a deliberate choice outside the tour. Links are never sensitive: opening a page
 * changes nothing (a "Cancel balance" link only opens a draft form, whose own buttons are guarded).
 */
const SENSITIVE =
  /\b(approve|reject|release|post|posting|delete|remove|pay|payment|verify|confirm|void|submit|send|e-?mail|award|cancellation|deactivate|block|discontinue|revoke|unlock|reset|load|save|create|transfer|convert|duplicate|import|mark as (complete|done)|record (a |the )?(payment|visit))\b|\bcancel\s+\w/i

/** Plain dialog buttons that only close what they opened. */
const HARMLESS = new Set(['cancel', 'close', 'back', 'not now', 'no', 'ok'])

export function isSensitiveLabel(label: string): boolean {
  const text = label.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!text || HARMLESS.has(text)) return false
  return SENSITIVE.test(text)
}

/**
 * "action:release", "action:send-for-approval": a target id naming a sensitive action. Only action: ids name what a
 * button does; menu:, rail: and other ids are places, and going to a place changes nothing.
 */
export function isSensitiveTargetId(id: string): boolean {
  if (!id.startsWith('action:')) return false
  return isSensitiveLabel(id.slice('action:'.length).replace(/[-_.]/g, ' '))
}

/** Steps where the person uses the highlighted element (and so where a sensitive one is never allowed). */
export function waitOf(step: TourStep): StepWait {
  return step.wait ?? { kind: 'next' }
}

export function isInteractive(step: TourStep): boolean {
  const kind = waitOf(step).kind
  return kind === 'click' || kind === 'fill' || kind === 'page' || kind === 'appear'
}

/* ── Checking a tour before it ships (also run over every registered tour in tours.spec.ts) ─────────────────────────── */

export const TOUR_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
export const MAX_STEPS = 100

function validRegex(source: string): boolean {
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}

function pageProblems(match: PageMatch | undefined, where: string): string[] {
  if (!match) return []
  if (!Object.values(match).some(Boolean)) return [`${where}: an empty page check matches every page`]
  return match.path && !validRegex(match.path) ? [`${where}: "${match.path}" is not a valid path pattern`] : []
}

export function tourProblems(tour: Tour): string[] {
  const problems: string[] = []
  if (!TOUR_ID.test(tour.id) || tour.id.length > 60) problems.push(`"${tour.id}" is not a tour id (lower case, dots or dashes)`)
  if (!tour.title.trim() || !tour.summary.trim()) problems.push(`${tour.id}: needs a title and a summary`)
  if (Array.isArray(tour.pages) && !tour.pages.length) problems.push(`${tour.id}: pages is empty; use 'any'`)
  if (!tour.steps.length) problems.push(`${tour.id}: has no steps`)
  if (tour.steps.length > MAX_STEPS) problems.push(`${tour.id}: more than ${MAX_STEPS} steps`)
  tour.steps.forEach((step, i) => {
    const where = `${tour.id} step ${i + 1}`
    if (!step.title.trim() || !step.text.trim()) problems.push(`${where}: needs a title and a text`)
    const wait = waitOf(step)
    if (wait.kind !== 'next' && wait.kind !== 'page' && !step.target) problems.push(`${where}: a ${wait.kind} step needs a target`)
    if (wait.kind === 'appear' && !wait.selector.trim()) problems.push(`${where}: appear needs a selector`)
    if (wait.kind === 'page') problems.push(...pageProblems(wait.to, where))
    problems.push(...pageProblems(step.page, where))
    if (isInteractive(step) && step.target && isSensitiveTargetId(step.target)) {
      problems.push(`${where}: "${step.target}" changes records; a tour may only explain it, never wait for it to be pressed`)
    }
    if (step.optional && !step.target) problems.push(`${where}: optional only makes sense with a target`)
  })
  return problems
}

/* ── Pages ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

export function pageMatches(match: PageMatch, here: Here): boolean {
  if (match.path && !new RegExp(match.path).test(here.path)) return false
  if (match.layout && match.layout !== (here.layout ?? 'bare')) return false
  if (match.module && match.module !== here.module) return false
  if (match.code && match.code !== here.code) return false
  return true
}

/** The tours Help lists: those for this page first, then the rest the person may take. */
export function toursFor(tours: Tour[], here: Here, can: (permission: string) => boolean): { onThisPage: Tour[]; more: Tour[] } {
  const allowed = tours.filter((t) => !t.permission || can(t.permission))
  const isHere = (t: Tour) => t.pages === 'any' || (!!here.code && t.pages.includes(here.code))
  return { onThisPage: allowed.filter(isHere), more: allowed.filter((t) => !isHere(t)) }
}

/* ── Progress (the state saved per person on the server, /me/tutorial) ──────────────────────────────────────────── */

export interface ActiveTour {
  tourId: string
  step: number
  path: string
  paused: boolean
}

export interface TutorialState {
  mode: boolean
  welcomeSeen: boolean
  done: string[]
  active: ActiveTour | null
}

export const WELCOME_TOUR_ID = 'welcome'

export function freshTutorial(): TutorialState {
  return { mode: true, welcomeSeen: false, done: [], active: null }
}

/** The welcome card shows to a first-time person with Tutorial mode on, until they start it or say no. */
export function offersWelcome(state: TutorialState, laterThisSession: boolean): boolean {
  return state.mode && !state.welcomeSeen && !state.active && !laterThisSession
}

export function atStep(state: TutorialState, tourId: string, step: number, path: string, paused = false): TutorialState {
  return { ...state, welcomeSeen: state.welcomeSeen || tourId === WELCOME_TOUR_ID, active: { tourId, step, path, paused } }
}

export function finished(state: TutorialState, tourId: string): TutorialState {
  return { ...state, welcomeSeen: state.welcomeSeen || tourId === WELCOME_TOUR_ID, done: [...new Set([...state.done, tourId])], active: null }
}

export function leftTour(state: TutorialState): TutorialState {
  return { ...state, active: null }
}

/** "I know my way around": no welcome, and Tutorial mode off (Help still has every tour). */
export function declinedWelcome(state: TutorialState): TutorialState {
  return { ...state, welcomeSeen: true, mode: false }
}

/** What the server sent, or a stored copy, read safely: anything unreadable counts as a fresh start. */
export function readTutorial(value: unknown): TutorialState {
  const fresh = freshTutorial()
  if (!value || typeof value !== 'object') return fresh
  const v = value as Record<string, unknown>
  const done = Array.isArray(v.done) ? v.done.filter((d): d is string => typeof d === 'string' && TOUR_ID.test(d)) : []
  const a = v.active as Record<string, unknown> | null | undefined
  const active =
    a && typeof a.tourId === 'string' && Number.isInteger(a.step) && typeof a.path === 'string' && a.path.startsWith('/')
      ? { tourId: a.tourId, step: a.step as number, path: a.path, paused: a.paused === true }
      : null
  return {
    mode: typeof v.mode === 'boolean' ? v.mode : fresh.mode,
    welcomeSeen: v.welcomeSeen === true,
    done: [...new Set(done)],
    active,
  }
}

/** "Step 3 of 8": optional steps left out along the way come off the total, so the count never jumps ahead. */
export function stepLabel(shown: number, total: number): string {
  return `Step ${shown} of ${Math.max(shown, total)}`
}
