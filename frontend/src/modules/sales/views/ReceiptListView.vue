<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Column from 'primevue/column'
import DataList from '@/components/erp/DataList.vue'
import FilterBar from '@/components/erp/FilterBar.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { formatDate, formatMoney } from '@/utils/format'
import { salesReceiptsApi } from '../api/sales'
import type { ReceiptRow } from '../types'
import { RECEIPT_GROUP } from './receipts'

/**
 * S35 · Official receipts (phase 5): Account's queue. Payments recorded by salespeople and installers, each with its
 * proof, wait here until Account checks them against the bank or card settlement and verifies them.
 */
const list = useListPage({ fetch: salesReceiptsApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))

const TABS = [
  { key: 'waiting', label: 'Waiting to verify' },
  { key: 'returned', label: 'Sent back' },
  { key: 'verified', label: 'Verified' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

const search = ref(list.params.value.q)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => list.setFilter('q', (v ?? '').trim()), 300)
})
</script>

<template>
  <section class="erp-card flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="Official Receipts" subtitle="Customer payments recorded on sales orders, each with its proof. Only verified receipts count as paid." />

    <p v-if="list.data.value && Number(list.data.value.waitingAmount)" class="m-0 text-[13px]">
      <span class="font-semibold">RM {{ formatMoney(list.data.value.waitingAmount) }}</span> waiting for Account to check against the bank.
    </p>

    <FilterBar>
      <input v-model="search" class="erp-input" placeholder="Receipt, customer or order" aria-label="Search receipt, customer or order" />
    </FilterBar>

    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />

    <DataList :rows="rows" :loading="list.loading.value" empty-text="No receipts here. Salespeople record payments from the sales order.">
      <Column header="Receipt">
        <template #body="{ data }: { data: ReceiptRow }">
          <RouterLink :to="`/sales/receipts/${data.id}`" class="erp-link font-semibold whitespace-nowrap">{{ data.docNo }}</RouterLink>
        </template>
      </Column>
      <Column header="Received on">
        <template #body="{ data }: { data: ReceiptRow }"><span class="whitespace-nowrap">{{ formatDate(data.docDate) }}</span></template>
      </Column>
      <Column header="Order">
        <template #body="{ data }: { data: ReceiptRow }">
          <RouterLink :to="`/sales/orders/${data.salesOrderId}`" class="erp-link whitespace-nowrap">{{ data.salesOrderNo }}</RouterLink>
        </template>
      </Column>
      <Column header="Customer" field="customerName" />
      <Column header="Payment" field="kindLabel" />
      <Column header="How" field="methodLabel" />
      <Column header="Amount (RM)" class="erp-col-num">
        <template #body="{ data }: { data: ReceiptRow }"><MoneyText :value="data.amount" /></template>
      </Column>
      <Column header="Recorded by" field="recordedByName" />
      <Column header="Status">
        <template #body="{ data }: { data: ReceiptRow }"><StatusChip :status="data.status" :label="data.statusLabel" :group="RECEIPT_GROUP[data.status]" /></template>
      </Column>
    </DataList>

    <div v-if="paged" class="mt-auto flex items-center justify-end pt-2">
      <Pager v-if="list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
    </div>
  </section>
</template>
