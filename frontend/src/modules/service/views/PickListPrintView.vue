<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PrintPreview from '@/components/erp/PrintPreview.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { formatQty } from '@/utils/format'
import { serviceStockApi } from '../api/service'
import type { StockDay } from '../types'

/** V12 · Pick list (phase 5): what the warehouse prepares, one list per job, for one job, one installer or the whole day. */
const route = useRoute()
const { state } = useSession()
const day = ref<StockDay | null>(null)
const query = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')
const person = ref(query('person'))
const signatures = ref(true)
onMounted(async () => {
  day.value = await serviceStockApi.day(query('date') || undefined)
})

const people = computed(() => [...new Map((day.value?.jobs ?? []).map((j) => [j.personId ?? '', j.personName ?? '—'])).entries()].map(([id, name]) => ({ id, name })))
const jobs = computed(() => (day.value?.jobs ?? []).filter((j) => (query('job') ? j.id === query('job') : !person.value || j.personId === person.value)).filter((j) => j.items.length))
const title = computed(() => `Pick list · ${day.value ? `${day.value.dateText} ${day.value.date.slice(0, 4)}` : ''}`)
const back = computed(() => `/service/stock?${new URLSearchParams({ ...(query('date') && { date: query('date') }), ...(person.value && { person: person.value }) }).toString()}`)
</script>

<template>
  <PrintPreview
    module="service" :back-to="back" back-label="Stock for Jobs" :heading="title" :footer="title" :file-title="title" :ready="!!day"
  >
    <template #options>
      <template v-if="!query('job')">
        <span class="font-bold">Installer</span>
        <select v-model="person" class="erp-input" aria-label="Installer">
          <option value="">Everyone</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </template>
      <div class="flex items-center justify-between border-b border-erp-row py-2"><span>Signature lines</span><SwitchToggle v-model="signatures" label="Signature lines" /></div>
      <p class="m-0 text-xs text-erp-muted">{{ jobs.length }} job{{ jobs.length === 1 ? '' : 's' }}. Parts the warehouse added are on it.</p>
    </template>

    <div v-if="day" class="flex flex-col gap-6 text-[12px]">
      <div class="flex items-baseline justify-between border-b-2 border-erp-text pb-2">
        <span class="text-[15px] font-bold">{{ state.tenantName }}</span>
        <span class="text-[15px] font-bold">Pick list</span>
      </div>
      <p v-if="!jobs.length" class="m-0 text-erp-muted">Nothing to pick.</p>
      <section v-for="j in jobs" :key="j.id" class="flex flex-col gap-2 [break-inside:avoid]">
        <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <span class="text-[14px] font-bold">{{ j.docNo }}<template v-if="j.salesOrderNo"> · {{ j.salesOrderNo }}</template></span>
          <span class="text-right font-bold">{{ day.dateText }} · {{ j.slotText }}</span>
          <span>{{ j.customerName }}<template v-if="j.phone"> · {{ j.phone }}</template></span>
          <span class="text-right">{{ j.personName }} · {{ j.typeLabel }}<template v-if="j.exchange">, one-to-one exchange</template></span>
          <span class="col-span-2 text-erp-muted">{{ j.siteAddress }}</span>
        </div>
        <table class="w-full border-collapse">
          <thead><tr class="border-b border-erp-text text-left"><th class="py-1">Item</th><th class="py-1">Description</th><th class="py-1 text-right">Quantity</th><th class="w-16 py-1 text-center">Picked</th></tr></thead>
          <tbody>
            <tr v-for="i in j.items" :key="i.itemCode" class="border-b border-erp-border">
              <td class="py-1 pr-3 font-semibold whitespace-nowrap">{{ i.itemCode }}</td>
              <td class="py-1 pr-3">{{ i.itemName }}<template v-if="!i.counted"> (no RFID tag)</template></td>
              <td class="py-1 text-right whitespace-nowrap">{{ formatQty(i.needed) }} {{ i.uomCode }}</td>
              <td class="py-1 text-center"><span class="inline-block h-3.5 w-3.5 border border-erp-text" aria-hidden="true" /></td>
            </tr>
          </tbody>
        </table>
        <div v-if="signatures" class="mt-10 grid grid-cols-2 gap-10 text-[11px] text-erp-muted">
          <span class="border-t border-erp-text pt-1">Picked by<template v-if="j.confirmedBy">: {{ j.confirmedBy }}</template></span>
          <span class="border-t border-erp-text pt-1">Signed by<template v-if="j.pickSignedBy">: {{ j.pickSignedBy }}</template></span>
        </div>
      </section>
    </div>
  </PrintPreview>
</template>
