<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Check, House, LayoutGrid } from '@lucide/vue'
import { sessionApi, type ModuleTile } from '@/api/session'
import { useSession } from '@/composables/useSession'
import { MODULES, type ModuleDef } from '@/modules/registry'
import { isBuilt, meshStyle, TILE_STYLE } from '@/modules/tiles'

/**
 * Jump to another module in one click (MES ModuleSwitcher): the round button in the top bar opens a panel with Home
 * (all modules) and each module the person can open, on its own gradient tile, with what is waiting for them there.
 * Attributes (data-tour) go on the button.
 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ module?: ModuleDef | null; onLauncher?: boolean }>()

const { state } = useSession()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

// The person's modules, loaded once per user (the session version bumps on a user or branch switch).
const tiles = ref<ModuleTile[]>([])
const waiting = reactive<Record<string, number>>({})
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
watch(() => state.version, () => (open.value ? void load() : (loadedFor = -1)))

async function loadWaiting() {
  for (const t of tiles.value) {
    const fetchCount = MODULES[t.code as keyof typeof MODULES].approvalsCount
    if (!fetchCount) continue
    fetchCount()
      .then((c) => (waiting[t.code] = c.waitingForMe))
      .catch(() => undefined)
  }
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  await load()
  void loadWaiting()
}

const items = computed(() => tiles.value.map((t) => ({ ...t, style: TILE_STYLE[t.code], current: t.code === props.module?.key })))
const HOME_TILE = { color: 'var(--tile-home)', deep: 'var(--tile-home-deep)', glow: 'var(--tile-home-glow)' }

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      v-bind="$attrs"
      class="ms-trigger"
      :class="{ 'is-open': open }"
      :aria-label="onLauncher ? 'Switch module' : `Switch module (in ${module?.label ?? 'a module'})`"
      title="Switch module"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <House v-if="onLauncher" :size="20" aria-hidden="true" />
      <LayoutGrid v-else :size="20" aria-hidden="true" />
    </button>

    <Transition name="ms-pop">
      <div v-if="open" role="menu" aria-label="Switch module" class="ms-panel absolute top-full left-0 z-50 mt-2 w-[19rem] max-w-[calc(100vw-2rem)]">
        <p class="m-0 px-2 pt-1 pb-1.5 text-[11px] font-semibold text-erp-muted">Go to</p>
        <RouterLink to="/" role="menuitem" class="ms-row" :class="{ 'is-on': onLauncher }" @click="open = false">
          <span class="erp-mesh ms-tile" :style="meshStyle(HOME_TILE)" aria-hidden="true"><LayoutGrid :size="15" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-semibold text-erp-text">Home</span>
            <span class="block truncate text-xs text-erp-muted">All modules</span>
          </span>
          <Check v-if="onLauncher" :size="16" class="shrink-0 text-mod-primary" aria-hidden="true" />
        </RouterLink>
        <div class="my-1 h-px bg-erp-row" role="separator" />
        <div class="max-h-[min(26rem,calc(100vh-10rem))] overflow-y-auto">
          <p v-if="!items.length" class="m-0 px-2 py-2 text-[13px] text-erp-muted">Loading…</p>
          <RouterLink
            v-for="t in items"
            :key="t.code"
            :to="t.route!"
            role="menuitem"
            class="ms-row"
            :class="{ 'is-on': t.current }"
            :aria-current="t.current ? 'page' : undefined"
            @click="open = false"
          >
            <span class="erp-mesh ms-tile" :style="meshStyle(t.style)" aria-hidden="true"><component :is="t.style.icon" :size="15" /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-semibold text-erp-text">{{ t.name }}</span>
              <span class="block truncate text-xs text-erp-muted">{{ t.style.description }}</span>
            </span>
            <span v-if="waiting[t.code]" class="shrink-0 rounded-full bg-chip-pending-bg px-2 py-px text-[11px] font-semibold text-chip-pending-text">
              {{ waiting[t.code] }}
            </span>
            <Check v-if="t.current" :size="16" class="shrink-0 text-mod-primary" aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ms-trigger {
  display: flex;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: var(--erp-muted-bg);
  color: var(--erp-gray-600);
  transition:
    transform 150ms,
    background-color 150ms,
    color 150ms;
}
.ms-trigger:hover,
.ms-trigger.is-open {
  transform: scale(1.05);
  background: var(--erp-muted-bg-hover);
  color: var(--erp-text);
}
.ms-trigger:focus-visible {
  outline: 2px solid var(--erp-text);
  outline-offset: 2px;
}
.ms-panel {
  padding: 6px;
  border: 1px solid var(--dd-border);
  border-radius: 14px;
  background: var(--dd-bg);
  box-shadow: var(--dd-shadow);
}
.ms-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border-radius: 10px;
  padding: 6px 8px;
  text-align: left;
  text-decoration: none;
  transition: background-color 120ms;
}
.ms-row:hover,
.ms-row:focus-visible {
  background: var(--dd-hover);
  outline: none;
}
.ms-row.is-on {
  background: var(--erp-hover-bg);
}
.ms-tile {
  --mesh-blur: 6px;
  display: flex;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: var(--erp-on-dark);
}
.ms-pop-enter-active,
.ms-pop-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: top left;
}
.ms-pop-enter-from,
.ms-pop-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .ms-pop-enter-active,
  .ms-pop-leave-active {
    transition: none;
  }
}
</style>
