<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { Columns3, Download, ListFilter, Maximize2, Minimize2, Search, X } from '@lucide/vue'
import { LIST_PAGE } from '@/composables/useListPage'
import { LIST_BOX, type BoxTable } from './listBox'

/**
 * A list's table box, as the MES data grid (Material Master): one bordered box with the toolbar (the search pill and the
 * count on the left; Filter with its count, Columns, Download, the page's own tools, Add and Full screen on the right),
 * the filters panel, the bar of what can be done with ticked rows, the table (DataList, default slot) and the footer.
 * Inside a list page (useListPage) the search goes to the server as ?q= and the Filter count and Clear come from it.
 */
const props = defineProps<{ count?: string; placeholder?: string; activeFilters?: number; selected?: number; openFilters?: boolean }>()
const search = defineModel<string>('search')
const page = inject(LIST_PAGE, null)

const filterCount = computed(() => props.activeFilters ?? page?.activeFilters.value ?? 0)
const filtersOpen = ref(props.openFilters || filterCount.value > 0)

/* ── Search: the page's own (v-model) or the list's ?q=, sent as you type (after a short pause) ── */
const ownSearch = computed(() => search.value !== undefined)
const text = ref(ownSearch.value ? (search.value ?? '') : (page?.q.value ?? ''))
let timer: ReturnType<typeof setTimeout> | undefined
watch(text, (v) => {
  if (ownSearch.value) {
    search.value = v
    return
  }
  clearTimeout(timer)
  timer = setTimeout(() => page?.setQ(v.trim()), 300)
})
const showSearch = computed(() => ownSearch.value || !!page)

/* ── The table inside, and what the toolbar does with it ── */
const table = shallowRef<BoxTable | null>(null)
provide(LIST_BOX, {
  register: (t) => (table.value = t),
  openFilters: () => (filtersOpen.value = true),
})
const ticked = computed(() => props.selected ?? table.value?.selected.value ?? 0)
const columnsOpen = ref(false)
const downloadOpen = ref(false)
const maximized = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.erp-box-pop')) {
    columnsOpen.value = false
    downloadOpen.value = false
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    maximized.value = false
    columnsOpen.value = false
    downloadOpen.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
function download(format: 'csv' | 'xlsx') {
  table.value?.download(format, ticked.value > 0)
  downloadOpen.value = false
}
</script>

<template>
  <div ref="root" class="erp-box" :class="{ 'is-max': maximized }">
    <div class="erp-box-bar">
      <label v-if="showSearch" class="erp-box-search">
        <Search :size="15" class="shrink-0 text-erp-off-text" aria-hidden="true" />
        <input v-model="text" type="text" :placeholder="placeholder ?? 'Search'" :aria-label="placeholder ?? 'Search this list'" />
        <button v-if="text" type="button" class="erp-box-clear" aria-label="Clear search" @click="text = ''"><X :size="13" aria-hidden="true" /></button>
      </label>
      <span v-if="count" class="erp-num text-[13px] text-erp-muted">{{ count }}</span>
      <div class="ml-auto flex flex-wrap items-center gap-0.5">
        <button v-if="$slots.filters" type="button" class="erp-box-tool" :class="{ 'is-on': filtersOpen || filterCount }" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen">
          <ListFilter :size="15" aria-hidden="true" />Filter
          <span v-if="filterCount" class="erp-box-count">{{ filterCount }}</span>
        </button>
        <div v-if="table && table.columns.value.length > 1" class="erp-box-pop relative">
          <button type="button" class="erp-box-tool" :class="{ 'is-on': columnsOpen || table.hidden.value.length }" aria-haspopup="true" :aria-expanded="columnsOpen" @click="columnsOpen = !columnsOpen">
            <Columns3 :size="15" aria-hidden="true" />Columns
          </button>
          <div v-if="columnsOpen" class="erp-box-menu absolute top-full right-0 z-40 mt-1.5 w-56">
            <p class="m-0 px-2 pb-1.5 text-[11px] font-semibold text-erp-muted">Show columns</p>
            <div class="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              <label v-for="c in table.columns.value" :key="c.index" class="erp-box-option">
                <input type="checkbox" :checked="!table.hidden.value.includes(c.label)" @change="table.toggleColumn(c.label)" />
                <span class="truncate">{{ c.label }}</span>
              </label>
            </div>
            <button v-if="table.hidden.value.length" type="button" class="erp-box-showall" @click="table.showAll()">Show all columns</button>
          </div>
        </div>
        <div v-if="table" class="erp-box-pop relative">
          <button type="button" class="erp-box-tool" aria-haspopup="true" :aria-expanded="downloadOpen" @click="downloadOpen = !downloadOpen">
            <Download :size="15" aria-hidden="true" />Download
          </button>
          <div v-if="downloadOpen" class="erp-box-menu absolute top-full right-0 z-40 mt-1.5 w-60">
            <p class="m-0 px-2 pb-1.5 text-[11px] font-semibold text-erp-muted">{{ ticked ? `The ${ticked} ticked rows` : 'The rows on this page' }}, shown columns</p>
            <button type="button" class="erp-box-option w-full border-0 bg-transparent text-left" @click="download('xlsx')">Excel (.xlsx)</button>
            <button type="button" class="erp-box-option w-full border-0 bg-transparent text-left" @click="download('csv')">CSV</button>
          </div>
        </div>
        <slot name="tools" />
        <span v-if="$slots.add" class="ml-1.5 flex"><slot name="add" /></span>
        <button type="button" class="erp-box-tool ml-1 w-8 justify-center !px-0" :aria-pressed="maximized" :title="maximized ? 'Exit full screen (Esc)' : 'Full screen'" :aria-label="maximized ? 'Exit full screen' : 'Full screen'" @click="maximized = !maximized">
          <component :is="maximized ? Minimize2 : Maximize2" :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div v-if="$slots.filters && filtersOpen" class="erp-box-filters">
      <slot name="filters" />
      <div class="erp-box-filter-actions">
        <button v-if="page && filterCount" type="button" class="erp-btn erp-btn-secondary h-8" @click="page.clearFilters()">Clear</button>
        <button type="button" class="erp-btn erp-btn-import h-8" @click="filtersOpen = false">Close</button>
      </div>
    </div>
    <div v-if="ticked" class="erp-box-selection">
      <span class="mr-2 text-[13px] font-medium">{{ ticked }} selected</span>
      <slot name="selection" />
      <button v-if="table" type="button" class="erp-box-tool" @click="table.download('xlsx', true)"><Download :size="15" aria-hidden="true" />Export selected</button>
      <button v-if="table && props.selected === undefined" type="button" class="erp-box-tool ml-auto" @click="table.clearSelection()">Clear selection</button>
    </div>
    <div class="erp-box-body"><slot /></div>
    <div v-if="$slots.footer" class="erp-box-foot"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.erp-box {
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius);
  background: var(--erp-card);
  box-shadow: var(--erp-card-shadow);
}
/* Full screen: the whole box lifts over the page and fills the window; a wide shadow dims what is behind */
.erp-box.is-max {
  position: fixed;
  inset: 12px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  box-shadow:
    0 0 0 100vmax var(--erp-backdrop),
    var(--erp-panel-shadow);
  animation: erp-box-max 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.erp-box.is-max .erp-box-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
@keyframes erp-box-max {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}
.erp-box-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--erp-border);
}
.erp-box-search {
  display: flex;
  width: 16rem;
  max-width: 100%;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 12px;
  border-radius: 9999px;
  background: var(--erp-gray-100);
  transition:
    background-color 150ms,
    box-shadow 150ms;
}
.erp-box-search:hover {
  background: var(--erp-gray-200);
}
.erp-box-search:focus-within {
  background: var(--erp-card);
  box-shadow: 0 0 0 1px var(--erp-gray-300);
}
.erp-box-search input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--erp-text);
  outline: none;
}
.erp-box-search input::placeholder {
  color: var(--erp-muted);
}
.erp-box-clear {
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-gray-400);
}
.erp-box-clear:hover {
  background: var(--erp-gray-200);
  color: var(--erp-text);
}
.erp-box-tool {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-gray-600);
  white-space: nowrap;
}
.erp-box-tool:hover,
.erp-box-tool.is-on {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.erp-box-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 9999px;
  background: var(--mod-primary);
  color: var(--erp-on-dark);
  font-size: 11px;
  font-weight: 600;
}
.erp-box-menu {
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 12px;
  background: var(--dd-bg);
  box-shadow: var(--dd-shadow);
}
.erp-box-option {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  color: var(--dd-ink);
  cursor: pointer;
}
.erp-box-option:hover {
  background: var(--dd-hover);
}
.erp-box-showall {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 6px;
  border: 0;
  border-top: 1px solid var(--dd-border);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--erp-link);
  text-align: left;
}
.erp-box-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 12px;
  margin: 10px 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--erp-head-bg);
}
/* A page's own filter row (FilterBar) keeps its columns across the panel */
.erp-box-filters > :deep([data-tour='filters']) {
  grid-column: 1 / -1;
}
.erp-box-filter-actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 8px;
}
.erp-box-selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--erp-border);
  background: color-mix(in srgb, var(--mod-primary) 6%, var(--erp-card));
}
.erp-box-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--erp-border);
}
.erp-box-foot > :deep(*) {
  flex: 1;
}
</style>
