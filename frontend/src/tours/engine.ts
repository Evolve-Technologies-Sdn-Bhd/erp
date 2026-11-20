import { reactive } from 'vue'
import type { Router } from 'vue-router'
import { holeRect, needsScroll, NARROW, type Rect } from './placement.rules'
import { progress, updateProgress } from './progress'
import { tourById } from './registry'
import { atStep, finished, isInteractive, isSensitiveLabel, leftTour, pageMatches, waitOf, type TutorialState } from './tour.rules'
import type { Here, Tour, TourStep } from './types'

/**
 * The tour runner: shows one step at a time on the real screen, waits for the person where the step says so, and
 * guards the page while it runs.
 *
 * Safety (the rule the tours are built on): while a step shows, a click anywhere except the tour's own box, and the
 * highlighted element on a step that asks for it, is stopped before the page sees it. Inside the highlighted element,
 * a button that changes records (Release, Approve, Delete, Pay …) is stopped too. Pausing or leaving the tour gives
 * the whole page back, so doing something real is always the person's own, deliberate act outside the tour.
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
})

/** The Help panel. */
export const help = reactive({ open: false })

interface Deps {
  router: Router
  can: (permission: string) => boolean
  onFinish: (tour: Tour) => void
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
const current = (): TourStep | null => run.tour?.steps[run.index] ?? null

function here(): Here & { fullPath: string } {
  const r = deps!.router.currentRoute.value
  return { path: r.path, fullPath: r.fullPath, layout: r.meta.layout ?? 'bare', module: r.meta.module, code: r.meta.code }
}

function save(change: (s: TutorialState) => TutorialState): void {
  if (progress.owner) updateProgress(change)
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

function updateHole(node: HTMLElement): void {
  const h = holeRect(node.getBoundingClientRect(), screenSize())
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
  run.raised = false
  run.dropdownOpen = false
  run.dialog = null
  run.slow = false
  run.offPage = false
}

function loop(): void {
  if (!raf) raf = requestAnimationFrame(frame)
}

function show(index: number): void {
  stopStep(true)
  run.index = index
  run.status = 'finding'
  startedAt = performance.now()
  shownPath = here().fullPath
  const tour = run.tour!
  save((s) => atStep(s, tour.id, index, shownPath))
  loop()
}

function frame(): void {
  raf = 0
  if (!isRunning()) return
  const step = current()
  if (!step) return
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
  const dropdown = run.interactive ? document.querySelector<HTMLElement>(DROPDOWNS) : null
  const dropdownOpen = !!dropdown && visible(dropdown)
  if (run.dropdownOpen !== dropdownOpen) run.dropdownOpen = dropdownOpen
  const dialog = run.interactive ? [...document.querySelectorAll<HTMLElement>('.p-dialog')].find((d) => visible(d) && !d.closest('[data-tour-ui]')) : undefined
  const dr = dialog?.getBoundingClientRect()
  if (!dr) {
    if (run.dialog) run.dialog = null
  } else if (!run.dialog || Math.abs(run.dialog.top - dr.top) > 1 || Math.abs(run.dialog.left - dr.left) > 1 || Math.abs(run.dialog.height - dr.height) > 1) {
    run.dialog = { top: dr.top, left: dr.left, width: dr.width, height: dr.height }
  }
  const wait = waitOf(step)
  if (run.status === 'showing' && wait.kind === 'appear') {
    const shown = document.querySelector<HTMLElement>(wait.selector)
    if (shown && visible(shown)) return next()
  }
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
  run.guarded = !!el && (control ? isSensitiveElement(control) : !!el.closest('[data-tour-sensitive]'))
  run.interactive = !!el && isInteractive(step) && !run.guarded

  const wait = waitOf(step)
  const node = el
  if (wait.kind === 'page' && pageMatches(wait.to, here())) {
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
  const tour = run.tour!
  save((s) => atStep(s, tour.id, run.index, shownPath, true))
}

function finish(): void {
  const tour = run.tour
  stopStep()
  resetRun()
  if (!tour) return
  save((s) => finished(s, tour.id))
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
}

/* ── What the controls do ────────────────────────────────────────────────────────────────────────────────────────── */

export function startTour(id: string): void {
  const tour = tourById(id)
  if (!tour || !deps) return
  if (tour.permission && !deps.can(tour.permission)) return
  help.open = false
  stopStep()
  resetRun()
  run.tour = tour
  if (tour.startAt && here().path !== tour.startAt) void deps.router.push(tour.startAt)
  show(0)
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
  const keep = run.status === 'showing' ? shownPath : here().fullPath
  stopStep()
  run.status = 'paused'
  run.returnPath = keep
  run.nudgeText = ''
  const tour = run.tour
  save((s) => atStep(s, tour.id, run.index, keep, true))
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
  if (!run.tour) return
  stopStep()
  resetRun()
  save(leftTour)
}

/** The router moved: a step waiting for that page moves on; a step on another page pauses the tour. */
export function onRouteChange(): void {
  if (!run.tour || !deps) return
  const step = current()
  if (!step) return
  const where = here()
  if (run.status === 'left') {
    if (!step.page || pageMatches(step.page, where)) show(run.index)
    return
  }
  if (!isRunning()) return
  const wait = waitOf(step)
  if (wait.kind === 'page' && pageMatches(wait.to, where)) return next()
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

function onClick(e: MouseEvent): void {
  if (!isRunning()) return
  const target = e.target instanceof Element ? e.target : null
  if (!target || target.closest('[data-tour-ui], .p-toast')) return
  const control = target.closest(CONTROL)
  const sensitive = !!control && isSensitiveElement(control)
  const inside = run.status === 'showing' && run.interactive && !!el && (el.contains(target) || !!target.closest(OVERLAYS))
  if (!inside || sensitive) return nudge(e, sensitive ? SENSITIVE_NUDGE : OUTSIDE_NUDGE)
  const step = current()
  if (step && waitOf(step).kind === 'click' && el?.contains(target)) window.setTimeout(next, 0)
}

function onSubmit(e: Event): void {
  if (!isRunning()) return
  const form = e.target instanceof Element ? e.target : null
  if (form?.closest('[data-tour-ui]')) return
  if (!(run.status === 'showing' && run.interactive && el && form && el.contains(form))) nudge(e, OUTSIDE_NUDGE)
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
  if (typing) return
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
