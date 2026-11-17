<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import PrintPreview from '@/components/erp/PrintPreview.vue'
import PrintSheet, { type PrintColumn, type PrintFact, type PrintParty, type PrintRow, type PrintTotal } from '@/components/erp/PrintSheet.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { salesInvoicesApi } from '../api/sales'
import type { InvoiceDetail } from '../types'

/** S20 · Print preview (InvoicePrint.html): an A4 page printed with the browser's own print. */
const route = useRoute()
const toast = useToast()

const inv = ref<InvoiceDetail | null>(null)
const options = reactive({ copies: 1, logo: true, bank: true, delivery: true, qr: true, signature: true, photos: false })

onMounted(async () => {
  inv.value = await salesInvoicesApi.get(String(route.params.id))
})

async function email() {
  const i = inv.value!
  try {
    const result = await salesInvoicesApi.email(i.id)
    toast.add({ severity: 'success', summary: 'Sent', detail: `${i.docNo} emailed to ${result.sentTo}.`, life: 4000 })
  } catch {
    /* the error toast comes from the API wrapper */
  }
}

const released = computed(() => inv.value?.status === 'RELEASED')
const split = (text: string | null | undefined) => (text ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const parties = computed((): PrintParty[] => {
  const i = inv.value
  if (!i) return []
  const bill = split(i.billTo)
  const list: PrintParty[] = [
    { label: 'Bill to', lines: [i.customer.name, ...bill.slice(1), `Attn: ${i.contactName ?? '—'} · TIN ${i.customer.tin ? 'on file' : 'missing'}`] },
  ]
  if (options.delivery) list.push({ label: 'Deliver to', lines: split(i.customer.deliveryAddress) })
  return list
})

const facts = computed((): PrintFact[] => {
  const i = inv.value
  if (!i) return []
  return [
    { label: 'Invoice date', value: formatDate(i.docDate) },
    { label: 'Branch', value: i.branch.name },
    { label: 'Terms', value: `${i.creditTermDays} days` },
    { label: 'Due date', value: formatDate(i.dueDate ?? '') || '—' },
    ...(i.order ? [{ label: 'Sales order', value: i.order.no }] : []),
    ...(i.deliveries.length ? [{ label: 'Delivery order', value: i.deliveries.map((d) => d.no).join(', ') }] : []),
    ...(i.customerPoRef ? [{ label: 'Your PO', value: i.customerPoRef }] : []),
    { label: 'Sales agent', value: i.agent.name },
  ]
})

const columns: PrintColumn[] = [
  { key: 'no', label: '#' },
  { key: 'item', label: 'Item' },
  { key: 'desc', label: 'Description', wrap: true },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  { key: 'price', label: 'Unit price', align: 'right' },
  { key: 'tax', label: 'Tax' },
  { key: 'amount', label: 'Amount (RM)', align: 'right' },
]

const rows = computed((): PrintRow[] => {
  const i = inv.value
  if (!i) return []
  return i.lines.map((l) => {
    const sub: string[] = []
    if (l.orderLine && i.deliveries.length)
      sub.push(`Delivered on ${i.deliveries.map((d) => d.no).join(', ')} · ${formatQty(l.orderLine.deliveredQty)} of ${formatQty(l.orderLine.orderedQty)} on ${i.order?.no ?? ''}`)
    if (Number(l.discountPct)) sub.push(`less ${Number(l.discountPct)}% discount`)
    return {
      no: String(l.lineNo),
      item: l.itemCode,
      desc: { text: l.itemName, sub },
      qty: formatQty(l.qty),
      uom: l.uomCode,
      price: formatPrice(l.unitPrice),
      tax: l.taxName,
      amount: formatMoney(l.amount),
    }
  })
})

const totals = computed((): PrintTotal[] => {
  const t = inv.value?.totals
  if (!t) return []
  return [
    { label: 'Subtotal', value: formatMoney(t.subtotal) },
    ...(Number(t.discountTotal) ? [{ label: 'Discount', value: `− ${formatMoney(t.discountTotal)}` }] : []),
    ...(Number(t.voucherTotal) ? [{ label: `Vouchers (${inv.value!.vouchers.map((v) => v.voucherNo).join(', ')})`, value: `− ${formatMoney(t.voucherTotal!)}` }] : []),
    ...t.taxLines.map((x) => ({ label: x.name, value: formatMoney(x.amount) })),
    ...(Number(t.rounding) ? [{ label: 'Rounding', value: formatMoney(t.rounding) }] : []),
    { label: `Total (${inv.value!.currency || 'MYR'})`, value: formatMoney(t.total), strong: true },
  ]
})
</script>

<template>
  <PrintPreview
    module="sales"
    :back-to="`/sales/invoices/${route.params.id}`"
    :back-label="inv?.docNo ?? 'invoice'"
    :heading="`Print preview · ${inv?.docNo ?? ''} · ${inv?.customer.name ?? ''}`"
    :footer="`${inv?.docNo ?? ''} · This is a computer-generated invoice.`"
    :file-title="inv ? `${inv.docNo} · ${inv.customer.name}` : 'Print preview'"
    :ready="!!inv"
    email-label="Email to customer"
    :can-email="released"
    @email="email"
  >
    <template #options>
      <label class="flex flex-col gap-1.5 text-xs font-medium text-erp-muted">
        Printer
        <select class="erp-input text-[13px] text-erp-text"><option>This computer · browser print</option></select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1.5 text-xs font-medium text-erp-muted">Copies<input v-model.number="options.copies" type="number" min="1" class="erp-input text-[13px] text-erp-text" /></label>
        <label class="flex flex-col gap-1.5 text-xs font-medium text-erp-muted">Paper<select class="erp-input text-[13px] text-erp-text"><option>A4</option></select></label>
      </div>
      <label class="flex flex-col gap-1.5 text-xs font-medium text-erp-muted">
        Layout
        <select class="erp-input text-[13px] text-erp-text"><option>Standard tax invoice</option></select>
      </label>
      <span class="font-bold">Include</span>
      <div class="flex flex-col">
        <div v-for="o in [
          { key: 'logo', label: 'Company logo' },
          { key: 'bank', label: 'Bank details' },
          { key: 'delivery', label: 'Delivery address' },
          { key: 'qr', label: 'e-Invoice QR code' },
          { key: 'signature', label: 'Signature line' },
          { key: 'photos', label: 'Show item photos' },
        ] as const" :key="o.key" class="flex items-center justify-between border-b border-erp-row py-2">
          <span>{{ o.label }}</span>
          <SwitchToggle v-model="options[o.key]" :label="o.label" />
        </div>
      </div>
      <p class="m-0 rounded-[10px] border border-note-warn-border bg-note-warn-bg px-3 py-2.5 text-note-warn-text">
        The QR code and LHDN UUID print only after e-Invoice validation. Until then the invoice prints with “e-Invoice pending”.
      </p>
      <p class="m-0 mt-auto text-xs text-erp-muted">Layouts are set up in Operation Policies › Document Types.</p>
    </template>

    <PrintSheet
      v-if="inv"
      :company="inv.print.companyName"
      :company-lines="['Reg. no · address · SST no · TIN', 'All from Master Data › Company']"
      :logo="options.logo"
      :title="released ? 'TAX INVOICE' : 'DRAFT INVOICE'"
      :doc-no="inv.docNo"
      :doc-note="released ? '' : 'Not valid until released'"
      :parties="parties"
      :facts="facts"
      :columns="columns"
      :rows="rows"
      :totals="totals"
      :words="inv.print.amountInWords"
      :notes="inv.note ? [{ label: 'Note', text: inv.note }] : []"
      :signatures="options.signature ? ['Authorised signature'] : []"
    >
      <template #foot>
        <div class="flex items-end gap-4">
          <div v-if="options.qr" class="flex h-[90px] w-[90px] shrink-0 items-center justify-center border border-dashed border-erp-input px-2 text-center text-[8px] text-erp-muted">e-Invoice QR after LHDN validation</div>
          <div class="flex flex-col gap-1">
            <div><strong>LHDN e-Invoice:</strong> pending</div>
            <div class="text-erp-subtle">UUID and validation date print here once validated.</div>
            <div v-if="options.bank"><strong>Pay to:</strong> <span class="border border-dashed border-erp-input px-1 text-erp-muted">[Bank and account no, from Master Data]</span></div>
            <div>Reference: {{ inv.docNo }}</div>
          </div>
        </div>
      </template>
    </PrintSheet>
  </PrintPreview>
</template>
