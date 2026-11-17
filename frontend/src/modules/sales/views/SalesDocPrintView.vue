<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import PrintPreview from '@/components/erp/PrintPreview.vue'
import PrintSheet, { type PrintColumn, type PrintFact, type PrintParty, type PrintRow, type PrintTotal } from '@/components/erp/PrintSheet.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { useViewBranch } from '@/composables/useViewBranch'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { salesDeliveriesApi, salesOrdersApi, salesProformasApi, salesQuotationsApi } from '../api/sales'
import type { DeliveryDetail, OrderDetail, ProformaDetail, QuotationDetail } from '../types'

/**
 * Print preview of a quotation (S09), sales order (S11), delivery order (S16) or proforma (S22) on A4, laid out like
 * the invoice (S20). Which one comes from the route. Anything not released prints as a draft.
 */
type Kind = 'quotation' | 'order' | 'delivery' | 'proforma'
type Doc =
  | { kind: 'quotation'; d: QuotationDetail }
  | { kind: 'order'; d: OrderDetail }
  | { kind: 'delivery'; d: DeliveryDetail }
  | { kind: 'proforma'; d: ProformaDetail }

const route = useRoute()
const toast = useToast()
const { state } = useSession()
const { nameOf } = useViewBranch()

const KINDS: Record<string, Kind> = {
  'sales-quotation-print': 'quotation',
  'sales-order-print': 'order',
  'sales-delivery-print': 'delivery',
  'sales-proforma-print': 'proforma',
}
const kind = KINDS[String(route.name)] ?? 'order'
const BACK: Record<Kind, { path: string; label: string }> = {
  quotation: { path: 'quotations', label: 'quotation' },
  order: { path: 'orders', label: 'sales order' },
  delivery: { path: 'deliveries', label: 'delivery order' },
  proforma: { path: 'proformas', label: 'proforma' },
}

const doc = ref<Doc | null>(null)
const options = ref({ signature: true, discount: true })

onMounted(async () => {
  const id = String(route.params.id)
  if (kind === 'quotation') doc.value = { kind, d: await salesQuotationsApi.get(id) }
  else if (kind === 'delivery') doc.value = { kind, d: await salesDeliveriesApi.get(id) }
  else if (kind === 'proforma') doc.value = { kind, d: await salesProformasApi.get(id) }
  else doc.value = { kind, d: await salesOrdersApi.get(id) }
})

const split = (text: string | null | undefined) => (text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const days = (n: number) => `${n} days`

/** Released (or later) documents are valid; anything before that prints as a draft. */
const valid = computed(() => {
  const x = doc.value
  if (!x) return false
  if (x.kind === 'quotation') return ['RELEASED', 'ORDERED'].includes(x.d.status)
  if (x.kind === 'order') return ['RELEASED', 'PARTIAL', 'DONE'].includes(x.d.status)
  if (x.kind === 'delivery') return x.d.status === 'CONFIRMED'
  return ['SENT', 'PAID', 'USED'].includes(x.d.status)
})
const cancelled = computed(() => {
  const x = doc.value
  if (!x) return false
  return (x.kind === 'order' || x.kind === 'proforma') && x.d.status === 'CANCELLED'
})

const NAMES: Record<Kind, string> = { quotation: 'QUOTATION', order: 'SALES ORDER', delivery: 'DELIVERY ORDER', proforma: 'PROFORMA INVOICE' }
const title = computed(() => (cancelled.value ? `CANCELLED ${NAMES[kind]}` : valid.value ? NAMES[kind] : `DRAFT ${NAMES[kind]}`))

const docNote = computed(() => {
  const x = doc.value
  if (!x) return ''
  const notes: string[] = []
  if ((x.kind === 'quotation' || x.kind === 'order') && x.d.revision > 1) notes.push(`Revision ${x.d.revision}`)
  if (x.kind === 'quotation' && x.d.status === 'SUPERSEDED') notes.push('Replaced by a later revision')
  if (x.kind === 'quotation' && x.d.status === 'LOST') notes.push('Closed as lost')
  if (x.kind === 'quotation' && x.d.expired) notes.push('Expired')
  if (x.kind === 'order' && x.d.balanceCancelled) notes.push('Balance cancelled')
  if (!valid.value && !cancelled.value && !(x.kind === 'quotation' && ['SUPERSEDED', 'LOST'].includes(x.d.status))) notes.push('Not valid until released')
  return notes.join(' · ')
})

const docNo = computed(() => doc.value?.d.docNo ?? '')
const customerName = computed(() => doc.value?.d.customer.name ?? '')

const parties = computed((): PrintParty[] => {
  const x = doc.value
  if (!x) return []
  if (x.kind === 'quotation') return [{ label: 'Quotation to', lines: [x.d.customer.name, ...(x.d.contactName ? [`Attn: ${x.d.contactName}`] : []), ...(x.d.customer.email ? [x.d.customer.email] : [])] }]
  if (x.kind === 'order')
    return [
      { label: 'Customer', lines: [x.d.customer.name, ...(x.d.contactName ? [`Attn: ${x.d.contactName}`] : [])] },
      { label: 'Deliver to', lines: split(x.d.deliveryAddress).length ? split(x.d.deliveryAddress) : ['As agreed'] },
    ]
  if (x.kind === 'delivery')
    return [
      { label: 'Customer', lines: [x.d.customer.name] },
      { label: 'Deliver to', lines: split(x.d.deliverTo).length ? split(x.d.deliverTo) : [x.d.customer.name] },
    ]
  return [{ label: 'Bill to', lines: [x.d.customer.name, ...(x.d.attention ? [`Attn: ${x.d.attention}`] : [])] }]
})

const facts = computed((): PrintFact[] => {
  const x = doc.value
  if (!x) return []
  if (x.kind === 'quotation')
    return [
      { label: 'Date', value: formatDate(x.d.docDate) },
      { label: 'Valid until', value: formatDate(x.d.validUntil ?? '') || '—' },
      { label: 'Branch', value: x.d.branch.name },
      { label: 'Terms', value: days(x.d.creditTermDays) },
      { label: 'Currency', value: x.d.currency },
      { label: 'Sales agent', value: x.d.agent.name },
    ]
  if (x.kind === 'order')
    return [
      { label: 'Order date', value: formatDate(x.d.docDate) },
      { label: 'Branch', value: x.d.branch.name },
      { label: 'Wanted by', value: formatDate(x.d.deliveryWantedBy ?? '') || '—' },
      ...(x.d.promisedDate ? [{ label: 'Promised', value: formatDate(x.d.promisedDate) }] : []),
      { label: 'Terms', value: days(x.d.creditTermDays) },
      ...(x.d.customerPoRef ? [{ label: 'Your PO', value: x.d.customerPoRef }] : []),
      ...(x.d.quotation ? [{ label: 'Our quotation', value: x.d.quotation.no }] : []),
      ...(x.d.project ? [{ label: 'Project', value: x.d.project }] : []),
      { label: 'Sales agent', value: x.d.agent.name },
    ]
  if (x.kind === 'delivery')
    return [
      { label: 'DO date', value: formatDate(x.d.docDate) },
      { label: 'Branch', value: nameOf(x.d.branchCode) || x.d.branchCode },
      { label: 'Sales order', value: x.d.order.no },
      ...(x.d.order.wantedBy ? [{ label: 'Wanted by', value: formatDate(x.d.order.wantedBy) }] : []),
      { label: 'From warehouse', value: x.d.warehouseCode },
      ...(x.d.vehicle ? [{ label: 'Vehicle', value: x.d.vehicle }] : []),
      ...(x.d.driver ? [{ label: 'Driver', value: x.d.driver }] : []),
      ...(x.d.consignmentNote ? [{ label: 'Consignment note', value: x.d.consignmentNote }] : []),
    ]
  return [
    { label: 'Date', value: formatDate(x.d.docDate) },
    { label: 'Branch', value: nameOf(x.d.branchCode) || x.d.branchCode },
    { label: 'Sales order', value: x.d.order.no },
    { label: 'Pay by', value: formatDate(x.d.payBy ?? '') || '—' },
    { label: 'Currency', value: x.d.currency },
    { label: 'Sales agent', value: x.d.agent.name },
  ]
})

/** Priced lines of a quotation, order or proforma, in one shape. */
interface PricedLine {
  lineNo: number
  itemCode: string
  itemName: string
  qty: string
  uomCode: string
  unitPrice: string
  discountPct: string
  taxName: string
  amount: string
  sub: string[]
}
const pricedLines = computed((): PricedLine[] => {
  const x = doc.value
  if (!x || x.kind === 'delivery') return []
  if (x.kind === 'quotation') return x.d.lines.map((l) => ({ ...l, sub: [] }))
  if (x.kind === 'proforma') return x.d.lines.map((l) => ({ ...l, sub: [] }))
  return x.d.lines.map((l) => {
    const sub: string[] = []
    if (Number(l.deliveredQty)) sub.push(`${formatQty(l.deliveredQty)} delivered`)
    if (Number(l.cancelledQty)) sub.push(`${formatQty(l.cancelledQty)} cancelled`)
    return { ...l, qty: l.orderedQty, sub }
  })
})
const anyDiscount = computed(() => pricedLines.value.some((l) => Number(l.discountPct)))
const showDiscount = computed(() => anyDiscount.value && options.value.discount)

const columns = computed((): PrintColumn[] => {
  if (kind === 'delivery')
    return [
      { key: 'no', label: '#' },
      { key: 'item', label: 'Item' },
      { key: 'desc', label: 'Description', wrap: true },
      { key: 'ordered', label: 'Ordered', align: 'right' },
      { key: 'qty', label: 'This delivery', align: 'right' },
      { key: 'uom', label: 'UOM' },
      { key: 'left', label: 'Still to come', align: 'right' },
    ]
  return [
    { key: 'no', label: '#' },
    { key: 'item', label: 'Item' },
    { key: 'desc', label: 'Description', wrap: true },
    { key: 'qty', label: 'Qty', align: 'right' },
    { key: 'uom', label: 'UOM' },
    { key: 'price', label: 'Unit price', align: 'right' },
    ...(showDiscount.value ? [{ key: 'disc', label: 'Disc %', align: 'right' as const }] : []),
    { key: 'tax', label: 'Tax' },
    { key: 'amount', label: 'Amount (RM)', align: 'right' },
  ]
})

const rows = computed((): PrintRow[] => {
  const x = doc.value
  if (!x) return []
  if (x.kind === 'delivery')
    return x.d.lines.map((l) => ({
      no: String(l.lineNo),
      item: l.itemCode,
      desc: l.itemName,
      ordered: formatQty(l.orderedQty),
      qty: { text: formatQty(l.qty), bold: true },
      uom: l.uomCode,
      left: formatQty(l.leftAfterQty),
    }))
  return pricedLines.value.map((l) => ({
    no: String(l.lineNo),
    item: l.itemCode,
    desc: { text: l.itemName, sub: [...l.sub, ...(!showDiscount.value && Number(l.discountPct) ? [`less ${Number(l.discountPct)}% discount`] : [])] },
    qty: formatQty(l.qty),
    uom: l.uomCode,
    price: formatPrice(l.unitPrice),
    disc: Number(l.discountPct) ? `${Number(l.discountPct)}` : '—',
    tax: l.taxName,
    amount: formatMoney(l.amount),
  }))
})

const totals = computed((): PrintTotal[] => {
  const x = doc.value
  if (!x || x.kind === 'delivery') return []
  if (x.kind === 'proforma')
    return [
      { label: 'Order subtotal', value: formatMoney(x.d.orderValue.subtotal) },
      { label: x.d.orderValue.taxName || 'Tax', value: formatMoney(x.d.orderValue.tax) },
      { label: 'Order total', value: formatMoney(x.d.orderValue.total) },
      { label: `${x.d.request} (${x.d.currency})`, value: formatMoney(x.d.amount), strong: true },
    ]
  const t = x.d.totals
  return [
    { label: 'Subtotal', value: formatMoney(t.subtotal) },
    ...(Number(t.discountTotal) ? [{ label: 'Discount', value: `− ${formatMoney(t.discountTotal)}` }] : []),
    ...(Number(t.voucherTotal) ? [{ label: 'Vouchers', value: `− ${formatMoney(t.voucherTotal!)}` }] : []),
    ...t.taxLines.map((tl) => ({ label: tl.name, value: formatMoney(tl.amount) })),
    ...(Number(t.rounding) ? [{ label: 'Rounding', value: formatMoney(t.rounding) }] : []),
    { label: `Total (${x.d.currency || 'MYR'})`, value: formatMoney(t.total), strong: true },
  ]
})

const notes = computed(() => {
  const x = doc.value
  if (!x) return []
  if (x.kind === 'quotation' && x.d.customerNote) return [{ label: 'Note', text: x.d.customerNote }]
  if (x.kind === 'proforma' && x.d.note) return [{ label: 'Note', text: x.d.note }]
  return []
})

const signatures = computed(() => {
  if (!options.value.signature) return []
  const x = doc.value
  if (x?.kind === 'delivery') return ['Delivered by', x.d.receiver ? `Received by ${x.d.receiver}` : 'Received by (name, IC, chop)']
  if (kind === 'quotation') return ['Prepared by', 'Accepted by (customer)']
  if (kind === 'order') return ['Prepared by', 'Confirmed by (customer)']
  return ['Authorised signature']
})

const closing = computed(() => {
  const x = doc.value
  if (!x) return ''
  if (x.kind === 'quotation') return `Prices are valid until ${formatDate(x.d.validUntil ?? '') || 'the date agreed'}. To order, please quote ${x.d.docNo}.`
  if (x.kind === 'order') return `Please check the order and tell us of any change before ${formatDate(x.d.deliveryWantedBy ?? '') || 'delivery'}.`
  if (x.kind === 'delivery') return 'Received the goods above in good order and condition.'
  return `This proforma is a request for payment, not a tax invoice. Please quote ${x.d.docNo} with your payment.`
})

const FOOTERS: Record<Kind, string> = {
  quotation: 'This is a computer-generated quotation.',
  order: 'This is a computer-generated sales order.',
  delivery: 'This is a computer-generated delivery order.',
  proforma: 'This is a computer-generated proforma invoice.',
}

const canEmail = computed(() => {
  const x = doc.value
  if (!x || !valid.value) return false
  if (x.kind === 'quotation') return x.d.allowedActions.includes('email')
  if (x.kind === 'proforma') return x.d.allowedActions.includes('email')
  return false
})
async function email() {
  const x = doc.value!
  const result = x.kind === 'quotation' ? await salesQuotationsApi.email(x.d.id) : await salesProformasApi.email(x.d.id)
  toast.add({ severity: 'success', summary: 'Sent', detail: `${x.d.docNo} emailed to ${result.sentTo}.`, life: 4000 })
}
</script>

<template>
  <PrintPreview
    module="sales"
    :back-to="`/sales/${BACK[kind].path}/${route.params.id}`"
    :back-label="docNo || BACK[kind].label"
    :heading="`Print preview · ${docNo} · ${customerName}`"
    :footer="`${docNo} · ${FOOTERS[kind]}`"
    :file-title="doc ? `${docNo} · ${customerName}` : 'Print preview'"
    :ready="!!doc"
    :email-label="kind === 'quotation' || kind === 'proforma' ? 'Email to customer' : undefined"
    :can-email="canEmail"
    @email="email"
  >
    <template #options>
      <span class="font-bold">Include</span>
      <div class="flex flex-col">
        <div class="flex items-center justify-between border-b border-erp-row py-2">
          <span>Signature lines</span><SwitchToggle v-model="options.signature" label="Signature lines" />
        </div>
        <div v-if="anyDiscount" class="flex items-center justify-between border-b border-erp-row py-2">
          <span>Discount column</span><SwitchToggle v-model="options.discount" label="Discount column" />
        </div>
      </div>
      <p v-if="doc && !valid && !cancelled" class="m-0 rounded-[10px] border border-note-warn-border bg-note-warn-bg px-3 py-2.5 text-note-warn-text">
        {{ docNo }} is not released, so it prints as a draft.
      </p>
      <p v-if="kind === 'delivery'" class="m-0 text-xs text-erp-muted">A delivery order shows quantities only, never prices.</p>
      <p class="m-0 mt-auto text-xs text-erp-muted">Layouts are set up in Operation Policies › Document Types.</p>
    </template>

    <PrintSheet
      v-if="doc"
      :company="state.tenantName || 'Zora Pro ERP'"
      :title="title"
      :doc-no="docNo"
      :doc-note="docNote"
      :parties="parties"
      :facts="facts"
      :columns="columns"
      :rows="rows"
      :totals="totals"
      :notes="notes"
      :signatures="signatures"
      :closing="closing"
    />
  </PrintPreview>
</template>
