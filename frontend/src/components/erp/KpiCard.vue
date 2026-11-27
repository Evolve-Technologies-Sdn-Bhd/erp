<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A headline number, as the Zora MES stat card: the label, the figure in Geist, a line of context, and a soft glow of
 * the module colour in the top corner. `tone` turns the figure and the glow amber ("Waiting for your approval"),
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
  default: { value: 'text-erp-text', glow: 'var(--mod-glow)' },
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
    :style="{ '--kpi-glow': TONES[tone].glow }"
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
/* A soft bloom in the top-right corner, behind everything: warmth, never a tint on the text. */
.erp-kpi-glow {
  position: absolute;
  top: -3.5rem;
  right: -3rem;
  z-index: -1;
  width: 11rem;
  height: 9rem;
  border-radius: 9999px;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--kpi-glow) 22%, transparent),
    color-mix(in srgb, var(--mod-primary) 10%, transparent) 55%,
    transparent
  );
  filter: blur(6px);
  pointer-events: none;
}
@media print {
  .erp-kpi-glow {
    display: none;
  }
}
</style>
