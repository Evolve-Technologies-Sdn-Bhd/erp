<script setup lang="ts" generic="T extends { id: string }">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import { Columns3, Inbox, Maximize2, Minimize2 } from '@lucide/vue'
import { LIST_PAGE } from '@/composables/useListPage'

/**
 * The list table of every list page, as the MES data grid: hairlines between rows and columns, 40px rows, the row
 * number in a gutter on the left (lists without tick boxes), and the tools at the top right: Columns (show or hide
 * columns, remembered per list on this device) and Full screen. Columns go in the default slot as PrimeVue <Column>s.
 * Paging and sorting stay on the server (useListPage + Pager). On a list page (.erp-listcard) it also tells the page
 * how tall its title is, so the MES box starts under it.
 */
const props = withDefaults(
  defineProps<{
    rows: T[]
    loading?: boolean
    emptyText?: string
    selectable?: boolean
    /** The Columns tool; off for the lists that keep their own column picker. */
    columnTool?: boolean
    /** Row numbers in the gutter (lists without tick boxes). */
    numbered?: boolean
  }>(),
  { loading: false, emptyText: undefined, selectable: false, columnTool: true, numbered: true },
)
const selection = defineModel<T[]>('selection', { default: () => [] })

const route = useRoute()
const page = inject(LIST_PAGE, null)
const first = computed(() => page?.first.value ?? 0)
const showNumbers = computed(() => props.numbered && !props.selectable)

const root = ref<HTMLElement | null>(null)
const uid = `dl${Math.random().toString(36).slice(2, 9)}`

/* ── Full screen: the table lifts over the page and fills the window (Esc leaves) ── */
const maximized = ref(false)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    maximized.value = false
    columnsOpen.value = false
  }
}

/* ── Columns: read from the header row, hidden by position, remembered by label for this list ── */
const columns = ref<{ index: number; label: string }[]>([])
const storeKey = `zora.cols:${route.path}`
function readHidden(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(storeKey) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const hidden = ref<string[]>(readHidden())
const columnsOpen = ref(false)
const toolsRoot = ref<HTMLElement | null>(null)
function toggleColumn(label: string) {
  hidden.value = hidden.value.includes(label) ? hidden.value.filter((l) => l !== label) : [...hidden.value, label]
  try {
    localStorage.setItem(storeKey, JSON.stringify(hidden.value))
  } catch {
    /* private mode: the choice lasts until reload */
  }
}
function showAll() {
  hidden.value = []
  try {
    localStorage.removeItem(storeKey)
  } catch {
    /* nothing kept */
  }
}
function readColumns() {
  const cells = root.value?.querySelectorAll<HTMLElement>('thead > tr:first-child > th') ?? []
  const found: { index: number; label: string }[] = []
  cells.forEach((th, i) => {
    const label = (th.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (label) found.push({ index: i + 1, label })
  })
  if (found.map((c) => c.label).join('|') !== columns.value.map((c) => c.label).join('|')) columns.value = found
}

// The hidden columns as a style rule for this table only (the screens keep their own <Column> markup).
const styleEl = document.createElement('style')
watchEffect(() => {
  const rules = columns.value
    .filter((c) => hidden.value.includes(c.label))
    .map(
      (c) =>
        `[data-dl="${uid}"] thead > tr > th:nth-child(${c.index}),[data-dl="${uid}"] tbody > tr:not(.p-datatable-empty-message) > td:nth-child(${c.index}){display:none}`,
    )
  styleEl.textContent = rules.join('')
})

/* ── On a list page: the height of the title above the box ── */
let resize: ResizeObserver | null = null
let mutations: MutationObserver | null = null
function measureHead() {
  const card = root.value?.closest<HTMLElement>('.erp-listcard')
  const head = card?.querySelector<HTMLElement>(':scope > [data-tour="page-header"]')
  if (card && head) card.style.setProperty("--lc-head", `${head.offsetHeight + 20}px`)
}

function onDocClick(e: MouseEvent) {
  if (columnsOpen.value && toolsRoot.value && !toolsRoot.value.contains(e.target as Node)) columnsOpen.value = false
}

onMounted(() => {
  document.head.appendChild(styleEl)
  readColumns()
  measureHead()
  const thead = root.value?.querySelector('thead')
  if (thead) {
    mutations = new MutationObserver(readColumns)
    mutations.observe(thead, { childList: true, subtree: true, characterData: true })
  }
  const head = root.value?.closest('.erp-listcard')?.querySelector(':scope > [data-tour="page-header"]')
  if (head) {
    resize = new ResizeObserver(measureHead)
    resize.observe(head)
  }
  document.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  styleEl.remove()
  mutations?.disconnect()
  resize?.disconnect()
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick)
})
watch(
  () => props.rows,
  () => queueMicrotask(readColumns),
)
</script>

<template>
  <div
    ref="root"
    class="erp-dl has-tools"
    :class="{ 'is-max': maximized, 'is-selectable': selectable, 'has-selection': selection.length > 0 }"
    :style="{ '--erp-first': String(first) }"
    :data-dl="uid"
  >
    <DataTable
      v-model:selection="selection"
      data-tour="list"
      :value="rows"
      data-key="id"
      :loading="loading"
      :selection-mode="selectable ? 'multiple' : undefined"
      :meta-key-selection="false"
      class="erp-datalist"
      table-class="erp-datalist-table"
    >
      <Column v-if="showNumbers" header-class="erp-dl-gutter" body-class="erp-dl-gutter">
        <template #body="{ index }">
          <span class="erp-dl-num">{{ first + index + 1 }}</span>
        </template>
      </Column>
      <slot />
      <template #empty>
        <div class="flex flex-col items-center justify-center gap-1 py-12 text-center">
          <Inbox :size="32" class="mb-2 text-erp-off-text" aria-hidden="true" />
          <p class="m-0 text-[13px] font-medium text-erp-subtle">{{ emptyText ?? 'Nothing to show for these filters.' }}</p>
        </div>
      </template>
    </DataTable>

    <!-- Tools, at the top right of the header row -->
    <div ref="toolsRoot" class="erp-dl-tools erp-no-print">
      <div v-if="columnTool && columns.length > 1" class="relative">
        <button
          type="button"
          class="erp-dl-tool"
          :class="{ 'is-on': columnsOpen || hidden.length }"
          :aria-expanded="columnsOpen"
          aria-haspopup="true"
          title="Columns"
          aria-label="Show or hide columns"
          @click="columnsOpen = !columnsOpen"
        >
          <Columns3 :size="15" aria-hidden="true" />
        </button>
        <div v-if="columnsOpen" class="erp-dl-menu absolute top-full right-0 z-30 mt-1.5 w-56">
          <p class="m-0 px-2 pb-1.5 text-[11px] font-semibold text-erp-muted">Show columns</p>
          <div class="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            <label v-for="c in columns" :key="c.index" class="erp-dl-option">
              <input type="checkbox" :checked="!hidden.includes(c.label)" @change="toggleColumn(c.label)" />
              <span class="truncate">{{ c.label }}</span>
            </label>
          </div>
          <button v-if="hidden.length" type="button" class="erp-dl-showall" @click="showAll">Show all columns</button>
        </div>
      </div>
      <button
        type="button"
        class="erp-dl-tool"
        :aria-pressed="maximized"
        :title="maximized ? 'Exit full screen (Esc)' : 'Full screen'"
        :aria-label="maximized ? 'Exit full screen' : 'Full screen'"
        @click="maximized = !maximized"
      >
        <component :is="maximized ? Minimize2 : Maximize2" :size="15" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.erp-dl {
  position: relative;
  min-width: 0;
}
/* Room for the tools at the end of the header row */
.erp-dl.has-tools :deep(thead > tr > th:last-child) {
  padding-right: 76px;
}
.erp-dl-tools {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
}
.erp-dl-tool {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--erp-muted);
  transition:
    background-color 150ms,
    color 150ms;
}
.erp-dl-tool:hover,
.erp-dl-tool.is-on {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.erp-dl-menu {
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 12px;
  background: var(--dd-bg);
  box-shadow: var(--dd-shadow);
}
.erp-dl-option {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--dd-ink);
  cursor: pointer;
}
.erp-dl-option:hover {
  background: var(--dd-hover);
}
.erp-dl-showall {
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
/* The gutter: the row number, quiet and centred */
.erp-dl :deep(.erp-dl-gutter) {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  padding-inline: 0 !important;
  text-align: center;
}
.erp-dl-num {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--erp-off-text);
}
/* Lists with tick boxes: the tick-box column shows the row number, which turns into the tick box on hover, on a
   ticked row, and on every row once anything is ticked (MES gutter). */
.erp-dl.is-selectable :deep(tbody) {
  counter-reset: erp-row var(--erp-first, 0);
}
.erp-dl.is-selectable :deep(tbody > tr:not(.p-datatable-empty-message)) {
  counter-increment: erp-row;
}
.erp-dl.is-selectable :deep(tbody > tr > td:has(.p-checkbox)) {
  text-align: center;
}
.erp-dl.is-selectable :deep(tbody > tr > td:has(.p-checkbox))::before {
  content: counter(erp-row);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--erp-off-text);
}
.erp-dl.is-selectable :deep(tbody > tr > td .p-checkbox) {
  display: none;
}
.erp-dl.is-selectable :deep(tbody > tr:hover > td .p-checkbox),
.erp-dl.is-selectable :deep(tbody > tr.p-datatable-row-selected > td .p-checkbox),
.erp-dl.is-selectable.has-selection :deep(tbody > tr > td .p-checkbox) {
  display: inline-flex;
}
.erp-dl.is-selectable :deep(tbody > tr:hover > td:has(.p-checkbox))::before,
.erp-dl.is-selectable :deep(tbody > tr.p-datatable-row-selected > td:has(.p-checkbox))::before,
.erp-dl.is-selectable.has-selection :deep(tbody > tr > td:has(.p-checkbox))::before {
  content: none;
}
/* Full screen: the table lifts over the page and fills the window; a wide shadow dims everything behind it. */
.erp-dl.is-max {
  position: fixed;
  inset: 12px;
  z-index: 60;
  overflow: auto;
  border-radius: 16px;
  background: var(--erp-card);
  box-shadow:
    0 0 0 100vmax var(--erp-backdrop),
    var(--erp-panel-shadow);
  animation: erp-dl-max 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.erp-dl.is-max .erp-dl-tools {
  position: sticky;
  top: 0;
  float: right;
  margin: 6px 8px -40px 0;
}
.erp-dl.is-max :deep(thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 2;
}
@keyframes erp-dl-max {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}
@media (prefers-reduced-motion: reduce) {
  .erp-dl.is-max {
    animation: none;
  }
}
</style>
