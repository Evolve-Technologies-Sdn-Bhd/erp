<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { Compass, Play, X } from '@lucide/vue'
import { useSession } from '@/composables/useSession'
import { dropRun, exitTour, installTourEngine, onRouteChange, restoreRun, resume, run, stepPosition } from './engine'
import { loadFeatures } from './features'
import HelpPanel from './HelpPanel.vue'
import { boxRect, cornerFor, NARROW, overlapArea, placeBox } from './placement.rules'
import { clearProgress, loadProgress, progress, setOwnerSource } from './progress'
import { stepLabel } from './tour.rules'
import TourBox from './TourBox.vue'
import './tours.css'

/**
 * Mounted once, beside the pages (App.vue): the dimmed page with its highlight, the tour box, the paused pill and the
 * Help panel. Keeps each person's progress: a switch of person (dev mode) or a sign-out stops the tour at once and
 * loads the next person's own.
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
    dropRun()
    void loadFeatures(code)
    if (!code) return clearProgress()
    await loadProgress(code)
    if (progress.owner === code) restoreRun(progress.state)
  },
  { immediate: true },
)

watch(() => route.fullPath, onRouteChange)

let uninstall: (() => void) | null = null
onMounted(() => {
  uninstall = installTourEngine({
    router,
    can: (permission) => session.can(permission),
    onFinish: (tour) =>
      toast.add({ severity: 'success', summary: `${tour.title}: done`, detail: 'More tours, Tutorial mode and starting again are under Help in the top bar.', life: 5000 }),
  })
  window.addEventListener('resize', measureScreen)
})
onBeforeUnmount(() => {
  uninstall?.()
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
  const box = boxHost.value?.querySelector('.tour-box') ?? null
  if (box === watchedBox) return
  sizeWatcher?.disconnect()
  watchedBox = box
  if (!box) return
  sizeWatcher = new ResizeObserver(() => {
    const size = box.classList.contains('tour-box-compact') ? chipSize : boxSize
    size.width = (box as HTMLElement).offsetWidth
    size.height = (box as HTMLElement).offsetHeight
  })
  sizeWatcher.observe(box)
}

const step = computed(() => run.tour?.steps[run.index] ?? null)
const boxShown = computed(() => run.status === 'showing' || run.status === 'missing' || (run.status === 'finding' && run.slow))
const dimmed = computed(() => run.status === 'showing' || run.status === 'missing' || run.status === 'finding')

const place = computed(() => placeBox(run.status === 'missing' ? null : run.hole, boxSize, screen, step.value?.placement))
/** What the box must keep off while the person works: an open dialog, or the dialog the step points into. */
const obstacle = computed(() => (run.status === 'showing' && run.interactive ? (run.dialog ?? (run.raised ? run.hole : null)) : null))
/** The full box would cover it: a one-line chip in the freest corner instead. */
const compact = computed(() => {
  if (sheet.value || !obstacle.value) return false
  const at = boxRect(place.value, boxSize)
  return !!at && overlapArea(at, obstacle.value) > 0
})
const boxStyle = computed(() => {
  if (compact.value) {
    const c = cornerFor(obstacle.value!, chipSize, screen)
    return { transform: `translate3d(${Math.round(c.left)}px, ${Math.round(c.top)}px, 0)` }
  }
  return place.value.mode === 'float' ? { transform: `translate3d(${Math.round(place.value.left)}px, ${Math.round(place.value.top)}px, 0)` } : {}
})
watch(() => [run.status, run.index, run.slow, compact.value] as const, () => nextTick(observeBox), { flush: 'post' })
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
      <Transition name="tour-fade">
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
