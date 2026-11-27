<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

/**
 * Under a list: "21–40 of 52", then the pages as quiet squares with the current one outlined (the Zora MES pager).
 * Shows at most 7 page buttons around the current page.
 */
const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ change: [page: number] }>()

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const visible = computed(() => {
  const start = Math.max(1, Math.min(props.page - 3, pages.value - 6))
  return Array.from({ length: Math.min(7, pages.value) }, (_, i) => start + i)
})
const first = computed(() => (props.total ? (props.page - 1) * props.pageSize + 1 : 0))
const last = computed(() => Math.min(props.page * props.pageSize, props.total))
const count = (n: number) => n.toLocaleString('en-MY')

function go(page: number) {
  if (page >= 1 && page <= pages.value && page !== props.page) emit('change', page)
}
</script>

<template>
  <nav data-tour="pager" class="flex items-center gap-1" aria-label="Pages">
    <span class="erp-num mr-2 text-xs text-erp-muted">{{ count(first) }}–{{ count(last) }} of {{ count(total) }}</span>
    <button type="button" class="erp-page" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)">
      <ChevronLeft :size="16" aria-hidden="true" />
    </button>
    <button
      v-for="n in visible"
      :key="n"
      type="button"
      class="erp-page"
      :class="{ 'erp-page-on': n === page }"
      :aria-current="n === page ? 'page' : undefined"
      @click="go(n)"
    >
      {{ n }}
    </button>
    <button type="button" class="erp-page" :disabled="page >= pages" aria-label="Next page" @click="go(page + 1)">
      <ChevronRight :size="16" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.erp-page {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--erp-muted);
  transition:
    background-color 150ms,
    color 150ms;
}
.erp-page:not(:disabled):not(.erp-page-on):hover {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.erp-page:disabled {
  opacity: 0.4;
  cursor: default;
}
.erp-page-on {
  background: var(--erp-card);
  border-color: var(--erp-border);
  color: var(--erp-text);
  font-weight: 600;
  box-shadow: var(--erp-card-shadow);
}
</style>
