import { reactive } from 'vue'
import type { Router } from 'vue-router'
import { holeRect, needsScroll, NARROW, type Rect } from './placement.rules'
import { meets } from './features'
import { companyWords } from './guide-values'
import { guideFinished, progress, updateProgress } from './progress'
import { tourById } from './registry'
import {
  atStep,
  docNoIn,
  fillText,
  finished,
  fitsPart,
  guideWords,
  isInteractive,
  isSensitiveLabel,
  leftTour,
  madeWords,
  pageMatches,
  peopleFor,
  waitOf,
  type Person,
  type TutorialState,
} from './tour.rules'
import type { Here, Tour, TourStep } from './types'

/**
 * The tour runner: shows one step at a time on the real screen, waits for the person where the step says so, and
 * guards the page while it runs.
 *
 * Safety (the rule the tours are built on): while a step shows, a click anywhere except the tour's own box, and the
 * highlighted element on a step that asks for it, is stopped before the page sees it. Inside the highlighted element,
 * a button that changes records (Release, Approve, Delete, Pay …) is stopped too. Pausing or leaving the tour gives
 * the whole page back, so doing something real is always the person's own, deliberate act outside the tour.
 *
 * Journeys (Tour.journey, dev mode): one document through several people. A "switch person" step waits until the
 * person in use holds the role; a hand-over step explains a real action, and only when the person chooses "I'll do it
 * now" does the tour give the page back to them, then carry on when it sees the outcome. The journey's place and the
 * documents it remembered are kept on this device, so it carries on whoever is using the app.
 *
 * Guides (Tour.guide, dev mode): a Handbook journey on screen. There the highlighted part is live: a button that changes
 * records works when the person presses it, and so does the dialog it opens. Everything else stays stopped.
 */

export type RunStatus = 'idle' | 'finding' | 'showing' | 'missing' | 'paused' | 'left'

const FIND_MS = 6000
const OPTIONAL_MS = 1500
const HOVER_MS = 450
const FILL_MS = 600
const SLOW_MS = 700

export const SENSITIVE_NUDGE = 'The tour won’t press this: it changes records for real. Pause or exit the tour, then do it yourself.'
export const OUTSIDE_NUDGE = 'The tour is showing the highlighted part. Use Next, or Pause to use the rest of the page.'

export const run = reactive({
  tour: null as Tour | null,
  index: 0,
  /** Steps shown before this one, with the page each was on, for Back */
  history: [] as { index: number; path: string }[],
  /** Optional steps left out because the person does not have that part; they come off the total */
  skipped: [] as number[],
  /** After a reload there is no history: Back goes to the step before on this page, if there is one */
  backHere: null as number | null,
  status: 'idle' as RunStatus,
  /** The highlight on screen, or null for a step in the middle of the screen */
  hole: null as Rect | null,
  /** Still looking for the step's element after a moment (a slow page): the box says so */
  slow: false,
  /** The step is on a page the person never reached (they skipped the step that opens it) */
  offPage: false,
  /** The person may use the highlighted element (click, fill, open, go to a page) */
  interactive: false,
  /** A guide's highlighted button does something real, and works */
  real: false,
  /** The highlighted element itself does something real: the tour only shows it */
  guarded: false,
  /** The element is inside a dialog, which sits above the page: the highlight goes above it too */
  raised: false,
  /** A dropdown or date picker is open on a step the person is doing: the box steps aside so it never covers it */
  dropdownOpen: false,
  /** A dialog open on a step the person is doing (or the dialog the step points into): the box keeps off it */
  dialog: null as Rect | null,
  /** Bumps when a click was stopped, so the box can say why */
  nudge: 0,
  nudgeText: '',
  /** The page to go back to after a pause or after leaving the step's page */
  returnPath: '',
  /** A hand-over step: the person chose to do the real action; the page is theirs until the tour sees it done */
  handover: false,
  /** A "switch person" step whose role the person in use already has */
  userOk: false,
  /** Documents a journey remembered on the way: their page, number and branch */
  memory: {} as Record<string, Memo>,
  /** Words a guide made when it started (a new household's name and phone) */
  made: {} as Record<string, string>,
})

export interface Memo {
  path: string
  label: string
  branch: string
}

/** The Help panel. */
export const help = reactive({ open: false })

interface Me {
  code: string
  name: string
  roles: readonly string[]
  branchCodes: readonly string[]
  branchCode: string
}

interface Deps {
  router: Router
  can: (permission: string) => boolean
  onFinish: (tour: Tour) => void
  /** Who is using the app now */
  me: () => Me | null
  /** The people of the demo, for "switch to …" (dev mode) */
  people: () => readonly Person[]
}
let deps: Deps | null = null

let el: HTMLElement | null = null
let startedAt = 0
let raf = 0
let stepCleanup: (() => void)[] = []
let shownPath = ''
/** The person skipped a step that opens a page: steps on that page cannot show, so they do not wait for it. */
let navSkipped = false

const isRunning = () => run.status === 'finding' || run.status === 'showing' || run.status === 'missing'
/** A guide on the demo: the highlighted part works for real. Never with real sign-in. */
const live = () => !!run.tour?.guide && meets('dev')
const current = (): TourStep | null => run.tour?.steps[run.index] ?? null

function here(): Here & { fullPath: string } {
  const r = deps!.router.currentRoute.value
  return { path: r.path, fullPath: r.fullPath, layout: r.meta.layout ?? 'bare', module: r.meta.module, code: r.meta.code }
}

function save(change: (s: TutorialState) => TutorialState): void {
  if (progress.owner) updateProgress(change)
}

/* ── Where a tour is kept: a person's own tours on the server, a journey on this device ──────────────────────────── */

const JOURNEY_KEY = 'zora.tour.journey'

interface KeptJourney {
  tourId: string
  step: number
  path: string
  paused: boolean
  memory: Record<string, Memo>
  made?: Record<string, string>
}

function writeJourney(kept: KeptJourney | null): void {
  try {
    if (kept) localStorage.setItem(JOURNEY_KEY, JSON.stringify(kept))
    else localStorage.removeItem(JOURNEY_KEY)
  } catch {
    /* private mode: the journey lasts until reload */
  }
}

function readJourney(): KeptJourney | null {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY)
    const v = raw ? (JSON.parse(raw) as KeptJourney) : null
    return v && typeof v.tourId === 'string' && Number.isInteger(v.step) && typeof v.path === 'string' ? v : null
  } catch {
    return null
  }
}

/** Where the running tour is now. */
function record(paused: boolean, path: string): void {
  const tour = run.tour
  if (!tour) return
  if (tour.journey) return writeJourney({ tourId: tour.id, step: run.index, path, paused, memory: { ...run.memory }, made: { ...run.made } })
  save((s) => atStep(s, tour.id, run.index, path, paused))
}

/** The tour ended: finished (done) or left. A journey only adds itself to the person's finished tours. */
function recordEnd(tour: Tour, done: boolean): void {
  if (tour.journey) {
    writeJourney(null)
    if (done && tour.guide) guideFinished(tour.id)
    if (done) save((s) => ({ ...s, done: [...new Set([...s.done, tour.id])] }))
    return
  }
  save((s) => (done ? finished(s, tour.id) : leftTour(s)))
}

/* ── Journeys: who plays the part, and the words filled in ─────────────────────────────────────────────────────── */

function partBranch(step: TourStep): string | undefined {
  const wait = waitOf(step)
  return wait.kind === 'user' && wait.sameBranchAs ? run.memory[wait.sameBranchAs]?.branch || undefined : undefined
}

const words = (): Record<string, string> => (run.tour?.guide ? guideWords(run.tour, companyWords.values, run.made) : {})

/** A guide's exact person for a part, when the company's words name one who works here. */
function partPerson(step: TourStep): Person | undefined {
  const wait = waitOf(step)
  const code = wait.kind === 'user' && wait.as ? words()[wait.as] : undefined
  return code ? deps?.people().find((p) => p.code === code) : undefined
}

function userFits(step: TourStep): boolean {
  const wait = waitOf(step)
  const person = partPerson(step)
  if (person) return deps?.me()?.code === person.code
  return wait.kind === 'user' && fitsPart(deps?.me(), wait.role, partBranch(step))
}

/** A step's words with what the journey knows: {people} for the part, {order} and other remembered documents. */
export function stepText(text: string | undefined): string {
  if (!text) return ''
  const step = current()
  const values: Record<string, string> = { ...words(), ...Object.fromEntries(Object.entries(run.memory).map(([k, m]) => [k, m.label])) }
  const wait = step ? waitOf(step) : null
  const person = step ? partPerson(step) : undefined
  if (person) values.people = `${person.name} (${person.code})`
  else if (wait?.kind === 'user' && deps) values.people = peopleFor(deps.people(), wait.role, partBranch(step!))
  return fillText(text, values)
}

/** Whether a hand-over's outcome is there (or a "gone" wait's element has gone, after it was seen). */
let goneSeen = false
function outcomeMet(step: TourStep): boolean {
  const wait = waitOf(step)
  if (wait.kind === 'page') return pageMatches(wait.to, here())
  if (wait.kind === 'appear') {
    const shown = document.querySelector<HTMLElement>(wait.selector)
    return !!shown && visible(shown)
  }
  if (wait.kind === 'gone') {
    const there = document.querySelector<HTMLElement>(wait.selector)
    if (there && visible(there)) goneSeen = true
    else if (goneSeen) return true
  }
  return false
}

/* ── Finding the element ─────────────────────────────────────────────────────────────────────────────────────────── */

function visible(node: HTMLElement): boolean {
  if (!node.isConnected || node.closest('[aria-hidden="true"]')) return false
  const r = node.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden'
}

function findTarget(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`)
  return [...all].find(visible) ?? null
}

const screenSize = () => ({ width: window.innerWidth, height: window.innerHeight })
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function reveal(node: HTMLElement): void {
  if (!needsScroll(node.getBoundingClientRect(), screenSize())) return
  node.scrollIntoView({ block: window.innerWidth < NARROW ? 'start' : 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/** A menu the element has opened, inside it or beside it (the module switcher's). */
function menuOf(node: HTMLElement): HTMLElement | null {
  const inside = node.querySelector<HTMLElement>('[role="menu"]')
  if (inside) return inside
  return node.matches('[aria-haspopup="menu"][aria-expanded="true"]') ? (node.parentElement?.querySelector<HTMLElement>('[role="menu"]') ?? null) : null
}

/** The element, and a menu it has opened (the person menu, a dropdown list): both stay lit. */
function litRect(node: HTMLElement): Rect {
  const whole = node.getBoundingClientRect()
  // A row of a table that scrolls sideways: light only the part that shows.
  const frame = node.closest('table')?.parentElement?.getBoundingClientRect()
  const r = frame && node.tagName === 'TR' ? new DOMRect(Math.max(whole.left, frame.left), whole.top, Math.min(whole.right, frame.right) - Math.max(whole.left, frame.left), whole.height) : whole
  const menu = menuOf(node)
  if (!menu || !visible(menu)) return r
  const m = menu.getBoundingClientRect()
  const top = Math.min(r.top, m.top)
  const left = Math.min(r.left, m.left)
  return { top, left, width: Math.max(r.right, m.right) - left, height: Math.max(r.bottom, m.bottom) - top }
}

function updateHole(node: HTMLElement): void {
  const h = holeRect(litRect(node), screenSize())
  const o = run.hole
  if (!o || Math.abs(o.top - h.top) > 0.5 || Math.abs(o.left - h.left) > 0.5 || Math.abs(o.width - h.width) > 0.5 || Math.abs(o.height - h.height) > 0.5) run.hole = h
}

/* ── What counts as a real action ────────────────────────────────────────────────────────────────────────────────── */

const CONTROL =
  'button, a[href], [role="button"], [role="menuitem"], [role="option"], [role="switch"], [role="tab"], [role="checkbox"], input, select, textarea, summary, label'
/** PrimeVue opens these at the end of the page; a step that has the person pick or open something may use them. */
const OVERLAYS =
  '.p-select-overlay, .p-autocomplete-overlay, .p-multiselect-overlay, .p-datepicker-panel, .p-popover, .p-dialog, .p-confirmdialog, .p-menu-overlay, .p-tieredmenu-overlay, .p-cascadeselect-overlay'

/** Lists that open under a field: the tour box must never sit on top of them while the person picks. */
const DROPDOWNS =
  '.p-select-overlay, .p-autocomplete-overlay, .p-multiselect-overlay, .p-datepicker-panel, .p-cascadeselect-overlay, .p-menu-overlay, .p-tieredmenu-overlay'

function labelOf(node: Element): string {
  return node.getAttribute('aria-label') ?? node.textContent ?? ''
}

/** A control that changes records for real. Links only open pages, so they never are. */
export function isSensitiveElement(control: Element): boolean {
  if (control.closest('[data-tour-sensitive]')) return true
  if (control.matches('a[href]')) return false
  if (control.matches('.erp-btn-danger, .erp-btn-delete')) return true
  if (control.matches('input[type="submit"], input[type="button"]')) return isSensitiveLabel((control as HTMLInputElement).value)
  return isSensitiveLabel(labelOf(control))
}

/* ── Showing a step ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Between two steps the old highlight stays until the new element is found, so it glides instead of flashing. */
function stopStep(keepHole = false): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  for (const undo of stepCleanup) undo()
  stepCleanup = []
  el = null
  if (!keepHole) run.hole = null
  run.interactive = false
  run.guarded = false
  run.real = false
  run.raised = false
  run.dropdownOpen = false
  run.dialog = null
  run.slow = false
  run.offPage = false
  run.handover = false
  run.userOk = false
  goneSeen = false
}

function loop(): void {
  if (!raf) raf = requestAnimationFrame(frame)
}

function show(index: number): void {
  stopStep(true)
  run.index = index
  run.status = 'finding'
  startedAt = performance.now()
  // A journey step may open its page: a fixed one, or a document remembered earlier ('@order').
  const step = run.tour!.steps[index]
  const go = step?.go ? (step.go.startsWith('@') ? run.memory[step.go.slice(1)]?.path : step.go) : undefined
  if (go && deps && here().fullPath !== go) void deps.router.push(go)
  shownPath = go ?? here().fullPath
  record(false, shownPath)
  loop()
}

/** Where an open dialog is, so the box keeps off it. */
function trackDialog(): void {
  const dialog = [...document.querySelectorAll<HTMLElement>('.p-dialog')].find((d) => visible(d) && !d.closest('[data-tour-ui]'))
  const dr = dialog?.getBoundingClientRect()
  if (!dr) {
    if (run.dialog) run.dialog = null
  } else if (!run.dialog || Math.abs(run.dialog.top - dr.top) > 1 || Math.abs(run.dialog.left - dr.left) > 1 || Math.abs(run.dialog.height - dr.height) > 1) {
    run.dialog = { top: dr.top, left: dr.left, width: dr.width, height: dr.height }
  }
}

function frame(): void {
  raf = 0
  if (!isRunning()) return
  const step = current()
  if (!step) return
  // The person is doing the real action: the page is theirs; the tour only watches for the outcome.
  if (run.handover) {
    trackDialog()
    if (outcomeMet(step)) return handoverDone()
    return loop()
  }
  const now = performance.now()
  const where = here()
  // A slow page says so; an optional step that may simply not be there is left out quietly instead.
  if (run.status === 'finding' && !run.slow && !step.optional && now - startedAt > SLOW_MS) run.slow = true

  // Not on the step's page. Left it: the tour pauses with Go back. Not there yet: a loading page gets a moment. Never
  // reached, because the step that opens it was skipped: an optional step is left out, any other says so.
  if (step.page && !pageMatches(step.page, where)) {
    if (run.status === 'showing') return leave()
    if (run.status === 'finding' && (navSkipped || now - startedAt > FIND_MS)) {
      if (step.optional || !navSkipped) {
        if (!step.optional) return leave()
        if (!run.skipped.includes(run.index)) run.skipped.push(run.index)
        return goTo(run.index + 1)
      }
      run.status = 'missing'
      run.offPage = true
      run.hole = null
    }
    return loop()
  }

  if (!step.target) {
    if (run.status !== 'showing') arm(step)
  } else if (!el || !visible(el)) {
    const found = findTarget(step.target)
    if (found) {
      el = found
      if (run.status !== 'showing') {
        reveal(found)
        arm(step)
      }
    } else {
      el = null
      run.hole = null
      if (run.status === 'showing') {
        // The page drew it again (a reload of its data): look for it again.
        run.status = 'finding'
        startedAt = now
      } else if (run.status === 'finding' && now - startedAt > (step.optional ? OPTIONAL_MS : FIND_MS)) {
        if (step.optional) {
          if (!run.skipped.includes(run.index)) run.skipped.push(run.index)
          return goTo(run.index + 1)
        }
        run.status = 'missing'
        run.hole = null
      }
    }
  }

  if (el) updateHole(el)
  // A menu the element opened is part of the highlight, so the box is already beside it and stays readable.
  const dropdown = run.interactive ? document.querySelector<HTMLElement>(DROPDOWNS) : null
  const dropdownOpen = !!dropdown && visible(dropdown)
  if (run.dropdownOpen !== dropdownOpen) run.dropdownOpen = dropdownOpen
  if (run.interactive) trackDialog()
  else if (run.dialog) run.dialog = null
  // Also once the button itself is gone: Release leaves the page as soon as the document is released.
  const wait = waitOf(step)
  const doing = run.status === 'showing' || (run.status === 'finding' && run.interactive)
  if (doing && !step.handover && (wait.kind === 'appear' || wait.kind === 'gone') && outcomeMet(step)) return next()
  loop()
}

/** The step is on screen: decide what the person may use, and start waiting for them. */
function arm(step: TourStep): void {
  run.status = 'showing'
  run.slow = false
  run.offPage = false
  navSkipped = false
  shownPath = here().fullPath
  if (!el) run.hole = null
  run.backHere = run.history.length ? null : previousHere()
  run.raised = !!el?.closest('.p-dialog, .p-drawer, .p-popover')
  const control = el?.matches(CONTROL) ? el : null
  const sensitive = !!el && (control ? isSensitiveElement(control) : !!el.closest('[data-tour-sensitive]'))
  const works = live() && isInteractive(step, true)
  run.guarded = sensitive && !works
  run.real = sensitive && works
  // A hand-over is read first; the page is only given back when the person chooses to do it.
  run.interactive = !!el && isInteractive(step, live()) && !run.guarded && !step.handover
  run.userOk = userFits(step)
  if (step.remember) {
    const title = document.querySelector('[data-tour="page-header"] h1')?.textContent ?? ''
    run.memory[step.remember] = { path: here().fullPath, label: docNoIn(title), branch: deps?.me()?.branchCode ?? '' }
    record(false, shownPath)
  }

  const wait = waitOf(step)
  const node = el
  if (wait.kind === 'page' && !step.handover && pageMatches(wait.to, here())) {
    queueMicrotask(next)
    return
  }
  if (!node || !run.interactive) {
    if (wait.kind === 'hover' && node) watchHover(node)
    return
  }
  if (wait.kind === 'fill') watchFill(node)
}

function watchHover(node: HTMLElement): void {
  let timer = 0
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    timer = window.setTimeout(next, HOVER_MS)
  }
  const leave = () => clearTimeout(timer)
  node.addEventListener('pointerenter', enter)
  node.addEventListener('pointerleave', leave)
  stepCleanup.push(() => {
    clearTimeout(timer)
    node.removeEventListener('pointerenter', enter)
    node.removeEventListener('pointerleave', leave)
  })
}

function isFilled(node: HTMLElement): boolean {
  // A picker says itself when a choice is made (data-filled), so typing a few letters does not count as filled.
  const marked = node.matches('[data-filled]') ? node : node.querySelector('[data-filled]')
  if (marked) return marked.getAttribute('data-filled') === 'true'
  const fields = node.matches('input, textarea, select') ? [node] : [...node.querySelectorAll<HTMLElement>('input, textarea, select')]
  if (fields.some((f) => (f as HTMLInputElement).value?.trim())) return true
  return !!node.querySelector('.p-select-label:not(.p-placeholder), [data-filled="true"]')
}

function watchFill(node: HTMLElement): void {
  let timer = 0
  const changed = () => {
    clearTimeout(timer)
    timer = window.setTimeout(() => isFilled(node) && next(), FILL_MS)
  }
  // A picker fills the field from its own overlay, so listen on the whole page and look at the field.
  document.addEventListener('input', changed, true)
  document.addEventListener('change', changed, true)
  document.addEventListener('click', changed, true)
  stepCleanup.push(() => {
    clearTimeout(timer)
    document.removeEventListener('input', changed, true)
    document.removeEventListener('change', changed, true)
    document.removeEventListener('click', changed, true)
  })
}

/** The nearest earlier step that can show on this page now: its page matches and its element is on screen. */
function previousHere(): number | null {
  const where = here()
  for (let j = run.index - 1; j >= 0; j--) {
    const s = run.tour!.steps[j]!
    if (s.page && !pageMatches(s.page, where)) return null
    if (!s.target || findTarget(s.target)) return j
    if (!s.optional) return null
  }
  return null
}

function goTo(index: number): void {
  if (!run.tour) return
  if (index >= run.tour.steps.length) return finish()
  show(index)
}

function leave(): void {
  stopStep()
  run.status = 'left'
  run.returnPath = shownPath
  record(true, shownPath)
}

function finish(): void {
  const tour = run.tour
  stopStep()
  resetRun()
  if (!tour) return
  recordEnd(tour, true)
  deps?.onFinish(tour)
}

function resetRun(): void {
  navSkipped = false
  run.tour = null
  run.index = 0
  run.history = []
  run.skipped = []
  run.backHere = null
  run.status = 'idle'
  run.returnPath = ''
  run.nudgeText = ''
  run.memory = {}
  run.made = {}
}

function handoverDone(): void {
  run.handover = false
  next()
}

/* ── What the controls do ────────────────────────────────────────────────────────────────────────────────────────── */

export function startTour(id: string): void {
  const tour = tourById(id)
  if (!tour || !deps) return
  if (tour.permission && !deps.can(tour.permission)) return
  help.open = false
  stopStep()
  resetRun()
  if (tour.journey) writeJourney(null)
  run.tour = tour
  if (tour.guide) run.made = madeWords(new Date(), Math.random)
  if (tour.startAt && here().path !== tour.startAt) void deps.router.push(tour.startAt)
  show(0)
}

/** "I'll do it now": the page is the person's for this step's real action; the tour carries on when it sees it done. */
export function handOver(): void {
  const step = current()
  if (!step?.handover || run.status !== 'showing') return
  run.handover = true
  run.nudgeText = ''
  run.hole = null
  goneSeen = false
}

/** "Carry on": the person says the action is done, if the tour did not see it by itself. */
export function carryOn(): void {
  if (run.handover) handoverDone()
}

/** Someone else is using the app now (dev mode): a journey waiting for that part moves on. */
export function onUserChange(): void {
  const step = current()
  if (!step || !isRunning()) return
  if (waitOf(step).kind !== 'user') return
  run.userOk = userFits(step)
  if (run.userOk && run.status === 'showing') next()
}

export function next(): void {
  if (!run.tour || !isRunning()) return
  run.history.push({ index: run.index, path: shownPath })
  run.nudgeText = ''
  goTo(run.index + 1)
}

/** Skip this step: the same as Next, for a step that waits for the person. */
export function skipStep(): void {
  const step = current()
  if (step && waitOf(step).kind === 'page') navSkipped = true
  next()
}

export function back(): void {
  if (!run.tour || !deps) return
  if (!run.history.length && run.backHere !== null) return show(run.backHere)
  const previous = run.history.pop()
  if (!previous) return
  run.nudgeText = ''
  const step = run.tour!.steps[previous.index]
  if (step?.page && !pageMatches(step.page, here()) && previous.path !== here().fullPath) void deps.router.push(previous.path)
  show(previous.index)
}

export function pause(): void {
  if (!run.tour || !isRunning()) return
  const keep = run.status === 'showing' && !run.handover ? shownPath : here().fullPath
  stopStep()
  run.status = 'paused'
  run.returnPath = keep
  run.nudgeText = ''
  record(true, keep)
}

/** Resume a paused tour, or go back to the page a step is on. */
export function resume(): void {
  if (!run.tour || !deps) return
  const step = current()
  if (!step) return exitTour()
  if (step.page && !pageMatches(step.page, here()) && run.returnPath) void deps.router.push(run.returnPath)
  show(run.index)
}

export function exitTour(): void {
  const tour = run.tour
  if (!tour) return
  stopStep()
  resetRun()
  recordEnd(tour, false)
}

/** The router moved: a step waiting for that page moves on; a step on another page pauses the tour. */
export function onRouteChange(): void {
  if (!run.tour || !deps) return
  const step = current()
  if (!step) return
  const where = here()
  // During a hand-over the person may go anywhere; only the outcome counts.
  if (run.handover) {
    if (outcomeMet(step)) handoverDone()
    return
  }
  if (run.status === 'left') {
    if (!step.page || pageMatches(step.page, where)) show(run.index)
    return
  }
  if (!isRunning()) return
  const wait = waitOf(step)
  if (wait.kind === 'page' && !step.handover && pageMatches(wait.to, where)) return next()
  if (step.page && !pageMatches(step.page, where)) {
    if (run.status !== 'finding') leave()
    return
  }
  // Same page, new content: find the element again.
  el = null
}

/** A person's saved progress arrived: a tour they left mid-way waits as paused. */
export function restoreRun(state: TutorialState): void {
  stopStep()
  resetRun()
  const active = state.active
  if (!active) return
  const tour = tourById(active.tourId)
  if (!tour || active.step >= tour.steps.length) {
    save(leftTour)
    return
  }
  run.tour = tour
  run.index = active.step
  run.status = 'paused'
  run.returnPath = active.path
}

/** A journey left on this device waits as paused, whoever uses the app now. Returns whether there was one. */
export function restoreJourney(): boolean {
  const kept = readJourney()
  const tour = kept ? tourById(kept.tourId) : undefined
  if (!kept || !tour?.journey || kept.step >= tour.steps.length) {
    if (kept) writeJourney(null)
    return false
  }
  stopStep()
  resetRun()
  run.tour = tour
  run.index = kept.step
  run.status = 'paused'
  run.returnPath = kept.path
  run.memory = { ...kept.memory }
  run.made = kept.made ?? (tour.guide ? madeWords(new Date(), Math.random) : {})
  return true
}

/** Someone else is using the app now (or nobody): stop without saving anything for them. */
export function dropRun(): void {
  stopStep()
  resetRun()
  help.open = false
}

/* ── The guard and the keys ──────────────────────────────────────────────────────────────────────────────────────── */

function nudge(e: Event, text: string): void {
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  run.nudgeText = text
  run.nudge += 1
}

/** The page is guarded while a step shows, and handed back during a hand-over or a pause. */
const guarding = () => isRunning() && !run.handover

/** In a list, a dialog or a menu the step has opened. A guide pointing into a dialog leaves the rest of that dialog alone. */
function inOpened(target: Element): boolean {
  if (el && menuOf(el)?.contains(target)) return true
  const overlay = target.closest(OVERLAYS)
  return !!overlay && !(live() && !!el && overlay.contains(el))
}

function onClick(e: MouseEvent): void {
  if (!guarding()) return
  const target = e.target instanceof Element ? e.target : null
  if (!target || target.closest('[data-tour-ui], .p-toast')) return
  const control = target.closest(CONTROL)
  const inside = run.status === 'showing' && run.interactive && !!el && (el.contains(target) || inOpened(target))
  // In a guide the highlighted part works, with the dialog it opens; elsewhere a real action is always stopped.
  const sensitive = !!control && isSensitiveElement(control) && !(inside && live())
  if (!inside || sensitive) return nudge(e, sensitive ? SENSITIVE_NUDGE : OUTSIDE_NUDGE)
  const step = current()
  if (step && waitOf(step).kind === 'click' && el?.contains(target)) window.setTimeout(next, 0)
}

function onSubmit(e: Event): void {
  if (!guarding()) return
  const form = e.target instanceof Element ? e.target : null
  if (form?.closest('[data-tour-ui]')) return
  if (!(run.status === 'showing' && run.interactive && el && form && (el.contains(form) || (live() && inOpened(form))))) nudge(e, OUTSIDE_NUDGE)
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
  const typing = isTyping(e.target)
  if (e.key === '?' && !typing) {
    e.preventDefault()
    help.open = !help.open
    return
  }
  if (!isRunning()) return
  if (e.key === 'Escape') {
    pause()
    return
  }
  if (typing || run.handover) return
  const step = current()
  if (e.key === 'ArrowRight' && step && waitOf(step).kind === 'next' && run.status === 'showing') {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft' && (run.history.length || run.backHere !== null)) {
    e.preventDefault()
    back()
  }
}

/** Installed once by the tour layer. Returns the uninstall. */
export function installTourEngine(d: Deps): () => void {
  deps = d
  window.addEventListener('click', onClick, true)
  window.addEventListener('submit', onSubmit, true)
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('submit', onSubmit, true)
    window.removeEventListener('keydown', onKey)
    dropRun()
    deps = null
  }
}

/** "Step 3 of 8" for the step on screen: optional steps left out come off both numbers. It holds after a reload too. */
export function stepPosition(): { shown: number; total: number } {
  const total = (run.tour?.steps.length ?? 0) - run.skipped.length
  return { shown: run.index + 1 - run.skipped.filter((i) => i < run.index).length, total }
}

export const canGoBack = () => run.history.length > 0 || run.backHere !== null
