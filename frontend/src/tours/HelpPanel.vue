<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { ChevronDown, CircleCheck, Compass, Keyboard, Play, RotateCcw, ShieldCheck, X } from '@lucide/vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { MODULES, type ModuleKey } from '@/modules/registry'
import { dropRun, exitTour, help, resume, run, startTour } from './engine'
import { available } from './features'
import { guidesDone, progress, resetProgress, updateProgress } from './progress'
import { TOURS } from './registry'
import { guideGroups, toursFor } from './tour.rules'
import type { Tour } from './types'

/**
 * Help, from the top bar (or the ? key): the guides (the Handbook's journeys on screen, by module), the short tours as
 * Quick look, Tutorial mode, and starting again. Everything can be started, restarted or left from here, at any time.
 */
const route = useRoute()
const toast = useToast()
const session = useSession()

const lists = computed(() =>
  toursFor(TOURS, { path: route.path, layout: route.meta.layout, module: route.meta.module, code: route.meta.code }, (p) => session.can(p), available),
)
/** This page's tours first, then the others by module, the module open now first. */
const groups = computed(() => {
  // Journeys (one document through several people) come first, apart from the one-page tours.
  const all = [...lists.value.onThisPage, ...lists.value.more]
  const journeys = all.filter((t) => t.journey && !t.guide)
  const byModule = new Map<string, Tour[]>()
  for (const t of lists.value.more.filter((t) => !t.journey)) byModule.set(t.module ?? '', [...(byModule.get(t.module ?? '') ?? []), t])
  const rank = (k: string) => (k === route.meta.module ? 0 : k === '' ? 2 : 1)
  const more = [...byModule.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, tours]) => ({ title: k && k in MODULES ? `${MODULES[k as ModuleKey].label} tours` : 'More tours', tours }))
  return [
    { title: 'One order, every person', tours: journeys },
    { title: 'On this page', tours: lists.value.onThisPage.filter((t) => !t.journey) },
    ...more,
  ].filter((g) => g.tours.length)
})
const isDone = (t: Tour) => (t.guide ? guidesDone.ids.includes(t.id) : progress.state.done.includes(t.id))

/** The guides, by module: the module open now first and unfolded, the others folded until asked for. */
const guides = computed(() =>
  guideGroups(
    [...lists.value.onThisPage, ...lists.value.more].filter((t) => t.guide),
    Object.keys(MODULES),
    route.meta.module,
    isDone,
  ),
)
const unfolded = ref<Record<string, boolean>>({})
const isOpen = (module: string, i: number) => unfolded.value[module] ?? i === 0
const moduleLabel = (key: string) => (key in MODULES ? MODULES[key as ModuleKey].label : key)
const isPaused = (t: Tour) => run.tour?.id === t.id

const mode = computed({
  get: () => progress.state.mode,
  set: (on: boolean) => updateProgress((s) => ({ ...s, mode: on })),
})

// "Start again" asks once, in the panel itself.
const confirmReset = ref(false)
async function reset() {
  dropRun()
  await resetProgress()
  confirmReset.value = false
  help.open = false
  toast.add({ severity: 'success', summary: 'Tours reset', detail: 'You are a first-time user again: the welcome card is back on the launcher.', life: 4000 })
}

const panel = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
watch(
  () => help.open,
  async (open) => {
    confirmReset.value = false
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      panel.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    } else returnFocus?.focus({ preventScroll: true })
  },
)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    help.open = false
  }
}
</script>

<template>
  <Transition name="tour-fade">
    <div v-if="help.open" data-tour-ui class="tour-panel-backdrop" aria-hidden="true" @click="help.open = false" />
  </Transition>
  <Transition name="tour-panel">
    <aside v-if="help.open" ref="panel" data-tour-ui class="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tour-help-title" @keydown="onKey">
      <header class="flex items-start gap-3 border-b border-erp-row px-5 py-4">
        <span class="tour-badge mt-0.5" aria-hidden="true"><Compass :size="14" /></span>
        <div class="min-w-0 flex-1">
          <h2 id="tour-help-title" class="m-0 text-[15px] font-bold">Help</h2>
          <p class="m-0 mt-0.5 text-xs leading-relaxed text-erp-muted">{{ guides.length ? 'Guides follow the Handbook click by click. Quick look shows you around a page.' : 'Tours walk you through the real screens, one step at a time.' }}</p>
        </div>
        <button type="button" class="tour-icon-btn" aria-label="Close Help" @click="help.open = false"><X :size="16" /></button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <p class="tour-note m-0"><ShieldCheck :size="14" class="shrink-0" aria-hidden="true" />{{ guides.length ? 'Nothing is ever pressed for you. In a guide the highlighted button works when you press it and changes this demo’s records; the rest of the page waits.' : 'A tour never presses a button that changes records, such as Release, Approve, Delete or a payment. It shows you where they are; you press them yourself.' }}</p>

        <div v-if="run.tour && (run.status === 'paused' || run.status === 'left')" class="tour-tour-row items-center">
          <div class="min-w-0 flex-1">
            <p class="m-0 text-[13px] font-semibold">{{ run.tour.title }}</p>
            <p class="m-0 text-xs text-erp-muted">Paused</p>
          </div>
          <button type="button" class="erp-btn tour-btn-primary tour-btn-sm" @click="(help.open = false), resume()"><Play :size="13" aria-hidden="true" />Resume</button>
          <button type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="exitTour">Exit</button>
        </div>

        <section v-if="guides.length" class="flex flex-col gap-2" aria-label="Guides">
          <h3 class="m-0 text-[11px] font-semibold tracking-widest text-erp-muted uppercase">Guides: the Handbook, click by click</h3>
          <div v-for="(g, i) in guides" :key="g.module" class="tour-guide-module">
            <button type="button" class="tour-guide-head" :aria-expanded="isOpen(g.module, i)" @click="unfolded[g.module] = !isOpen(g.module, i)">
              <span class="min-w-0 flex-1 truncate text-[13px] font-bold">{{ moduleLabel(g.module) }}</span>
              <span class="text-[11px] font-semibold text-erp-muted"><span class="erp-num">{{ g.done }}</span> of <span class="erp-num">{{ g.total }}</span> done</span>
              <ChevronDown :size="14" class="shrink-0 text-erp-muted transition-transform" :class="{ 'rotate-180': isOpen(g.module, i) }" aria-hidden="true" />
            </button>
            <div class="tour-progress" aria-hidden="true"><i :style="{ width: `${Math.round((g.done / g.total) * 100)}%` }" /></div>
            <div v-if="isOpen(g.module, i)" class="flex flex-col gap-1.5 pt-2">
              <template v-for="b in g.books" :key="b.title">
                <p class="m-0 pt-1 text-[11px] font-semibold text-erp-muted">{{ b.title }}</p>
                <div v-for="t in b.guides" :key="t.id" class="tour-guide-row">
                  <span class="tour-letter" :class="{ done: isDone(t) }" aria-hidden="true">{{ t.guide!.letter }}</span>
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p class="m-0 text-[13px] leading-snug font-semibold">{{ t.title }}</p>
                    <p class="m-0 text-[11px] leading-relaxed text-erp-muted">{{ t.guide!.cast }} · {{ t.guide!.rows }} steps<template v-if="isDone(t)"> · <span class="text-chip-done-text">Done</span></template></p>
                  </div>
                  <button type="button" class="erp-btn tour-btn-sm shrink-0" :class="isDone(t) || isPaused(t) ? 'erp-btn-secondary' : 'tour-btn-primary'" :aria-label="`${isDone(t) ? 'Take again' : 'Start'}: ${t.guide!.book} ${t.guide!.letter}, ${t.title}`" @click="startTour(t.id)">
                    {{ isPaused(t) ? 'Start again' : isDone(t) ? 'Again' : 'Start' }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </section>

        <h3 v-if="guides.length" class="m-0 border-t border-erp-row pt-4 text-[13px] font-bold">Quick look</h3>
        <section v-for="group in groups" :key="group.title" class="flex flex-col gap-2">
          <template v-if="group.tours.length">
            <h3 class="m-0 text-[11px] font-semibold tracking-widest text-erp-muted uppercase">{{ group.title }}</h3>
            <div v-for="t in group.tours" :key="t.id" class="tour-tour-row">
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <p class="m-0 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  {{ t.title }}
                  <span v-if="isDone(t)" class="tour-chip-done"><CircleCheck :size="11" aria-hidden="true" />Done</span>
                </p>
                <p class="m-0 text-xs leading-relaxed text-erp-muted">{{ t.summary }}</p>
                <p class="m-0 text-[11px] text-erp-muted">About {{ t.minutes }} min · {{ t.steps.length }} steps</p>
              </div>
              <button type="button" class="erp-btn tour-btn-sm shrink-0 self-center" :class="isDone(t) || isPaused(t) ? 'erp-btn-secondary' : 'tour-btn-primary'" @click="startTour(t.id)">
                {{ isPaused(t) ? 'Start again' : isDone(t) ? 'Take again' : 'Start' }}
              </button>
            </div>
          </template>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="m-0 text-[11px] font-semibold tracking-widest text-erp-muted uppercase">Settings</h3>
          <div class="tour-tour-row items-start">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-[13px] font-semibold">Tutorial mode</p>
              <p class="m-0 text-xs leading-relaxed text-erp-muted">
                {{ mode ? 'On: new users get the welcome card and tours are offered.' : 'Off: nothing is offered; tours start only from here.' }}
              </p>
            </div>
            <SwitchToggle v-model="mode" label="Tutorial mode" />
          </div>
          <div class="tour-tour-row items-center">
            <template v-if="!confirmReset">
              <div class="min-w-0 flex-1">
                <p class="m-0 text-[13px] font-semibold">Start again</p>
                <p class="m-0 text-xs leading-relaxed text-erp-muted">Forget the tours you finished and show the welcome again.</p>
              </div>
              <button type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="confirmReset = true"><RotateCcw :size="13" aria-hidden="true" />Start again</button>
            </template>
            <template v-else>
              <p class="m-0 min-w-0 flex-1 text-[13px]">Start again as a first-time user?</p>
              <button type="button" class="erp-btn tour-btn-primary tour-btn-sm" @click="reset">Yes, start again</button>
              <button type="button" class="erp-btn erp-btn-secondary tour-btn-sm" @click="confirmReset = false">Keep</button>
            </template>
          </div>
        </section>
      </div>

      <footer class="flex items-center gap-2 border-t border-erp-row bg-erp-head px-5 py-3 text-[11px] text-erp-muted">
        <Keyboard :size="14" aria-hidden="true" />
        <span><kbd>?</kbd> Help · <kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>Esc</kbd> pause</span>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
kbd {
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--erp-border);
  background: var(--erp-card);
  color: var(--erp-text);
}
</style>
