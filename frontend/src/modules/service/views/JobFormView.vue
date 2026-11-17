<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { Check } from '@lucide/vue'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FormField from '@/components/erp/FormField.vue'
import MasterDataPicker from '@/components/erp/MasterDataPicker.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { useSession } from '@/composables/useSession'
import { formatDate, formatDateTime, formatQty } from '@/utils/format'
import { serviceApi, serviceJobsApi } from '../api/service'
import type { JobDetail, JobStage, JobType, ServiceCustomerOption } from '../types'
import { JOB_TYPE_OPTIONS, STAGE_GROUP } from './stages'

/** V04 · Job (SvcJob.html), and a job the office adds by hand. Booking and the installer's part come in F3 parts 2 and 3. */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const setCrumb = usePageCrumb()
const { can, today } = useSession()

const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const job = ref<JobDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  jobType: 'SERVICE' as JobType,
  customer: null as ServiceCustomerOption | null,
  contactName: '',
  phone: '',
  siteAddress: '',
  area: '',
  preferredDate: '',
  note: '',
})
const pad = (n: number) => String(n).padStart(2, '0')
const isoToDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`) : null)
const dateToIso = (value: unknown) => (value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : '')

const saved = ref('')
const snapshot = () => JSON.stringify({ ...form, customer: form.customer?.code ?? null })
const dirty = computed(() => snapshot() !== saved.value)
const editable = computed(() => (isNew.value ? can('service.job.edit') : Boolean(job.value?.allowedActions.includes('edit'))))

function fill(j: JobDetail | null) {
  form.jobType = j?.jobType ?? 'SERVICE'
  form.customer = j ? { code: j.customerCode, name: j.customerName, contactName: j.contactName, phone: j.phone, deliveryAddress: j.siteAddress, area: j.area, branchCode: j.branchCode } : null
  form.contactName = j?.contactName ?? ''
  form.phone = j?.phone ?? ''
  form.siteAddress = j?.siteAddress ?? ''
  form.area = j?.area ?? ''
  form.preferredDate = j?.preferredDate ?? ''
  form.note = j?.note ?? ''
  saved.value = snapshot()
  errors.value = {}
}

async function load() {
  loading.value = true
  try {
    job.value = isNew.value ? null : await serviceJobsApi.get(id.value)
    fill(job.value)
    setCrumb(job.value?.docNo ?? 'New job')
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(id, load)

function show(j: JobDetail) {
  job.value = j
  fill(j)
  setCrumb(j.docNo)
}

const searchCustomers = async (q: string) => (await serviceApi.customers(q)).items
function onCustomerPicked(c: ServiceCustomerOption) {
  form.customer = c
  form.contactName = c.contactName ?? ''
  form.phone = c.phone ?? ''
  form.siteAddress = c.deliveryAddress ?? ''
  form.area = c.area ?? ''
}

async function save() {
  const e: Record<string, string> = {}
  if (isNew.value && !form.customer) e.customerCode = 'Pick the customer from Master Data.'
  if (!form.siteAddress.trim()) e.siteAddress = 'Type the address the installer goes to.'
  errors.value = e
  if (Object.keys(e).length) return
  saving.value = true
  try {
    const body = {
      contactName: form.contactName, phone: form.phone, siteAddress: form.siteAddress, area: form.area,
      preferredDate: form.preferredDate || null, note: form.note,
    }
    const result = isNew.value
      ? await serviceJobsApi.create({ ...body, jobType: form.jobType, customerCode: form.customer!.code })
      : await serviceJobsApi.update(id.value, { ...body, version: job.value!.version })
    toast.add({ severity: 'success', summary: isNew.value ? `${result.docNo} added` : 'Job saved', life: 3000 })
    if (isNew.value) await router.replace(`/service/jobs/${result.id}`)
    show(result)
  } catch (error) {
    if (error instanceof ApiError) errors.value = { ...errors.value, ...error.fieldErrors }
  } finally {
    saving.value = false
  }
}

// ── Cancel ───────────────────────────────────────────────────────────────────
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelError = ref('')
async function cancelJob() {
  cancelError.value = cancelReason.value.trim() ? '' : 'Type why the job is cancelled.'
  if (cancelError.value) return
  saving.value = true
  try {
    show(await serviceJobsApi.cancel(job.value!.id, job.value!.version, cancelReason.value.trim()))
    cancelOpen.value = false
    cancelReason.value = ''
    toast.add({ severity: 'success', summary: `${job.value!.docNo} cancelled`, life: 3000 })
  } finally {
    saving.value = false
  }
}

// ── Display ──────────────────────────────────────────────────────────────────
/** The stage bar of SvcJob.html: each stage done, current or still to come. */
const STAGES: { key: JobStage; label: string }[] = [
  { key: 'NOT_BOOKED', label: 'Not booked' },
  { key: 'BOOKED', label: 'Booked' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DONE', label: 'Done' },
  { key: 'CHECKED', label: 'Checked' },
  { key: 'CLOSED', label: 'Closed' },
]
const stageIndex = computed(() => STAGES.findIndex((s) => s.key === job.value?.stage))
const subtitle = computed(() => {
  const j = job.value
  if (!j) return 'Pick the customer and the site. The job number is given when you save.'
  return j.salesOrderNo ? `${j.typeLabel} for sales order ${j.salesOrderNo}.` : `${j.typeLabel}, added by the office.`
})
const asksFor = computed(() => {
  const j = job.value
  if (!j) return ''
  if (j.preferredDate) return formatDate(j.preferredDate)
  return j.afterStock ? 'After stock arrives' : 'No date asked'
})
</script>

<template>
  <div v-if="loading" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else>
    <PageHeader :title="job ? `Job ${job.docNo}` : 'New job'" document :branch="job?.branch.code">
      <template #chip>
        <StatusChip v-if="job" :status="job.stage" :label="job.stageLabel" :group="STAGE_GROUP[job.stage]" />
        <StatusChip v-else status="DRAFT" label="New" />
      </template>
      <template #subtitle>{{ subtitle }}</template>
      <template #actions>
        <RouterLink to="/service/jobs" class="erp-btn erp-btn-secondary">Back</RouterLink>
        <button v-if="job?.allowedActions.includes('cancel')" type="button" class="erp-btn erp-btn-delete" :disabled="saving" @click="cancelOpen = true">Cancel job</button>
        <button v-if="editable" type="button" class="erp-btn erp-btn-primary" :disabled="saving || (!isNew && !dirty)" @click="save">{{ isNew ? 'Add job' : 'Save' }}</button>
      </template>
    </PageHeader>

    <!-- Stage bar (SvcJob.html) -->
    <section v-if="job && job.stage !== 'CANCELLED'" class="erp-card flex items-center gap-2 overflow-x-auto px-5 py-3">
      <template v-for="(s, i) in STAGES" :key="s.key">
        <span
          class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap"
          :class="i < stageIndex ? 'bg-mod-chip-bg text-mod-chip-text' : i === stageIndex ? 'bg-mod-primary text-erp-on-dark' : 'bg-erp-head text-erp-muted'"
        >
          <Check v-if="i < stageIndex" :size="12" aria-hidden="true" />{{ s.label }}
        </span>
        <span v-if="i < STAGES.length - 1" class="h-px w-4 shrink-0 bg-erp-border" aria-hidden="true" />
      </template>
    </section>
    <NoticeBanner v-else-if="job" kind="error">
      Cancelled {{ job.cancelledAt ? formatDateTime(job.cancelledAt) : '' }}<template v-if="job.cancelReason">: “{{ job.cancelReason }}”</template>.
    </NoticeBanner>

    <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_330px]">
      <div class="flex min-w-0 flex-col gap-4">
        <section class="erp-card grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-[18px]">
          <h2 class="col-span-2 m-0 text-[15px] font-bold">Customer and site</h2>
          <FormField v-if="isNew" label="Type" for="job-type">
            <select id="job-type" v-model="form.jobType" class="erp-input">
              <option v-for="t in JOB_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </FormField>
          <FormField :label="form.customer ? `Customer · ${form.customer.code}` : 'Customer · from Master Data'" :error="errors.customerCode" for="job-customer">
            <MasterDataPicker
              v-if="isNew"
              v-model="form.customer"
              input-id="job-customer"
              :search="searchCustomers"
              :invalid="Boolean(errors.customerCode)"
              :display="(c) => c.name"
              placeholder="Type a customer code or name"
              @picked="onCustomerPicked"
            />
            <div v-else class="erp-input-ro">{{ form.customer?.name }}</div>
          </FormField>
          <FormField label="Contact" for="job-contact">
            <input v-if="editable" id="job-contact" v-model="form.contactName" class="erp-input" maxlength="100" />
            <div v-else class="erp-input-ro">{{ form.contactName || '—' }}</div>
          </FormField>
          <FormField label="Phone" for="job-phone">
            <input v-if="editable" id="job-phone" v-model="form.phone" class="erp-input" maxlength="40" />
            <div v-else class="erp-input-ro">{{ form.phone || '—' }}</div>
          </FormField>
          <FormField label="Site address" class="col-span-2" :error="errors.siteAddress" for="job-site">
            <input v-if="editable" id="job-site" v-model="form.siteAddress" class="erp-input" maxlength="300" :aria-invalid="Boolean(errors.siteAddress)" />
            <div v-else class="erp-input-ro">{{ form.siteAddress || '—' }}</div>
          </FormField>
          <FormField label="Area" for="job-area">
            <input v-if="editable" id="job-area" v-model="form.area" class="erp-input" maxlength="60" />
            <div v-else class="erp-input-ro">{{ form.area || '—' }}</div>
          </FormField>
          <FormField label="Customer asks for" :error="errors.preferredDate" for="job-date">
            <DatePicker
              v-if="editable"
              input-id="job-date"
              :model-value="isoToDate(form.preferredDate)"
              :min-date="isoToDate(today) ?? undefined"
              date-format="d M yy"
              show-icon
              show-button-bar
              fluid
              class="erp-date"
              @update:model-value="form.preferredDate = dateToIso($event)"
            />
            <div v-else class="erp-input-ro">{{ asksFor }}</div>
          </FormField>
          <FormField label="Note to the installer" class="col-span-2" for="job-note">
            <textarea v-if="editable" id="job-note" v-model="form.note" rows="3" class="erp-input h-auto py-2" maxlength="2000" />
            <div v-else class="erp-input-ro whitespace-pre-line">{{ form.note || '—' }}</div>
          </FormField>
          <p v-if="job?.afterStock && !form.preferredDate" class="col-span-2 m-0 text-xs text-attention">
            Released with items short: book it when the stock arrives. Setting a date says the customer has asked for that day.
          </p>
        </section>

        <section v-if="job && job.items.length" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <h2 class="m-0 text-[15px] font-bold">Items</h2>
          <table class="erp-table">
            <thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>Unit</th><th>Serial number</th></tr></thead>
            <tbody>
              <tr v-for="i in job.items" :key="i.lineNo">
                <td class="font-semibold whitespace-nowrap">{{ i.itemCode }}</td>
                <td>{{ i.itemName }}</td>
                <td class="num">{{ formatQty(i.qty) }}</td>
                <td>{{ i.uomCode }}</td>
                <td>{{ i.serialNo ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <ActivityList v-if="job" :items="job.activity" />
      </div>

      <aside class="flex flex-col gap-4">
        <SideCard title="Booking">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Type</span><span>{{ job?.typeLabel ?? JOB_TYPE_OPTIONS.find((t) => t.value === form.jobType)?.label }}</span></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Person</span><span>Not booked</span></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Customer asks for</span><span>{{ job ? asksFor : form.preferredDate ? formatDate(form.preferredDate) : '—' }}</span></div>
            <div v-if="job" class="flex justify-between gap-3"><span class="text-erp-muted">Branch</span><span>{{ job.branch.name }}</span></div>
          </div>
          <p class="m-0 text-xs text-erp-muted">The office books the person, the day and the slot on the planning board (F3 part 2).</p>
        </SideCard>
        <SideCard v-if="job?.salesOrderNo" title="Linked documents">
          <div class="flex justify-between gap-3 text-[13px]">
            <span class="font-semibold">{{ job.salesOrderNo }}</span><span class="text-erp-muted">Sales order</span>
          </div>
          <p class="m-0 text-xs text-erp-muted">The job was made when the order was released with installation.</p>
        </SideCard>
      </aside>
    </div>

    <Dialog v-model:visible="cancelOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '480px' }" :header="`Cancel ${job?.docNo}?`">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-[13px]">The job stays in the list as Cancelled, with the reason. Nobody can book it after this.</p>
        <FormField label="Reason" :error="cancelError" for="job-cancel-reason">
          <textarea id="job-cancel-reason" v-model="cancelReason" rows="3" class="erp-input h-auto py-2" maxlength="300" :aria-invalid="Boolean(cancelError)" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="cancelOpen = false">Keep the job</button>
        <button type="button" class="erp-btn erp-btn-delete" :disabled="saving" @click="cancelJob">Cancel job</button>
      </template>
    </Dialog>
  </template>
</template>
