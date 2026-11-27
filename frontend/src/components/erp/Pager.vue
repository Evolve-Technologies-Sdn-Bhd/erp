<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'

/**
 * Under a list: "21–40 of 52", then the pages as quiet squares with the current one outlined (the Zora MES pager).
 * Shows at most 7 page buttons around the current page.
 */
const props = defineProps<{ page: number; pageSize: number; total: number; sizes?: number[] }>()
const emit = defineEmits<{ change: [page: number]; size: [size: number] }>()

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const visible = computed(() => {
  const start = Math.max(1, Math.min(props.page - 3, pages.value - 6))
  return Array.from({ length: Math.min(7, pages.value) }, (_, i) => start + i)
})
const first = computed(() => (props.total ? (props.page - 1) * props.pageSize + 1 : 0))
const last = computed(() => Math.min(props.page * props.pageSize, props.total))
const sizeOptions = computed(() => [...new Set([...(props.sizes ?? []), props.pageSize])].sort((a, b) => a - b))
// Rows per page: a small panel in the style of the toolbar's menus (Columns, Download)
const sizeOpen = ref(false)
const sizeRoot = ref<HTMLElement | null>(null)
function pickSize(n: number) {
  sizeOpen.value = false
  if (n !== props.pageSize) emit('size', n)
}
function onDocClick(e: MouseEvent) {
  if (sizeOpen.value && sizeRoot.value && !sizeRoot.value.contains(e.target as Node)) sizeOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
const count = (n: number) => n.toLocaleString('en-MY')

function go(page: number) {
  if (page >= 1 && page <= pages.value && page !== props.page) emit('change', page)
}
</script>

<template>
  <nav data-tour="pager" class="flex items-center gap-1" :class="{ 'w-full': sizes }" aria-label="Pages">
    <template v-if="sizes">
      <span class="mr-2 text-xs whitespace-nowrap text-erp-muted">Rows per page</span>
      <div ref="sizeRoot" class="relative mr-2">
        <button type="button" class="erp-size" aria-label="Rows per page" aria-haspopup="menu" :aria-expanded="sizeOpen" @click="sizeOpen = !sizeOpen">
          {{ pageSize }}<ChevronDown :size="13" class="text-erp-muted" aria-hidden="true" />
        </button>
        <div v-if="sizeOpen" role="menu" class="erp-size-menu absolute bottom-full left-0 z-40 mb-1.5 w-28">
          <button v-for="s in sizeOptions" :key="s" type="button" role="menuitemradio" :aria-checked="s === pageSize" class="erp-size-option" :class="{ 'is-on': s === pageSize }" @click="pickSize(s)">
            <span class="flex-1">{{ s }}</span><Check v-if="s === pageSize" :size="14" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>
    <span class="erp-num mr-2 text-xs text-erp-muted" :class="{ 'mr-auto': sizes }">{{ count(first) }}–{{ count(last) }} of {{ count(total) }}</span>
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
.erp-size {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--erp-input-border);
  border-radius: 10px;
  background: var(--erp-card);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--erp-text);
  box-shadow: var(--erp-field-shadow);
}
.erp-size:hover {
  border-color: var(--erp-input-border-strong);
}
.erp-size-menu {
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 12px;
  background: var(--dd-bg);
  box-shadow: var(--dd-shadow);
}
.erp-size-option {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--dd-ink);
  text-align: left;
}
.erp-size-option:hover {
  background: var(--dd-hover);
}
.erp-size-option.is-on {
  font-weight: 600;
  color: var(--mod-primary);
}
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
