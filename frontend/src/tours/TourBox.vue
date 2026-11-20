<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Compass, Hand, Info, Lock, Pause, X } from '@lucide/vue'
import { back, canGoBack, carryOn, exitTour, handOver, next, pause, run, skipStep, stepPosition, stepText } from './engine'
import { isInteractive, stepLabel, waitOf } from './tour.rules'

/**
 * The box beside the highlighted element: where the tour is, what to do, and the controls. Built from the ERP's own
 * card, buttons and the module's colour (--tour-accent), so it reads as part of the screen.
 *
 * A hand-over step (a real action) offers "I'll do it now" instead of Next; once chosen, the box becomes a one-line
 * "Your turn" strip while the person presses the real button, and the tour carries on when it sees it done.
 */
const props = defineProps<{ sheet: boolean; compact?: boolean }>()

const step = computed(() => run.tour?.steps[run.index] ?? null)
const position = computed(() => stepPosition())
const label = computed(() => stepLabel(position.value.shown, position.value.total))
const percent = computed(() => `${Math.round((position.value.shown / Math.max(1, position.value.total)) * 100)}%`)
const isLast = computed(() => !!run.tour && run.index === run.tour.steps.length - 1)
const missing = computed(() => run.status === 'missing')
const finding = computed(() => run.status === 'finding')

// The words, with what a journey knows filled in ({people}, {order} …).
const title = computed(() => stepText(step.value?.title))
const text = computed(() => stepText(step.value?.text))
const why = computed(() => stepText(step.value?.why))

const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
const kind = computed(() => (step.value ? waitOf(step.value).kind : 'next'))
/** A real action the person may take over, not taken over yet. */
const offering = computed(() => !!step.value?.handover && !run.handover && run.status === 'showing')
/** The step waits for the person (and the element is safe to use); otherwise it is read and Next. */
const waiting = computed(() => {
  if (!step.value || run.status !== 'showing' || run.guarded || step.value.handover) return false
  if (kind.value === 'hover') return !touch
  if (kind.value === 'user') return !run.userOk
  return isInteractive(step.value) && run.interactive
})
const waitingText = computed(() => stepText(step.value?.waiting) || WAITING_TEXT[kind.value])
const WAITING_TEXT: Record<string, string> = {
  click: 'Waiting for you to click it.',
  hover: 'Point at it to carry on.',
  page: 'Waiting for you to open it.',
  appear: 'Waiting for you to open it.',
  gone: 'Waiting for you to finish it.',
  fill: 'Waiting for you to fill it in.',
  user: 'Waiting for you to switch person, top right.',
}

const nextButton = ref<HTMLButtonElement | null>(null)
// On a step that only explains, Next takes the focus, so the keyboard can go on; never away from a field being typed in.
watch(
  () => [run.index, run.status] as const,
  async ([, status]) => {
    if (status !== 'showing' || waiting.value) return
    await nextTick()
    const active = document.activeElement
    if (!active || active === document.body || active.closest('[data-tour-ui]')) nextButton.value?.focus({ preventScroll: true })
  },
)

// A stopped click shakes the box once, with the reason.
const shaking = ref(false)
watch(
  () => run.nudge,
  () => {
    shaking.value = false
    requestAnimationFrame(() => (shaking.value = true))
  },
)
</script>

<template>
  <!-- One line: while the person works in a dialog, or does a hand-over ("Your turn") -->
  <div
    v-if="run.tour && step && props.compact"
    data-tour-ui
    role="dialog"
    aria-modal="false"
    :aria-label="`${run.tour.title}, ${label}: ${title}. ${text}`"
    class="tour-box tour-box-compact"
    :class="{ 'tour-shake': shaking, 'tour-box-aside': run.dropdownOpen }"
    @animationend="shaking = false"
  >
    <div class="flex items-center gap-2.5">
      <span class="tour-badge" aria-hidden="true"><component :is="run.handover ? Hand : Compass" :size="14" /></span>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[11px] font-semibold tracking-wide text-erp-muted uppercase">
          <template v-if="run.handover">Your turn · the tour carries on when it sees it done</template>
          <template v-else><span class="erp-num">{{ label }}</span> · {{ run.tour.title }}</template>
        </span>
        <span class="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-erp-text">
          <span v-if="waiting || run.handover" class="tour-dot shrink-0" aria-hidden="true" /><span class="truncate">{{ title }}</span>
        </span>
      </div>
      <button v-if="run.handover" type="button" class="erp-btn erp-btn-secondary tour-btn-sm" title="If the tour did not notice it is done" @click="carryOn">Carry on</button>
      <button v-else-if="waiting" type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="skipStep">Skip step</button>
      <button v-else type="button" class="erp-btn tour-btn-primary tour-btn-sm" @click="next">{{ isLast ? 'Done' : 'Next' }}</button>
      <button type="button" class="tour-icon-btn" aria-label="Pause the tour" title="Pause (Esc)" @click="pause"><Pause :size="15" /></button>
      <button type="button" class="tour-icon-btn" aria-label="Exit the tour" title="Exit" @click="exitTour"><X :size="16" /></button>
    </div>
    <p v-if="run.nudgeText" :key="run.nudge" class="tour-nudge" role="alert">{{ run.nudgeText }}</p>
  </div>
  <div
    v-else-if="run.tour && step"
    data-tour-ui
    role="dialog"
    aria-modal="false"
    :aria-label="`${run.tour.title}, ${label}`"
    class="tour-box"
    :class="{ 'tour-box-sheet': props.sheet, 'tour-shake': shaking, 'tour-box-aside': run.dropdownOpen }"
    @animationend="shaking = false"
  >
    <div class="flex items-center gap-2">
      <span class="tour-badge" aria-hidden="true"><Compass :size="14" /></span>
      <p class="m-0 min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-erp-muted uppercase">
        <span class="erp-num">{{ label }}</span> · {{ run.tour.title }}
      </p>
      <button type="button" class="tour-icon-btn" aria-label="Pause the tour" title="Pause (Esc)" @click="pause"><Pause :size="15" /></button>
      <button type="button" class="tour-icon-btn" aria-label="Exit the tour" title="Exit" @click="exitTour"><X :size="16" /></button>
    </div>
    <div class="tour-progress" aria-hidden="true"><i :style="{ width: percent }" /></div>

    <div class="flex flex-col gap-1.5" aria-live="polite">
      <h2 class="m-0 text-[15px] leading-snug font-bold text-erp-text">{{ title }}</h2>
      <p class="m-0 text-[13px] leading-relaxed text-erp-subtle">{{ text }}</p>
    </div>

    <p v-if="why" class="tour-note"><Info :size="14" class="shrink-0" aria-hidden="true" />{{ why }}</p>
    <p v-if="offering" class="tour-note tour-note-lock">
      <Hand :size="14" class="shrink-0" aria-hidden="true" />This changes records for real, so the tour does not press it. Choose I’ll do it now, then press it yourself; the tour carries on when it sees it done.
    </p>
    <p v-else-if="run.guarded" class="tour-note tour-note-lock">
      <Lock :size="14" class="shrink-0" aria-hidden="true" />The tour only shows this button. Pressing it changes records for real, so it is yours to do after the tour.
    </p>
    <p v-if="waiting" class="tour-waiting"><span class="tour-dot" aria-hidden="true" />{{ waitingText }}</p>
    <p v-if="finding" class="tour-waiting"><span class="tour-dot" aria-hidden="true" />Waiting for the page…</p>
    <p v-if="missing" class="tour-note">
      <Info :size="14" class="shrink-0" aria-hidden="true" />
      {{ run.offPage ? 'This step is on a page you have not opened. Open it to carry on, or skip this step.' : 'This part is not on your screen. Your role may not show it, or the page has not loaded yet.' }}
    </p>
    <p v-if="run.nudgeText" :key="run.nudge" class="tour-nudge" role="alert">{{ run.nudgeText }}</p>

    <div class="flex items-center gap-2 pt-1">
      <button v-if="canGoBack()" type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="back"><ChevronLeft :size="15" aria-hidden="true" />Back</button>
      <span class="grow" />
      <button v-if="waiting || missing || finding || offering" type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="skipStep">Skip step</button>
      <button v-if="missing" type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="exitTour">Exit tour</button>
      <button v-if="offering" ref="nextButton" type="button" class="erp-btn tour-btn-primary tour-btn-sm" @click="handOver"><Hand :size="14" aria-hidden="true" />I’ll do it now</button>
      <button v-else-if="!waiting && !missing && !finding" ref="nextButton" type="button" class="erp-btn tour-btn-primary tour-btn-sm" @click="next">
        {{ isLast ? 'Done' : 'Next' }}<ChevronRight v-if="!isLast" :size="15" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
