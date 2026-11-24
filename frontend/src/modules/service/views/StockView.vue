<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { formatDateTime, formatQty } from '@/utils/format'
import { serviceStockApi } from '../api/service'
import type { StockDay, StockJob } from '../types'

/**
 * V09 · Stock for Jobs (phase 5): the warehouse's list of a day's booked jobs, tomorrow first. Each job shows what it
 * needs, what is free once earlier jobs have theirs, and whether the warehouse has confirmed it. Confirming is their
 * word: short figures warn, they never block. A confirmed job gets its delivery order 24 hours before.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const day = ref<StockDay | null>(null)
const busy = ref('')
const asked = computed(() => (typeof route.query.date === 'string' ? route.query.date : undefined))

async function load() {
  day.value = await serviceStockApi.day(asked.value)
}
onMounted(load)
watch(asked, load)

function shift(days: number) {
  const d = new Date(`${day.value!.date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  void router.replace({ query: { ...route.query, date: d.toISOString().slice(0, 10) } })
}

async function act(j: StockJob, what: 'confirm' | 'undo') {
  busy.value = j.id
  try {
    day.value = await serviceStockApi[what](j.id, j.version)
    toast.add({ severity: 'success', summary: what === 'confirm' ? `${j.docNo} stock confirmed` : `${j.docNo} not confirmed`, life: 3000 })
  } catch {
    await load()
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="erp-card flex grow flex-col gap-4 px-6 py-[18px]">
    <PageHeader title="Stock for Jobs" subtitle="What a day's booked jobs need. Confirm each one once the goods are there; its delivery order is made 24 hours before the job." />

    <div v-if="!day" class="py-10 text-center text-[13px] text-erp-muted">Loading…</div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Day before" @click="shift(-1)"><ChevronLeft :size="16" /></button>
        <span class="min-w-[170px] text-center text-[15px] font-bold">{{ day.dateText }} {{ day.date.slice(0, 4) }}</span>
        <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Next day" @click="shift(1)"><ChevronRight :size="16" /></button>
        <span class="ml-auto text-[13px]">
          <strong>{{ day.counts.jobs }}</strong> job{{ day.counts.jobs === 1 ? '' : 's' }} · <strong>{{ day.counts.confirmed }}</strong> confirmed
          <template v-if="day.counts.short"> · <strong class="text-chip-cancelled-text">{{ day.counts.short }}</strong> short</template>
        </span>
      </div>

      <NoticeBanner v-if="!day.on" kind="warning">The warehouse does not confirm stock yet. Turn it on in Service › Slots and Stages to confirm jobs here and get their delivery orders made.</NoticeBanner>
      <p v-if="!day.jobs.length" class="m-0 py-8 text-center text-[13px] text-erp-muted">No booked jobs need stock on this day.</p>

      <article v-for="j in day.jobs" :key="j.id" data-tour="svc:stock-job" class="flex flex-col gap-2 rounded-xl border px-4 py-3" :class="j.atRisk ? 'border-note-error-border' : 'border-erp-border'">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <RouterLink :to="`/service/jobs/${j.id}`" class="erp-link font-semibold">{{ j.docNo }}</RouterLink>
          <span class="font-semibold">{{ j.slotText }}</span>
          <span>{{ j.personName }}</span>
          <span class="text-erp-muted">{{ j.typeLabel }} · {{ j.customerName }}<template v-if="j.salesOrderNo"> · {{ j.salesOrderNo }}</template><template v-if="j.warehouseCode"> · {{ j.warehouseCode }}</template></span>
          <span class="ml-auto flex items-center gap-2">
            <RouterLink v-if="j.deliveryId" :to="`/sales/deliveries/${j.deliveryId}`" class="erp-link font-semibold">{{ j.deliveryNo }}</RouterLink>
            <StatusChip v-if="j.atRisk" status="AT_RISK" label="At risk" group="cancelled" :title="j.atRiskNote ?? ''" />
            <StatusChip v-if="j.confirmedAt" status="CONFIRMED" label="Stock confirmed" group="done" :title="`${j.confirmedBy}, ${formatDateTime(j.confirmedAt)}`" />
            <button v-if="j.canUndo" type="button" class="erp-btn erp-btn-secondary" :disabled="busy === j.id" @click="act(j, 'undo')">Undo</button>
            <button v-if="j.canConfirm" type="button" data-tour="action:confirm-stock" class="erp-btn erp-btn-primary" :disabled="busy === j.id" @click="act(j, 'confirm')">Confirm stock</button>
          </span>
        </div>
        <table class="erp-table">
          <thead><tr><th>Item</th><th class="num">Needed</th><th class="num">On hand</th><th class="num">Held by earlier jobs</th><th class="num">Free</th></tr></thead>
          <tbody>
            <tr v-for="i in j.items" :key="i.itemCode">
              <td><span class="font-semibold">{{ i.itemCode }}</span> <span class="text-xs text-erp-muted">{{ i.itemName }}</span></td>
              <td class="num">{{ formatQty(i.needed) }} {{ i.uomCode }}</td>
              <td class="num">{{ formatQty(i.onHand) }}</td>
              <td class="num">{{ formatQty(i.earlier) }}</td>
              <td class="num" :class="i.short ? 'font-bold text-chip-cancelled-text' : ''">{{ formatQty(i.free) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="j.shortText && !j.confirmedAt" class="m-0 text-xs text-attention">Short: {{ j.shortText }}. You can still confirm if the goods are really there.</p>
      </article>
    </template>
  </section>
</template>
