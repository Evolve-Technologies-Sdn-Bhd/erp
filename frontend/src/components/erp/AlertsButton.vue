<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Inbox } from '@lucide/vue'
import { notificationsApi, type Alert, type Alerts } from '@/api/notifications'
import { useSession } from '@/composables/useSession'
import { formatDateTime } from '@/utils/format'

/**
 * Alerts in every top bar (phase 5): orders about to be cancelled or cancelled automatically, jobs postponed,
 * rescheduled or at risk. Each person sees only their own; opening one marks it read and goes to what it is about.
 * Checked every minute and when the person changes.
 */
const REFRESH_MS = 60_000
const router = useRouter()
const { state } = useSession()
const data = ref<Alerts | null>(null)
const open = ref(false)
const root = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  try {
    data.value = await notificationsApi.list()
  } catch {
    data.value = null
  }
}
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), REFRESH_MS)
  document.addEventListener('pointerdown', onOutside)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('pointerdown', onOutside)
})
watch(() => state.version, () => void load())

function onOutside(e: PointerEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function toggle() {
  open.value = !open.value
  if (open.value) void load()
}
async function openAlert(a: Alert) {
  if (!a.read) data.value = await notificationsApi.read(a.id).catch(() => data.value)
  open.value = false
  if (a.link) void router.push(a.link)
}
async function readAll() {
  data.value = await notificationsApi.readAll().catch(() => data.value)
}
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      data-tour="alerts"
      class="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 font-[inherit] text-[13px] font-semibold text-erp-subtle transition-colors hover:bg-erp-head hover:text-erp-text"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="`Alerts, ${data?.unread ?? 0} unread`"
      title="Alerts"
      @click="toggle"
    >
      <Inbox :size="17" aria-hidden="true" />
      <span v-if="data?.unread" class="rounded-[10px] bg-mod-side px-[7px] py-px text-[11px] font-bold text-erp-on-dark">{{ data.unread }}</span>
    </button>
    <div
      v-if="open"
      role="dialog"
      aria-label="Alerts"
      class="absolute top-10 right-0 z-40 flex w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-erp-border bg-erp-card shadow-lg"
    >
      <div class="flex items-center justify-between gap-2 border-b border-erp-border px-4 py-2.5">
        <strong class="text-[13px]">Alerts</strong>
        <button v-if="data?.unread" type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 text-xs text-erp-link" @click="readAll">Mark all read</button>
      </div>
      <p v-if="!data?.items.length" class="m-0 px-4 py-6 text-center text-[13px] text-erp-muted">No alerts.</p>
      <ul v-else class="m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0">
        <li v-for="a in data.items" :key="a.id" class="border-b border-erp-border last:border-b-0">
          <button
            type="button"
            class="flex w-full cursor-pointer flex-col gap-0.5 border-0 px-4 py-2.5 text-left font-[inherit] transition-colors hover:bg-erp-head"
            :class="a.read ? 'bg-transparent' : 'bg-mod-light'"
            @click="openAlert(a)"
          >
            <span class="text-[13px]" :class="a.read ? 'font-medium' : 'font-bold'">{{ a.title }}</span>
            <span class="text-xs text-erp-muted">{{ a.body }}</span>
            <span class="text-[11px] text-erp-subtle">{{ formatDateTime(a.createdAt) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
