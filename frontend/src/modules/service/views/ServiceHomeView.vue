<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CalendarDays, ClipboardList, Plus, SlidersHorizontal } from '@lucide/vue'
import KpiCard from '@/components/erp/KpiCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { serviceApi } from '../api/service'
import type { ServiceHome } from '../types'
import { STAGE_GROUP } from './stages'

/** V01 · Service home (SvcHome.html). Part 1: what waits to be booked; part 2 adds today's jobs by person. */
const { can } = useSession()
const data = ref<ServiceHome | null>(null)
const loading = ref(true)
onMounted(async () => {
  try {
    data.value = await serviceApi.home()
  } finally {
    loading.value = false
  }
})

const TILES = [
  { title: 'Planning Board', to: '/service/board', icon: CalendarDays, shade: 'bg-mod-tile-1' },
  { title: 'Jobs', to: '/service/jobs', icon: ClipboardList, shade: 'bg-mod-tile-2' },
  { title: 'Slots and Stages', to: '/service/settings', icon: SlidersHorizontal, shade: 'bg-mod-tile-3' },
]
const oldest = computed(() => {
  const d = data.value?.notBooked.oldestDays
  return d === null || d === undefined ? 'Nothing waiting' : d === 0 ? 'Oldest waiting since today' : `Oldest waiting ${d} day${d === 1 ? '' : 's'}`
})
const s = (key: string) => data.value?.stages[key] ?? 0
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="m-0 text-xl font-bold">Service</h1>
      <p class="m-0 mt-1 text-[13px] text-erp-muted">Installation, service, warranty and repair jobs<template v-if="data">, today {{ formatDate(data.today) }}</template>.</p>
    </div>
    <div class="flex gap-2">
      <RouterLink to="/service/board" class="erp-btn erp-btn-secondary">Open planning board</RouterLink>
      <RouterLink v-if="can('service.job.edit')" to="/service/jobs/new" class="erp-btn erp-btn-add"><Plus :size="14" :stroke-width="2.5" aria-hidden="true" />New job</RouterLink>
    </div>
  </div>

  <div class="flex gap-4">
    <RouterLink
      v-for="t in TILES"
      :key="t.to"
      :to="t.to"
      class="flex h-[100px] w-[132px] flex-col items-center justify-center gap-2 rounded-xl p-2 text-center text-xs font-semibold text-erp-on-dark"
      :class="t.shade"
    >
      <span class="flex h-9 w-9 items-center justify-center rounded-full bg-erp-on-dark text-mod-accent">
        <component :is="t.icon" :size="18" aria-hidden="true" />
      </span>
      {{ t.title }}
    </RouterLink>
  </div>

  <div class="grid grid-cols-4 gap-4">
    <KpiCard label="Not booked" :value="data?.notBooked.count ?? ''" :sub="oldest" :loading="loading" to="/service/jobs?status=notBooked" :tone="(data?.notBooked.count ?? 0) > 0 ? 'warning' : 'default'" />
    <KpiCard label="Booked or accepted" :value="s('booked') + s('accepted')" sub="Booking comes with the planning board" :loading="loading" />
    <KpiCard label="Done, waiting for check" :value="s('done')" sub="The office checks before a job closes" :loading="loading" />
    <KpiCard label="All jobs" :value="s('all')" :sub="`${s('cancelled')} cancelled`" :loading="loading" to="/service/jobs" />
  </div>

  <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="m-0 text-[15px] font-bold">Waiting to be booked</h2>
      <span class="text-xs text-erp-muted">Oldest first. A released sales order with installation adds one here.</span>
    </div>
    <p v-if="data && !data.waiting.length" class="m-0 text-[13px] text-erp-muted">Nothing is waiting. Jobs appear here when a sales order with installation is released, or when the office adds one.</p>
    <table v-else-if="data" class="erp-table">
      <thead>
        <tr><th>Job</th><th>Type</th><th>Customer</th><th>From</th><th>Customer asks for</th><th>Stage</th></tr>
      </thead>
      <tbody>
        <tr v-for="j in data.waiting" :key="j.id">
          <td><RouterLink :to="`/service/jobs/${j.id}`" class="erp-link font-semibold whitespace-nowrap">{{ j.docNo }}</RouterLink></td>
          <td>{{ j.typeLabel }}</td>
          <td>{{ j.customerName }}</td>
          <td class="whitespace-nowrap">{{ j.salesOrderNo ?? 'Added by the office' }}</td>
          <td class="whitespace-nowrap">{{ j.whenText }}</td>
          <td><StatusChip :status="j.stage" :label="j.stageLabel" :group="STAGE_GROUP[j.stage]" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
