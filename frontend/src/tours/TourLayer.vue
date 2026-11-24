<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { Compass, Play, X } from '@lucide/vue'
import { useSession } from '@/composables/useSession'
import { dropRun, exitTour, installTourEngine, onRouteChange, onUserChange, restoreJourney, restoreRun, resume, run, stepPosition } from './engine'
import { loadFeatures } from './features'
import { loadGuideValues } from './guide-values'
import HelpPanel from './HelpPanel.vue'
import { boxRect, cornerFor, NARROW, overlapArea, placeBox } from './placement.rules'
import { clearProgress, loadProgress, progress, setOwnerSource } from './progress'
import { stepLabel } from './tour.rules'
import TourBox from './TourBox.vue'
import './tours.css'

/**
 * Mounted once, beside the pages (App.vue): the dimmed page with its highlight, the tour box, the paused pill and the
 * Help panel. Keeps each person's progress: a switch of person (dev mode) or a sign-out stops the tour at once and
 * loads the next person's own. A journey is the exception: it goes on through the switch, since switching person is
 * part of it, and its place is kept on this device.
 */
const router = useRouter()
const route = useRoute()
const toast = useToast()
const session = useSession()

/** Whose tours these are: empty until the app knows who is using it. */
const owner = computed(() => {
  const s = session.state
  if (!s.ready || (s.mode === 'jwt' && s.signedOut)) return ''
  return s.me?.user.code ?? ''
})
// The person a request goes out as: in dev mode the switcher changes it before the new person has loaded.
setOwnerSource(() => (session.state.mode === 'dev' ? session.state.userCode : owner.value))

watch(
  owner,
  async (code) => {
    const journey = !!run.tour?.journey
    if (!journey) dropRun()
    void loadFeatures(code, session.state.mode)
    if (code) void loadGuideValues(session.state.mode)
    if (!code) return journey ? undefined : clearProgress()
    if (journey) onUserChange()
    await loadProgress(code)
    if (journey || run.tour?.journey || progress.owner !== code) return
    if (!restoreJourney()) restoreRun(progress.state)
  },
  { immediate: true },
)

watch(() => route.fullPath, onRouteChange)

let uninstall: (() => void) | null = null
onMounted(() => {
  uninstall = installTourEngine({
    router,
    can: (permission) => session.can(permission),
    me: () => {
      const me = session.state.me
      return me ? { code: me.user.code, name: me.user.name, roles: me.user.roles, branchCodes: me.user.branchCodes, branchCode: me.branchCode } : null
    },
    people: () => session.state.users,
    onFinish: (tour) =>
      toast.add({ severity: 'success', summary: `${tour.title}: done`, detail: tour.guide ? 'The next guide is under Help in the top bar.' : 'More tours, Tutorial mode and starting again are under Help in the top bar.', life: 5000 }),
  })
  window.addEventListener('resize', measureScreen)
})
onBeforeUnmount(() => {
  uninstall?.()
  document.body.removeAttribute('data-tour-on')
  window.removeEventListener('resize', measureScreen)
  sizeWatcher?.disconnect()
})

/* ── Where the box goes ─────────────────────────────────────────────────────────────────────────────────────────── */

const screen = reactive({ width: window.innerWidth, height: window.innerHeight })
function measureScreen() {
  screen.width = window.innerWidth
  screen.height = window.innerHeight
}
const sheet = computed(() => screen.width < NARROW)

/** The full box's size, and the compact one's: each measured while it shows, so choosing between them never flickers. */
const boxSize = reactive({ width: 360, height: 220 })
const chipSize = reactive({ width: 420, height: 56 })
const boxHost = ref<HTMLElement | null>(null)
let sizeWatcher: ResizeObserver | null = null
let watchedBox: Element | null = null
/** The box changes size with its text; it is measured each time it appears or changes step. */
function observeBox() {
  // The box that is coming in, not one fading out: a box being removed measures 0 and would push the next one off screen.
  const box = boxHost.value?.querySelector('.tour-box:not(.tour-fade-leave-active)') ?? null
  if (box === watchedBox) return
  sizeWatcher?.disconnect()
  watchedBox = box
  if (!box) return
  sizeWatcher = new ResizeObserver(() => {
    const width = (box as HTMLElement).offsetWidth
    const height = (box as HTMLElement).offsetHeight
    if (!width || !height || !box.isConnected) return
    const size = box.classList.contains('tour-box-compact') ? chipSize : boxSize
    size.width = width
    size.height = height
  })
  sizeWatcher.observe(box)
}

const step = computed(() => run.tour?.steps[run.index] ?? null)
const boxShown = computed(() => run.status === 'showing' || run.status === 'missing' || (run.status === 'finding' && run.slow))
// During a hand-over the page is the person's: no dimming, only the "Your turn" strip.
const dimmed = computed(() => !run.handover && (run.status === 'showing' || run.status === 'missing' || run.status === 'finding'))

// Messages move to the bottom left while a step shows, so they never cover the button it points at (top right).
watch(dimmed, (on) => document.body.toggleAttribute('data-tour-on', on), { immediate: true })

const place = computed(() => placeBox(run.status === 'missing' ? null : run.hole, boxSize, screen, step.value?.placement))
/** The menu rail on the left: the "Your turn" strip keeps off it when nothing else is in the way. */
const rail = computed(() => ({ top: 0, left: 0, width: 90, height: screen.height }))
/** What the box must keep off while the person works: an open dialog, or the dialog the step points into. */
const obstacle = computed(() => {
  if (run.handover) return run.dialog ?? rail.value
  return run.status === 'showing' && run.interactive ? (run.dialog ?? (run.raised ? run.hole : null)) : null
})
/** The chip keeps clear of the dialog and of the rail's Home and Sign out. */
const keepClear = computed(() => (obstacle.value ? [obstacle.value, rail.value] : [rail.value]))
/** The full box would cover it, or the person is doing a hand-over: a one-line chip in the freest corner instead. */
const compact = computed(() => {
  if (run.handover) return true
  if (sheet.value || !obstacle.value) return false
  const at = boxRect(place.value, boxSize)
  return !!at && overlapArea(at, obstacle.value) > 0
})
const boxStyle = computed(() => {
  if (compact.value) {
    const c = cornerFor(keepClear.value, chipSize, screen, run.handover ? null : run.hole)
    return { transform: `translate3d(${Math.round(c.left)}px, ${Math.round(c.top)}px, 0)` }
  }
  return place.value.mode === 'float' ? { transform: `translate3d(${Math.round(place.value.left)}px, ${Math.round(place.value.top)}px, 0)` } : {}
})
watch(() => [run.status, run.index, run.slow, compact.value, run.handover] as const, () => nextTick(observeBox), { flush: 'post' })
const holeStyle = computed(() => (run.hole ? { top: `${run.hole.top}px`, left: `${run.hole.left}px`, width: `${run.hole.width}px`, height: `${run.hole.height}px` } : {}))

/* ── The paused pill ─────────────────────────────────────────────────────────────────────────────────────────────── */

const pillShown = computed(() => !!run.tour && (run.status === 'paused' || run.status === 'left'))
const pillText = computed(() => {
  const p = stepPosition()
  return run.status === 'left' ? 'Paused: you left the page this step is on' : `Paused at ${stepLabel(p.shown, p.total).toLowerCase()}`
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div v-if="dimmed && run.hole && run.status !== 'missing'" class="tour-hole" :class="{ 'tour-hole-live': run.interactive && run.status === 'showing', 'tour-hole-guarded': run.guarded, 'tour-hole-raised': run.raised }" :style="holeStyle" aria-hidden="true" />
      <div v-else-if="dimmed" class="tour-scrim" aria-hidden="true" />
    </Transition>

    <div ref="boxHost">
      <Transition name="tour-fade" @after-enter="observeBox">
        <TourBox v-if="boxShown" :sheet="sheet" :compact="compact" :style="boxStyle" />
      </Transition>
    </div>

    <Transition name="tour-rise">
      <div v-if="pillShown" data-tour-ui class="tour-pill" :class="{ 'left-4': sheet }" role="status">
        <span class="tour-badge" aria-hidden="true"><Compass :size="14" /></span>
        <span class="min-w-0 truncate"><strong>{{ run.tour!.title }}</strong> · {{ pillText }}</span>
        <button type="button" class="erp-btn tour-btn-primary tour-pill-btn" @click="resume"><Play :size="13" aria-hidden="true" />{{ run.status === 'left' ? 'Go back' : 'Resume' }}</button>
        <button type="button" class="tour-icon-btn" aria-label="Exit the tour" title="Exit" @click="exitTour"><X :size="16" /></button>
      </div>
    </Transition>

    <HelpPanel />
  </Teleport>
</template>
