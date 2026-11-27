<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ArrowRight, Lock, Star } from '@lucide/vue'
import { accountApi, sessionApi, type ModuleTile } from '@/api/session'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import TopBar from '@/components/erp/TopBar.vue'
import { useSession } from '@/composables/useSession'
import { MODULES, type ModuleKey } from '@/modules/registry'
import { notificationsApi } from '@/api/notifications'
import { ClipboardCheck, Inbox, ListChecks, Plus, UserRound } from '@lucide/vue'
import ListBox from '@/components/erp/ListBox.vue'
import { help } from '@/tours/engine'
import WelcomeCard from '@/tours/WelcomeCard.vue'
import { isBuilt, meshStyle, TILE_STYLE } from '@/modules/tiles'
import { formatLongDate, greeting } from '@/utils/format'

/**
 * 00 · Choose a module, as the MES launchpad: the greeting, then one card per module drawn in its gradient. A card
 * opens only when its module is built in this app and the person may view it; the others say "No access" (built, not in
 * their roles) or "Coming soon".
 */
const toast = useToast()
const { state, user, today, now, isJwt } = useSession()

const FALLBACK: ModuleTile[] = [
  { code: 'core', name: 'Core', tag: '', state: 'OPEN', route: '/core' },
  { code: 'purchase', name: 'Purchase', tag: '', state: 'OPEN', route: '/purchase' },
  { code: 'sales', name: 'Sales', tag: '', state: 'OPEN', route: '/sales' },
  { code: 'wms', name: 'WMS', tag: '', state: 'EXISTING', route: null },
  { code: 'config', name: 'Configuration', tag: '', state: 'OPEN', route: '/config' },
]

const tiles = ref<ModuleTile[]>(FALLBACK)

/** Modules the person can open first, then those not in their roles, then those coming later. */
const sortedTiles = computed(() => [
  ...tiles.value.filter(isBuilt),
  ...tiles.value.filter((t) => !isBuilt(t) && t.state === 'NO_ACCESS'),
  ...tiles.value.filter((t) => !isBuilt(t) && t.state !== 'NO_ACCESS'),
])
const builtTiles = computed(() => tiles.value.filter(isBuilt))

// Approvals waiting for the current user, per built module (shown on its card).
const waiting = reactive<Record<string, number>>({})
async function loadWaiting() {
  for (const t of builtTiles.value) {
    const fetchCount = MODULES[t.code as keyof typeof MODULES].approvalsCount
    if (!fetchCount) continue
    try {
      waiting[t.code] = (await fetchCount()).waitingForMe
    } catch {
      /* the card just shows no count */
    }
  }
}

// A14 "Ask to change regularly": the password is old enough to ask for a new one (sign-in mode only).
const passwordDue = ref(false)

onMounted(async () => {
  try {
    tiles.value = (await sessionApi.modules()).items
  } catch {
    /* keep the static list; the error toast already explains */
  }
  if (isJwt.value) {
    accountApi
      .get(true)
      .then((a) => (passwordDue.value = a.password.changeDue))
      .catch(() => undefined)
  }
  await loadWaiting()
})

// Default module: remembered for when login exists (then the app opens straight into it).
const DEFAULT_KEY = 'zora.defaultModule'
const ADMIN_MODULES: string[] = ['core', 'config']
const storedDefault = ref(readDefault())
// Without a choice, the first module for daily work: Core and Configuration are for administrators, so never the fallback.
const defaultModule = computed(() =>
  builtTiles.value.some((t) => t.code === storedDefault.value)
    ? storedDefault.value
    : (builtTiles.value.find((t) => !ADMIN_MODULES.includes(t.code))?.code ?? builtTiles.value[0]?.code ?? ''),
)
function readDefault(): string {
  try {
    return localStorage.getItem(DEFAULT_KEY) ?? ''
  } catch {
    return ''
  }
}
function setDefault(tile: ModuleTile) {
  if (tile.code === defaultModule.value) return
  storedDefault.value = tile.code
  try {
    localStorage.setItem(DEFAULT_KEY, tile.code)
  } catch {
    /* private mode: the choice lasts until reload */
  }
  toast.add({ severity: 'success', summary: 'Default module saved', detail: `${tile.name} will open first after you sign in.`, life: 3000 })
}

const hello = computed(() => `${greeting(now())}, ${user.value?.name ?? ''}`)

/* ── Under the modules: what waits, what you opened last, what you start most ── */
const session = useSession()
const unread = ref(0)
onMounted(() => {
  notificationsApi
    .list()
    .then((a) => (unread.value = a.unread))
    .catch(() => undefined)
})
const waitingCells = computed(() =>
  builtTiles.value
    .filter((t) => MODULES[t.code as ModuleKey]?.approvalsTo)
    .map((t) => ({ code: t.code, label: `${t.name} approvals`, count: waiting[t.code] ?? 0, to: MODULES[t.code as ModuleKey].approvalsTo! })),
)

// Pages opened from a module's menu (the sidebar keeps when each was last opened, on this device).
const recents = computed(() => {
  let visits: Record<string, number> = {}
  try {
    visits = JSON.parse(localStorage.getItem('zora.nav.recents') ?? '{}') as Record<string, number>
  } catch {
    /* nothing kept */
  }
  const open = new Set(builtTiles.value.map((t) => t.code as string))
  return Object.entries(visits)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [code, item] = key.split(':') as [ModuleKey, string]
      if (!open.has(code)) return null
      const m = MODULES[code]
      const page = m?.menu.flatMap((g) => g.items).find((i) => i.key === item)
      return page ? { key, label: page.label, module: m.label, to: page.to, code, when: whenText(visits[key] ?? 0) } : null
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .slice(0, 12)
})

function whenText(t: number): string {
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(t).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}
const recentSearch = ref('')
const shownRecents = computed(() => {
  const q = recentSearch.value.trim().toLowerCase()
  return q ? recents.value.filter((r) => `${r.label} ${r.module}`.toLowerCase().includes(q)) : recents.value
})

// Each module's home that carries charts: the dashboards this ERP has today.
const BOARDS = [
  { code: 'sales', name: 'Sales dashboard', description: 'Orders, approvals, sales by agent and by month', to: '/sales' },
  { code: 'purchase', name: 'Purchase dashboard', description: 'Open orders, what to buy soon, committed spend', to: '/purchase' },
  { code: 'service', name: 'Service dashboard', description: 'Jobs today, not booked, overdue and reminders', to: '/service' },
] as const
const boards = computed(() => BOARDS.filter((b) => builtTiles.value.some((t) => t.code === b.code)))

// The documents people start most, each only for whoever may make it.
const QUICK = [
  { label: 'New sales order', to: '/sales/orders/new', code: 'sales', permission: 'sales.order.edit' },
  { label: 'New quotation', to: '/sales/quotations/new', code: 'sales', permission: 'sales.quotation.edit' },
  { label: 'New purchase order', to: '/purchase/orders/new', code: 'purchase', permission: 'purchase.order.edit' },
  { label: 'New customer', to: '/core/customers/new', code: 'core', permission: 'core.customer.edit' },
  { label: 'New item', to: '/core/items/new', code: 'core', permission: 'core.item.edit' },
] as const
const quick = computed(() => QUICK.filter((q) => builtTiles.value.some((t) => t.code === q.code) && session.can(q.permission)))
</script>

<template>
  <div class="min-h-screen bg-erp-shell">
    <TopBar />

    <div class="px-2 pb-2">
      <main class="erp-page min-h-[calc(100dvh-4.5rem)] p-4 md:p-6">
        <div class="flex w-full flex-col gap-7 md:py-1">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 class="m-0 text-[28px] leading-tight font-semibold">{{ hello }}</h1>
              <p class="mt-1 mb-0 text-sm text-erp-muted">
                {{ today ? formatLongDate(today) : '' }}<template v-if="state.tenantName"> · {{ state.tenantName }}</template>
              </p>
            </div>
            <button type="button" class="lc-tool" @click="help.open = true"><ListChecks :size="16" aria-hidden="true" />Guides</button>
          </div>

          <WelcomeCard />

          <NoticeBanner v-if="passwordDue" kind="warning">
            It is time to change your password. <RouterLink to="/account" class="erp-link font-semibold">Change it in My account</RouterLink>
          </NoticeBanner>

          <section aria-labelledby="launcher-modules" class="flex flex-col gap-3">
            <h2 id="launcher-modules" class="erp-display m-0 text-xl font-semibold tracking-[-0.02em]">Modules</h2>
            <!-- One small card per module, in one row where the screen allows (MES launchpad) -->
            <ul data-tour="launcher:tiles" class="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
              <li v-for="tile in sortedTiles" :key="tile.code">
                <div
                  v-if="isBuilt(tile)"
                  class="lc-card erp-mesh group flex h-[6.5rem] flex-col justify-between rounded-2xl p-3 text-erp-on-dark"
                  :style="meshStyle(TILE_STYLE[tile.code])"
                  :title="TILE_STYLE[tile.code].description"
                >
                  <div class="flex items-start justify-between gap-1">
                    <span class="lc-icon" aria-hidden="true"><component :is="TILE_STYLE[tile.code].icon" :size="15" /></span>
                    <button
                      type="button"
                      class="lc-star relative z-10"
                      :class="{ 'is-on': tile.code === defaultModule }"
                      :aria-pressed="tile.code === defaultModule"
                      :aria-label="tile.code === defaultModule ? 'Default module' : 'Set as default module'"
                      :title="tile.code === defaultModule ? 'Opens first after you sign in' : 'Set as default module'"
                      @click="setDefault(tile)"
                    >
                      <Star :size="12" :fill="tile.code === defaultModule ? 'currentColor' : 'none'" aria-hidden="true" />
                    </button>
                  </div>
                  <div class="lc-text min-w-0">
                    <RouterLink :to="tile.route!" class="lc-name erp-display block truncate text-[15px] leading-tight font-semibold text-erp-on-dark outline-none">
                      {{ tile.name }}
                    </RouterLink>
                    <span class="block truncate text-[11px] text-erp-on-dark/80">{{ waiting[tile.code] ? `${waiting[tile.code]} waiting for you` : TILE_STYLE[tile.code].description }}</span>
                  </div>
                </div>
                <div
                  v-else
                  class="flex h-[6.5rem] flex-col justify-between rounded-2xl border border-dashed border-erp-input bg-erp-card p-3"
                  aria-disabled="true"
                  :title="tile.state === 'NO_ACCESS' ? 'Not part of your role. Ask your administrator if you need it.' : 'Coming soon'"
                >
                  <span class="lc-icon-quiet" :style="{ '--tile-color': TILE_STYLE[tile.code].color }" aria-hidden="true">
                    <component :is="TILE_STYLE[tile.code].icon" :size="15" />
                  </span>
                  <div class="min-w-0">
                    <span class="erp-display block truncate text-[15px] leading-tight font-semibold text-erp-subtle">{{ tile.name }}</span>
                    <span class="flex items-center gap-1 text-[11px] text-erp-muted"><Lock v-if="tile.state === 'NO_ACCESS'" :size="10" aria-hidden="true" />{{ tile.state === 'NO_ACCESS' ? 'No access' : 'Coming soon' }}</span>
                  </div>
                </div>
              </li>
            </ul>
            <!-- Quieter than the modules: the person's own inboxes -->
            <div class="flex flex-wrap gap-2">
              <RouterLink v-for="c in waitingCells" :key="c.code" :to="c.to" class="lc-pill">
                <ClipboardCheck :size="14" aria-hidden="true" />{{ c.label }}
                <span v-if="c.count" class="rounded-full bg-chip-pending-bg px-1.5 text-[11px] font-semibold text-chip-pending-text">{{ c.count }}</span>
              </RouterLink>
              <span class="lc-pill"><Inbox :size="14" aria-hidden="true" />Alerts<span v-if="unread" class="rounded-full bg-chip-pending-bg px-1.5 text-[11px] font-semibold text-chip-pending-text">{{ unread }}</span></span>
              <RouterLink to="/account" class="lc-pill"><UserRound :size="14" aria-hidden="true" />My account</RouterLink>
            </div>
          </section>

          <section aria-labelledby="launcher-boards" class="flex flex-col gap-3">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <h2 id="launcher-boards" class="erp-display m-0 text-xl font-semibold tracking-[-0.02em]">Dashboards</h2>
              <div v-if="quick.length" class="erp-ink flex flex-wrap gap-2">
                <RouterLink v-for="q in quick.slice(0, 2)" :key="q.to" :to="q.to" class="erp-btn erp-btn-add"><Plus :size="14" aria-hidden="true" />{{ q.label }}</RouterLink>
              </div>
            </div>
            <!-- Each module's home dashboard, drawn as the board it is -->
            <div v-if="boards.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RouterLink v-for="b in boards" :key="b.code" :to="b.to" class="lc-board group">
                <span class="lc-sketch" aria-hidden="true">
                  <span class="lc-sk-row"><i /><i /><i /><i /></span>
                  <span class="lc-sk-grid"><span class="lc-sk-line" /><span class="lc-sk-bars"><b /><b /><b /></span><span class="lc-sk-list" /><span class="lc-sk-ring" /></span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-erp-text">{{ b.name }}</span>
                  <span class="mt-0.5 block text-xs text-erp-muted">{{ b.description }}</span>
                  <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-erp-link">Open dashboard <ArrowRight :size="13" class="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
                </span>
              </RouterLink>
            </div>

            <ListBox v-model:search="recentSearch" placeholder="Search" :count="`${shownRecents.length} recently opened`">
              <table class="erp-table">
                <thead>
                  <tr><th>Page</th><th>Module</th><th>Last opened</th><th class="w-10" /></tr>
                </thead>
                <tbody>
                  <tr v-if="!shownRecents.length"><td colspan="4" class="py-8 text-center text-erp-muted">Pages you open from a module's menu show here.</td></tr>
                  <tr v-for="r in shownRecents" :key="r.key">
                    <td>
                      <RouterLink :to="r.to" class="flex items-center gap-2.5 font-medium text-erp-text hover:underline">
                        <span class="erp-mesh lc-mini" :style="meshStyle(TILE_STYLE[r.code])" aria-hidden="true"><component :is="TILE_STYLE[r.code].icon" :size="12" /></span>{{ r.label }}
                      </RouterLink>
                    </td>
                    <td class="text-erp-subtle">{{ r.module }}</td>
                    <td class="text-erp-subtle">{{ r.when }}</td>
                    <td><RouterLink :to="r.to" class="text-erp-muted" :aria-label="`Open ${r.label}`"><ArrowRight :size="15" /></RouterLink></td>
                  </tr>
                </tbody>
              </table>
            </ListBox>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.lc-card {
  box-shadow: var(--erp-card-shadow);
  transition:
    transform 200ms,
    box-shadow 200ms;
}
.lc-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px color-mix(in srgb, var(--erp-gray-900) 22%, transparent);
}
.lc-card:focus-within {
  outline: 2px solid var(--erp-text);
  outline-offset: 2px;
}
/* The whole card is the link */
.lc-name::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 1.5rem;
}
.lc-text {
  text-shadow: 0 1px 2px color-mix(in srgb, var(--erp-gray-900) 22%, transparent);
}
.lc-icon {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--erp-on-dark) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--erp-on-dark) 25%, transparent);
  color: var(--erp-on-dark);
}
.lc-icon-quiet {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--tile-color) 12%, transparent);
  color: var(--tile-color);
}
.lc-star {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--erp-gray-900) 18%, transparent);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--erp-on-dark);
  opacity: 0;
  transition:
    opacity 150ms,
    background-color 150ms;
}
.lc-card:hover .lc-star,
.lc-star:focus-visible,
.lc-star.is-on {
  opacity: 1;
}
.lc-star:hover {
  background: color-mix(in srgb, var(--erp-gray-900) 30%, transparent);
}
.lc-badge {
  align-items: center;
  padding: 2px 9px;
  border-radius: 9999px;
  background: var(--erp-card);
  color: var(--chip-pending-text);
  font-size: 12px;
  font-weight: 600;
  text-shadow: none;
}
.lc-open {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--erp-card);
  color: var(--erp-text);
  box-shadow: 0 10px 20px color-mix(in srgb, var(--erp-gray-900) 25%, transparent);
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 200ms,
    transform 200ms;
  pointer-events: none;
}
.lc-card:hover .lc-open,
.lc-card:focus-within .lc-open {
  opacity: 1;
  transform: none;
}
.lc-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  overflow: hidden;
  border: 1px solid var(--erp-border);
  border-radius: 1rem;
  background: var(--erp-card);
  box-shadow: var(--erp-card-shadow);
}
.lc-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 20px;
  color: var(--erp-text);
  text-decoration: none;
  box-shadow:
    -1px 0 0 var(--erp-border),
    0 -1px 0 var(--erp-border);
  transition: background-color 150ms;
}
a.lc-cell:hover {
  background: var(--erp-hover-bg);
}
.lc-mini {
  --mesh-blur: 6px;
  display: flex;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--erp-on-dark);
}
.lc-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--erp-input-border);
  border-radius: 9999px;
  background: var(--erp-card);
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-text);
  text-decoration: none;
  transition: background-color 150ms;
}
.lc-pill:hover {
  background: var(--erp-hover-bg);
}
@media (prefers-reduced-motion: reduce) {
  .lc-card,
  .lc-open,
  .lc-star {
    transition: none;
  }
}
</style>

<style scoped>
.lc-tool {
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
}
.lc-tool:hover {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.lc-board {
  display: flex;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius);
  background: var(--erp-card);
  box-shadow: var(--erp-card-shadow);
  text-decoration: none;
  transition:
    border-color 150ms,
    box-shadow 150ms;
}
.lc-board:hover {
  border-color: var(--erp-gray-300);
  box-shadow: var(--erp-lift-shadow);
}
/* A little drawing of the board: a KPI row, then four charts */
.lc-sketch {
  display: flex;
  width: 104px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: var(--erp-muted-bg);
}
.lc-sk-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.lc-sk-row i {
  height: 6px;
  border-radius: 2px;
  background: var(--erp-gray-400);
}
.lc-sk-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.lc-sk-grid > span {
  height: 22px;
  border-radius: 4px;
  background: var(--erp-card);
}
.lc-sk-line {
  background: linear-gradient(165deg, transparent 45%, var(--erp-gray-400) 46% 50%, transparent 51%) var(--erp-card) !important;
}
.lc-sk-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  padding: 4px;
}
.lc-sk-bars b {
  width: 5px;
  border-radius: 1px;
  background: var(--erp-gray-500);
}
.lc-sk-bars b:nth-child(1) {
  height: 40%;
}
.lc-sk-bars b:nth-child(2) {
  height: 75%;
}
.lc-sk-bars b:nth-child(3) {
  height: 55%;
}
.lc-sk-list {
  padding: 4px 6px;
  background: repeating-linear-gradient(180deg, var(--erp-gray-300) 0 2px, transparent 2px 6px) content-box var(--erp-card) !important;
}
.lc-sk-ring {
  background: radial-gradient(circle, var(--erp-card) 38%, var(--erp-gray-500) 40% 55%, var(--erp-card) 57%) !important;
}
</style>
