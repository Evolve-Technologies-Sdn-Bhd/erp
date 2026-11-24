<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import { ApiError } from '@/api/http'
import FileTiles from '@/components/erp/FileTiles.vue'
import FormField from '@/components/erp/FormField.vue'
import { useSession } from '@/composables/useSession'
import { formatMoney } from '@/utils/format'
import { salesReceiptsApi } from '../api/sales'
import type { ReceiptDetail, ReceiptKind, ReceiptMethod } from '../types'

/**
 * Record a payment as an official receipt, or correct one (phase 5). The proof (a photo or PDF of the slip) is uploaded
 * first and linked when the receipt is saved. Account then verifies it against the bank.
 */
const props = defineProps<{
  /** Recording: the order the payment is for, and what it still owes. */
  order?: { id: string; docNo: string; customerName: string; open: string; anyPaid: boolean } | null
  /** Correcting: the receipt as it is. */
  receipt?: ReceiptDetail | null
}>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [receipt: ReceiptDetail] }>()
const { today } = useSession()

const KINDS: { value: ReceiptKind; label: string }[] = [
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'BALANCE', label: 'Balance' },
]
const METHODS: { value: ReceiptMethod; label: string; ref: string }[] = [
  { value: 'TRANSFER', label: 'Bank transfer', ref: 'Transfer reference' },
  { value: 'CASH', label: 'Cash (banked in)', ref: 'Bank-in slip number' },
  { value: 'CARD', label: 'Card', ref: 'Approval code' },
  { value: 'CARD_EPP', label: 'Card instalment (EPP)', ref: 'Approval code' },
  { value: 'CHEQUE', label: 'Cheque', ref: 'Cheque number' },
]

const form = reactive({ docDate: '', kind: 'DEPOSIT' as ReceiptKind, method: 'TRANSFER' as ReceiptMethod, amount: '', payerRef: '', note: '' })
const added = ref<{ id: string; fileName: string; mimeType: string; downloadUrl: string }[]>([])
const errors = ref<Record<string, string>>({})
const saving = ref(false)

const pad = (n: number) => String(n).padStart(2, '0')
const isoToDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`) : null)
const dateToIso = (value: unknown) => (value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : '')

watch(visible, (open) => {
  if (!open) return
  const r = props.receipt
  Object.assign(form, r
    ? { docDate: r.docDate, kind: r.kind, method: r.method, amount: r.amount, payerRef: r.payerRef ?? '', note: r.note ?? '' }
    : { docDate: today.value, kind: props.order?.anyPaid ? 'BALANCE' : 'DEPOSIT', method: 'TRANSFER', amount: props.order?.open ?? '', payerRef: '', note: '' })
  added.value = []
  errors.value = {}
})

const files = computed(() => [...(props.receipt?.proofs ?? []), ...added.value])
const refLabel = computed(() => METHODS.find((m) => m.value === form.method)?.ref ?? 'Reference')
const header = computed(() => (props.receipt ? `Correct ${props.receipt.docNo}` : `Record a payment · ${props.order?.docNo ?? ''}`))

async function upload(file: File) {
  added.value = [...added.value, await salesReceiptsApi.uploadProof(file)]
}

async function save() {
  const e: Record<string, string> = {}
  if (!form.docDate) e.docDate = 'Pick the day the money was received.'
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim()) || !(Number(form.amount) > 0)) e.amount = 'Type the amount received, more than 0, like 500.00.'
  if (!files.value.length) e.proofIds = 'Add the payment proof: a photo or PDF of the slip.'
  errors.value = e
  if (Object.keys(e).length) return
  saving.value = true
  try {
    const body = { docDate: form.docDate, kind: form.kind, method: form.method, amount: form.amount.trim(), payerRef: form.payerRef, note: form.note, proofIds: added.value.map((f) => f.id) }
    const result = props.receipt
      ? await salesReceiptsApi.update(props.receipt.id, { ...body, version: props.receipt.version })
      : await salesReceiptsApi.create({ ...body, salesOrderId: props.order!.id })
    visible.value = false
    emit('saved', result)
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" data-tour="receipt-dialog" modal :draggable="false" class="erp-dialog" :style="{ width: '560px' }" :header="header">
    <div class="flex flex-col gap-3 text-[13px]">
      <p v-if="order && !receipt" class="m-0 text-erp-muted">{{ order.customerName }} · still owes RM {{ formatMoney(order.open) }}. Account checks it against the bank before it counts as paid.</p>
      <p v-if="receipt?.returnReason" class="m-0 rounded-lg border border-note-warn-border bg-note-warn-bg px-3 py-2 text-note-warn-text">Sent back by Account: “{{ receipt.returnReason }}”</p>

      <div class="grid grid-cols-2 gap-3">
        <FormField label="Received on" :error="errors.docDate" for="rc-date">
          <DatePicker
            input-id="rc-date"
            :model-value="isoToDate(form.docDate)"
            :max-date="isoToDate(today) ?? undefined"
            date-format="d M yy"
            show-icon
            fluid
            class="erp-date"
            @update:model-value="form.docDate = dateToIso($event)"
          />
        </FormField>
        <FormField label="Amount (RM)" :error="errors.amount" for="rc-amount">
          <input id="rc-amount" v-model="form.amount" class="erp-input text-right" inputmode="decimal" maxlength="15" :aria-invalid="Boolean(errors.amount)" />
        </FormField>
      </div>

      <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
        <legend class="mb-1 text-xs font-medium text-erp-muted">Payment</legend>
        <div class="flex gap-4">
          <label v-for="k in KINDS" :key="k.value" class="flex items-center gap-1.5"><input v-model="form.kind" type="radio" name="rc-kind" :value="k.value" />{{ k.label }}</label>
        </div>
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <FormField label="How the customer paid" for="rc-method">
          <select id="rc-method" v-model="form.method" class="erp-input">
            <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </FormField>
        <FormField :label="`${refLabel} (optional)`" for="rc-ref">
          <input id="rc-ref" v-model="form.payerRef" class="erp-input" maxlength="60" />
        </FormField>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-erp-muted">Proof: a photo or PDF of the slip</span>
        <FileTiles :files="files" editable add-label="+ Add proof" accept="image/*,application/pdf" :upload="upload" />
        <span v-if="errors.proofIds" class="text-xs text-note-error-text">{{ errors.proofIds }}</span>
      </div>

      <FormField label="Note (optional)" for="rc-note">
        <input id="rc-note" v-model="form.note" class="erp-input" maxlength="500" />
      </FormField>
    </div>
    <template #footer>
      <button type="button" class="erp-btn erp-btn-secondary" @click="visible = false">Cancel</button>
      <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="save">{{ receipt ? (receipt.status === 'RETURNED' ? 'Send again' : 'Save') : 'Record payment' }}</button>
    </template>
  </Dialog>
</template>
