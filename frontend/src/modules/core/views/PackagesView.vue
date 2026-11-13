<script setup lang="ts">
import { computed } from 'vue'
import Column from 'primevue/column'
import { Plus } from '@lucide/vue'
import DataList from '@/components/erp/DataList.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { useSession } from '@/composables/useSession'
import { formatDate, formatMoney } from '@/utils/format'
import { corePackagesApi } from '../api/core'
import type { PackageListItem } from '../types'
import { PACKAGE_STATUS_GROUP } from './packages'

/** C15 · List of Packages (CorePackages.html) */
const { can } = useSession()
const list = useListPage({ filterKeys: [], fetch: corePackagesApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ended', label: 'Ended' },
]
const runs = (p: PackageListItem) => `${formatDate(p.runsFrom)} – ${p.endedOn ? formatDate(p.endedOn) : p.runsUntil ? formatDate(p.runsUntil) : 'no end'}`
</script>

<template>
  <section class="erp-card flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="List of Packages" subtitle="Several items sold together at one price, with a free gift the customer chooses. Sales adds a package to an order as one line." />

    <div class="flex items-center justify-between gap-3">
      <RouterLink v-if="can('core.price_list.edit')" to="/core/packages/new" class="erp-btn erp-btn-add"><Plus :size="14" :stroke-width="2.5" aria-hidden="true" />Add new package</RouterLink>
    </div>

    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />

    <DataList :rows="rows" :loading="list.loading.value" empty-text="No packages yet.">
      <Column header="Code">
        <template #body="{ data }: { data: PackageListItem }">
          <RouterLink :to="`/core/packages/${data.id}`" class="erp-link font-semibold whitespace-nowrap">{{ data.code }}</RouterLink>
        </template>
      </Column>
      <Column header="Name" field="name" />
      <Column header="Items" field="itemsText" />
      <Column header="Normal value" class="erp-col-num">
        <template #body="{ data }: { data: PackageListItem }">{{ formatMoney(data.normalValue) }}</template>
      </Column>
      <Column header="Package price" class="erp-col-num">
        <template #body="{ data }: { data: PackageListItem }">{{ formatMoney(data.packagePrice) }}</template>
      </Column>
      <Column header="Saves" class="erp-col-num">
        <template #body="{ data }: { data: PackageListItem }">{{ data.saves === null ? '—' : formatMoney(data.saves) }}</template>
      </Column>
      <Column header="Free gift" field="giftText" />
      <Column header="Runs">
        <template #body="{ data }: { data: PackageListItem }"><span class="whitespace-nowrap">{{ runs(data) }}</span></template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: PackageListItem }"><StatusChip :status="data.status" :label="data.statusLabel" :group="PACKAGE_STATUS_GROUP[data.status]" /></template>
      </Column>
    </DataList>

    <div v-if="paged" class="mt-auto flex items-center justify-end pt-2">
      <Pager v-if="list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
    </div>
  </section>
</template>
