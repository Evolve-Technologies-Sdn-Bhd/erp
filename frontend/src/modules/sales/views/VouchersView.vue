<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Column from 'primevue/column'
import DatePicker from 'primevue/datepicker'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import DataList from '@/components/erp/DataList.vue'
import FilterBar from '@/components/erp/FilterBar.vue'
import FormField from '@/components/erp/FormField.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { useSession } from '@/composables/useSession'
import { formatDate, formatRm } from '@/utils/format'
import { salesVouchersApi } from '../api/sales'
import type { VoucherRow } from '../types'

/** S37 · Vouchers (phase 5): the list Sales Support keeps. Salespeople pick one on the order and never type an amount. */
const toast = useToast()
const confirm = useConfirm()
const { today } = useSession()
const list = useListPage({ fetch: salesVouchersApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const canManage = computed(() => Boolean(list.data.value?.canManage))
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))

const TABS = [
  { key: 'running', label: 'Running' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ended', label: 'Ended or used up' },
  { key: 'all', label: 'All' },
]
const GROUP: Record<VoucherRow['status'], 'done' | 'pending' | 'draft' | 'cancelled'> = { RUNNING: 'done', SCHEDULED: 'pending', USED_UP: 'draft', ENDED: 'cancelled' }

const search = ref(list.params.value.q)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => list.setFilter('q', (v ?? '').trim()), 300)
})

// ── Add or change one ────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const isoToDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`) : null)
const dateToIso = (value: unknown) => (value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : '')
const editing = ref<VoucherRow | null>(null)
const form = reactive({ voucherNo: '', description: '', amount: '', validFrom: '', validUntil: '', maxUses: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)

function startNew() {
  editing.value = null
  errors.value = {}
  Object.assign(form, { voucherNo: '', description: '', amount: '', validFrom: today.value, validUntil: '', maxUses: '' })
}
watch(today, (t) => t && !form.validFrom && startNew(), { immediate: true })

function edit(v: VoucherRow) {
  editing.value = v
  errors.value = {}
  Object.assign(form, { voucherNo: v.voucherNo, description: v.description, amount: v.amount, validFrom: v.validFrom, validUntil: v.validUntil ?? '', maxUses: v.maxUses === null ? '' : String(v.maxUses) })
}

async function save() {
  saving.value = true
  errors.value = {}
  const uses = form.maxUses.trim()
  const body = { voucherNo: form.voucherNo, description: form.description, amount: form.amount.trim(), validFrom: form.validFrom, validUntil: form.validUntil || null, maxUses: uses ? Number(uses) : null }
  try {
    const v = editing.value ? await salesVouchersApi.update(editing.value.id, { ...body, version: editing.value.version }) : await salesVouchersApi.create(body)
    toast.add({ severity: 'success', summary: `${v.voucherNo} ${editing.value ? 'saved' : 'added'}`, detail: `${formatRm(v.amount)} off, ${v.statusLabel.toLowerCase()}.`, life: 3500 })
    startNew()
    await list.reload()
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}

function end(v: VoucherRow) {
  confirm.require({
    header: `End ${v.voucherNo} today?`,
    message: 'Today is its last day. Orders that have it keep it.',
    acceptLabel: 'End it',
    rejectLabel: 'Keep it running',
    accept: async () => {
      await salesVouchersApi.end(v.id, v.version)
      toast.add({ severity: 'success', summary: `${v.voucherNo} ends today`, life: 3000 })
      await list.reload()
    },
  })
}

function remove(v: VoucherRow) {
  confirm.require({
    header: `Delete ${v.voucherNo}?`,
    message: 'No order uses it.',
    acceptLabel: 'Delete',
    rejectLabel: 'Keep it',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await salesVouchersApi.remove(v.id, v.version)
      toast.add({ severity: 'success', summary: `${v.voucherNo} deleted`, life: 3000 })
      if (editing.value?.id === v.id) startNew()
      await list.reload()
    },
  })
}
</script>

<template>
  <div class="grid grow items-start gap-4" :class="canManage ? 'grid-cols-[minmax(0,1fr)_320px]' : ''">
    <section class="erp-card flex min-h-[560px] flex-col gap-3 px-6 py-[18px]">
      <PageHeader title="Vouchers" subtitle="What salespeople may take off an order. They pick one from this list; the amount is never typed." />
      <NoticeBanner v-if="list.data.value && !list.data.value.on" kind="info">
        Vouchers are still typed on the order. Turn on <em>Vouchers come from the voucher list</em> in Operation Policies › Sales Flow to use this list.
      </NoticeBanner>
      <FilterBar><input v-model="search" class="erp-input" placeholder="Voucher number or name" aria-label="Search voucher number or name" /></FilterBar>
      <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />

      <DataList :rows="rows" :loading="list.loading.value" empty-text="No vouchers here.">
        <Column header="Voucher">
          <template #body="{ data }: { data: VoucherRow }"><div class="font-bold whitespace-nowrap">{{ data.voucherNo }}</div><div class="text-xs text-erp-muted">{{ data.description }}</div></template>
        </Column>
        <Column header="Off (RM)" class="erp-col-num"><template #body="{ data }: { data: VoucherRow }"><MoneyText :value="data.amount" /></template></Column>
        <Column header="From"><template #body="{ data }: { data: VoucherRow }"><span class="whitespace-nowrap">{{ formatDate(data.validFrom) }}</span></template></Column>
        <Column header="Until"><template #body="{ data }: { data: VoucherRow }"><span class="whitespace-nowrap" :class="{ 'text-erp-subtle': !data.validUntil }">{{ data.validUntil ? formatDate(data.validUntil) : 'No end' }}</span></template></Column>
        <Column header="Orders"><template #body="{ data }: { data: VoucherRow }"><span class="erp-num whitespace-nowrap">{{ data.usesText }}</span></template></Column>
        <Column header="Status"><template #body="{ data }: { data: VoucherRow }"><StatusChip :status="data.status" :label="data.statusLabel" :group="GROUP[data.status]" /></template></Column>
        <Column v-if="canManage" header="">
          <template #body="{ data }: { data: VoucherRow }">
            <div class="flex justify-end gap-2">
              <button v-if="data.allowedActions.includes('edit')" type="button" class="erp-btn erp-btn-secondary h-[28px] px-2.5 text-xs" @click="edit(data)">Change</button>
              <button v-if="data.allowedActions.includes('end')" type="button" class="erp-btn erp-btn-secondary h-[28px] px-2.5 text-xs" @click="end(data)">End</button>
              <button v-if="data.allowedActions.includes('delete')" type="button" class="erp-btn erp-btn-danger h-[28px] px-2.5 text-xs" @click="remove(data)">Delete</button>
            </div>
          </template>
        </Column>
      </DataList>

      <div v-if="paged" class="mt-auto flex items-center justify-end pt-2">
        <Pager v-if="list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
      </div>
    </section>

    <div v-if="canManage" class="flex flex-col gap-4">
      <SideCard data-tour="vc:form" :title="editing ? `Change ${editing.voucherNo}` : 'Add a voucher'">
        <div class="flex flex-col gap-3">
          <FormField label="Voucher number" :error="errors.voucherNo" for="vc-no">
            <input id="vc-no" v-model="form.voucherNo" class="erp-input uppercase" maxlength="30" placeholder="e.g. CV-2611-50" :aria-invalid="Boolean(errors.voucherNo)" />
          </FormField>
          <FormField label="Name on the order" :error="errors.description" for="vc-name">
            <input id="vc-name" v-model="form.description" class="erp-input" maxlength="100" placeholder="e.g. Cash voucher RM 50" :aria-invalid="Boolean(errors.description)" />
          </FormField>
          <div class="grid grid-cols-2 gap-3">
            <FormField label="Amount off (RM)" :error="errors.amount" for="vc-amount">
              <input id="vc-amount" v-model="form.amount" class="erp-input text-right" inputmode="decimal" placeholder="50.00" :aria-invalid="Boolean(errors.amount)" />
            </FormField>
            <FormField label="Orders (optional)" :error="errors.maxUses" for="vc-uses">
              <input id="vc-uses" v-model="form.maxUses" class="erp-input text-right" inputmode="numeric" placeholder="No limit" :aria-invalid="Boolean(errors.maxUses)" />
            </FormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <FormField label="From" :error="errors.validFrom" for="vc-from">
              <DatePicker input-id="vc-from" :model-value="isoToDate(form.validFrom)" date-format="d M yy" fluid class="erp-date" @update:model-value="form.validFrom = dateToIso($event)" />
            </FormField>
            <FormField label="Until (optional)" :error="errors.validUntil" for="vc-until">
              <DatePicker input-id="vc-until" :model-value="isoToDate(form.validUntil)" :min-date="isoToDate(form.validFrom) ?? undefined" date-format="d M yy" placeholder="No end" show-button-bar fluid class="erp-date" @update:model-value="form.validUntil = dateToIso($event)" />
            </FormField>
          </div>
          <div class="flex justify-end gap-2">
            <button v-if="editing" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="startNew">Cancel</button>
            <button type="button" data-tour="vc:save" class="erp-btn erp-btn-add" :disabled="saving" @click="save">{{ editing ? 'Save changes' : 'Add voucher' }}</button>
          </div>
        </div>
      </SideCard>
      <SideCard title="How it works">
        <p class="m-0 text-[13px] text-erp-subtle">The amount comes off before tax. An order's date must be within the dates, and a voucher stops when the number of orders is reached.</p>
        <p class="m-0 text-[13px] text-erp-subtle">Once an order uses it, its number and amount stay. End it and add a new one for the next month.</p>
      </SideCard>
    </div>
  </div>
</template>
