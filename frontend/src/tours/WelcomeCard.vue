<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { Compass } from '@lucide/vue'
import { startTour } from './engine'
import { progress, updateProgress } from './progress'
import { declinedWelcome, offersWelcome, WELCOME_TOUR_ID } from './tour.rules'

/**
 * The launcher's welcome for a first-time person (Tutorial mode on). Optional: "Not now" hides it until next time,
 * "I know my way around" turns Tutorial mode off for good; Help still has every tour.
 */
const toast = useToast()

const laterKey = () => `zora.tutorial.later.${progress.owner}`
function readLater(): boolean {
  try {
    return sessionStorage.getItem(laterKey()) === '1'
  } catch {
    return false
  }
}
const later = ref(readLater())

const shown = computed(() => progress.loaded && offersWelcome(progress.state, later.value || readLater()))

function notNow() {
  later.value = true
  try {
    sessionStorage.setItem(laterKey(), '1')
  } catch {
    /* hidden for this page view only */
  }
}

function knowMyWay() {
  updateProgress(declinedWelcome)
  toast.add({ severity: 'info', summary: 'Tutorial mode is off', detail: 'Tours are still under Help in the top bar, whenever you want one.', life: 5000 })
}
</script>

<template>
  <Transition name="tour-rise">
    <section v-if="shown" class="flex flex-col gap-4 rounded-2xl border border-erp-border bg-erp-card p-5 shadow-sm sm:flex-row sm:items-center" aria-labelledby="tour-welcome-title">
      <span class="tour-welcome-icon" aria-hidden="true"><Compass :size="24" /></span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="tour-welcome-title" class="m-0 text-base font-bold">New here? Take a 2-minute tour</h2>
        <p class="m-0 text-[13px] leading-normal text-erp-muted">
          We show you the modules, the menu, the top bar and how lists work, on your own screens. The tour never presses a button that changes records, and you can stop at any time.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" class="erp-btn tour-btn-primary" @click="startTour(WELCOME_TOUR_ID)">Take the tour</button>
        <button type="button" class="erp-btn erp-btn-secondary" @click="notNow">Not now</button>
        <button type="button" class="erp-link cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-xs font-semibold" @click="knowMyWay">I know my way around</button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.tour-welcome-icon {
  display: flex;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--tour-accent);
  color: var(--erp-on-dark);
}
</style>
