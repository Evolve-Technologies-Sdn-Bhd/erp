<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A headline number, as the Zora MES stat card: the label, the figure in Geist, a line of context, and a soft wash of
 * the module colour from the top-right corner (the user's choice C, 27 Nov 2026). `tone` turns the figure and the glow amber ("Waiting for your approval"),
 * green or red. `compact` is the smaller card of list pages (PurDemand.html).
 */
withDefaults(
  defineProps<{
    label: string
    value: string | number
    sub?: string
    to?: RouteLocationRaw
    tone?: 'default' | 'warning' | 'success' | 'danger'
    loading?: boolean
    compact?: boolean
  }>(),
  { tone: 'default', loading: false, compact: false },
)

// Coloured cards (GrnList.html): green "Arrived today", red "Late", amber "Waiting for Inventory".
const TONES = {
  default: { value: 'text-erp-text', glow: undefined },
  warning: { value: 'text-note-warn-strong', glow: 'var(--chip-pending-dot)' },
  success: { value: 'text-chip-done-text', glow: 'var(--chip-done-dot)' },
  danger: { value: 'text-chip-cancelled-text', glow: 'var(--chip-cancelled-dot)' },
} as const
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'div'"
    :to="to"
    class="erp-kpi relative isolate flex flex-col overflow-hidden rounded-2xl border border-erp-border bg-erp-card text-erp-text"
    :class="[to ? 'is-link' : '', compact ? 'gap-1.5 px-[18px] py-3.5' : 'gap-2 p-5']"
    :style="TONES[tone].glow ? { '--kpi-glow': TONES[tone].glow } : undefined"
  >
    <span class="erp-kpi-glow" aria-hidden="true" />
    <span class="text-[13px] font-medium text-erp-muted">{{ label }}</span>
    <span
      class="erp-display erp-num leading-none font-semibold tracking-[-0.03em]"
      :class="[compact ? 'text-[22px]' : 'text-[30px]', TONES[tone].value]"
    >
      <span v-if="loading" class="inline-block h-7 w-12 animate-pulse rounded-md bg-erp-track align-middle" />
      <template v-else>{{ value }}</template>
    </span>
    <span v-if="sub" class="text-[13px] text-erp-muted">{{ sub }}</span>
  </component>
</template>

<style scoped>
.erp-kpi {
  transition:
    border-color 200ms,
    box-shadow 200ms;
}
.erp-kpi.is-link:hover {
  border-color: var(--erp-gray-300);
  box-shadow: var(--erp-lift-shadow);
}
/* A soft wash from the top-right corner, behind everything: the module's light tone, or the tone's own colour. */
.erp-kpi {
  --kpi-glow: var(--mod-grad-from);
}
.erp-kpi-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(225deg, color-mix(in srgb, var(--kpi-glow) var(--kpi-wash, 22%), transparent) 0%, transparent 45%);
  pointer-events: none;
}
@media print {
  .erp-kpi-glow {
    display: none;
  }
}
</style>

<style>
/* Not scoped: in the dark the wash takes the module's deeper side colour, a little stronger. */
html.dark .erp-kpi {
  --kpi-glow: var(--mod-side);
  --kpi-wash: 24%;
}
</style>
