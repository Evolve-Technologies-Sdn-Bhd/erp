<script setup lang="ts">
import { computed } from 'vue'
import Column from 'primevue/column'
import { Plus } from '@lucide/vue'
import DataList from '@/components/erp/DataList.vue'
import ListBox from '@/components/erp/ListBox.vue'
import RowMenu from '@/components/erp/RowMenu.vue'
import FilterBar from '@/components/erp/FilterBar.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { serviceClaimsApi } from '../api/service'
import type { ClaimRow } from '../types'

/**
 * V07 · Installer Claims (F5): what installers claim per claim period, Account's queue (Waiting for Account), and what
 * was paid. The total adds up the claims on the tab and filter, as a simple report.
 */
const { can } = useSession()
const list = useListPage({ filterKeys: [], fetch: serviceClaimsApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Waiting for Account' },
  { key: 'returned', label: 'Sent back' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
]
const GROUP = { DRAFT: 'draft', SUBMITTED: 'pending', RETURNED: 'cancelled', APPROVED: 'released', PAID: 'done', CANCELLED: 'draft' } as const
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3.5">
    <PageHeader title="Installer Claims" subtitle="Installers claim a fee per complete, fully paid job, twice a month with their invoice. Account checks, approves and pays.">
      <template v-if="can('service.claim.edit')" #actions>
        <RouterLink to="/service/claims/new" data-tour="action:new-claim" class="erp-btn erp-btn-add"><Plus :size="14" :stroke-width="2.5" aria-hidden="true" />New claim</RouterLink>
      </template>
    </PageHeader>
    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />
    <ListBox open-filters>
      <template #filters>
        <FilterBar>
      <input :value="list.params.value.q" class="erp-input" placeholder="Search claim, installer, invoice or PV" aria-label="Search" @change="list.setFilter('q', ($event.target as HTMLInputElement).value)" />
    </FilterBar>
      </template>
      <DataList :rows="rows" :loading="list.loading.value" empty-text="No claims yet. Key one for an installer with New claim.">
      <Column header="Claim">
        <template #body="{ data }: { data: ClaimRow }"><RouterLink :to="`/service/claims/${data.id}`" class="erp-link font-semibold">{{ data.docNo }}</RouterLink></template>
      </Column>
      <Column header="Installer" field="personName" />
      <Column header="Period">
        <template #body="{ data }: { data: ClaimRow }">{{ data.periodText }}<div class="text-xs text-erp-muted">Paid on {{ formatDate(data.payOn) }}</div></template>
      </Column>
      <Column header="Jobs" class="erp-col-num">
        <template #body="{ data }: { data: ClaimRow }">{{ data.jobs }}</template>
      </Column>
      <Column header="Invoice">
        <template #body="{ data }: { data: ClaimRow }">{{ data.selfBilled ? 'Self-billed' : (data.invoiceNo ?? '—') }}</template>
      </Column>
      <Column header="Total (RM)" class="erp-col-num">
        <template #body="{ data }: { data: ClaimRow }"><MoneyText :value="data.total" /></template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: ClaimRow }">
          <StatusChip :status="data.status" :label="data.statusLabel" :group="GROUP[data.status]" />
          <div v-if="data.paymentRef" class="text-xs text-erp-muted">{{ data.paymentRef }}</div>
        </template>
      </Column>
          <Column header="" header-class="w-[56px]">
        <template #body="{ data }">
          <RowMenu :items="[{ label: 'Open', to: `/service/claims/${data.id}` }]" />
        </template>
      </Column>
    </DataList>
      <template #footer>
        <div class="mt-auto flex items-center justify-between gap-3 pt-2 text-[13px]">
      <span v-if="list.data.value">Total on this tab: <strong>RM <MoneyText :value="list.data.value.sumTotal" /></strong></span>
      <Pager :sizes="[10, 20, 50, 100]" @size="(n) => list.setFilters({ pageSize: String(n), page: undefined })" v-if="paged && list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
    </div>
      </template>
    </ListBox>
  </section>
</template>
