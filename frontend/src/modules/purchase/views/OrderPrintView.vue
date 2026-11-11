<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import PrintPreview from '@/components/erp/PrintPreview.vue'
import PrintSheet, { type PrintColumn, type PrintFact, type PrintParty, type PrintRow, type PrintTotal } from '@/components/erp/PrintSheet.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { ordersApi } from '../api/purchase'
import type { OrderDetail } from '../types'

/**
 * P10 · Print preview of a purchase order: the A4 order sent to the supplier, laid out like the Sales invoice
 * (S20). Before release it prints as a draft, never as an order the supplier could act on.
 */
const route = useRoute()
const toast = useToast()
const { state } = useSession()

const po = ref<OrderDetail | null>(null)
const options = ref({ signature: true, received: false })
onMounted(async () => {
  po.value = await ordersApi.get(String(route.params.id))
})

/** Statuses the supplier may act on: released and later, but not cancelled. */
const valid = computed(() => ['RELEASED', 'PARTIAL', 'DONE'].includes(po.value?.status ?? ''))
const title = computed(() => {
  const s = po.value?.status
  if (s === 'CANCELLED') return 'CANCELLED ORDER'
  return valid.value ? 'PURCHASE ORDER' : 'DRAFT PURCHASE ORDER'
})
const docNote = computed(() => {
  const o = po.value
  if (!o) return ''
  if (o.status === 'CANCELLED') return 'This order was cancelled'
  if (!valid.value) return `${o.statusLabel} · not valid until released`
  if (o.balanceCancelled) return 'Balance cancelled'
  return ''
})

async function email() {
  const o = po.value!
  const result = await ordersApi.email(o.id)
  toast.add({ severity: 'success', summary: 'Sent', detail: `${o.docNo} emailed to ${result.sentTo}.`, life: 4000 })
}

const parties = computed((): PrintParty[] => {
  const o = po.value
  if (!o) return []
  return [
    { label: 'Supplier', lines: [o.supplier.name, `Supplier code ${o.supplier.code}`, ...(o.supplier.email ? [o.supplier.email] : [])] },
    { label: 'Deliver to', lines: [o.warehouse.name, o.branch.name] },
  ]
})

const facts = computed((): PrintFact[] => {
  const o = po.value
  if (!o) return []
  return [
    { label: 'PO date', value: formatDate(o.docDate) },
    { label: 'Branch', value: o.branch.name },
    { label: 'Expected delivery', value: formatDate(o.expectedDate ?? '') || '—' },
    { label: 'Payment term', value: `${o.paymentTermDays} days` },
    { label: 'Currency', value: o.currency },
    ...(o.supplierQuoteRef ? [{ label: 'Your quote', value: o.supplierQuoteRef }] : []),
    { label: 'Buyer', value: o.buyer.name },
  ]
})

const columns = computed((): PrintColumn[] => [
  { key: 'no', label: '#' },
  { key: 'item', label: 'Item' },
  { key: 'desc', label: 'Description', wrap: true },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  ...(options.value.received ? [{ key: 'received', label: 'Received', align: 'right' as const }] : []),
  { key: 'price', label: 'Unit price', align: 'right' },
  { key: 'tax', label: 'Tax' },
  { key: 'amount', label: `Amount (${po.value?.currency ?? 'MYR'})`, align: 'right' },
])

const rows = computed((): PrintRow[] =>
  (po.value?.lines ?? []).map((l) => {
    const sub: string[] = []
    if (Number(l.cancelledQty)) sub.push(`${formatQty(l.cancelledQty)} ${l.uomCode} cancelled`)
    return {
      no: String(l.lineNo),
      item: l.itemCode,
      desc: { text: l.itemName, sub },
      qty: formatQty(l.orderedQty),
      uom: l.uomCode,
      received: formatQty(l.receivedQty),
      price: formatPrice(l.unitPrice),
      tax: l.taxName,
      amount: formatMoney(l.amount),
    }
  }),
)

const totals = computed((): PrintTotal[] => {
  const t = po.value?.totals
  if (!t) return []
  return [
    { label: 'Subtotal', value: formatMoney(t.subtotal) },
    ...t.taxLines.map((x) => ({ label: x.name, value: formatMoney(x.amount) })),
    { label: `Order total (${po.value!.currency})`, value: formatMoney(t.total), strong: true },
  ]
})
</script>

<template>
  <PrintPreview
    module="purchase"
    :back-to="`/purchase/orders/${route.params.id}`"
    :back-label="po?.docNo ?? 'purchase order'"
    :heading="`Print preview · ${po?.docNo ?? ''} · ${po?.supplier.name ?? ''}`"
    :footer="`${po?.docNo ?? ''} · Please quote this PO number on your delivery order and invoice.`"
    :file-title="po ? `${po.docNo} · ${po.supplier.name}` : 'Print preview'"
    :ready="!!po"
    email-label="Email to supplier"
    :can-email="valid && !!po?.allowedActions.includes('email')"
    @email="email"
  >
    <template #options>
      <span class="font-bold">Include</span>
      <div class="flex flex-col">
        <div class="flex items-center justify-between border-b border-erp-row py-2">
          <span>Signature lines</span><SwitchToggle v-model="options.signature" label="Signature lines" />
        </div>
        <div class="flex items-center justify-between border-b border-erp-row py-2">
          <span>Received so far</span><SwitchToggle v-model="options.received" label="Received so far" />
        </div>
      </div>
      <p v-if="po && !valid" class="m-0 rounded-[10px] border border-note-warn-border bg-note-warn-bg px-3 py-2.5 text-note-warn-text">
        {{ po.docNo }} is not released, so it prints as a draft. Send it to the supplier once it is released.
      </p>
      <p class="m-0 mt-auto text-xs text-erp-muted">“Received so far” is for your own copy; the supplier's copy leaves it off.</p>
    </template>

    <PrintSheet
      v-if="po"
      :company="state.tenantName || 'Purchase order'"
      :title="title"
      :doc-no="po.docNo"
      :doc-note="docNote"
      :parties="parties"
      :facts="facts"
      :columns="columns"
      :rows="rows"
      :totals="totals"
      :notes="po.noteToSupplier ? [{ label: 'Note to supplier', text: po.noteToSupplier }] : []"
      :signatures="options.signature ? ['Prepared by', 'Approved by'] : []"
      :closing="`Deliver to ${po.warehouse.name} by ${formatDate(po.expectedDate ?? '') || 'the agreed date'}, with a delivery order quoting ${po.docNo}.`"
    />
  </PrintPreview>
</template>
