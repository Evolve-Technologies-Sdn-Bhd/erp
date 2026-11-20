<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { CircleQuestionMark } from '@lucide/vue'
import { useSession } from '@/composables/useSession'
import { help, run } from './engine'
import { available } from './features'
import { progress } from './progress'
import { TOURS } from './registry'
import { toursFor } from './tour.rules'

/**
 * Help in every top bar: the module screens, the module homes and the launcher. With Tutorial mode on, a dot shows
 * while there is something to offer: the welcome for a first-time person, a paused tour, or a tour of this page not
 * taken yet. Part of the tour's own controls (data-tour-ui), so it still opens while a tour runs.
 */
const route = useRoute()
const session = useSession()

const pageTour = computed(() => {
  const here = { path: route.path, layout: route.meta.layout, module: route.meta.module, code: route.meta.code }
  return toursFor(TOURS, here, (p) => session.can(p), available).onThisPage.some((t) => t.pages !== 'any' && !progress.state.done.includes(t.id))
})
const paused = computed(() => run.status === 'paused' || run.status === 'left')
const hint = computed(() => progress.loaded && (paused.value || (progress.state.mode && (!progress.state.welcomeSeen || pageTour.value))))
const hintText = computed(() => (paused.value ? ', a tour is paused' : !progress.state.welcomeSeen ? ', a welcome tour is waiting for you' : ', this page has a tour'))
</script>

<template>
  <button
    type="button"
    data-tour="help"
    data-tour-ui
    class="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 font-[inherit] text-[13px] font-semibold text-erp-subtle transition-colors hover:bg-erp-head hover:text-erp-text"
    :aria-expanded="help.open"
    aria-haspopup="dialog"
    :title="hint && pageTour && !paused ? 'Help and tours (?): this page has a tour' : 'Help and tours (?)'"
    @click="help.open = !help.open"
  >
    <CircleQuestionMark :size="17" aria-hidden="true" />
    <span class="hidden sm:inline">Help</span>
    <span v-if="hint" class="tour-hint-dot" aria-hidden="true" />
    <span v-if="hint" class="sr-only">{{ hintText }}</span>
  </button>
</template>

<style scoped>
.tour-hint-dot {
  position: absolute;
  top: 5px;
  left: 20px;
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: var(--tour-accent);
  box-shadow: 0 0 0 2px var(--erp-card);
}
</style>
