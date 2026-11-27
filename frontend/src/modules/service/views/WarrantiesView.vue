<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
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
import { serviceWarrantiesApi } from '../api/service'
import type { Warranty } from '../types'

/** V11 · Warranties (phase 5): the units installed, what is covered until when, and claims on them. */
const toast = useToast()
const router = useRouter()
const list = useListPage({ filterKeys: [], fetch: serviceWarrantiesApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Waiting for payment' },
  { key: 'expired', label: 'Expired' },
  { key: 'void', label: 'Void' },
]
const GROUP = { ACTIVE: 'done', PENDING: 'pending', EXPIRED: 'draft', VOID: 'cancelled' } as const

type Ask = 'claim' | 'serial' | 'void'
const ask = ref<Ask | null>(null)
const unit = ref<Warranty | null>(null)
const form = reactive({ problem: '', preferredDate: '', serialNo: '', reason: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const TITLE: Record<Ask, string> = { claim: 'New claim', serial: 'Serial number', void: 'Make void' }
const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (v: unknown) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : '')
const toDate = (v: string) => (v ? new Date(`${v}T00:00:00`) : null)

function open(what: Ask, w: Warranty) {
  Object.assign(form, { problem: '', preferredDate: '', serialNo: w.serialNo ?? '', reason: '' })
  errors.value = {}
  unit.value = w
  ask.value = what
}
async function save() {
  const w = unit.value!
  saving.value = true
  try {
    if (ask.value === 'claim') {
      const job = await serviceWarrantiesApi.claim(w.id, { problem: form.problem.trim(), preferredDate: form.preferredDate || undefined })
      toast.add({ severity: 'success', summary: `${job.docNo} added`, detail: 'Decide the claim, then book it.', life: 3500 })
      await router.push(`/service/jobs/${job.id}`)
      return
    }
    if (ask.value === 'serial') await serviceWarrantiesApi.update(w.id, w.version, form.serialNo)
    else await serviceWarrantiesApi.makeVoid(w.id, w.version, form.reason)
    ask.value = null
    toast.add({ severity: 'success', summary: 'Saved', life: 2500 })
    await list.reload()
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="erp-card erp-listcard flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="Warranties" subtitle="Units installed with a warranty, from the installation day. A warranty is active once its order is fully paid." />
    <FilterBar>
      <input :value="list.params.value.q" class="erp-input min-w-[320px]" placeholder="Search phone, customer, order or serial" aria-label="Search" @change="list.setFilter('q', ($event.target as HTMLInputElement).value)" />
    </FilterBar>
    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />
    <DataList :rows="rows" :loading="list.loading.value" empty-text="No warranties. Set Warranty (months) on an item in Core; a complete installation registers it here.">
      <Column header="Unit">
        <template #body="{ data }: { data: Warranty }"><span class="font-semibold">{{ data.itemCode }}</span> · {{ formatQty(data.qty) }} {{ data.uomCode }}<div class="text-xs text-erp-muted">{{ data.itemName }}</div></template>
      </Column>
      <Column header="Serial number">
        <template #body="{ data }: { data: Warranty }">{{ data.serialNo ?? '—' }}</template>
      </Column>
      <Column header="Customer">
        <template #body="{ data }: { data: Warranty }">{{ data.customerName }}<div class="text-xs text-erp-muted">{{ data.phone ?? '—' }}</div></template>
      </Column>
      <Column header="Installed">
        <template #body="{ data }: { data: Warranty }"><RouterLink :to="`/service/jobs/${data.jobId}`" class="erp-link font-semibold">{{ data.jobNo }}</RouterLink><div class="text-xs text-erp-muted">{{ data.salesOrderNo ?? 'No order' }}</div></template>
      </Column>
      <Column header="Covered">
        <template #body="{ data }: { data: Warranty }">{{ formatDate(data.startOn) }} – {{ formatDate(data.endOn) }}<div class="text-xs text-erp-muted">{{ data.warrantyMonths }} months</div></template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: Warranty }"><StatusChip :status="data.state" :label="data.stateLabel" :group="GROUP[data.state]" /><div v-if="data.voidReason" class="text-xs text-erp-muted">{{ data.voidReason }}</div></template>
      </Column>
      <Column header="">
        <template #body="{ data }: { data: Warranty }">
          <span v-if="data.canEdit" class="flex justify-end gap-3 text-xs whitespace-nowrap">
            <button type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 font-semibold" @click="open('claim', data)">New claim</button>
            <button type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0" @click="open('serial', data)">Serial</button>
            <button type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0" @click="open('void', data)">Void</button>
          </span>
        </template>
      </Column>
    </DataList>
    <div v-if="paged && list.data.value" class="mt-auto pt-2"><Pager :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" /></div>

    <Dialog :visible="Boolean(ask)" data-tour="svc:warranty-ask" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="ask ? `${TITLE[ask]} · ${unit?.itemCode}` : ''" @update:visible="ask = null">
      <div class="flex flex-col gap-3 text-[13px]">
        <p class="m-0">{{ unit?.customerName }} · {{ unit?.stateLabel }}</p>
        <template v-if="ask === 'claim'">
          <FormField label="What is wrong?" :error="errors.problem" for="wr-problem"><textarea id="wr-problem" v-model="form.problem" rows="3" class="erp-input h-auto py-2" maxlength="2000" /></FormField>
          <FormField label="Date the customer asks for (optional)" :error="errors.preferredDate" for="wr-date">
            <DatePicker input-id="wr-date" :model-value="toDate(form.preferredDate)" date-format="d M yy" show-icon show-button-bar fluid class="erp-date" @update:model-value="form.preferredDate = toIso($event)" />
          </FormField>
        </template>
        <FormField v-else-if="ask === 'serial'" label="Serial number" for="wr-serial"><input id="wr-serial" v-model="form.serialNo" class="erp-input" maxlength="60" /></FormField>
        <FormField v-else label="Why is it void?" :error="errors.reason" for="wr-void"><input id="wr-void" v-model="form.reason" class="erp-input" maxlength="300" /></FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="ask = null">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="saving || (ask === 'claim' && !form.problem.trim())" @click="save">{{ ask === 'claim' ? 'Add warranty job' : 'Save' }}</button>
      </template>
    </Dialog>
  </section>
</template>
