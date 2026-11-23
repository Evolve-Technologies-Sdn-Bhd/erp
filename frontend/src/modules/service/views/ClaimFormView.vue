<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dialog from 'primevue/dialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FileTiles from '@/components/erp/FileTiles.vue'
import FormField from '@/components/erp/FormField.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { serviceApi, serviceClaimsApi } from '../api/service'
import type { ClaimAction, ClaimDetail, ClaimPeriod, EligibleJob, JobPhoto, Person } from '../types'

/**
 * V08 · Installer claim (F5): the office keys it for an installer and a claim period, ticks the jobs (each at the fee by
 * rule, another amount with a reason) and adds the installer's invoice; Account approves or sends it back, then
 * records the payment voucher. Jobs that cannot be claimed yet are listed with why.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { today } = useSession()
const setCrumb = usePageCrumb()

const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const claim = ref<ClaimDetail | null>(null)
const people = ref<Person[]>([])
const form = reactive({ personId: '', day: '', invoiceNo: '', selfBilled: false, note: '' })
const eligible = ref<{ period: ClaimPeriod; jobs: EligibleJob[] } | null>(null)
const picked = reactive<Record<string, { on: boolean; amount: string; reason: string }>>({})
const files = ref<JobPhoto[]>([])
const added = ref<string[]>([])
const errors = ref<Record<string, string>>({})
const saving = ref(false)

const can = (a: ClaimAction) => (isNew.value ? a === 'edit' || a === 'submit' : Boolean(claim.value?.allowedActions.includes(a)))
const editable = computed(() => can('edit'))

async function load() {
  errors.value = {}
  added.value = []
  if (!people.value.length) people.value = (await serviceApi.settings()).people.filter((p) => p.claimsFees && p.isActive)
  if (isNew.value) {
    claim.value = null
    Object.assign(form, { personId: (route.query.person as string) ?? '', day: today.value || new Date().toISOString().slice(0, 10), invoiceNo: '', selfBilled: false, note: '' })
    files.value = []
    setCrumb('New claim')
  } else {
    const c = await serviceClaimsApi.get(id.value)
    claim.value = c
    Object.assign(form, { personId: c.personId, day: c.period.start, invoiceNo: c.invoiceNo ?? '', selfBilled: c.selfBilled, note: c.note ?? '' })
    files.value = c.files
    setCrumb(c.docNo)
  }
  await loadEligible()
}
onMounted(load)
watch(id, load)

async function loadEligible() {
  for (const k of Object.keys(picked)) delete picked[k]
  eligible.value = null
  if (!form.personId || !form.day || !editable.value) return
  const e = await serviceClaimsApi.eligible(form.personId, form.day, claim.value?.id)
  eligible.value = { period: e.period, jobs: e.jobs }
  for (const j of e.jobs) {
    const line = claim.value?.lines.find((l) => l.jobId === j.id)
    picked[j.id] = { on: Boolean(line) || (isNew.value && j.claimable), amount: line?.amount ?? j.referenceAmount, reason: line?.reason ?? '' }
  }
}
watch(() => [form.personId, form.day], () => {
  if (isNew.value) void loadEligible()
})

const period = computed(() => claim.value?.period ?? eligible.value?.period ?? null)
const chosen = computed(() => (eligible.value?.jobs ?? []).filter((j) => j.claimable && picked[j.id]?.on))
/** A preview; the server's total is the truth. */
const total = computed(() => (editable.value ? chosen.value.reduce((s, j) => s + (Number(picked[j.id]!.amount) || 0), 0).toFixed(2) : (claim.value?.total ?? '0.00')))
const differs = (j: EligibleJob) => Number(picked[j.id]?.amount) !== Number(j.referenceAmount)

async function upload(file: File) {
  const f = await serviceClaimsApi.uploadInvoice(file)
  files.value = [...files.value, f]
  added.value = [...added.value, f.id]
}

async function save(): Promise<ClaimDetail | null> {
  const e: Record<string, string> = {}
  if (!form.personId) e.personId = 'Pick the installer.'
  chosen.value.forEach((j) => {
    if (differs(j) && !picked[j.id]!.reason.trim()) e[`job-${j.id}`] = `Say why the amount is not ${j.referenceAmount}, the fee by rule.`
  })
  errors.value = e
  if (Object.keys(e).length) return null
  const body = {
    lines: chosen.value.map((j) => ({ jobId: j.id, amount: picked[j.id]!.amount.trim(), reason: picked[j.id]!.reason.trim() || undefined })),
    invoiceNo: form.invoiceNo, selfBilled: form.selfBilled, note: form.note, invoiceFileIds: added.value,
  }
  saving.value = true
  try {
    const result = isNew.value
      ? await serviceClaimsApi.create({ ...body, personId: form.personId, day: form.day })
      : await serviceClaimsApi.update(claim.value!.id, { ...body, version: claim.value!.version })
    added.value = []
    if (isNew.value) {
      toast.add({ severity: 'success', summary: `${result.docNo} saved`, detail: 'Add the invoice, then submit it to Account.', life: 3500 })
      await router.replace(`/service/claims/${result.id}`)
    } else {
      claim.value = result
      files.value = result.files
      toast.add({ severity: 'success', summary: 'Claim saved', life: 2500 })
      await loadEligible()
    }
    return result
  } catch (error) {
    if (error instanceof ApiError) errors.value = { ...errors.value, ...error.fieldErrors }
    return null
  } finally {
    saving.value = false
  }
}

async function submit() {
  const saved = await save()
  if (!saved) return
  try {
    const result = await serviceClaimsApi.submit(saved.id, saved.version)
    toast.add({ severity: 'success', summary: `${result.docNo} submitted`, detail: 'Account has been told.', life: 3500 })
    if (isNew.value) await router.replace(`/service/claims/${result.id}`)
    else await load()
  } catch (error) {
    if (error instanceof ApiError) errors.value = { ...errors.value, ...error.fieldErrors }
    if (isNew.value) await router.replace(`/service/claims/${saved.id}`)
  }
}

async function act(run: () => Promise<ClaimDetail>, summary: string) {
  saving.value = true
  try {
    claim.value = await run()
    toast.add({ severity: 'success', summary, life: 3000 })
  } finally {
    saving.value = false
  }
}
function cancelClaim() {
  const c = claim.value!
  confirm.require({
    header: `Cancel ${c.docNo}?`,
    message: 'Its jobs can then go on another claim.',
    acceptLabel: 'Cancel claim',
    rejectLabel: 'Keep it',
    acceptClass: 'p-button-danger',
    accept: () => act(() => serviceClaimsApi.cancel(c.id, c.version), `${c.docNo} cancelled`),
  })
}
const approve = () => act(() => serviceClaimsApi.approve(claim.value!.id, claim.value!.version), `${claim.value!.docNo} approved`)

const backOpen = ref(false)
const backReason = ref('')
async function sendBack() {
  if (!backReason.value.trim()) return
  await act(() => serviceClaimsApi.sendBack(claim.value!.id, claim.value!.version, backReason.value.trim()), `${claim.value!.docNo} sent back`)
  backOpen.value = false
  backReason.value = ''
}
const payOpen = ref(false)
const pay = reactive({ ref: '', on: '' })
const payError = ref('')
function openPay() {
  Object.assign(pay, { ref: '', on: claim.value!.period.payOn })
  payError.value = ''
  payOpen.value = true
}
async function recordPay() {
  payError.value = pay.ref.trim() ? '' : 'Type the payment voucher (PV) number.'
  if (payError.value) return
  await act(() => serviceClaimsApi.pay(claim.value!.id, claim.value!.version, pay.ref.trim(), pay.on), `${claim.value!.docNo} paid`)
  payOpen.value = false
}

const GROUP = { DRAFT: 'draft', SUBMITTED: 'pending', RETURNED: 'cancelled', APPROVED: 'released', PAID: 'done', CANCELLED: 'draft' } as const
</script>

<template>
  <PageHeader :title="isNew ? 'New claim' : `Claim ${claim?.docNo ?? ''}`">
    <template v-if="claim" #chip><StatusChip :status="claim.status" :label="claim.statusLabel" :group="GROUP[claim.status]" /></template>
    <template #subtitle>
      <template v-if="claim">{{ claim.personName }} · {{ claim.period.text }} · paid on {{ formatDate(claim.period.payOn) }}</template>
      <template v-else>Pick the installer and a day in the claim period, tick the jobs, and add the installer's invoice.</template>
    </template>
    <template #actions>
      <RouterLink to="/service/claims" class="erp-btn erp-btn-secondary">Back</RouterLink>
      <button v-if="!isNew && can('cancel')" type="button" class="erp-btn erp-btn-delete" :disabled="saving" @click="cancelClaim">Cancel claim</button>
      <button v-if="editable" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="save">Save draft</button>
      <button v-if="editable && can('submit')" type="button" data-tour="action:submit-claim" class="erp-btn erp-btn-primary" :disabled="saving || !chosen.length" @click="submit">Submit to Account</button>
      <button v-if="can('return')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="backOpen = true">Send back</button>
      <button v-if="can('approve')" type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="approve">Approve</button>
      <button v-if="can('pay')" type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="openPay">Record payment</button>
    </template>
  </PageHeader>

  <NoticeBanner v-if="claim?.status === 'RETURNED'" kind="error">
    Sent back by {{ claim.decidedByName }}: “{{ claim.returnReason }}”. Fix it and submit it again.
  </NoticeBanner>
  <NoticeBanner v-else-if="claim?.status === 'SUBMITTED'" kind="warning">
    Waiting for Account since {{ formatDate(claim.submittedAt!) }} (submitted by {{ claim.submittedByName }}). Whoever submitted a claim does not approve it.
  </NoticeBanner>
  <NoticeBanner v-else-if="claim?.status === 'APPROVED'">Approved by {{ claim.decidedByName }}: to be paid on {{ formatDate(claim.period.payOn) }}.</NoticeBanner>
  <NoticeBanner v-else-if="claim?.status === 'PAID'">Paid on {{ formatDate(claim.paidOn!) }}, payment voucher {{ claim.paymentRef }}.</NoticeBanner>

  <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_300px]">
    <div class="flex min-w-0 flex-col gap-4">
      <section v-if="isNew" class="erp-card grid grid-cols-3 gap-x-4 gap-y-3 px-5 py-[18px]">
        <h2 class="col-span-3 m-0 text-[15px] font-bold">Installer and claim period</h2>
        <FormField label="Installer" :error="errors.personId" for="cl-person">
          <select id="cl-person" v-model="form.personId" class="erp-input">
            <option value="">Pick the installer</option>
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </FormField>
        <FormField label="Any day in the period" for="cl-day"><input id="cl-day" v-model="form.day" type="date" class="erp-input" /></FormField>
        <div class="self-end pb-2 text-[13px]">
          <template v-if="period"><strong>{{ period.text }}</strong> · paid on {{ formatDate(period.payOn) }}</template>
        </div>
        <p v-if="!people.length" class="col-span-3 m-0 text-xs text-erp-muted">Nobody claims fees yet: tick <em>Claims fees</em> for your installers in Slots and Stages.</p>
      </section>

      <section class="erp-card flex flex-col gap-3 px-5 py-[18px]" data-tour="claim:jobs">
        <h2 class="m-0 text-[15px] font-bold">Jobs</h2>
        <p v-if="editable && !eligible" class="m-0 text-[13px] text-erp-muted">Pick the installer to see their jobs in the period.</p>
        <p v-else-if="editable && !eligible!.jobs.length" class="m-0 text-[13px] text-erp-muted">No jobs done by this installer in {{ eligible!.period.text }}.</p>
        <table v-if="editable && eligible?.jobs.length" class="erp-table">
          <thead><tr><th aria-label="Claim" /><th>Job</th><th>Done on</th><th>Customer</th><th>Category</th><th class="num">Fee by rule</th><th class="num">Amount</th><th>Reason</th></tr></thead>
          <tbody>
            <tr v-for="j in eligible.jobs" :key="j.id" :class="j.claimable ? '' : 'opacity-60'">
              <td><input v-if="j.claimable" v-model="picked[j.id]!.on" type="checkbox" :aria-label="`Claim ${j.docNo}`" /></td>
              <td><RouterLink :to="`/service/jobs/${j.id}`" class="erp-link font-semibold">{{ j.docNo }}</RouterLink><div class="text-xs text-erp-muted">{{ j.typeLabel }}</div></td>
              <td class="whitespace-nowrap">{{ formatDate(j.doneOn) }}</td>
              <td>{{ j.customerName }}<div v-if="j.salesOrderNo" class="text-xs text-erp-muted">{{ j.salesOrderNo }}</div></td>
              <td>{{ j.categoryName ?? '—' }}</td>
              <td class="num">
                <MoneyText :value="j.referenceAmount" />
                <div v-if="j.late" class="text-xs font-semibold text-chip-cancelled-text" title="Updated more than 72 hours after the expected finish">Late: no fee</div>
              </td>
              <template v-if="j.claimable">
                <td class="num"><input v-model="picked[j.id]!.amount" class="erp-input w-24 text-right" inputmode="decimal" :disabled="!picked[j.id]!.on" :aria-label="`Amount for ${j.docNo}`" /></td>
                <td>
                  <input v-if="picked[j.id]!.on && differs(j)" v-model="picked[j.id]!.reason" class="erp-input" maxlength="300" placeholder="Why a different amount" :aria-label="`Reason for ${j.docNo}`" />
                  <span v-if="errors[`job-${j.id}`]" class="text-xs text-note-error-text">{{ errors[`job-${j.id}`] }}</span>
                </td>
              </template>
              <td v-else colspan="2" class="text-xs text-erp-muted">{{ j.why }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="!editable && claim" class="erp-table">
          <thead><tr><th>Job</th><th>Done on</th><th>Customer</th><th>Category</th><th class="num">Fee by rule</th><th class="num">Amount</th><th>Reason</th></tr></thead>
          <tbody>
            <tr v-for="l in claim.lines" :key="l.id">
              <td><RouterLink :to="`/service/jobs/${l.jobId}`" class="erp-link font-semibold">{{ l.jobNo }}</RouterLink><div class="text-xs text-erp-muted">{{ l.typeLabel }}</div></td>
              <td class="whitespace-nowrap">{{ formatDate(l.doneOn) }}</td>
              <td>{{ l.customerName }}<div v-if="l.salesOrderNo" class="text-xs text-erp-muted">{{ l.salesOrderNo }}</div></td>
              <td>{{ l.categoryName ?? '—' }}</td>
              <td class="num"><MoneyText :value="l.referenceAmount" /><div v-if="l.late" class="text-xs font-semibold text-chip-cancelled-text">Late: no fee</div></td>
              <td class="num"><MoneyText :value="l.amount" /></td>
              <td class="text-xs">{{ l.reason ?? '' }}</td>
            </tr>
          </tbody>
        </table>
        <span v-if="errors.jobIds" class="text-xs text-note-error-text">{{ errors.jobIds }}</span>
        <p class="m-0 text-xs text-erp-muted">
          Only complete jobs whose order is fully paid (verified receipts) are claimed, each once. A job updated more than 72 hours after its expected finish gets no
          fee by rule. The fee by rule is the job category's fee in Slots and Stages; another amount needs a reason.
        </p>
      </section>

      <section class="erp-card grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-[18px]">
        <h2 class="col-span-2 m-0 text-[15px] font-bold">Installer's invoice</h2>
        <FormField label="Invoice number" :error="errors.invoiceNo" for="cl-invoice">
          <input v-if="editable" id="cl-invoice" v-model="form.invoiceNo" class="erp-input" maxlength="40" :disabled="form.selfBilled" />
          <div v-else class="erp-input-ro">{{ claim?.selfBilled ? 'Self-billed' : (claim?.invoiceNo ?? '—') }}</div>
        </FormField>
        <label v-if="editable" class="flex items-center gap-2 self-end pb-2 text-[13px]"><input v-model="form.selfBilled" type="checkbox" />Self-billed: Account makes the invoice for the installer</label>
        <div class="col-span-2 flex flex-col gap-1">
          <FileTiles :files="files" :editable="editable && !form.selfBilled" add-label="+ Add invoice" accept="image/*,application/pdf" :upload="upload" />
          <span v-if="errors.invoiceFileIds" class="text-xs text-note-error-text">{{ errors.invoiceFileIds }}</span>
        </div>
        <FormField label="Note" class="col-span-2" for="cl-note">
          <input v-if="editable" id="cl-note" v-model="form.note" class="erp-input" maxlength="500" />
          <div v-else class="erp-input-ro">{{ claim?.note || '—' }}</div>
        </FormField>
      </section>

      <ActivityList v-if="claim" :items="claim.activity" />
    </div>

    <aside class="flex flex-col gap-4">
      <SideCard title="Claim total">
        <div class="flex items-baseline justify-between text-[13px]">
          <span>{{ editable ? chosen.length : (claim?.lines.length ?? 0) }} job{{ (editable ? chosen.length : (claim?.lines.length ?? 0)) === 1 ? '' : 's' }}</span>
          <strong class="text-lg">RM <MoneyText :value="total" /></strong>
        </div>
        <p v-if="period" class="m-0 mt-2 text-xs text-erp-muted">{{ period.text }}: paid on {{ formatDate(period.payOn) }} by payment voucher.</p>
      </SideCard>
    </aside>
  </div>

  <Dialog v-model:visible="backOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="`Send back ${claim?.docNo}?`">
    <FormField label="What is wrong" for="cl-back"><input id="cl-back" v-model="backReason" class="erp-input" maxlength="300" /></FormField>
    <template #footer>
      <button type="button" class="erp-btn erp-btn-secondary" @click="backOpen = false">Keep it</button>
      <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="!backReason.trim() || saving" @click="sendBack">Send back</button>
    </template>
  </Dialog>

  <Dialog v-model:visible="payOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '420px' }" :header="`Record the payment of ${claim?.docNo}`">
    <div class="flex flex-col gap-3">
      <FormField label="Payment voucher (PV) number" :error="payError" for="cl-pv"><input id="cl-pv" v-model="pay.ref" class="erp-input" maxlength="40" /></FormField>
      <FormField label="Paid on" for="cl-paid"><input id="cl-paid" v-model="pay.on" type="date" class="erp-input" /></FormField>
    </div>
    <template #footer>
      <button type="button" class="erp-btn erp-btn-secondary" @click="payOpen = false">Cancel</button>
      <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="saving" @click="recordPay">Record payment</button>
    </template>
  </Dialog>
</template>
