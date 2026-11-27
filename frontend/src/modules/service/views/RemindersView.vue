<script setup lang="ts">
import { computed, ref } from 'vue'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import DataList from '@/components/erp/DataList.vue'
import FormField from '@/components/erp/FormField.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import Pager from '@/components/erp/Pager.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { useListPage } from '@/composables/useListPage'
import { useSession } from '@/composables/useSession'
import { formatDate, formatQty } from '@/utils/format'
import { serviceRemindersApi } from '../api/service'
import type { ReminderRow } from '../types'

/**
 * V06 · Reminders (F6): an item with a service interval in Core, installed at a customer, comes due that many months
 * later. 14 days before, Service makes a service job for it; completing that job starts the next reminder.
 */
const toast = useToast()
const { can } = useSession()
const list = useListPage({ filterKeys: [], fetch: serviceRemindersApi.list })
const rows = computed(() => list.data.value?.items ?? [])
const paged = computed(() => (list.data.value?.total ?? 0) > (list.data.value?.pageSize ?? Infinity))
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'jobMade', label: 'Job made' },
  { key: 'dismissed', label: 'Dismissed' },
]
const GROUP = { UPCOMING: 'pending', JOB_MADE: 'released', DISMISSED: 'draft' } as const

const running = ref(false)
async function runNow() {
  running.value = true
  try {
    const { made } = await serviceRemindersApi.run()
    toast.add({
      severity: made.length ? 'success' : 'info',
      summary: made.length ? `${made.length} service job${made.length === 1 ? '' : 's'} made` : 'Nothing due in the next 14 days',
      detail: made.length ? made.map((m) => `${m.jobNo} ${m.customerName}`).join(' · ') : undefined,
      life: 4500,
    })
    await list.reload()
  } finally {
    running.value = false
  }
}

const dismissing = ref<ReminderRow | null>(null)
const reason = ref('')
const reasonError = ref('')
async function dismiss() {
  reasonError.value = reason.value.trim() ? '' : 'Type why the reminder is dismissed.'
  if (reasonError.value || !dismissing.value) return
  await serviceRemindersApi.dismiss(dismissing.value.id, dismissing.value.version, reason.value.trim())
  toast.add({ severity: 'success', summary: 'Reminder dismissed', life: 2500 })
  dismissing.value = null
  reason.value = ''
  await list.reload()
}
</script>

<template>
  <section class="erp-card erp-listcard flex grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="Service Reminders" subtitle="Items with a service interval in Core come due after installation. 14 days before the due day, a service job is made for the office to book.">
      <template v-if="can('service.job.edit')" #actions>
        <button type="button" data-tour="action:make-jobs" class="erp-btn erp-btn-add" :disabled="running" @click="runNow">Make jobs now</button>
      </template>
    </PageHeader>

    <p class="m-0 text-xs text-erp-muted">
      The server also makes them by itself every hour<template v-if="list.data.value"> (now up to {{ formatDate(list.data.value.makesUntil) }})</template>. Completing the service job starts the next reminder.
    </p>

    <StatusTabs :tabs="TABS" :counts="list.data.value?.statusCounts" :active="list.params.value.status" @select="list.setStatus" />

    <DataList :rows="rows" :loading="list.loading.value" empty-text="No reminders yet. Set Service every (months) on an item in Core; completing its installation starts one.">
      <Column header="Due">
        <template #body="{ data }: { data: ReminderRow }">
          <span class="whitespace-nowrap" :class="data.overdue ? 'font-semibold text-attention' : ''">{{ formatDate(data.dueOn) }}</span>
        </template>
      </Column>
      <Column header="Customer">
        <template #body="{ data }: { data: ReminderRow }">{{ data.customerName }}<div v-if="data.area" class="text-xs text-erp-muted">{{ data.area }}</div></template>
      </Column>
      <Column header="Item">
        <template #body="{ data }: { data: ReminderRow }">
          <span class="font-semibold">{{ data.itemCode }}</span> · {{ data.itemName }}
          <div class="text-xs text-erp-muted">{{ formatQty(data.qty) }} {{ data.uomCode }} · every {{ data.intervalMonths }} month{{ data.intervalMonths === 1 ? '' : 's' }}</div>
        </template>
      </Column>
      <Column header="Last done">
        <template #body="{ data }: { data: ReminderRow }">
          <span class="whitespace-nowrap">{{ formatDate(data.lastDoneOn) }}</span>
          <div class="text-xs"><RouterLink :to="`/service/jobs/${data.fromJobId}`" class="erp-link">{{ data.fromJobNo }}</RouterLink></div>
        </template>
      </Column>
      <Column header="Service job">
        <template #body="{ data }: { data: ReminderRow }">
          <RouterLink v-if="data.jobId" :to="`/service/jobs/${data.jobId}`" class="erp-link font-semibold">{{ data.jobNo }}</RouterLink>
          <span v-else-if="data.dismissReason" class="text-xs text-erp-muted">{{ data.dismissReason }}</span>
          <span v-else class="text-erp-muted">—</span>
        </template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: ReminderRow }"><StatusChip :status="data.status" :label="data.overdue ? 'Overdue' : data.statusLabel" :group="data.overdue ? 'cancelled' : GROUP[data.status]" /></template>
      </Column>
      <Column header="">
        <template #body="{ data }: { data: ReminderRow }">
          <button v-if="data.status === 'UPCOMING' && can('service.job.edit')" type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 text-[13px] text-erp-link" @click="dismissing = data">Dismiss</button>
        </template>
      </Column>
    </DataList>

    <div v-if="paged" class="mt-auto flex items-center justify-end pt-2">
      <Pager v-if="list.data.value" :page="list.data.value.page" :page-size="list.data.value.pageSize" :total="list.data.value.total" @change="list.setPage" />
    </div>

    <Dialog :visible="Boolean(dismissing)" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="`Dismiss the reminder for ${dismissing?.itemCode}?`" @update:visible="(v: boolean) => !v && (dismissing = null)">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-[13px]">{{ dismissing?.customerName }} gets no service job for it, and no further reminders.</p>
        <FormField label="Reason" :error="reasonError" for="rem-reason">
          <input id="rem-reason" v-model="reason" class="erp-input" maxlength="300" placeholder="Customer moved, unit removed, …" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="dismissing = null">Keep it</button>
        <button type="button" class="erp-btn erp-btn-delete" @click="dismiss">Dismiss</button>
      </template>
    </Dialog>
  </section>
</template>
