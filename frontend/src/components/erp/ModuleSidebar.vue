<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlignJustify, Check, ChevronDown, House, LayoutGrid, LayoutList, LogOut, PanelLeftClose, PanelLeftOpen, Search, X } from '@lucide/vue'
import { useSession } from '@/composables/useSession'
import { useShell } from '@/composables/useShell'
import type { ModuleDef } from '@/modules/registry'

/**
 * The module's menu (MES AppSidebar): one rounded panel in the module's gradient. Each menu group is a row with a round
 * tile; its pages open as a submenu under it, the group you are in open already. Search, sort (menu order, A–Z, recents)
 * and view (compact, list, grid) are remembered on this device. On a desktop it folds to a strip of tiles; below 1024px
 * it slides in over the page. Guided tours point at: rail, rail:groups, rail:<group>, menu-panel, menu:<page>, rail:footer.
 */
const props = defineProps<{ module: ModuleDef; home?: boolean }>()
const route = useRoute()
const router = useRouter()
const shell = useShell()
const { isJwt, signOut } = useSession()

/* ── Phones and tablets always get the full panel; the strip of tiles is desktop only ── */
const isMobile = ref(false)
let mql: MediaQueryList | null = null
const onViewport = (e: MediaQueryListEvent) => (isMobile.value = e.matches)
const narrow = computed(() => shell.collapsed && !isMobile.value)

/* ── Sort and view, remembered on this device ── */
type SortKey = 'menu' | 'alpha' | 'recents'
type ViewKey = 'compact' | 'list' | 'grid'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recents', label: 'Recents' },
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'menu', label: 'Menu order' },
]
const VIEWS = [
  { key: 'compact' as const, label: 'Compact', icon: AlignJustify },
  { key: 'list' as const, label: 'List', icon: LayoutList },
  { key: 'grid' as const, label: 'Grid', icon: LayoutGrid },
]
function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function keep(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: the choice lasts until reload */
  }
}
const sort = ref<SortKey>(stored('zora.sidebar.sort', ['menu', 'alpha', 'recents'], 'menu'))
const view = ref<ViewKey>(stored('zora.sidebar.view', ['compact', 'list', 'grid'], 'list'))
const sortOpen = ref(false)
const sortRoot = ref<HTMLElement | null>(null)
const sortLabel = computed(() => SORTS.find((s) => s.key === sort.value)?.label ?? 'Menu order')
const viewIcon = computed(() => VIEWS.find((v) => v.key === view.value)?.icon ?? LayoutList)
function setSort(key: SortKey) {
  sort.value = key
  keep('zora.sidebar.sort', key)
  sortOpen.value = false
}
function setView(key: ViewKey) {
  view.value = key
  keep('zora.sidebar.view', key)
  sortOpen.value = false
}

/* ── Where we are: the group and page of this route ── */
const activeItemKey = computed(() => {
  // A page that links to a filtered list (Draft Quotation → the quotation list on its Draft tab) wins while the list
  // shows exactly that filter; otherwise the route's own menu item.
  for (const g of props.module.menu) {
    for (const item of g.items) {
      const [path, qs] = item.to.split('?')
      if (!qs || path !== route.path) continue
      const wanted = new URLSearchParams(qs)
      if ([...wanted.entries()].every(([k, v]) => route.query[k] === v)) return item.key
    }
  }
  return route.meta.menuItem
})
const currentGroupKey = computed<string | null>(() => (props.home ? null : (route.meta.menuGroup ?? props.module.menu[0]?.key ?? null)))

/* ── Recents: when each page of this module was last opened ── */
const RECENTS_KEY = 'zora.nav.recents'
function readVisits(): Record<string, number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}
const visits = ref<Record<string, number>>(readVisits())
watch(
  activeItemKey,
  (key) => {
    if (!key) return
    visits.value = { ...visits.value, [`${props.module.key}:${key}`]: Date.now() }
    keep(RECENTS_KEY, JSON.stringify(visits.value))
  },
  { immediate: true },
)

/* ── Search ── */
const q = ref('')
const searching = ref(false)
const searchEl = ref<HTMLInputElement | null>(null)
async function toggleSearch() {
  searching.value = !searching.value
  if (!searching.value) {
    q.value = ''
    return
  }
  sortOpen.value = false
  await nextTick()
  searchEl.value?.focus()
}

/* ── Groups: the one you are in is open; others open and close on click ── */
const openGroups = ref(new Set<string>())
function toggleGroup(key: string) {
  const s = new Set(openGroups.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  openGroups.value = s
}
/** Folded to tiles: a tile unfolds the menu with its group open, so its pages can be picked. */
function unfoldTo(key: string) {
  shell.collapsed = false
  openGroups.value = new Set([...openGroups.value, key])
}

const term = computed(() => q.value.trim().toLowerCase())
const entries = computed(() =>
  props.module.menu
    .map((g, i) => {
      const nameHit = !term.value || g.title.toLowerCase().includes(term.value)
      const pages = nameHit ? g.items : g.items.filter((p) => p.label.toLowerCase().includes(term.value))
      const active = g.key === currentGroupKey.value
      return {
        group: g,
        order: i,
        pages: pages.length ? pages : g.items,
        hit: nameHit || pages.length > 0,
        active,
        open: active || openGroups.value.has(g.key) || (!!term.value && !nameHit),
        lastVisit: Math.max(0, ...g.items.map((p) => visits.value[`${props.module.key}:${p.key}`] ?? 0)),
      }
    })
    .filter((e) => e.hit),
)
const sorted = computed(() => {
  const list = [...entries.value]
  if (sort.value === 'alpha') return list.sort((a, b) => a.group.title.localeCompare(b.group.title))
  // Most recently opened first; groups never opened keep the menu's order after them.
  if (sort.value === 'recents') return list.sort((a, b) => b.lastVisit - a.lastVisit || a.order - b.order)
  return list
})
/** In the grid view the tiles open a group's first page; the pages of the group you are in sit under the grid. */
const currentEntry = computed(() => entries.value.find((e) => e.active) ?? null)

function closeOnMobile() {
  if (isMobile.value) shell.mobileOpen = false
}

/** Sign-in mode ends the session; dev mode goes back to the launcher, as before. */
async function leave() {
  if (isJwt.value) {
    await signOut()
    await router.push('/sign-in')
  } else await router.push('/')
}

// A new module starts with nothing searched and no extra groups open; a new page closes the menu on a phone.
watch(
  () => props.module.key,
  () => {
    q.value = ''
    searching.value = false
    openGroups.value = new Set()
  },
)
watch(() => route.fullPath, closeOnMobile)

function onDocClick(e: MouseEvent) {
  if (sortOpen.value && sortRoot.value && !sortRoot.value.contains(e.target as Node)) sortOpen.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    sortOpen.value = false
    if (isMobile.value) shell.mobileOpen = false
  }
}
onMounted(() => {
  mql = window.matchMedia('(max-width: 1023px)')
  isMobile.value = mql.matches
  mql.addEventListener('change', onViewport)
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  mql?.removeEventListener('change', onViewport)
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Transition name="lib-fade">
    <div v-if="isMobile && shell.mobileOpen" class="lib-backdrop erp-no-print fixed inset-0 z-30 lg:hidden" aria-hidden="true" @click="shell.mobileOpen = false" />
  </Transition>

  <aside
    data-tour="rail"
    :aria-label="`${module.label} menu`"
    class="lib erp-shell-side erp-no-print fixed top-16 bottom-2 left-2 z-40 flex w-[280px] flex-col overflow-hidden rounded-xl text-erp-on-dark transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0"
    :class="[shell.mobileOpen ? 'translate-x-0' : '-translate-x-[110%]', narrow ? 'lg:w-[72px]' : '']"
  >
    <!-- ── Folded: the tiles alone ── -->
    <template v-if="narrow">
      <div class="flex flex-col items-center gap-1.5 px-2 pt-4 pb-3">
        <button type="button" class="lib-chip h-10 w-10" title="Expand menu" aria-label="Expand menu" @click="shell.collapsed = false">
          <PanelLeftOpen :size="20" :stroke-width="1.75" aria-hidden="true" />
        </button>
      </div>
      <nav data-tour="menu-panel" class="lib-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul data-tour="rail:groups" class="m-0 flex list-none flex-col items-center gap-2 p-0">
          <li v-for="e in sorted" :key="e.group.key">
            <button
              type="button"
              :data-tour="`rail:${e.group.key}`"
              class="lib-tile h-11 w-11"
              :class="{ 'is-active': e.active }"
              :aria-label="e.group.title"
              :title="e.group.title"
              @click="unfoldTo(e.group.key)"
            >
              <component :is="e.group.icon" :size="20" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </nav>
      <div data-tour="rail:footer" class="flex flex-col items-center gap-1.5 px-2 pb-3">
        <RouterLink :to="module.home" class="lib-chip h-10 w-10" :title="`${module.label} home`" :aria-label="`${module.label} home`">
          <House :size="18" aria-hidden="true" />
        </RouterLink>
        <button type="button" class="lib-chip h-10 w-10" title="Sign out" aria-label="Sign out" @click="leave">
          <LogOut :size="18" class="rotate-180" aria-hidden="true" />
        </button>
      </div>
    </template>

    <!-- ── Open ── -->
    <template v-else>
      <div class="px-4 pt-4 pb-2">
        <!-- The module's name has the row to itself; the fold control shows while it is hovered. -->
        <button
          type="button"
          class="group -ml-1 flex max-w-full min-w-0 items-center rounded-full border-0 bg-transparent py-1 pr-2 pl-1 text-erp-on-dark/85 transition-colors hover:text-erp-on-dark"
          :aria-label="isMobile ? 'Close menu' : 'Collapse menu'"
          :title="isMobile ? 'Close menu' : 'Collapse menu'"
          @click="isMobile ? (shell.mobileOpen = false) : (shell.collapsed = true)"
        >
          <span class="flex w-0 shrink-0 items-center overflow-hidden opacity-0 transition-all duration-200 group-hover:mr-2 group-hover:w-5 group-hover:opacity-100 group-focus-visible:mr-2 group-focus-visible:w-5 group-focus-visible:opacity-100">
            <X v-if="isMobile" :size="20" class="shrink-0" aria-hidden="true" />
            <PanelLeftClose v-else :size="20" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
          </span>
          <span class="lib-title truncate">{{ module.label }}</span>
        </button>

        <!-- Search (a round button until wanted, then a pill) and the sort / view menu -->
        <div class="mt-4 flex h-9 items-center justify-between gap-2">
          <div class="flex h-9 items-center overflow-hidden rounded-full transition-[width,background-color] duration-300" :class="searching ? 'lib-search-on w-full' : 'w-9'">
            <button
              type="button"
              class="lib-chip h-9 w-9"
              :class="{ 'is-flat': searching }"
              :aria-label="searching ? 'Close search' : `Search ${module.label}`"
              :title="searching ? 'Close search' : `Search in ${module.label}`"
              @click="toggleSearch"
            >
              <Search :size="16" aria-hidden="true" />
            </button>
            <input
              ref="searchEl"
              v-model="q"
              type="text"
              :placeholder="`Search in ${module.label}`"
              :aria-label="`Search in ${module.label}`"
              class="lib-search-input h-9 min-w-0 flex-1 border-0 bg-transparent pr-4 font-[inherit] text-[13px] outline-none"
              :class="searching ? 'opacity-100' : 'pointer-events-none opacity-0'"
              :tabindex="searching ? 0 : -1"
              @keydown.esc.prevent="toggleSearch"
            />
          </div>

          <div v-if="!searching" ref="sortRoot" class="relative shrink-0">
            <button
              type="button"
              class="lib-chip h-9 gap-1.5 px-3.5 text-[13px] font-medium"
              :class="{ 'is-open': sortOpen }"
              aria-haspopup="menu"
              :aria-expanded="sortOpen"
              @click="sortOpen = !sortOpen"
            >
              {{ sortLabel }}
              <component :is="viewIcon" :size="16" aria-hidden="true" />
            </button>
            <Transition name="lib-pop">
              <div v-if="sortOpen" role="menu" class="lib-menu absolute top-full right-0 z-50 mt-2 w-52">
                <p class="lib-menu-label">Sort by</p>
                <button
                  v-for="s in SORTS"
                  :key="s.key"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="sort === s.key"
                  class="lib-menu-item"
                  :class="{ 'is-on': sort === s.key }"
                  @click="setSort(s.key)"
                >
                  <span class="flex-1">{{ s.label }}</span>
                  <Check v-if="sort === s.key" :size="16" :stroke-width="2.25" aria-hidden="true" />
                </button>
                <div class="lib-menu-sep" />
                <p class="lib-menu-label">View as</p>
                <button
                  v-for="v in VIEWS"
                  :key="v.key"
                  type="button"
                  role="menuitemradio"
                  :aria-checked="view === v.key"
                  class="lib-menu-item"
                  :class="{ 'is-on': view === v.key }"
                  @click="setView(v.key)"
                >
                  <component :is="v.icon" :size="16" class="opacity-80" aria-hidden="true" />
                  <span class="flex-1">{{ v.label }}</span>
                  <Check v-if="view === v.key" :size="16" :stroke-width="2.25" aria-hidden="true" />
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <nav data-tour="menu-panel" class="lib-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        <p v-if="!sorted.length" class="m-0 px-3 py-6 text-center text-xs text-erp-on-dark/75">Nothing in {{ module.label }} matches “{{ q }}”.</p>

        <!-- Grid: round tiles two across, names under them; a tile opens its group's first page -->
        <template v-if="view === 'grid'">
          <ul data-tour="rail:groups" class="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
            <li v-for="e in sorted" :key="e.group.key">
              <RouterLink
                :to="e.pages[0]?.to ?? e.group.to"
                :data-tour="`rail:${e.group.key}`"
                class="lib-row flex w-full flex-col items-center rounded-2xl px-2 pt-3 pb-2.5 text-center no-underline"
                :class="{ 'is-active': e.active }"
                @click="closeOnMobile"
              >
                <span class="lib-tile h-16 w-16" :class="{ 'is-active': e.active }"><component :is="e.group.icon" :size="28" aria-hidden="true" /></span>
                <span class="mt-2.5 line-clamp-2 text-[13px] leading-snug font-semibold text-erp-on-dark">{{ e.group.title }}</span>
                <span class="text-xs text-erp-on-dark/70">{{ e.group.items.length }} {{ e.group.items.length === 1 ? 'page' : 'pages' }}</span>
              </RouterLink>
            </li>
          </ul>
          <ul v-if="currentEntry" class="lib-sub mt-3 mb-1 ml-2 flex list-none flex-col gap-0.5 border-0 border-l border-solid py-0.5 pl-3">
            <li v-for="page in currentEntry.pages" :key="page.key">
              <RouterLink
                :to="page.to"
                :data-tour="`menu:${page.key}`"
                class="lib-sub-link flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] no-underline"
                :class="{ 'is-active': activeItemKey === page.key }"
                :aria-current="activeItemKey === page.key ? 'page' : undefined"
                @click="closeOnMobile"
              >
                <span class="truncate">{{ page.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </template>

        <!-- List and Compact: one row per group, its pages as a submenu under a guide line -->
        <ul v-else data-tour="rail:groups" class="m-0 flex list-none flex-col p-0" :class="view === 'compact' ? 'gap-0.5' : 'gap-1'">
          <li v-for="e in sorted" :key="e.group.key">
            <button
              type="button"
              :data-tour="`rail:${e.group.key}`"
              class="lib-row flex w-full items-center border-0 bg-transparent text-left font-[inherit]"
              :class="[view === 'compact' ? 'gap-2.5 rounded-full px-3 py-2' : 'gap-3 rounded-2xl px-2 py-2', { 'is-active': e.active && !e.open }]"
              :aria-expanded="e.open"
              @click="toggleGroup(e.group.key)"
            >
              <span v-if="view === 'list'" class="lib-tile h-10 w-10" :class="{ 'is-active': e.active }"><component :is="e.group.icon" :size="20" aria-hidden="true" /></span>
              <component :is="e.group.icon" v-else :size="16" class="shrink-0 opacity-85" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-erp-on-dark" :class="view === 'compact' ? 'text-[13px]' : 'text-sm'">{{ e.group.title }}</span>
                <span v-if="view === 'list'" class="block truncate text-xs text-erp-on-dark/70">{{ e.group.items.length }} {{ e.group.items.length === 1 ? 'page' : 'pages' }}</span>
              </span>
              <ChevronDown :size="16" class="mr-1 shrink-0 text-erp-on-dark/75 transition-transform duration-200" :class="{ 'rotate-180': e.open }" aria-hidden="true" />
            </button>

            <ul
              v-if="e.open"
              class="lib-sub mt-1 mb-1.5 flex list-none flex-col gap-0.5 border-0 border-l border-solid py-0.5 pl-3"
              :class="view === 'list' ? 'ml-[27px]' : 'ml-[19px]'"
            >
              <li v-for="page in e.pages" :key="page.key">
                <RouterLink
                  :to="page.to"
                  :data-tour="`menu:${page.key}`"
                  class="lib-sub-link flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] no-underline"
                  :class="{ 'is-active': activeItemKey === page.key }"
                  :aria-current="activeItemKey === page.key ? 'page' : undefined"
                  @click="closeOnMobile"
                >
                  <span class="truncate">{{ page.label }}</span>
                </RouterLink>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <!-- This module's home, then Sign out -->
      <div data-tour="rail:footer" class="lib-foot flex items-center gap-1.5 px-3 py-2.5">
        <RouterLink :to="module.home" class="lib-chip h-9 flex-1 gap-2 px-3.5 text-[13px] font-medium no-underline" @click="closeOnMobile">
          <House :size="16" aria-hidden="true" />{{ module.label }} home
        </RouterLink>
        <button type="button" class="lib-chip h-9 w-9" title="Sign out" aria-label="Sign out" @click="leave">
          <LogOut :size="16" class="rotate-180" aria-hidden="true" />
        </button>
      </div>
    </template>
    <span class="lib-edge" aria-hidden="true" />
  </aside>
</template>

<style scoped>
/* The panel is a grainy mesh gradient (MES AppSidebar): a deep band down the left, the module's warm glow blooming from
   the top right into the module colour, the colour pooling low, all blurred together over a vertical base, then a fine
   film grain. The layers sit behind the content, so text stays crisp. White washes are the on-dark token mixed down. */
.lib {
  --w-06: color-mix(in srgb, var(--erp-on-dark) 6%, transparent);
  --w-10: color-mix(in srgb, var(--erp-on-dark) 10%, transparent);
  --w-14: color-mix(in srgb, var(--erp-on-dark) 14%, transparent);
  --w-16: color-mix(in srgb, var(--erp-on-dark) 16%, transparent);
  --w-18: color-mix(in srgb, var(--erp-on-dark) 18%, transparent);
  --w-22: color-mix(in srgb, var(--erp-on-dark) 22%, transparent);
  --w-25: color-mix(in srgb, var(--erp-on-dark) 25%, transparent);
  --w-26: color-mix(in srgb, var(--erp-on-dark) 26%, transparent);
  --w-60: color-mix(in srgb, var(--erp-on-dark) 60%, transparent);
  --w-82: color-mix(in srgb, var(--erp-on-dark) 82%, transparent);
  --k-16: color-mix(in srgb, var(--erp-gray-900) 16%, transparent);
  --k-20: color-mix(in srgb, var(--erp-gray-900) 20%, transparent);
  --k-28: color-mix(in srgb, var(--erp-gray-900) 28%, transparent);
  isolation: isolate;
  background-color: var(--mod-grad-to);
  box-shadow: 0 10px 30px var(--k-20);
  text-shadow: 0 1px 2px var(--k-20);
}
.lib::before {
  content: '';
  position: absolute;
  inset: -25%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(32% 10% at 74% 19%, color-mix(in srgb, var(--mod-glow) 62%, var(--erp-on-dark)) 0%, transparent 70%),
    radial-gradient(48% 16% at 60% 25%, var(--mod-glow) 0%, transparent 70%),
    radial-gradient(45% 18% at 70% 42%, color-mix(in srgb, var(--mod-glow) 50%, var(--mod-side)) 0%, transparent 72%),
    radial-gradient(24% 55% at 20% 55%, color-mix(in srgb, var(--mod-grad-to) 72%, var(--erp-gray-900)) 0%, transparent 72%),
    radial-gradient(60% 22% at 55% 80%, color-mix(in srgb, var(--mod-side) 88%, var(--erp-gray-900)) 0%, transparent 72%),
    linear-gradient(180deg, var(--mod-side) 0%, var(--mod-grad-to) 100%);
  filter: blur(40px) saturate(1.15);
}
.lib::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.2;
  background-image: var(--erp-grain);
  background-size: 200px 200px;
}
@media (prefers-reduced-transparency: reduce) {
  .lib::after {
    display: none;
  }
}
/* A hairline of light along the top edge, so the panel reads as lit. */
.lib-edge {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow:
    inset 0 1px 0 var(--w-22),
    inset 0 0 0 1px var(--w-06);
}
.lib-title {
  font-family: var(--erp-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--erp-on-dark);
}
.lib-backdrop {
  background: var(--erp-backdrop);
}

/* Controls on the gradient sit on a dark glass chip, legible over the bright corner as much as the deep end. */
.lib-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: var(--k-16);
  color: var(--erp-on-dark);
  font-family: inherit;
  transition: background-color 150ms;
}
.lib-chip:hover,
.lib-chip.is-open {
  background: var(--k-28);
}
.lib-chip.is-flat {
  background: transparent;
}
.lib-search-on {
  background: var(--k-20);
  box-shadow: 0 0 0 1px var(--w-14);
}
.lib-search-input {
  color: var(--erp-on-dark);
}
.lib-search-input::placeholder {
  color: var(--w-60);
}

/* Rows lighten on hover; the current one holds a brighter wash. */
.lib-row {
  color: var(--erp-on-dark);
  transition: background-color 150ms;
}
.lib-row:hover {
  background: var(--w-10);
}
.lib-row.is-active {
  background: var(--w-18);
}
.lib-row:focus-visible,
.lib-sub-link:focus-visible,
.lib-tile:focus-visible,
.lib-chip:focus-visible {
  outline: 2px solid var(--w-82);
  outline-offset: 1px;
}

/* Round tiles: frosted on the gradient, solid white for the group you are in. */
.lib-tile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: var(--w-16);
  color: var(--erp-on-dark);
  box-shadow: inset 0 0 0 1px var(--w-14);
  transition:
    background-color 150ms,
    transform 150ms;
}
button.lib-tile:hover {
  background: var(--w-26);
}
.lib-tile.is-active {
  background: var(--erp-card);
  color: var(--mod-active);
  box-shadow: 0 4px 14px var(--k-20);
}

/* Submenu pages under a guide line; the current one a white pill */
.lib-sub {
  border-color: var(--w-25);
}
.lib-sub-link {
  color: var(--w-82);
  transition:
    background-color 150ms,
    color 150ms;
}
.lib-sub-link:hover {
  background: var(--w-10);
  color: var(--erp-on-dark);
}
.lib-sub-link.is-active {
  background: var(--erp-card);
  color: var(--mod-active);
  font-weight: 600;
  text-shadow: none;
  box-shadow: 0 2px 8px var(--k-16);
}
.lib-foot {
  border-top: 1px solid var(--w-14);
}

/* The sort / view menu: the same white panel as every other dropdown */
.lib-menu {
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 16px;
  background: var(--dd-bg);
  color: var(--dd-ink);
  text-shadow: none;
  box-shadow: var(--dd-shadow);
}
.lib-menu-label {
  margin: 0;
  padding: 6px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dd-muted);
}
.lib-menu-sep {
  height: 1px;
  margin: 4px -2px;
  background: var(--dd-hover);
}
.lib-menu-item {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 10px;
  padding: 0 12px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--erp-text-soft);
  text-align: left;
}
.lib-menu-item:hover,
.lib-menu-item:focus-visible {
  background: var(--dd-hover);
  outline: none;
}
.lib-menu-item.is-on {
  color: var(--mod-primary);
  font-weight: 600;
}

.lib-pop-enter-active,
.lib-pop-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top right;
}
.lib-pop-enter-from,
.lib-pop-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}
.lib-fade-enter-active,
.lib-fade-leave-active {
  transition: opacity 200ms ease;
}
.lib-fade-enter-from,
.lib-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .lib-pop-enter-active,
  .lib-pop-leave-active,
  .lib-fade-enter-active,
  .lib-fade-leave-active {
    transition: none;
  }
}

/* The list scrolls quietly: a thin bar that only shows while hovered. */
.lib-scroll {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.lib-scroll:hover {
  scrollbar-color: color-mix(in srgb, var(--erp-on-dark) 35%, transparent) transparent;
}
</style>
