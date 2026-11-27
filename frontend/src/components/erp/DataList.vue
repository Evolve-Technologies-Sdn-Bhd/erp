<script setup lang="ts" generic="T extends { id: string }">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import { ArrowDownAZ, ArrowUpAZ, EyeOff, Group, Inbox, ListFilter, Pin, PinOff, Ungroup } from '@lucide/vue'
import { LIST_PAGE } from '@/composables/useListPage'
import { downloadCsv } from '@/utils/csv'
import { downloadXlsx } from '@/utils/xlsx'
import { LIST_BOX } from './listBox'

/**
 * The list table of every list page, as the MES data grid: hairlines between rows and columns, 40px rows, and a gutter
 * whose row number turns into a tick box on hover (select all in its header). Each column header has a ▾ menu: sort
 * and group (the rows of this page: paging is on the server), pin, hide, and Filter (the box's panel). Pinned columns,
 * the gutter and the row menu stay put while the table scrolls sideways. Hidden and pinned columns are remembered per
 * list on this device. Skeleton rows while the first page loads. Inside a ListBox, the box's toolbar drives Columns and
 * Download (Excel or CSV of the shown columns). Columns go in the default slot as PrimeVue <Column>s.
 */
const props = withDefaults(
  defineProps<{
    rows: T[]
    loading?: boolean
    emptyText?: string
    /** The page has its own tick-box column and acts on the ticked rows */
    selectable?: boolean
    /** Kept for older call sites; the box's Columns tool covers every list. */
    columnTool?: boolean
    numbered?: boolean
  }>(),
  { loading: false, emptyText: undefined, selectable: false, columnTool: true, numbered: true },
)
const selection = defineModel<T[]>('selection', { default: () => [] })

const route = useRoute()
const page = inject(LIST_PAGE, null)
const box = inject(LIST_BOX, null)
const first = computed(() => page?.first.value ?? 0)
const root = ref<HTMLElement | null>(null)
const uid = `dl${Math.random().toString(36).slice(2, 9)}`

/* ── Columns, read from the header row; hidden and pinned remembered by label ── */
const columns = ref<{ index: number; label: string }[]>([])
const keyOf = (what: string) => `zora.${what}:${route.path}`
function read(what: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(keyOf(what)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function keep(what: string, v: string[]) {
  try {
    localStorage.setItem(keyOf(what), JSON.stringify(v))
  } catch {
    /* private mode: lasts until reload */
  }
}
const hidden = ref<string[]>(read('cols'))
const pinned = ref<string[]>(read('pins'))
function toggleColumn(label: string) {
  hidden.value = hidden.value.includes(label) ? hidden.value.filter((l) => l !== label) : [...hidden.value, label]
  keep('cols', hidden.value)
}
function showAll() {
  hidden.value = []
  keep('cols', [])
}
function togglePin(label: string) {
  pinned.value = pinned.value.includes(label) ? pinned.value.filter((l) => l !== label) : [...pinned.value, label]
  keep('pins', pinned.value)
}

/* ── What each row shows, per column (read from the table), for sorting, grouping and downloads ── */
const texts = ref(new Map<string, string[]>())
const sortBy = ref<{ label: string; dir: 1 | -1 } | null>(null)
const groupBy = ref<string | null>(null)
const indexOf = (label: string | null | undefined) => columns.value.find((c) => c.label === label)?.index ?? 0
const cellOf = (r: T, label: string | null | undefined) => texts.value.get(r.id)?.[indexOf(label) - 1] ?? ''
const asNumber = (s: string) => (/^-?[\d,]+(\.\d+)?$/.test(s.trim()) ? Number(s.replace(/,/g, '')) : null)
function compare(a: string, b: string): number {
  const x = asNumber(a)
  const y = asNumber(b)
  return x !== null && y !== null ? x - y : a.localeCompare(b, undefined, { numeric: true })
}
const shown = computed<T[]>(() => {
  const list = [...props.rows]
  if (!texts.value.size || (!sortBy.value && !groupBy.value)) return list
  return list.sort((a, b) => {
    if (groupBy.value) {
      const g = compare(cellOf(a, groupBy.value), cellOf(b, groupBy.value))
      if (g) return g
    }
    return sortBy.value ? compare(cellOf(a, sortBy.value.label), cellOf(b, sortBy.value.label)) * sortBy.value.dir : 0
  })
})
const groupKey = (r: T) => cellOf(r, groupBy.value) || '—'
// PrimeVue types this as a field name; it also takes a function of the row.
const groupRows = computed(() => (groupBy.value ? (groupKey as unknown as string) : undefined))
const groupCounts = computed(() => {
  const m = new Map<string, number>()
  for (const r of shown.value) m.set(groupKey(r), (m.get(groupKey(r)) ?? 0) + 1)
  return m
})

function readTable() {
  const el = root.value
  if (!el) return
  const found: { index: number; label: string }[] = []
  el.querySelectorAll<HTMLElement>('thead > tr:first-child > th').forEach((th, i) => {
    const label = (th.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (label) {
      found.push({ index: i + 1, label })
      th.dataset.dlCol = label
    }
  })
  if (found.map((c) => c.label).join('|') !== columns.value.map((c) => c.label).join('|')) columns.value = found
  const trs = el.querySelectorAll<HTMLElement>('tbody > tr:not(.p-datatable-row-group-header):not(.p-datatable-empty-message)')
  const next = new Map<string, string[]>()
  trs.forEach((tr, i) => {
    const row = shown.value[i]
    if (row) next.set(row.id, [...tr.children].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()))
  })
  if (JSON.stringify([...next]) !== JSON.stringify([...texts.value])) texts.value = next
  layoutSticky()
}

/* ── Sticky: the gutter, pinned columns (left) and the row menu (right), as generated rules for this table ── */
const sticky = ref('')
function layoutSticky() {
  const el = root.value
  if (!el) return
  const ths = [...el.querySelectorAll<HTMLElement>('thead > tr:first-child > th')]
  if (!ths.length) return
  const left: number[] = [1, ...columns.value.filter((c) => pinned.value.includes(c.label) && !hidden.value.includes(c.label)).map((c) => c.index)]
  left.sort((a, b) => a - b)
  let x = 0
  const rules: string[] = []
  const sel = (n: number) => `[data-dl="${uid}"] thead > tr > th:nth-child(${n}),[data-dl="${uid}"] tbody > tr > td:nth-child(${n})`
  left.forEach((n, i) => {
    rules.push(`${sel(n)}{position:sticky;left:${x}px;z-index:2;background:var(--erp-card)}`)
    if (i === left.length - 1) rules.push(`[data-dl="${uid}"].is-scrolled-left thead > tr > th:nth-child(${n}),[data-dl="${uid}"].is-scrolled-left tbody > tr > td:nth-child(${n}){box-shadow:inset -1px 0 0 var(--erp-border),10px 0 14px -12px var(--erp-dl-edge)}`)
    x += ths[n - 1]?.offsetWidth ?? 0
  })
  // The row menu: the last column when it has no title and holds the ⋯ buttons
  const last = ths.length
  if (!ths[last - 1]?.textContent?.trim() && el.querySelector('tbody > tr > td:last-child .erp-row-menu')) {
    rules.push(`${sel(last)}{position:sticky;right:0;z-index:2;background:var(--erp-card)}`)
    rules.push(`[data-dl="${uid}"].can-scroll-right thead > tr > th:nth-child(${last}),[data-dl="${uid}"].can-scroll-right tbody > tr > td:nth-child(${last}){box-shadow:inset 1px 0 0 var(--erp-border),-10px 0 14px -12px var(--erp-dl-edge)}`)
  }
  const css = rules.join('')
  if (css !== sticky.value) sticky.value = css
  onScroll()
}
const edges = ref({ left: false, right: false })
function onScroll() {
  const c = root.value?.querySelector<HTMLElement>('.p-datatable-table-container')
  if (!c) return
  const next = { left: c.scrollLeft > 0, right: c.scrollLeft + c.clientWidth < c.scrollWidth - 1 }
  if (next.left !== edges.value.left || next.right !== edges.value.right) edges.value = next
}

// Hidden columns and the sticky ones, as one style rule for this table only (the screens keep their own <Column>s).
const styleEl = document.createElement('style')
watchEffect(() => {
  const hide = columns.value
    .filter((c) => hidden.value.includes(c.label))
    .map((c) => `[data-dl="${uid}"] thead > tr > th:nth-child(${c.index}),[data-dl="${uid}"] tbody > tr:not(.p-datatable-empty-message):not(.p-datatable-row-group-header) > td:nth-child(${c.index}){display:none}`)
  styleEl.textContent = hide.join('') + sticky.value
})

/* ── The ▾ menu on a column header ── */
const menu = ref<{ label: string; x: number; y: number } | null>(null)
function onHeadClick(e: MouseEvent) {
  const th = (e.target as HTMLElement).closest<HTMLElement>('th[data-dl-col]')
  if (!th || (e.target as HTMLElement).closest('.p-checkbox')) return
  const r = th.getBoundingClientRect()
  menu.value = { label: th.dataset.dlCol ?? '', x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 4 }
}
function act(what: 'asc' | 'desc' | 'group' | 'pin' | 'hide' | 'filter') {
  const label = menu.value?.label
  menu.value = null
  if (!label) return
  if (what === 'asc' || what === 'desc') sortBy.value = sortBy.value?.label === label && sortBy.value.dir === (what === 'asc' ? 1 : -1) ? null : { label, dir: what === 'asc' ? 1 : -1 }
  if (what === 'group') groupBy.value = groupBy.value === label ? null : label
  if (what === 'pin') togglePin(label)
  if (what === 'hide') toggleColumn(label)
  if (what === 'filter') box?.openFilters()
  void nextTick(readTable)
}
function onDocClick(e: MouseEvent) {
  if (menu.value && !(e.target as HTMLElement).closest('.erp-dl-colmenu, th[data-dl-col]')) menu.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menu.value = null
}

/* ── Downloads: the shown columns, of the ticked rows or of the rows on this page ── */
function download(format: 'csv' | 'xlsx', onlySelected: boolean) {
  readTable()
  const cols = columns.value.filter((c) => !hidden.value.includes(c.label))
  const ids = new Set(selection.value.map((r) => r.id))
  const rows = shown.value.filter((r) => !onlySelected || ids.has(r.id))
  const body = rows.map((r) => cols.map((c) => texts.value.get(r.id)?.[c.index - 1] ?? ''))
  const name = `${route.path.replace(/^\//, '').replace(/\//g, '-') || 'list'}-${new Date().toISOString().slice(0, 10)}`
  if (format === 'csv') downloadCsv(`${name}.csv`, [cols.map((c) => c.label), ...body])
  else downloadXlsx(name, [cols.map((c) => c.label), ...body.map((r) => r.map((v) => asNumber(v) ?? v))])
}

const selectedCount = computed(() => selection.value.length)
box?.register({
  columns,
  hidden,
  toggleColumn,
  showAll,
  selected: selectedCount,
  clearSelection: () => (selection.value = []),
  download,
})

let mutations: MutationObserver | null = null
let resize: ResizeObserver | null = null
onMounted(() => {
  document.head.appendChild(styleEl)
  readTable()
  const table = root.value?.querySelector('table')
  if (table) {
    mutations = new MutationObserver(() => queueMicrotask(readTable))
    mutations.observe(table, { childList: true, subtree: true, characterData: true })
    resize = new ResizeObserver(layoutSticky)
    resize.observe(table)
  }
  root.value?.querySelector('.p-datatable-table-container')?.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onUpdated(() => queueMicrotask(readTable))
onBeforeUnmount(() => {
  styleEl.remove()
  mutations?.disconnect()
  resize?.disconnect()
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    ref="root"
    class="erp-dl"
    :class="{ 'has-selection': selection.length > 0, 'is-reloading': loading && rows.length > 0, 'is-scrolled-left': edges.left, 'can-scroll-right': edges.right }"
    :style="{ '--erp-first': String(first) }"
    :data-dl="uid"
  >
    <!-- Skeleton rows while the first page loads: the shape of the table, a gentle pulse -->
    <div v-if="loading && !rows.length" class="erp-dl-skeleton" role="status" aria-label="Loading">
      <div v-for="n in 6" :key="n" class="flex items-center gap-4 border-b border-erp-row px-3 py-3">
        <span class="h-3 w-5 rounded bg-erp-track" />
        <span class="h-3 w-[12%] rounded bg-erp-track" />
        <span class="h-3 w-[22%] rounded bg-erp-track" />
        <span class="h-3 w-[10%] rounded bg-erp-track" />
        <span class="h-5 w-[9%] rounded-full bg-erp-track" />
        <span class="ml-auto h-3 w-[8%] rounded bg-erp-track" />
      </div>
    </div>
    <DataTable
      v-else
      v-model:selection="selection"
      data-tour="list"
      :value="shown"
      data-key="id"
      :selection-mode="selectable ? 'multiple' : undefined"
      :meta-key-selection="false"
      :row-group-mode="groupBy ? 'subheader' : undefined"
      :group-rows-by="groupRows"
      class="erp-datalist"
      table-class="erp-datalist-table"
      @click.capture="onHeadClick"
    >
      <template v-if="groupBy" #groupheader="{ data }">
        <div class="flex items-center gap-2 text-[13px]">
          <span class="font-semibold text-erp-text">{{ groupKey(data) }}</span>
          <span class="erp-num text-erp-muted">{{ groupCounts.get(groupKey(data)) ?? 0 }}</span>
        </div>
      </template>
      <Column v-if="!selectable" selection-mode="multiple" header-class="erp-dl-gutter" body-class="erp-dl-gutter" />
      <slot />
      <template #empty>
        <div class="flex flex-col items-center justify-center gap-1 py-12 text-center">
          <Inbox :size="32" class="mb-2 text-erp-off-text" aria-hidden="true" />
          <p class="m-0 text-[13px] font-medium text-erp-subtle">{{ emptyText ?? 'Nothing to show for these filters.' }}</p>
        </div>
      </template>
    </DataTable>

    <!-- The ▾ menu of a column header -->
    <Teleport to="body">
      <div v-if="menu" class="erp-dl-colmenu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" role="menu">
        <p class="m-0 truncate px-2 pt-1 pb-1.5 text-[11px] font-semibold text-erp-muted">{{ menu.label }}</p>
        <button type="button" role="menuitem" @click="act('asc')"><ArrowDownAZ :size="15" />Sort A to Z</button>
        <button type="button" role="menuitem" @click="act('desc')"><ArrowUpAZ :size="15" />Sort Z to A</button>
        <button v-if="box" type="button" role="menuitem" @click="act('filter')"><ListFilter :size="15" />Filter</button>
        <button type="button" role="menuitem" @click="act('group')">
          <component :is="groupBy === menu.label ? Ungroup : Group" :size="15" />{{ groupBy === menu.label ? 'Stop grouping' : 'Group by this column' }}
        </button>
        <button type="button" role="menuitem" @click="act('pin')">
          <component :is="pinned.includes(menu.label) ? PinOff : Pin" :size="15" />{{ pinned.includes(menu.label) ? 'Unpin' : 'Pin to the left' }}
        </button>
        <button type="button" role="menuitem" @click="act('hide')"><EyeOff :size="15" />Hide column</button>
        <p class="m-0 border-t border-erp-row px-2 pt-1.5 text-[11px] text-erp-muted">Sort and group work on the rows of this page.</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.erp-dl {
  --erp-dl-edge: color-mix(in srgb, var(--erp-gray-900) 22%, transparent);
  position: relative;
  min-width: 0;
}
.erp-dl.is-reloading {
  opacity: 0.6;
  transition: opacity 150ms;
}
.erp-dl :deep(.p-datatable-table-container) {
  overflow-x: auto;
}
.erp-dl-skeleton {
  animation: erp-dl-pulse 1.4s ease-in-out infinite;
}
@keyframes erp-dl-pulse {
  50% {
    opacity: 0.5;
  }
}
/* Headers with a ▾ menu: the chevron shows while the header is pointed at */
.erp-dl :deep(th[data-dl-col]) {
  cursor: pointer;
}
.erp-dl :deep(th[data-dl-col] .p-datatable-column-header-content)::after {
  content: '▾';
  margin-left: auto;
  padding-left: 6px;
  font-size: 11px;
  color: var(--erp-muted);
  opacity: 0;
  transition: opacity 120ms;
}
.erp-dl :deep(th[data-dl-col]:hover .p-datatable-column-header-content)::after {
  opacity: 1;
}
/* The gutter: the row number, which turns into the tick box on hover, on a ticked row, and on every row once anything
   is ticked (MES). Select all sits in its header. */
.erp-dl :deep(.erp-dl-gutter),
.erp-dl :deep(th:has(.p-checkbox)),
.erp-dl :deep(td:has(.p-checkbox)) {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  padding-inline: 0 !important;
  text-align: center;
}
.erp-dl :deep(thead .p-checkbox) {
  display: inline-flex !important;
}
.erp-dl :deep(tbody) {
  counter-reset: erp-row var(--erp-first, 0);
}
.erp-dl :deep(tbody > tr:not(.p-datatable-empty-message):not(.p-datatable-row-group-header)) {
  counter-increment: erp-row;
}
.erp-dl :deep(tbody > tr > td:has(.p-checkbox))::before {
  content: counter(erp-row);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--erp-off-text);
}
.erp-dl :deep(tbody > tr > td .p-checkbox) {
  display: none;
}
.erp-dl :deep(tbody > tr:hover > td .p-checkbox),
.erp-dl :deep(tbody > tr.p-datatable-row-selected > td .p-checkbox),
.erp-dl.has-selection :deep(tbody > tr > td .p-checkbox) {
  display: inline-flex;
}
.erp-dl :deep(tbody > tr:hover > td:has(.p-checkbox))::before,
.erp-dl :deep(tbody > tr.p-datatable-row-selected > td:has(.p-checkbox))::before,
.erp-dl.has-selection :deep(tbody > tr > td:has(.p-checkbox))::before {
  content: none;
}
.erp-dl :deep(.p-datatable-row-group-header > td) {
  background: var(--erp-head-bg);
}
</style>

<style>
/* The header menu is drawn at the end of the page, outside the table */
.erp-dl-colmenu {
  position: fixed;
  z-index: 1100;
  width: 220px;
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 12px;
  background: var(--dd-bg);
  box-shadow: var(--dd-shadow);
}
.erp-dl-colmenu button {
  display: flex;
  width: 100%;
  min-height: 32px;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--dd-ink);
  text-align: left;
}
.erp-dl-colmenu button:hover {
  background: var(--dd-hover);
}
.erp-dl-colmenu button svg {
  flex-shrink: 0;
  color: var(--dd-muted);
}
</style>
