<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, X } from '@lucide/vue'
import { sessionApi, type ModuleTile } from '@/api/session'
import { useSession } from '@/composables/useSession'
import { MODULES, type ModuleDef, type ModuleKey } from '@/modules/registry'
import { isBuilt, meshStyle, TILE_STYLE } from '@/modules/tiles'

/**
 * "What do you want to open?" in the top bar (MES ModuleSearch): always a pill, Ctrl/Cmd+K jumps to it from anywhere.
 * Finds any menu page of the modules the person can open, this module's first, each on its module's colour.
 */
const props = defineProps<{ module?: ModuleDef | null }>()
const router = useRouter()
const { state } = useSession()
const query = ref('')
const open = ref(false)
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

// The modules the person can open, loaded on first use per user.
const tiles = ref<ModuleTile[]>([])
let loadedFor = -1
async function load() {
  if (loadedFor === state.version) return
  loadedFor = state.version
  try {
    tiles.value = (await sessionApi.modules()).items.filter(isBuilt)
  } catch {
    tiles.value = []
  }
}

interface Hit {
  label: string
  group: string
  module: string
  code: ModuleKey
  to: string
}

const pages = computed<Hit[]>(() => {
  const codes = tiles.value.map((t) => t.code as ModuleKey)
  // This module first, even before the list of modules has loaded.
  const order = props.module ? [props.module.key, ...codes.filter((c) => c !== props.module!.key)] : codes
  return order.flatMap((code) => {
    const m = MODULES[code]
    if (!m) return []
    return [
      { label: `${m.label} home`, group: m.label, module: m.label, code, to: m.home },
      ...(m.approvalsTo ? [{ label: 'Approvals', group: m.label, module: m.label, code, to: m.approvalsTo }] : []),
      ...m.menu.flatMap((g) => g.items.map((i) => ({ label: i.label, group: g.title, module: m.label, code, to: i.to }))),
    ]
  })
})

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return pages.value
    .filter((p) => p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q) || p.module.toLowerCase().includes(q))
    .slice(0, 8)
})
watch(results, () => (active.value = 0))

function go(hit: Hit | undefined) {
  if (!hit) return
  query.value = ''
  open.value = false
  input.value?.blur()
  void router.push(hit.to)
}
function move(step: number) {
  const n = results.value.length
  if (n) active.value = (active.value + step + n) % n
}
function onFocus() {
  open.value = true
  void load()
}
function close() {
  open.value = false
  query.value = ''
  input.value?.blur()
}
const where = (h: Hit) => (h.module === h.group ? h.module : `${h.module} • ${h.group}`)

function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    input.value?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="relative">
    <label class="ps-pill">
      <Search :size="17" class="ps-icon shrink-0" aria-hidden="true" />
      <input
        ref="input"
        v-model="query"
        type="text"
        aria-label="Search pages and modules"
        placeholder="What do you want to open?"
        class="h-full min-w-0 flex-1 border-0 bg-transparent font-[inherit] text-sm text-erp-text outline-none placeholder:text-erp-muted"
        @focus="onFocus"
        @blur="open = false"
        @keydown.esc.prevent="close"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="go(results[active])"
      />
      <button v-if="query" type="button" class="ps-clear" aria-label="Clear search" @mousedown.prevent="query = ''">
        <X :size="13" aria-hidden="true" />
      </button>
      <kbd v-else class="hidden shrink-0 rounded-md border border-erp-border px-1.5 py-0.5 font-[inherit] text-[10px] font-medium text-erp-muted md:inline">Ctrl K</kbd>
    </label>

    <Transition name="ps-pop">
      <div v-if="open && query" class="ps-results absolute inset-x-0 top-full z-50 mt-2 max-h-96 overflow-y-auto">
        <ul v-if="results.length" class="m-0 list-none p-0">
          <li v-for="(r, i) in results" :key="r.to + r.label">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border-0 px-2.5 py-2 text-left font-[inherit]"
              :class="i === active ? 'bg-erp-muted-bg' : 'bg-transparent'"
              @mouseenter="active = i"
              @mousedown.prevent="go(r)"
            >
              <span class="erp-mesh ps-tile" :style="meshStyle(TILE_STYLE[r.code])" aria-hidden="true">
                <component :is="TILE_STYLE[r.code].icon" :size="15" />
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-erp-text">{{ r.label }}</span>
                <span class="block truncate text-xs text-erp-muted">{{ where(r) }}</span>
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="m-0 px-3 py-6 text-center text-sm text-erp-muted">No page matches “{{ query }}”. Try a module or page name.</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ps-pill {
  display: flex;
  height: 48px;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 16px;
  border-radius: 9999px;
  background: var(--erp-muted-bg);
  box-shadow: 0 0 0 1px transparent;
  cursor: text;
  transition:
    background-color 150ms,
    box-shadow 150ms;
}
.ps-pill:hover {
  background: var(--erp-muted-bg-hover);
}
.ps-pill:focus-within {
  background: var(--erp-card);
  box-shadow: 0 0 0 2px var(--erp-text);
}
.ps-icon {
  color: var(--erp-muted);
}
.ps-pill:focus-within .ps-icon {
  color: var(--erp-text);
}
.ps-clear {
  display: flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-gray-400);
}
.ps-clear:hover {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.ps-results {
  padding: 6px;
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  background: var(--erp-card);
  box-shadow: var(--dd-shadow);
}
.ps-tile {
  --mesh-blur: 6px;
  display: flex;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--erp-on-dark);
}
.ps-pop-enter-active,
.ps-pop-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ps-pop-enter-from,
.ps-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
