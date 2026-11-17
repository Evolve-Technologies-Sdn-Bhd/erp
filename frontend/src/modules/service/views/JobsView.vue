<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Column from 'primevue/column'
import { Plus } from '@lucide/vue'
import DataList from '@/components/erp/DataList.vue'
import FilterBar from '@/components/erp/FilterBar.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { useSession } from '@/composables/useSession'
import { serviceJobsApi } from '../api/service'
import type { JobRow } from '../types'
import { JOB_TYPE_OPTIONS, STAGE_GROUP } from './stages'

/** V03 · List of Jobs (SvcJobs.html). Person, date and slot fill in with the planning board (F3 part 2). */
const { can } = useSession()
const list = useListPage({ filterKeys: ['type'], fetch: serviceJobsApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'notBooked', label: 'Not booked' },
  { key: 'booked', label: 'Booked' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Search waits for a pause in typing, then goes in the URL like every list filter.
const search = ref(list.params.value.q)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => list.setFilter('q', (v ?? '').trim()), 300)
})
</script>

<template>
  <section class="erp-card flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="List of Jobs" subtitle="Every installation, service, warranty and repair job." />

    <div class="flex items-center justify-between gap-3">
      <RouterLink v-if="can('service.job.edit')" to="/service/jobs/new" class="erp-btn erp-btn-add"><Plus :size="14" :stroke-width="2.5" aria-hidden="true" />New job</RouterLink>
    </div>

    <FilterBar>
      <input v-model="search" class="erp-input" placeholder="Job, customer or order" aria-label="Search job, customer or order" />
      <select class="erp-input" aria-label="Filter by type" :value="list.params.value.type" @change="list.setFilter('type', ($event.target as HTMLSelectElement).value)">
        <option value="">All types</option>
        <option v-for="t in JOB_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </FilterBar>

    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />

    <DataList :rows="rows" :loading="list.loading.value" empty-text="No jobs yet. A released sales order with installation adds one, or click New job.">
      <Column header="Job">
        <template #body="{ data }: { data: JobRow }">
          <RouterLink :to="`/service/jobs/${data.id}`" class="erp-link font-semibold whitespace-nowrap">{{ data.docNo }}</RouterLink>
        </template>
      </Column>
      <Column header="Type" field="typeLabel" />
      <Column header="Customer" field="customerName" />
      <Column header="Area">
        <template #body="{ data }: { data: JobRow }">{{ data.area ?? '—' }}</template>
      </Column>
      <Column header="Order">
        <template #body="{ data }: { data: JobRow }"><span class="whitespace-nowrap">{{ data.salesOrderNo ?? '—' }}</span></template>
      </Column>
      <Column header="Person">
        <template #body="{ data }: { data: JobRow }">{{ data.personName ?? '—' }}</template>
      </Column>
      <Column header="Date and slot">
        <template #body="{ data }: { data: JobRow }"><span class="whitespace-nowrap">{{ data.whenText }}</span></template>
      </Column>
      <Column header="Paid on site">
        <template #body="{ data }: { data: JobRow }"><span :class="data.paidLabel === 'Not paid' ? 'font-semibold text-attention' : ''">{{ data.paidLabel ?? '—' }}</span></template>
      </Column>
      <Column header="Stage">
        <template #body="{ data }: { data: JobRow }"><StatusChip :status="data.stage" :label="data.stageLabel" :group="STAGE_GROUP[data.stage]" /></template>
      </Column>
    </DataList>

    <div v-if="paged" class="mt-auto flex items-center justify-end pt-2">
      <Pager v-if="list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
    </div>
  </section>
</template>
