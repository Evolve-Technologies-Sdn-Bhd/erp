<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import DataList from '@/components/erp/DataList.vue'
import FilterBar from '@/components/erp/FilterBar.vue'
import FormField from '@/components/erp/FormField.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { formatDate, formatQty } from '@/utils/format'
import { serviceReturnsApi } from '../api/service'
import type { ReturnedPart } from '../types'

/** V10 · Returned Parts (phase 5): what installers say comes back from their jobs, and what the store received. */
const toast = useToast()
const list = useListPage({ filterKeys: [], fetch: serviceReturnsApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'expected', label: 'Not received' },
  { key: 'received', label: 'Received' },
]

const part = ref<ReturnedPart | null>(null)
const form = reactive({ goodQty: '', damagedQty: '0', note: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
function open(r: ReturnedPart) {
  Object.assign(form, { goodQty: String(Number(r.qty)), damagedQty: '0', note: '' })
  errors.value = {}
  part.value = r
}
async function receive() {
  const r = part.value!
  saving.value = true
  try {
    const done = await serviceReturnsApi.receive(r.id, { version: r.version, goodQty: form.goodQty.trim() || '0', damagedQty: form.damagedQty.trim() || '0', note: form.note.trim() || undefined })
    part.value = null
    toast.add({ severity: 'success', summary: `${done.itemCode} received`, detail: done.receivedText ?? undefined, life: 3000 })
    await list.reload()
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="erp-card flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="Returned Parts" subtitle="Parts installers bring back from their jobs. The store counts them as good or damaged; the warehouse system counts the stock when they are scanned." />
    <FilterBar>
      <input :value="list.params.value.q" class="erp-input" placeholder="Search job, customer, item or person" aria-label="Search" @change="list.setFilter('q', ($event.target as HTMLInputElement).value)" />
    </FilterBar>
    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />
    <DataList :rows="rows" :loading="list.loading.value" empty-text="No returned parts. They are listed when a visit is recorded.">
      <Column header="Job">
        <template #body="{ data }: { data: ReturnedPart }"><RouterLink :to="`/service/jobs/${data.jobId}`" class="erp-link font-semibold">{{ data.jobNo }}</RouterLink><div class="text-xs text-erp-muted">{{ data.customerName }}</div></template>
      </Column>
      <Column header="Item">
        <template #body="{ data }: { data: ReturnedPart }"><span class="font-semibold">{{ data.itemCode }}</span><div class="text-xs text-erp-muted">{{ data.itemName }}</div></template>
      </Column>
      <Column header="Coming back" class="erp-col-num">
        <template #body="{ data }: { data: ReturnedPart }">{{ formatQty(data.qty) }} {{ data.uomCode }}</template>
      </Column>
      <Column header="From">
        <template #body="{ data }: { data: ReturnedPart }">{{ data.personName ?? '—' }}<div class="text-xs text-erp-muted">{{ formatDate(data.createdAt.slice(0, 10)) }}</div></template>
      </Column>
      <Column header="Received">
        <template #body="{ data }: { data: ReturnedPart }">
          <template v-if="data.receivedAt">
            <StatusChip status="RECEIVED" :label="data.receivedText ?? 'Received'" group="done" />
            <div class="text-xs text-erp-muted">{{ data.receivedBy }}<template v-if="data.note"> · {{ data.note }}</template></div>
          </template>
          <button v-else-if="data.canReceive" type="button" class="erp-btn erp-btn-secondary" @click="open(data)">Receive</button>
          <StatusChip v-else status="EXPECTED" label="Not received" group="pending" />
        </template>
      </Column>
    </DataList>
    <div v-if="paged && list.data.value" class="mt-auto pt-2"><Pager :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" /></div>

    <Dialog :visible="Boolean(part)" data-tour="svc:receive" modal :draggable="false" class="erp-dialog" :style="{ width: '440px' }" :header="`Receive ${part?.itemCode ?? ''} from ${part?.jobNo ?? ''}`" @update:visible="part = null">
      <div class="grid grid-cols-2 gap-3 text-[13px]">
        <p class="col-span-2 m-0">{{ part ? formatQty(part.qty) : '' }} {{ part?.uomCode }} {{ part?.itemName }} said to come back.</p>
        <FormField label="Good" :error="errors.goodQty" for="rt-good"><input id="rt-good" v-model="form.goodQty" class="erp-input text-right" inputmode="decimal" /></FormField>
        <FormField label="Damaged" :error="errors.damagedQty" for="rt-damaged"><input id="rt-damaged" v-model="form.damagedQty" class="erp-input text-right" inputmode="decimal" /></FormField>
        <FormField label="Note (needed when something is missing)" :error="errors.note" class="col-span-2" for="rt-note"><input id="rt-note" v-model="form.note" class="erp-input" maxlength="300" /></FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="part = null">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="saving" @click="receive">Receive</button>
      </template>
    </Dialog>
  </section>
</template>
