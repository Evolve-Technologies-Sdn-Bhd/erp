<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { Check } from '@lucide/vue'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FileTiles from '@/components/erp/FileTiles.vue'
import FormField from '@/components/erp/FormField.vue'
import MasterDataPicker from '@/components/erp/MasterDataPicker.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { useSession } from '@/composables/useSession'
import { MY_STATES, postcodeError } from '@/utils/address'
import { formatDate, formatDateTime, formatMoney, formatQty } from '@/utils/format'
import { serviceApi, serviceJobsApi } from '../api/service'
import type { Assessment, JobDetail, JobStage, JobType, PaidMethod, PaidStatus, ServiceCustomerOption, SiteType, VisitResult } from '../types'
import { JOB_TYPE_OPTIONS, SITE_TYPE_OPTIONS, STAGE_GROUP } from './stages'

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
  postcode: '',
  state: '',
  area: '',
  preferredDate: '',
  note: '',
  siteType: '' as SiteType | '',
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
  form.postcode = j?.postcode ?? ''
  form.state = j?.state ?? ''
  form.area = j?.area ?? ''
  form.preferredDate = j?.preferredDate ?? ''
  form.note = j?.note ?? ''
  form.siteType = j?.siteType ?? ''
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
  if (postcodeError(form.postcode.trim())) e.postcode = postcodeError(form.postcode.trim())
  errors.value = e
  if (Object.keys(e).length) return
  saving.value = true
  try {
    const body = {
      contactName: form.contactName, phone: form.phone, siteAddress: form.siteAddress, postcode: form.postcode.trim(), state: form.state, area: form.area,
      preferredDate: form.preferredDate || null, note: form.note, siteType: form.siteType || null,
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
  { key: 'DONE', label: 'Done' },
  { key: 'CLOSED', label: 'Closed' },
]

// ── Board actions: take off the board, close, follow-up ──────────────────────
async function run(action: 'unbook' | 'close') {
  const j = job.value!
  saving.value = true
  try {
    show(action === 'unbook' ? await serviceJobsApi.unbook(j.id, j.version) : await serviceJobsApi.close(j.id, j.version))
    toast.add({ severity: 'success', summary: action === 'unbook' ? `${j.docNo} taken off the board` : `${j.docNo} closed`, life: 3000 })
  } finally {
    saving.value = false
  }
}
async function addFollowUp() {
  saving.value = true
  try {
    const next = await serviceJobsApi.followUp(job.value!.id)
    toast.add({ severity: 'success', summary: `${next.docNo} added`, detail: `Follow-up of ${job.value!.docNo}, waiting to be booked.`, life: 3500 })
    await router.push(`/service/jobs/${next.id}`)
  } finally {
    saving.value = false
  }
}

// ── Extend: a later expected completion that day, with the reason (F3 part 4) ──
const extendOpen = ref(false)
const extendForm = reactive({ until: '', reason: '' })
const extendErrors = ref<Record<string, string>>({})
const asTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
function openExtend() {
  const end = job.value?.booking?.expectedEnd ?? 0
  extendForm.until = asTime(Math.min(end + 60, 23 * 60 + 30))
  extendForm.reason = ''
  extendErrors.value = {}
  extendOpen.value = true
}
async function saveExtend() {
  const j = job.value!
  saving.value = true
  try {
    const result = await serviceJobsApi.extend(j.id, { version: j.version, until: extendForm.until, reason: extendForm.reason })
    show(result)
    extendOpen.value = false
    const late = result.booking?.runsInto ?? []
    toast.add({
      severity: late.length ? 'warn' : 'success', summary: `${j.docNo} now expected by ${result.booking?.expectedText}`,
      detail: late.length ? `It runs into ${late.join(', ')}: tell the customer of the later job.` : undefined, life: late.length ? 6000 : 3000,
    })
  } catch (error) {
    if (error instanceof ApiError) extendErrors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}

// ── Record the visit (F3 part 3): result, photos, paid or not ────────────────
const RESULTS: { value: VisitResult; label: string; hint: string }[] = [
  { value: 'COMPLETE', label: 'Complete', hint: 'The work is finished.' },
  { value: 'PARTIAL', label: 'Partly done', hint: 'Something is left: a follow-up job can be added.' },
  { value: 'POSTPONED', label: 'Postponed', hint: 'Nothing done today: the job waits to be booked again.' },
]
const PAID: { value: PaidStatus; label: string }[] = [
  { value: 'PAID', label: 'Paid on site' },
  { value: 'NOT_PAID', label: 'Not paid' },
  { value: 'NO_CHARGE', label: 'No charge' },
]
const METHODS: { value: PaidMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
]
const recordOpen = ref(false)
const visit = reactive({ result: 'COMPLETE' as VisitResult, reason: '', arrivedAt: '', finishedAt: '', paidStatus: '' as PaidStatus | '', paidMethod: '' as PaidMethod | '', notPaidReason: '', note: '', nextDate: '', returns: {} as Record<string, string>, parts: [] as { itemCode: string; itemName: string; qty: string }[] })
const visitErrors = ref<Record<string, string>>({})
// ── Warranty claim and parts used (phase 5) ──────────────────────────────────
const ASSESSMENTS: { value: Assessment; label: string; hint: string }[] = [
  { value: 'COVERED', label: 'Covered', hint: 'Done free of charge.' },
  { value: 'CHARGEABLE', label: 'Chargeable', hint: 'The customer pays: make a sales order.' },
  { value: 'REJECTED', label: 'Rejected', hint: 'Not done: the job is cancelled.' },
]
const assessOpen = ref(false)
const assess = reactive({ result: 'COVERED' as Assessment, note: '' })
const assessErrors = ref<Record<string, string>>({})
function openAssess() {
  const w = job.value!.warranty!
  Object.assign(assess, { result: w.assessment ?? w.suggested, note: w.note ?? '' })
  assessErrors.value = {}
  assessOpen.value = true
}
async function saveAssess() {
  const j = job.value!
  saving.value = true
  try {
    show(await serviceJobsApi.assess(j.id, { version: j.version, result: assess.result, note: assess.note.trim() || undefined }))
    assessOpen.value = false
    toast.add({ severity: 'success', summary: `${j.docNo}: ${job.value!.warranty?.assessmentLabel ?? 'decided'}`, life: 3000 })
  } catch (error) {
    if (error instanceof ApiError) assessErrors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
const partPick = ref<{ code: string; name: string; uomCode: string } | null>(null)
const searchItems = async (q: string) => (await serviceApi.items(q)).items
function addPart(i: { code: string; name: string; uomCode: string }) {
  if (!visit.parts.some((p) => p.itemCode === i.code)) visit.parts.push({ itemCode: i.code, itemName: i.name, qty: '1' })
  partPick.value = null
}
const partError = computed(() => Object.entries(visitErrors.value).find(([k]) => k.startsWith('parts'))?.[1] ?? '')

/** The job's items, each once, for the parts coming back (phase 5). */
const returnItems = computed(() => {
  const out = new Map<string, { itemCode: string; itemName: string; qty: string }>()
  for (const i of job.value?.items ?? []) {
    const before = out.get(i.itemCode)
    out.set(i.itemCode, { itemCode: i.itemCode, itemName: i.itemName, qty: String(Number(before?.qty ?? 0) + Number(i.qty)) })
  }
  return [...out.values()]
})
const returnError = computed(() => Object.entries(visitErrors.value).find(([k]) => k.startsWith('returns'))?.[1] ?? '')
function openRecord() {
  Object.assign(visit, { result: 'COMPLETE', reason: '', arrivedAt: '', finishedAt: '', paidStatus: '', paidMethod: '', notPaidReason: '', note: '', nextDate: '', returns: {}, parts: [] })
  visitErrors.value = {}
  recordOpen.value = true
}
async function uploadPhoto(file: File) {
  const photo = await serviceJobsApi.uploadPhoto(job.value!.id, file)
  job.value = { ...job.value!, photos: [...job.value!.photos, photo] }
}
async function saveVisit() {
  const j = job.value!
  saving.value = true
  try {
    const result = await serviceJobsApi.record(j.id, {
      version: j.version, result: visit.result, reason: visit.reason.trim() || undefined, arrivedAt: visit.arrivedAt || undefined, finishedAt: visit.finishedAt || undefined,
      ...(visit.result !== 'POSTPONED' && { paidStatus: visit.paidStatus || undefined, paidMethod: visit.paidStatus === 'PAID' ? visit.paidMethod || undefined : undefined, notPaidReason: visit.paidStatus === 'NOT_PAID' ? visit.notPaidReason.trim() || undefined : undefined, note: visit.note.trim() || undefined, returns: Object.entries(visit.returns).filter(([, q]) => q.trim() && Number(q) !== 0).map(([itemCode, qty]) => ({ itemCode, qty: qty.trim() })), ...(visit.parts.length && { parts: visit.parts.map((p) => ({ itemCode: p.itemCode, qty: p.qty.trim() })) }) }),
      ...(visit.result === 'POSTPONED' && visit.nextDate && { nextDate: visit.nextDate }),
    })
    show(result)
    recordOpen.value = false
    toast.add({ severity: 'success', summary: visit.result === 'POSTPONED' ? `${j.docNo} postponed` : `${j.docNo} done`, detail: visit.result === 'POSTPONED' ? 'It waits to be booked again.' : undefined, life: 3500 })
  } catch (error) {
    if (error instanceof ApiError) visitErrors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
/** Book or Move opens the board on the booked day, else the day the customer asks for, with this job picked. */
const boardLink = computed(() => {
  const j = job.value
  const date = j?.booking?.date ?? j?.preferredDate ?? undefined
  return { path: '/service/board', query: { job: j?.id, ...(date ? { date } : {}) } }
})
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
        <button v-if="job?.allowedActions.includes('unbook')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="run('unbook')">Take off the board</button>
        <RouterLink v-if="job?.allowedActions.includes('book')" :to="boardLink" data-tour="svc:book-link" class="erp-btn erp-btn-secondary">{{ job.stage === 'BOOKED' ? 'Move' : 'Book on the board' }}</RouterLink>
        <button v-if="editable" type="button" data-tour="action:save-job" class="erp-btn" :class="job?.allowedActions.includes('record') ? 'erp-btn-secondary' : 'erp-btn-primary'" :disabled="saving || (!isNew && !dirty)" @click="save">{{ isNew ? 'Add job' : 'Save' }}</button>
        <button v-if="job?.allowedActions.includes('record')" type="button" data-tour="action:record-visit" class="erp-btn erp-btn-primary" :disabled="saving || dirty" @click="openRecord">Record the visit</button>
        <button v-if="job?.allowedActions.includes('followUp')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="addFollowUp">Add follow-up job</button>
        <button v-if="job?.allowedActions.includes('close')" type="button" data-tour="action:close-job" class="erp-btn erp-btn-primary" :disabled="saving" @click="run('close')">Close job</button>
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
    <NoticeBanner v-if="job?.atRisk" kind="error" data-tour="svc:at-risk">
      At risk: stock not ready 24 hours before the installation ({{ job.atRiskNote }}). The office and {{ job.agentName ?? 'the salesperson' }} were alerted;
      it clears when the stock is there at the next check.
    </NoticeBanner>
    <NoticeBanner v-if="job?.overdue" kind="error">
      Overdue since {{ job.overdueSinceText }}: the visit has not been recorded.
      {{ job.stage === 'NOT_BOOKED' ? 'It was taken off the board, and it' : 'It' }} stays overdue until the visit is recorded, even when it is extended or moved.
    </NoticeBanner>
    <NoticeBanner v-if="job?.postponed && job.stage === 'NOT_BOOKED'" kind="warning">
      Postponed{{ job.postponed.count > 1 ? ` ${job.postponed.count} times` : '' }}<template v-if="job.postponed.reason">: “{{ job.postponed.reason }}”</template>. It waits to be booked again on the Planning Board.
    </NoticeBanner>
    <NoticeBanner v-if="job?.missingText" kind="warning" data-tour="svc:missing">
      {{ job.missingText }} Booking is not stopped; {{ editable ? 'fill them in below and save.' : 'they can be filled in while the job is not done.' }}
    </NoticeBanner>
    <NoticeBanner v-if="job?.followUpOf">
      Follow-up of <RouterLink :to="`/service/jobs/${job.followUpOf.id}`" class="erp-link font-semibold">{{ job.followUpOf.docNo }}</RouterLink>, which was partly done.
    </NoticeBanner>

    <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_330px]">
      <div class="flex min-w-0 flex-col gap-4">
        <section data-tour="svc:site" class="erp-card grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-[18px]">
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
          <FormField data-tour="svc:address" label="Site address" class="col-span-2" :error="errors.siteAddress" for="job-site">
            <input v-if="editable" id="job-site" v-model="form.siteAddress" class="erp-input" maxlength="300" :aria-invalid="Boolean(errors.siteAddress)" />
            <div v-else class="erp-input-ro">{{ form.siteAddress || '—' }}</div>
          </FormField>
          <FormField label="Postcode" :error="errors.postcode" for="job-postcode">
            <input v-if="editable" id="job-postcode" v-model="form.postcode" class="erp-input" inputmode="numeric" maxlength="5" placeholder="e.g. 40150" />
            <div v-else class="erp-input-ro">{{ form.postcode || '—' }}</div>
          </FormField>
          <FormField label="State" :error="errors.state" for="job-state">
            <select v-if="editable" id="job-state" v-model="form.state" class="erp-input">
              <option value="">—</option>
              <option v-for="s in MY_STATES" :key="s" :value="s">{{ s }}</option>
            </select>
            <div v-else class="erp-input-ro">{{ form.state || '—' }}</div>
          </FormField>
          <FormField label="Area" for="job-area">
            <input v-if="editable" id="job-area" v-model="form.area" class="erp-input" maxlength="60" />
            <div v-else class="erp-input-ro">{{ form.area || '—' }}</div>
          </FormField>
          <FormField data-tour="svc:site-type" label="Site type" :error="errors.siteType" for="job-site-type">
            <select v-if="editable" id="job-site-type" v-model="form.siteType" class="erp-input">
              <option value="">Not set: anyone can go</option>
              <option v-for="s in SITE_TYPE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <div v-else class="erp-input-ro">{{ SITE_TYPE_OPTIONS.find((s) => s.value === form.siteType)?.label ?? 'Not set' }}</div>
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

        <section v-if="job && job.items.length" data-tour="svc:items" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
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

        <!-- What the installer recorded (SvcJob.html) -->
        <section v-if="job?.visit" data-tour="svc:visit" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <h2 class="m-0 text-[15px] font-bold">What the installer recorded</h2>
          <div class="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
            <span class="text-erp-muted">Result</span><span class="font-semibold">{{ job.visit.resultLabel }}<template v-if="job.visit.reason"> · {{ job.visit.reason }}</template></span>
            <template v-if="job.visit.arrivedAt"><span class="text-erp-muted">Arrived</span><span>{{ job.visit.arrivedAt }}</span></template>
            <template v-if="job.visit.finishedAt"><span class="text-erp-muted">Finished</span><span>{{ job.visit.finishedAt }}</span></template>
            <span class="text-erp-muted">Paid on site</span>
            <span>{{ job.visit.paidLabel }}<template v-if="job.visit.paidMethod"> · {{ job.visit.paidMethod }}</template><template v-if="job.visit.notPaidReason">: {{ job.visit.notPaidReason }}</template></span>
            <template v-if="job.doneNote"><span class="text-erp-muted">Work done</span><span>{{ job.doneNote }}</span></template>
            <span class="text-erp-muted">Recorded</span><span>{{ job.visit.recordedBy }}<template v-if="job.visit.recordedAt">, {{ formatDateTime(job.visit.recordedAt) }}</template></span>
          </div>
          <p class="m-0 text-xs text-erp-muted">Payments are not kept in this system yet. “Paid on site” is the installer's note for the office to check against the bank.</p>
        </section>

        <section v-if="job && (job.photos.length || job.allowedActions.includes('record'))" data-tour="svc:photos" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <h2 class="m-0 text-[15px] font-bold">Photos</h2>
          <FileTiles :files="job.photos" :editable="job.allowedActions.includes('record')" add-label="+ Add photo" accept="image/*" :upload="uploadPhoto" />
          <p v-if="job.allowedActions.includes('record')" class="m-0 text-xs text-erp-muted">At least one photo of the work is needed to record a complete or partly done visit.</p>
        </section>

        <ActivityList v-if="job" :items="job.activity" />
      </div>

      <aside class="flex flex-col gap-4">
        <SideCard data-tour="svc:booking" title="Booking">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Type</span><span>{{ job?.typeLabel ?? JOB_TYPE_OPTIONS.find((t) => t.value === form.jobType)?.label }}</span></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Person</span><span>{{ job?.booking?.personName ?? 'Not booked' }}</span></div>
            <div v-if="job?.booking" class="flex justify-between gap-3"><span class="text-erp-muted">Date and slot</span><span class="text-right">{{ job.booking.text }}</span></div>
            <div v-if="job?.booking" class="flex justify-between gap-3">
              <span class="text-erp-muted">Expected done by</span>
              <span class="text-right" :class="job.overdue ? 'font-semibold text-chip-cancelled-text' : ''">{{ job.booking.expectedText }}<template v-if="job.booking.extended"> · extended</template></span>
            </div>
            <p v-if="job?.booking?.extendReason" class="m-0 text-xs text-erp-muted">Extended: “{{ job.booking.extendReason }}”</p>
            <p v-if="job?.booking?.runsInto.length" class="m-0 text-xs text-attention">Runs into {{ job.booking.runsInto.join(', ') }}: that job will start late.</p>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Customer asks for</span><span>{{ job ? asksFor : form.preferredDate ? formatDate(form.preferredDate) : '—' }}</span></div>
            <div v-if="job" class="flex justify-between gap-3"><span class="text-erp-muted">Branch</span><span>{{ job.branch.name }}</span></div>
          </div>
          <p v-if="!job?.booking" class="m-0 text-xs text-erp-muted">The office books the person, the day and the slot on the Planning Board.</p>
          <button v-if="job?.allowedActions.includes('extend')" type="button" data-tour="action:extend" class="erp-btn erp-btn-secondary mt-1 justify-center" :disabled="saving" @click="openExtend">Extend the time</button>
        </SideCard>
        <SideCard v-if="job && (job.delivery || (job.booking && job.stock.confirms && job.stock.items.length))" data-tour="svc:stock" title="Stock and delivery">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <template v-if="job.booking && job.stock.confirms">
              <div v-for="i in job.stock.items" :key="i.itemCode" class="flex justify-between gap-3">
                <span>{{ i.itemCode }}</span><span :class="i.short ? 'font-semibold text-chip-cancelled-text' : ''">{{ formatQty(i.free) }} free, {{ formatQty(i.needed) }} needed</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-erp-muted">Warehouse</span>
                <span class="text-right" :class="job.stock.confirmedAt ? 'font-semibold text-chip-done-text' : 'text-attention'">{{ job.stock.confirmedAt ? `Confirmed by ${job.stock.confirmedBy}` : 'Not confirmed' }}</span>
              </div>
            </template>
            <div v-if="job.delivery" class="flex justify-between gap-3"><span class="text-erp-muted">{{ job.delivery.delivered ? 'Delivered' : 'Delivery order' }}</span><RouterLink :to="`/sales/deliveries/${job.delivery.id}`" class="erp-link font-semibold">{{ job.delivery.docNo }}</RouterLink></div>
          </div>
        </SideCard>
        <SideCard v-if="job?.warranty" data-tour="svc:warranty" title="Warranty">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <template v-if="job.warranty.unit">
              <div class="flex justify-between gap-3"><span class="font-semibold">{{ job.warranty.unit.itemCode }}</span><span :class="job.warranty.unit.state === 'ACTIVE' ? 'font-semibold text-chip-done-text' : 'font-semibold text-attention'">{{ job.warranty.unit.stateLabel }}</span></div>
              <div class="flex justify-between gap-3"><span class="text-erp-muted">Covered</span><span class="text-right">{{ formatDate(job.warranty.unit.startOn) }} – {{ formatDate(job.warranty.unit.endOn) }}</span></div>
              <div v-if="job.warranty.unit.serialNo" class="flex justify-between gap-3"><span class="text-erp-muted">Serial number</span><span>{{ job.warranty.unit.serialNo }}</span></div>
              <div class="flex justify-between gap-3"><span class="text-erp-muted">Installed on</span><RouterLink :to="`/service/jobs/${job.warranty.unit.jobId}`" class="erp-link font-semibold">{{ job.warranty.unit.jobNo }}</RouterLink></div>
            </template>
            <p v-else class="m-0 text-xs text-erp-muted">Not linked to a registered unit. Start claims from Service › Warranties to see what is covered.</p>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Decision</span><span class="text-right font-semibold">{{ job.warranty.assessmentLabel ?? 'Not decided yet' }}</span></div>
            <p v-if="job.warranty.note" class="m-0 text-xs text-erp-muted">“{{ job.warranty.note }}” · {{ job.warranty.by }}</p>
            <RouterLink v-if="job.warranty.assessment === 'CHARGEABLE'" to="/sales/orders/new" class="erp-link text-xs">Make the sales order for {{ job.customer.name }}</RouterLink>
          </div>
          <button v-if="job.warranty.canAssess" type="button" data-tour="action:assess" class="erp-btn erp-btn-secondary mt-1 justify-center" :disabled="saving" @click="openAssess">{{ job.warranty.assessment ? 'Change the decision' : 'Decide the claim' }}</button>
        </SideCard>
        <SideCard v-if="job?.parts.length" data-tour="svc:parts" title="Parts used">
          <div v-for="p in job.parts" :key="p.itemCode" class="flex justify-between gap-3 text-[13px]"><span>{{ p.itemCode }} <span class="text-xs text-erp-muted">{{ p.itemName }}</span></span><span>{{ formatQty(p.qty) }} {{ p.uomCode }}</span></div>
          <p class="m-0 text-xs text-erp-muted">Recorded only: stock is not taken yet.</p>
        </SideCard>
        <SideCard v-if="job?.returns.length" data-tour="svc:returns" title="Parts coming back">
          <div v-for="r in job.returns" :key="r.id" class="flex justify-between gap-3 text-[13px]">
            <span>{{ formatQty(r.qty) }} {{ r.itemCode }}</span><span class="text-right" :class="r.receivedAt ? 'text-chip-done-text' : 'text-attention'">{{ r.receivedText ?? 'Not received yet' }}</span>
          </div>
        </SideCard>
        <SideCard v-if="job?.doneAt" title="Done">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Done</span><span>{{ formatDateTime(job.doneAt) }}</span></div>
            <div v-if="job.closedAt" class="flex justify-between gap-3"><span class="text-erp-muted">Closed</span><span>{{ formatDateTime(job.closedAt) }}</span></div>
            <div v-if="job.overdueSinceText" class="flex justify-between gap-3"><span class="text-erp-muted">Late</span><span class="text-right text-chip-cancelled-text">Overdue since {{ job.overdueSinceText }}</span></div>
          </div>
        </SideCard>
        <SideCard v-if="job && (job.salesOrderNo || job.followUpOf || job.followUpJob)" data-tour="svc:links" title="Linked documents">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <div v-if="job.salesOrderNo" class="flex justify-between gap-3"><span class="font-semibold">{{ job.salesOrderNo }}</span><span class="text-erp-muted">Sales order</span></div>
            <div v-if="job.orderPayment" class="flex justify-between gap-3">
              <span class="text-erp-muted">Order payment</span>
              <span class="text-right" :class="job.orderPayment.status === 'FULLY_PAID' ? 'font-semibold text-chip-done-text' : ''">
                {{ job.orderPayment.label }}<template v-if="job.orderPayment.paid && job.orderPayment.status !== 'FULLY_PAID'"> · RM {{ formatMoney(job.orderPayment.paid) }} of {{ formatMoney(job.orderPayment.total) }}</template>
              </span>
            </div>
            <div v-if="job.followUpOf" class="flex justify-between gap-3">
              <RouterLink :to="`/service/jobs/${job.followUpOf.id}`" class="erp-link font-semibold">{{ job.followUpOf.docNo }}</RouterLink><span class="text-erp-muted">Partly done job</span>
            </div>
            <div v-if="job.followUpJob" class="flex justify-between gap-3">
              <RouterLink :to="`/service/jobs/${job.followUpJob.id}`" class="erp-link font-semibold">{{ job.followUpJob.docNo }}</RouterLink><span class="text-erp-muted">Follow-up job</span>
            </div>
          </div>
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

    <Dialog v-model:visible="assessOpen" data-tour="svc:assess" modal :draggable="false" class="erp-dialog" :style="{ width: '480px' }" :header="`Decide the claim · ${job?.docNo}`">
      <div class="flex flex-col gap-3 text-[13px]">
        <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Decision</legend>
          <label v-for="a in ASSESSMENTS" :key="a.value" class="flex items-start gap-2"><input v-model="assess.result" type="radio" name="assess" :value="a.value" class="mt-0.5" /><span><span class="font-semibold">{{ a.label }}</span> <span class="text-erp-muted">· {{ a.hint }}</span></span></label>
        </fieldset>
        <FormField :label="assess.result === 'COVERED' ? 'Note (optional)' : 'Why'" :error="assessErrors.note" for="assess-note"><input id="assess-note" v-model="assess.note" class="erp-input" maxlength="300" /></FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="assessOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="saving" @click="saveAssess">Save the decision</button>
      </template>
    </Dialog>

    <Dialog v-model:visible="extendOpen" data-tour="svc:extend" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="`Extend the time · ${job?.docNo}`">
      <div class="flex flex-col gap-3 text-[13px]">
        <p v-if="job?.booking" class="m-0 text-erp-muted">{{ job.booking.personName }} · {{ job.booking.text }} · expected by {{ job.booking.expectedText }} now</p>
        <FormField label="Now expected to finish by" :error="extendErrors.until" for="extend-until">
          <input id="extend-until" v-model="extendForm.until" type="time" step="900" class="erp-input" :aria-invalid="Boolean(extendErrors.until)" />
        </FormField>
        <FormField label="Why does it need longer?" :error="extendErrors.reason" for="extend-reason">
          <input id="extend-reason" v-model="extendForm.reason" class="erp-input" maxlength="300" :aria-invalid="Boolean(extendErrors.reason)" />
        </FormField>
        <p class="m-0 text-xs text-erp-muted">{{ job?.booking?.personName }} stays busy until then, so nothing new is booked over it. A job already overdue stays overdue.</p>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="extendOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="saveExtend">Extend</button>
      </template>
    </Dialog>

    <Dialog v-model:visible="recordOpen" data-tour="svc:record" modal :draggable="false" class="erp-dialog" :style="{ width: '560px' }" :header="`Record the visit · ${job?.docNo}`">
      <div class="flex flex-col gap-4 text-[13px]">
        <p v-if="job?.booking" class="m-0 text-erp-muted">{{ job.booking.personName }} · {{ job.booking.text }}</p>

        <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Result</legend>
          <label v-for="r in RESULTS" :key="r.value" class="flex items-start gap-2">
            <input v-model="visit.result" type="radio" name="visit-result" :value="r.value" class="mt-0.5" />
            <span><span class="font-semibold">{{ r.label }}</span> <span class="text-erp-muted">· {{ r.hint }}</span></span>
          </label>
        </fieldset>

        <FormField v-if="visit.result !== 'COMPLETE'" :label="visit.result === 'POSTPONED' ? 'Why is it postponed?' : 'What is left to do?'" :error="visitErrors.reason" for="visit-reason">
          <input id="visit-reason" v-model="visit.reason" class="erp-input" maxlength="300" :aria-invalid="Boolean(visitErrors.reason)" />
        </FormField>

        <FormField v-if="visit.result === 'POSTPONED'" label="New date the customer asks for (optional)" :error="visitErrors.nextDate" for="visit-next">
          <DatePicker input-id="visit-next" :model-value="isoToDate(visit.nextDate)" :min-date="isoToDate(today) ?? undefined" date-format="d M yy" show-icon show-button-bar fluid class="erp-date" @update:model-value="visit.nextDate = dateToIso($event)" />
        </FormField>

        <div class="grid grid-cols-2 gap-3">
          <FormField label="Arrived (optional)" :error="visitErrors.arrivedAt" for="visit-arrived"><input id="visit-arrived" v-model="visit.arrivedAt" type="time" class="erp-input" /></FormField>
          <FormField label="Finished (optional)" :error="visitErrors.finishedAt" for="visit-finished"><input id="visit-finished" v-model="visit.finishedAt" type="time" class="erp-input" /></FormField>
        </div>

        <template v-if="visit.result !== 'POSTPONED'">
          <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend class="mb-1 text-xs font-medium text-erp-muted">Did the customer pay on site?</legend>
            <div class="flex flex-wrap gap-4">
              <label v-for="p in PAID" :key="p.value" class="flex items-center gap-1.5"><input v-model="visit.paidStatus" type="radio" name="visit-paid" :value="p.value" />{{ p.label }}</label>
            </div>
            <span v-if="visitErrors.paidStatus" class="text-xs text-note-error-text">{{ visitErrors.paidStatus }}</span>
          </fieldset>
          <FormField v-if="visit.paidStatus === 'PAID'" label="How (optional)" for="visit-method">
            <select id="visit-method" v-model="visit.paidMethod" class="erp-input">
              <option value="">—</option>
              <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </FormField>
          <FormField v-if="visit.paidStatus === 'NOT_PAID'" label="Why not?" :error="visitErrors.notPaidReason" for="visit-notpaid">
            <input id="visit-notpaid" v-model="visit.notPaidReason" class="erp-input" maxlength="300" :aria-invalid="Boolean(visitErrors.notPaidReason)" />
          </FormField>
          <FormField label="Work done (optional)" for="visit-note">
            <textarea id="visit-note" v-model="visit.note" rows="2" class="erp-input h-auto py-2" maxlength="500" />
          </FormField>
          <fieldset v-if="job && job.jobType !== 'INSTALLATION'" data-tour="svc:visit-parts" class="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend class="mb-1 text-xs font-medium text-erp-muted">Parts used (optional)</legend>
            <div v-for="(p, i) in visit.parts" :key="p.itemCode" class="flex items-center gap-2">
              <input v-model="p.qty" class="erp-input w-20 text-right" inputmode="decimal" :aria-label="`${p.itemCode} used`" />
              <span>{{ p.itemCode }} <span class="text-erp-muted">{{ p.itemName }}</span></span>
              <button type="button" class="erp-link ml-auto cursor-pointer border-0 bg-transparent p-0 text-xs" @click="visit.parts.splice(i, 1)">Remove</button>
            </div>
            <MasterDataPicker v-model="partPick" input-id="visit-part" :search="searchItems" placeholder="Add a part: type a code or name" @picked="addPart" />
            <span v-if="partError" class="text-xs text-note-error-text">{{ partError }}</span>
          </fieldset>
          <fieldset v-if="job?.items.length" data-tour="svc:visit-returns" class="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend class="mb-1 text-xs font-medium text-erp-muted">Parts coming back to the store (optional)</legend>
            <label v-for="i in returnItems" :key="i.itemCode" class="flex items-center gap-2">
              <input v-model="visit.returns[i.itemCode]" class="erp-input w-20 text-right" inputmode="decimal" placeholder="0" :aria-label="`${i.itemCode} coming back`" />
              <span>of {{ formatQty(i.qty) }} {{ i.itemCode }} <span class="text-erp-muted">{{ i.itemName }}</span></span>
            </label>
            <span v-if="returnError" class="text-xs text-note-error-text">{{ returnError }}</span>
          </fieldset>
          <p class="m-0 text-xs" :class="visitErrors.photos ? 'font-semibold text-note-error-text' : 'text-erp-muted'">
            {{ job?.photos.length ? `${job.photos.length} photo${job.photos.length === 1 ? '' : 's'} on the job.` : 'No photo yet: add one under Photos on the job page first.' }}
            <template v-if="visitErrors.photos"> {{ visitErrors.photos }}</template>
          </p>
        </template>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="recordOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="saveVisit">Save the visit</button>
      </template>
    </Dialog>
  </template>
</template>
