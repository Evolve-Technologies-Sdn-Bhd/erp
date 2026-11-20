<script setup lang="ts">
import { computed } from 'vue'
import { CircleQuestionMark } from '@lucide/vue'
import { help, run } from './engine'
import { progress } from './progress'

/**
 * Help in every top bar: the module screens, the module homes and the launcher. A dot shows while Tutorial mode has
 * something to offer (a first-time person, or a paused tour). Part of the tour's own controls (data-tour-ui), so it
 * still opens while a tour runs.
 */
const hint = computed(() => progress.loaded && ((progress.state.mode && !progress.state.welcomeSeen) || run.status === 'paused' || run.status === 'left'))
</script>

<template>
  <button
    type="button"
    data-tour="help"
    data-tour-ui
    class="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 font-[inherit] text-[13px] font-semibold text-erp-subtle transition-colors hover:bg-erp-head hover:text-erp-text"
    :aria-expanded="help.open"
    aria-haspopup="dialog"
    title="Help and tours (?)"
    @click="help.open = !help.open"
  >
    <CircleQuestionMark :size="17" aria-hidden="true" />
    <span class="hidden sm:inline">Help</span>
    <span v-if="hint" class="tour-hint-dot" aria-hidden="true" />
    <span v-if="hint" class="sr-only">, a tour is waiting for you</span>
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
