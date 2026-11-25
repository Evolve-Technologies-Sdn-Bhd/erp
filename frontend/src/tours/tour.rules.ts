import type { Guide, Here, PageMatch, StepWait, Tour, TourStep } from './types'

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
  /\b(approve|reject|release|post|posting|delete|remove|pay|payment|verify|confirm|void|submit|send|e-?mail|award|cancellation|deactivate|block|discontinue|revoke|unlock|reset|load|save|create|transfer|convert|duplicate|import|book|extend|dismiss|close job|make jobs|take off|mark as (complete|done)|record (a |the )?(payment|visit))\b|\bcancel\s+\w/i

/** Plain dialog buttons that only close what they opened. */
const HARMLESS = new Set(['cancel', 'close', 'back', 'not now', 'no', 'ok'])

/**
 * An action button says what it does in a few words ("Take payment and release"). Longer text is content: a job card
 * or a request card, whose customer name could read "Post Office". Those are judged by their style and markers only.
 */
export const ACTION_LABEL_MAX = 40

export function isSensitiveLabel(label: string): boolean {
  const text = label.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!text || HARMLESS.has(text) || text.length > ACTION_LABEL_MAX) return false
  return SENSITIVE.test(text)
}

/** What a tour may need switched on; tours.spec checks every tour names only these. */
export const REQUIREMENTS = [
  'dev',
  'service',
  'wms',
  'sales:useEnquiries',
  'sales:officeDraftsQuotations',
  'sales:askInstallation',
  'sales:agentsAddCustomers',
  'sales:priceRange',
  'sales:fixedPrices',
  'sales:freePrices',
  'sales:voucherControl',
  'sales:freeVouchers',
  'sales:useReceipts',
  'sales:reviseOrders',
  'sales:preOrders',
  'sales:autoCancel',
  'sales:shareWhatsapp',
  'sales:holdStock',
  'sales:autoDelivery',
  'sales:signedDelivery',
  'sales:autoInvoice',
  'sales:receiptsPayInvoices',
] as const
export type Requirement = (typeof REQUIREMENTS)[number]

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

/** live: a guide, where the highlighted part works for real (so also one whose outcome is something going away). */
export function isInteractive(step: TourStep, live = false): boolean {
  const kind = waitOf(step).kind
  return kind === 'click' || kind === 'fill' || kind === 'page' || kind === 'appear' || kind === 'user' || kind === 'use' || (live && kind === 'gone')
}

/** A hand-over waits for what the person's own action leads to. */
const OUTCOMES = ['page', 'appear', 'gone']

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
  for (const r of tour.requires ?? []) if (!(REQUIREMENTS as readonly string[]).includes(r)) problems.push(`${tour.id}: needs "${r}", which no feature check knows`)
  if (tour.journey && !tour.requires?.includes('dev')) problems.push(`${tour.id}: a journey switches person, so it needs 'dev'`)
  const remembered = new Set<string>()
  tour.steps.forEach((step, i) => {
    const where = `${tour.id} step ${i + 1}`
    if (!step.title.trim() || !step.text.trim()) problems.push(`${where}: needs a title and a text`)
    const wait = waitOf(step)
    if (wait.kind !== 'next' && wait.kind !== 'page' && !step.target) problems.push(`${where}: a ${wait.kind} step needs a target`)
    if ((wait.kind === 'appear' || wait.kind === 'gone') && !wait.selector.trim()) problems.push(`${where}: ${wait.kind} needs a selector`)
    if (wait.kind === 'page') problems.push(...pageProblems(wait.to, where))
    if (wait.kind === 'user' && !tour.journey) problems.push(`${where}: only a journey switches person`)
    if (wait.kind === 'user' && wait.sameBranchAs && !remembered.has(wait.sameBranchAs)) problems.push(`${where}: "${wait.sameBranchAs}" is not remembered before this step`)
    problems.push(...pageProblems(step.page, where))
    if (step.handover && !OUTCOMES.includes(wait.kind)) problems.push(`${where}: a hand-over waits for an outcome (page, appear or gone)`)
    if (!tour.guide && !step.handover && isInteractive(step) && step.target && isSensitiveTargetId(step.target)) {
      problems.push(`${where}: "${step.target}" changes records; a tour may only explain it or hand it over, never wait for it to be pressed`)
    }
    for (const r of step.when ?? []) if (!(REQUIREMENTS as readonly string[]).includes(r)) problems.push(`${where}: needs "${r}", which no feature check knows`)
    if (step.pick && !step.target) problems.push(`${where}: pick only makes sense with a target`)
    if (step.optional && !step.target) problems.push(`${where}: optional only makes sense with a target`)
    if (step.go?.startsWith('@') && !remembered.has(step.go.slice(1))) problems.push(`${where}: "${step.go}" is not remembered before this step`)
    if (step.go && !step.go.startsWith('@') && !step.go.startsWith('/')) problems.push(`${where}: go is a path or @remembered`)
    if (step.remember) remembered.add(step.remember)
  })
  if (tour.guide) problems.push(...guideProblems(tour, tour.guide))
  return problems
}

/** What only a guide needs: dev mode, its module, the Handbook's steps in order, and no word it cannot fill in. */
function guideProblems(tour: Tour, guide: Guide): string[] {
  const problems: string[] = []
  if (!tour.journey) problems.push(`${tour.id}: a guide switches person, so it is a journey`)
  if (!tour.module) problems.push(`${tour.id}: a guide belongs to a module`)
  if (!/^[A-Z]$/.test(guide.letter) || !guide.book.trim() || !guide.cast.trim()) problems.push(`${tour.id}: a guide has a book, a letter and who plays`)
  const rows = tour.steps.flatMap((s) => (s.row ? [s.row] : []))
  const wanted = Array.from({ length: guide.rows }, (_, i) => i + 1)
  if (rows.join() !== wanted.join()) problems.push(`${tour.id}: Handbook steps ${rows.join(', ') || 'none'}; they should be 1 to ${guide.rows}, once each, in order`)
  const known = new Set([...Object.keys(guide.values ?? {}), ...Object.keys(madeWords(new Date(0), () => 0))])
  for (const word of Object.keys(guide.from ?? {})) if (!guide.values?.[word]) problems.push(`${tour.id}: {${word}} from another guide needs neutral words too`)
  tour.steps.forEach((step, i) => {
    if (step.handover) problems.push(`${tour.id} step ${i + 1}: a guide's button works as it is, so it has no hand-over`)
    const here = new Set([...known, ...(waitOf(step).kind === 'user' ? ['people'] : []), ...(step.remember ? [step.remember] : [])])
    const texts = [step.title, step.text, step.why, step.waiting, step.expect, step.pick, ...(step.type ?? []).flatMap((t) => [t.field, t.value])]
    for (const text of texts) for (const m of (text ?? '').matchAll(/\{(\w+)\}/g)) if (!here.has(m[1]!)) problems.push(`${tour.id} step ${i + 1}: nothing fills in {${m[1]}}`)
    if (step.remember) known.add(step.remember)
  })
  return problems
}

/* ── Guides: the words and the Handbook's step numbers ────────────────────────────────────────────────────────────── */

const FIRST = 'Salmah Aminah Faridah Rokiah Zainab Hasnah Maimun Noraini Rohana Azizah Kamariah Latifah Mariam Norlia Rashidah Suraya Wahidah Yasmin Zaleha Halimah'.split(' ')
const LAST = 'Ismail Yusof Hamid Razak Osman Karim Salleh Bakar Daud Hashim Jalil Kassim Latif Mansor Nordin Rahim Samad Talib Wahab Zakaria'.split(' ')

/**
 * Words made new each time a guide starts, because the system refuses them twice (a phone already on file) or they
 * must be in the future. Kept with the guide, so a reload shows the same ones.
 */
export function madeWords(now: Date, random: () => number): Record<string, string> {
  const pick = (list: string[]) => list[Math.floor(random() * list.length)]!
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 10)).join('')
  const day = (ahead: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + ahead)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return { newName: `Puan ${pick(FIRST)} ${pick(LAST)}`, newPhone: `011-${digits(4)} ${digits(4)}`, newVoucher: `V-${digits(4)}`, newSerial: `SN-${digits(6)}`, newBill: `SI-${digits(5)}`, newBill2: `SI-${digits(5)}`, tomorrow: day(1), nextWeek: day(7) }
}

/** A guide's words: its own neutral ones, the made ones, then the company's (for every guide, then for this one). */
export function guideWords(tour: Tour, company: Record<string, Record<string, string>>, made: Record<string, string>): Record<string, string> {
  return { ...tour.guide?.values, ...made, ...company.common, ...company[tour.id] }
}

/**
 * Whether what a step asks for is there, so Next may be clicked. A field that marks itself (data-filled) says so; else
 * as many typed fields as the step names, or one for a step that only says to pick something.
 */
export function stepReady(step: Pick<TourStep, 'type' | 'must'>, marked: boolean | null, filledTexts: number, filledAny: number): boolean {
  if (!step.type?.length && !step.must) return true
  if (marked !== null) return marked
  return step.type?.length ? filledTexts >= step.type.length : filledAny > 0
}

/** The Handbook step a click belongs to: 0 before the first. */
export function rowAt(tour: Tour, index: number): number {
  for (let i = Math.min(index, tour.steps.length - 1); i >= 0; i--) if (tour.steps[i]!.row) return tour.steps[i]!.row!
  return 0
}

export interface GuideGroup {
  module: string
  books: { title: string; guides: Tour[]; done: number }[]
  total: number
  done: number
}

/** Help's guides: by module, the module open now first, then by book, each in letter order with how many are done. */
export function guideGroups(guides: Tour[], order: string[], here: string | undefined, isDone: (t: Tour) => boolean): GuideGroup[] {
  const rank = (m: string) => (m === here ? -1 : order.indexOf(m) < 0 ? order.length : order.indexOf(m))
  const modules = [...new Set(guides.map((g) => g.module!))].sort((a, b) => rank(a) - rank(b))
  return modules.map((module) => {
    const own = guides.filter((g) => g.module === module)
    const books = [...new Set(own.map((g) => g.guide!.book))].map((title) => {
      const list = own.filter((g) => g.guide!.book === title).sort((a, b) => a.guide!.letter.localeCompare(b.guide!.letter))
      return { title, guides: list, done: list.filter(isDone).length }
    })
    return { module, books, total: own.length, done: own.filter(isDone).length }
  })
}

/* ── Journeys: words filled in on the way, and who may play a part ────────────────────────────────────────────────── */

/** "Order {order}" with what the journey knows; an unknown name reads as nothing rather than "{order}". */
export function fillText(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '').replace(/\s{2,}/g, ' ')
}

/** The document number in a page title: "Sales order SO-0012" → "SO-0012"; "Official receipt OR-2611-0003". */
export function docNoIn(title: string): string {
  return title.match(/\b[A-Z]{1,5}(?:-[A-Z0-9]+)*-\d+\b/)?.[0] ?? title.trim()
}

export interface Person {
  code: string
  name: string
  roles: readonly string[]
  branchCodes: readonly string[]
}

export function fitsPart(person: Pick<Person, 'roles' | 'branchCodes'> | null | undefined, role: string, branch?: string): boolean {
  return !!person && person.roles.includes(role) && (!branch || person.branchCodes.includes(branch))
}

/** "Demo Sales Manager or Lim Wei Jie": who to switch to for a part. */
export function peopleFor(people: readonly Person[], role: string, branch?: string): string {
  const names = people.filter((p) => fitsPart(p, role, branch)).map((p) => p.name)
  if (!names.length) return 'someone with that role'
  if (names.length > 5) return `${names.slice(0, 3).join(', ')} or one of ${names.length - 3} others`
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
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
export function toursFor(
  tours: Tour[],
  here: Here,
  can: (permission: string) => boolean,
  available: (tour: Tour) => boolean = () => true,
): { onThisPage: Tour[]; more: Tour[] } {
  const allowed = tours.filter((t) => (!t.permission || can(t.permission)) && available(t))
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
