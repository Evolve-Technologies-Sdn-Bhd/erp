<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FileTiles from '@/components/erp/FileTiles.vue'
import FormField from '@/components/erp/FormField.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { formatDate, formatDateTime, formatMoney } from '@/utils/format'
import { salesReceiptsApi } from '../api/sales'
import ReasonDialog from '../components/ReasonDialog.vue'
import ReceiptDialog from '../components/ReceiptDialog.vue'
import type { ReceiptDetail } from '../types'
import { PAYMENT_GROUP, RECEIPT_GROUP } from './receipts'

/**
 * S36 · Official receipt (phase 5). Account checks the proof against the bank or card settlement and verifies it, or
 * sends it back with a reason; whoever records receipts corrects it and sends it again, or cancels it.
 */
const route = useRoute()
const toast = useToast()
const setCrumb = usePageCrumb()

const r = ref<ReceiptDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const id = computed(() => String(route.params.id))

async function load() {
  loading.value = true
  try {
    show(await salesReceiptsApi.get(id.value))
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(id, load)
function show(x: ReceiptDetail) {
  r.value = x
  setCrumb(x.docNo)
}
const can = (a: string) => Boolean(r.value?.allowedActions.includes(a as never))

// ── Verify ───────────────────────────────────────────────────────────────────
const verifyOpen = ref(false)
const reference = ref('')
const verifyError = ref('')
function openVerify() {
  reference.value = ''
  verifyError.value = ''
  verifyOpen.value = true
}
async function verify() {
  if (!reference.value.trim()) {
    verifyError.value = 'Type the bank transaction or card settlement reference it matches.'
    return
  }
  saving.value = true
  try {
    show(await salesReceiptsApi.verify(r.value!.id, r.value!.version, reference.value.trim()))
    verifyOpen.value = false
    toast.add({ severity: 'success', summary: `${r.value!.docNo} verified`, detail: r.value!.order ? `${r.value!.order.docNo} is now ${r.value!.order.paymentLabel.toLowerCase()}.` : undefined, life: 4000 })
  } catch (error) {
    if (error instanceof ApiError) verifyError.value = error.fieldErrors.reference ?? ''
  } finally {
    saving.value = false
  }
}

// ── Send back, cancel, correct ───────────────────────────────────────────────
const backOpen = ref(false)
const cancelOpen = ref(false)
const editOpen = ref(false)
async function sendBack(reason: string) {
  saving.value = true
  try {
    show(await salesReceiptsApi.sendBack(r.value!.id, r.value!.version, reason))
    backOpen.value = false
    toast.add({ severity: 'success', summary: `${r.value!.docNo} sent back`, detail: `${r.value!.recordedByName} sees why and corrects it.`, life: 4000 })
  } finally {
    saving.value = false
  }
}
async function cancel(reason: string) {
  saving.value = true
  try {
    show(await salesReceiptsApi.cancel(r.value!.id, r.value!.version, reason))
    cancelOpen.value = false
    toast.add({ severity: 'success', summary: `${r.value!.docNo} cancelled`, life: 3000 })
  } finally {
    saving.value = false
  }
}
function saved(x: ReceiptDetail) {
  show(x)
  toast.add({ severity: 'success', summary: `${x.docNo} sent to Account`, detail: 'It waits to be verified again.', life: 3500 })
}
</script>

<template>
  <div v-if="loading && !r" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else-if="r">
    <PageHeader :title="`Official receipt ${r.docNo}`" document :branch="r.branchCode">
      <template #chip><StatusChip :status="r.status" :label="r.statusLabel" :group="RECEIPT_GROUP[r.status]" /></template>
      <template #subtitle>{{ r.kindLabel }} for sales order {{ r.salesOrderNo }} · {{ r.customerName }}</template>
      <template #actions>
        <RouterLink to="/sales/receipts?status=waiting" class="erp-btn erp-btn-secondary">Back</RouterLink>
        <button v-if="can('cancel')" type="button" class="erp-btn erp-btn-delete" :disabled="saving" @click="cancelOpen = true">Cancel receipt</button>
        <button v-if="can('edit')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="editOpen = true">{{ r.status === 'RETURNED' ? 'Correct and send again' : 'Correct' }}</button>
        <button v-if="can('sendBack')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving" @click="backOpen = true">Send back</button>
        <button v-if="can('verify')" type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="openVerify">Verify</button>
      </template>
    </PageHeader>

    <NoticeBanner v-if="r.status === 'RETURNED'" kind="warning">Sent back by Account: “{{ r.returnReason }}”. Correct it and send it again, or cancel it.</NoticeBanner>
    <NoticeBanner v-else-if="r.status === 'WAITING' && !can('verify')" kind="info">
      Waiting for Account to check it against the bank. It counts as paid once verified<template v-if="r.recordedByName">; {{ r.recordedByName }} recorded it, so someone else verifies it</template>.
    </NoticeBanner>
    <NoticeBanner v-else-if="r.status === 'CANCELLED'" kind="error">Cancelled<template v-if="r.cancelReason">: “{{ r.cancelReason }}”</template>.</NoticeBanner>

    <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_330px]">
      <div class="flex min-w-0 flex-col gap-4">
        <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <h2 class="m-0 text-[15px] font-bold">Payment</h2>
          <div class="grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
            <span class="text-erp-muted">Amount</span><span class="text-[15px] font-bold">RM {{ formatMoney(r.amount) }}</span>
            <span class="text-erp-muted">Received on</span><span>{{ formatDate(r.docDate) }}</span>
            <span class="text-erp-muted">Payment</span><span>{{ r.kindLabel }}</span>
            <span class="text-erp-muted">How</span><span>{{ r.methodLabel }}<template v-if="r.payerRef"> · {{ r.payerRef }}</template></span>
            <template v-if="r.note"><span class="text-erp-muted">Note</span><span>{{ r.note }}</span></template>
            <span class="text-erp-muted">Recorded by</span><span>{{ r.recordedByName }}, {{ formatDateTime(r.recordedAt) }}</span>
            <template v-if="r.status === 'VERIFIED'">
              <span class="text-erp-muted">Verified</span>
              <span class="font-semibold text-chip-done-text">{{ r.verifiedByName }}<template v-if="r.verifiedAt">, {{ formatDateTime(r.verifiedAt) }}</template> · matches {{ r.verifiedRef }}</span>
            </template>
          </div>
        </section>

        <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <h2 class="m-0 text-[15px] font-bold">Proof</h2>
          <FileTiles :files="r.proofs" />
          <p class="m-0 text-xs text-erp-muted">Each receipt must match a bank transaction or a card settlement slip.</p>
        </section>

        <ActivityList :items="r.activity" />
      </div>

      <aside class="flex flex-col gap-4">
        <SideCard v-if="r.order" title="Sales order">
          <div class="flex flex-col gap-1.5 text-[13px]">
            <div class="flex justify-between gap-3"><RouterLink :to="`/sales/orders/${r.order.id}`" class="erp-link font-semibold">{{ r.order.docNo }}</RouterLink><StatusChip :status="r.order.payment" :label="r.order.paymentLabel" :group="PAYMENT_GROUP[r.order.payment]" /></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Order total</span><span>RM {{ formatMoney(r.order.total) }}</span></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Verified</span><span>RM {{ formatMoney(r.order.verified) }}</span></div>
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Waiting for Account</span><span>RM {{ formatMoney(r.order.waiting) }}</span></div>
            <div class="flex justify-between gap-3 font-semibold"><span>Still owed</span><span>RM {{ formatMoney(r.order.open) }}</span></div>
          </div>
        </SideCard>
      </aside>
    </div>

    <Dialog v-model:visible="verifyOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="`Verify ${r.docNo}`">
      <div class="flex flex-col gap-3 text-[13px]">
        <p class="m-0">RM {{ formatMoney(r.amount) }} by {{ r.methodLabel.toLowerCase() }}, received {{ formatDate(r.docDate) }}. Once verified it counts as paid and can no longer be changed.</p>
        <FormField label="Bank transaction or card settlement reference" :error="verifyError" for="rc-verify-ref">
          <input id="rc-verify-ref" v-model="reference" class="erp-input" maxlength="60" :aria-invalid="Boolean(verifyError)" />
        </FormField>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="verifyOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="verify">Verify</button>
      </template>
    </Dialog>
    <ReasonDialog v-model:visible="backOpen" :title="`Send back ${r.docNo}?`" message="It goes back to whoever records receipts, with your reason, to correct and send again." label="What is wrong" confirm-label="Send back" :busy="saving" @confirm="sendBack" />
    <ReasonDialog v-model:visible="cancelOpen" :title="`Cancel ${r.docNo}?`" message="The receipt stays in the list as Cancelled, with the reason. It never counts as paid." confirm-label="Cancel receipt" danger :busy="saving" @confirm="cancel" />
    <ReceiptDialog v-model:visible="editOpen" :receipt="r" @saved="saved" />
  </template>
</template>
