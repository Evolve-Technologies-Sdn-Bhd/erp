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
import { Clock, Inbox, Plus } from '@lucide/vue'
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
      return page ? { key, label: page.label, module: m.label, to: page.to, code } : null
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .slice(0, 8)
})

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
        <div class="mx-auto flex w-full max-w-[1200px] flex-col gap-7 md:py-2">
          <div>
            <h1 class="m-0 text-[28px] leading-tight font-semibold">{{ hello }}</h1>
            <p class="mt-1 mb-0 text-sm text-erp-muted">
              {{ today ? formatLongDate(today) : '' }}<template v-if="state.tenantName"> · {{ state.tenantName }}</template>
            </p>
          </div>

          <WelcomeCard />

          <NoticeBanner v-if="passwordDue" kind="warning">
            It is time to change your password. <RouterLink to="/account" class="erp-link font-semibold">Change it in My account</RouterLink>
          </NoticeBanner>

          <section aria-labelledby="launcher-modules" class="flex flex-col gap-3">
            <h2 id="launcher-modules" class="erp-display m-0 text-xl font-semibold tracking-[-0.02em]">Modules</h2>
            <!-- One card per module: its grainy gradient as the art, its name and purpose set on it. The row reflows by
                 width, so adding a module never strands one card. -->
            <ul data-tour="launcher:tiles" class="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[480px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
              <li v-for="tile in sortedTiles" :key="tile.code">
                <!-- Built module: the whole card is the link (stretched over it); the star sits above it -->
                <div
                  v-if="isBuilt(tile)"
                  class="lc-card erp-mesh group flex aspect-[4/3] min-h-[9.5rem] flex-col justify-between rounded-[1.5rem] p-4 text-erp-on-dark"
                  :style="meshStyle(TILE_STYLE[tile.code])"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="lc-icon" aria-hidden="true"><component :is="TILE_STYLE[tile.code].icon" :size="18" /></span>
                    <button
                      type="button"
                      class="lc-star relative z-10"
                      :class="{ 'is-on': tile.code === defaultModule }"
                      :aria-pressed="tile.code === defaultModule"
                      :title="tile.code === defaultModule ? 'Opens first after you sign in' : 'Set as default module'"
                      @click="setDefault(tile)"
                    >
                      <Star :size="13" :fill="tile.code === defaultModule ? 'currentColor' : 'none'" aria-hidden="true" />
                      {{ tile.code === defaultModule ? 'Default' : 'Set default' }}
                    </button>
                  </div>
                  <div class="lc-text min-w-0 pr-12">
                    <RouterLink :to="tile.route!" class="lc-name erp-display block text-lg leading-tight font-semibold text-erp-on-dark outline-none">
                      {{ tile.name }}
                    </RouterLink>
                    <span class="mt-1 line-clamp-2 block text-xs text-erp-on-dark/80">{{ TILE_STYLE[tile.code].description }}</span>
                    <span v-if="waiting[tile.code]" class="lc-badge mt-2 inline-flex">{{ waiting[tile.code] }} waiting for you</span>
                  </div>
                  <!-- "Open", the MES play button: shows on hover or focus -->
                  <span class="lc-open" aria-hidden="true"><ArrowRight :size="16" /></span>
                </div>

                <!-- Not in this app yet, or not in the person's roles -->
                <div
                  v-else
                  class="flex aspect-[4/3] min-h-[9.5rem] flex-col justify-between rounded-[1.5rem] border border-dashed border-erp-input bg-erp-card p-4"
                  aria-disabled="true"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="lc-icon-quiet" :style="{ '--tile-color': TILE_STYLE[tile.code].color }" aria-hidden="true">
                      <component :is="TILE_STYLE[tile.code].icon" :size="18" />
                    </span>
                    <span
                      v-if="tile.state === 'NO_ACCESS'"
                      class="flex items-center gap-1 rounded-full bg-erp-muted-bg px-2.5 py-0.5 text-xs font-medium text-erp-muted"
                      title="Not part of your role. Ask your administrator if you need it."
                    >
                      <Lock :size="12" aria-hidden="true" />No access
                    </span>
                    <span v-else class="rounded-full bg-erp-muted-bg px-2.5 py-0.5 text-xs font-medium text-erp-muted">Coming soon</span>
                  </div>
                  <div class="min-w-0">
                    <span class="erp-display block text-lg leading-tight font-semibold text-erp-subtle">{{ tile.name }}</span>
                    <span class="mt-1 line-clamp-2 block text-xs text-erp-muted">{{ TILE_STYLE[tile.code].description }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <!-- What waits for you: one strip, cells split by hairlines (MES SummaryCards) -->
          <section aria-labelledby="launcher-waiting" class="flex flex-col gap-3">
            <h2 id="launcher-waiting" class="erp-display m-0 text-xl font-semibold tracking-[-0.02em]">Waiting for you</h2>
            <div class="lc-strip">
              <RouterLink v-for="c in waitingCells" :key="c.code" :to="c.to" class="lc-cell">
                <span class="text-[13px] font-medium text-erp-muted">{{ c.label }}</span>
                <span class="erp-display erp-num text-[28px] leading-none font-semibold" :class="c.count ? 'text-note-warn-strong' : 'text-erp-text'">{{ c.count }}</span>
              </RouterLink>
              <div class="lc-cell">
                <span class="flex items-center gap-1.5 text-[13px] font-medium text-erp-muted"><Inbox :size="14" aria-hidden="true" />Unread alerts</span>
                <span class="erp-display erp-num text-[28px] leading-none font-semibold">{{ unread }}</span>
              </div>
            </div>
          </section>

          <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <!-- Recently opened -->
            <section aria-labelledby="launcher-recent" class="erp-card flex min-w-0 flex-col gap-3 p-5">
              <h2 id="launcher-recent" class="m-0 flex items-center gap-2 text-base font-semibold"><Clock :size="16" class="text-erp-muted" aria-hidden="true" />Recently opened</h2>
              <p v-if="!recents.length" class="m-0 text-[13px] text-erp-muted">Pages you open from a module's menu show here.</p>
              <ul v-else class="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
                <li v-for="r in recents" :key="r.key">
                  <RouterLink :to="r.to" class="flex items-center gap-3 rounded-xl px-2 py-1.5 text-erp-text no-underline hover:bg-erp-hover">
                    <span class="erp-mesh lc-mini" :style="meshStyle(TILE_STYLE[r.code])" aria-hidden="true"><component :is="TILE_STYLE[r.code].icon" :size="14" /></span>
                    <span class="min-w-0">
                      <span class="block truncate text-[13px] font-medium">{{ r.label }}</span>
                      <span class="block truncate text-xs text-erp-muted">{{ r.module }}</span>
                    </span>
                  </RouterLink>
                </li>
              </ul>
            </section>

            <!-- Quick actions -->
            <section v-if="quick.length" aria-labelledby="launcher-quick" class="erp-card flex flex-col gap-3 p-5">
              <h2 id="launcher-quick" class="m-0 text-base font-semibold">Start something</h2>
              <div class="flex flex-wrap gap-2">
                <RouterLink v-for="q in quick" :key="q.to" :to="q.to" class="lc-pill">
                  <Plus :size="14" aria-hidden="true" />{{ q.label }}
                </RouterLink>
              </div>
            </section>
          </div>
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
