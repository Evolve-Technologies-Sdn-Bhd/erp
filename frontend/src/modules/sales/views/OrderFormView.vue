<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import Menu from 'primevue/menu'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ChevronDown, Gift, Lock, Plus, Ticket, X } from '@lucide/vue'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FormField from '@/components/erp/FormField.vue'
import LinkedDocs from '@/components/erp/LinkedDocs.vue'
import MasterDataPicker from '@/components/erp/MasterDataPicker.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { notifyApprovalsChanged } from '@/composables/useApprovalsCount'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { roleLabel, useSession } from '@/composables/useSession'
import { formatDate, formatDateTime, formatMoney, formatPrice, formatQty, formatRm } from '@/utils/format'
import { isPositiveDecimal, previewSaleLine, sumMoney } from '@/utils/money'
import { salesDeliveriesApi, salesLookupsApi, salesOrdersApi, salesProformasApi } from '../api/sales'
import ItemPickerDialog from '../components/ItemPickerDialog.vue'
import NewCustomerDialog from '../components/NewCustomerDialog.vue'
import PackagePickerDialog from '../components/PackagePickerDialog.vue'
import ReceiptDialog from '../components/ReceiptDialog.vue'
import { PAYMENT_GROUP, RECEIPT_GROUP } from './receipts'
import { salesFlow } from '../flow'
import { docRoute } from '../routes'
import type { CustomerOption, InstallOption, OrderAction, OrderDetail, OrderLine, PackageOption, ReceiptDetail, SaleItemOption } from '../types'

/** S11 · Sales order (SalesOrderForm.html) and S12 · Credit check failed (CreditApproval.html). */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const setCrumb = usePageCrumb()
const { today, user, can: canDo } = useSession()

const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')

const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const pickerOpen = ref(false)
const reason = ref('')
const reasonError = ref('')
const transferMenu = ref<InstanceType<typeof Menu> | null>(null)

// ── Form state ───────────────────────────────────────────────────────────────
interface LineItem {
  code: string
  name: string
  uomCode: string
  taxCode: string
  taxName: string
  taxRate: string
  listPrice: string | null
}
interface EditLine {
  kind: 'item'
  key: number
  item: LineItem
  qty: string
  unitPrice: string
  discountPct: string
}
/** A package on the order (phase 5): sets and the chosen gift. Core prices it; the form only previews. */
interface EditPackage {
  kind: 'package'
  key: number
  code: string
  name: string
  uomCode: string
  price: string
  taxCode: string
  taxName: string
  taxRate: string
  giftRule: PackageOption['giftRule']
  /** Items per set, with the unit price the package gives them. */
  items: { itemCode: string; itemName: string; qty: string; uomCode: string; unitPrice: string }[]
  gifts: PackageOption['gifts']
  qty: string
  giftItemCode: string | null
}
type FormLine = EditLine | EditPackage
/** A voucher the agent typed (phase 5): it lowers the amount taxed, so the server prices its tax. */
interface EditVoucher {
  key: number
  voucherNo: string
  description: string
  amount: string
  taxCode: string | null
  invoiceNo: string | null
}
let nextKey = 1
const form = reactive({
  customer: null as CustomerOption | null,
  contactName: '',
  docDate: '',
  deliveryWantedBy: '',
  customerPoRef: '',
  project: '',
  deliveryAddress: '',
  installOption: 'INSTALLATION' as InstallOption,
  installDate: '',
  lines: [] as FormLine[],
  vouchers: [] as EditVoucher[],
})
const pad = (n: number) => String(n).padStart(2, '0')
const isoToDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`) : null)
const dateToIso = (value: unknown) => (value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : '')
const trimPrice = (v: string) => v.replace(/(\.\d\d)00$/, '$1')

const saved = ref('')
// ── Installation (phase 5): asked when the company turns it on in Sales Flow (S34) ──
const INSTALL_OPTIONS: { value: InstallOption; label: string }[] = [
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'DELIVERY', label: 'Delivery only' },
  { value: 'COLLECT', label: 'Collect' },
]
/** A new order follows the switch; a saved one shows what it was saved with. */
const askInstallation = computed(() => (order.value ? order.value.installation.asked || order.value.installation.option !== null : salesFlow.value.askInstallation))
const installHint = computed(() => {
  const i = order.value?.installation
  if (form.installOption !== 'INSTALLATION') return 'No installation job. Delivery or collection is arranged as usual.'
  if (i?.afterStock) return 'Some items are short: the office arranges installation when stock arrives.'
  return 'The office books the installer and slot. Needed to release when every item is in stock.'
})

const snapshot = () =>
  JSON.stringify({
    ...form,
    lines: form.lines.map((l) => (l.kind === 'package' ? { pkg: l.code, qty: l.qty, gift: l.giftItemCode } : { code: l.item.code, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct })),
    vouchers: form.vouchers.map((v) => ({ no: v.voucherNo, amount: v.amount, description: v.description, taxCode: v.taxCode })),
  })
const dirty = computed(() => snapshot() !== saved.value)

const can = (action: OrderAction) => (isNew.value ? action === 'edit' : Boolean(order.value?.allowedActions.includes(action)))
const editable = computed(() => isNew.value || can('edit'))

function fillForm(o: OrderDetail | null) {
  if (o) {
    form.customer = { code: o.customer.code, name: o.customer.name, branchCode: o.branch.code, contactName: o.contactName, deliveryAddress: o.deliveryAddress, creditTermDays: o.creditTermDays, priceListCode: o.priceList.code, creditLimit: null, defaultAgentCode: null }
    form.contactName = o.contactName ?? ''
    form.docDate = o.docDate
    form.deliveryWantedBy = o.deliveryWantedBy ?? ''
    form.customerPoRef = o.customerPoRef ?? ''
    form.project = o.project ?? ''
    form.deliveryAddress = o.deliveryAddress ?? ''
    form.installOption = o.installation.option ?? 'INSTALLATION'
    form.installDate = o.installation.preferredDate ?? ''
    form.lines = toFormLines(o.lines)
    form.vouchers = o.vouchers.map((v) => ({ key: nextKey++, voucherNo: v.voucherNo, description: v.description, amount: v.amount, taxCode: v.taxCode, invoiceNo: v.invoiceNo ?? null }))
  } else {
    form.customer = null
    form.contactName = ''
    form.docDate = today.value
    form.deliveryWantedBy = ''
    form.customerPoRef = ''
    form.project = ''
    form.deliveryAddress = ''
    form.installOption = 'INSTALLATION'
    form.installDate = ''
    form.lines = []
    form.vouchers = []
  }
  saved.value = snapshot()
  errors.value = {}
}

const plainQty = (v: string) => formatQty(v).replace(/,/g, '')
/** The order's lines as the form edits them: each package's lines become one package line again. */
function toFormLines(lines: OrderLine[]): FormLine[] {
  const out: FormLine[] = []
  const seen = new Set<number>()
  for (const l of lines) {
    if (!l.package) {
      out.push({
        kind: 'item',
        key: nextKey++,
        item: { code: l.itemCode, name: l.itemName, uomCode: l.uomCode, taxCode: l.taxCode, taxName: l.taxName, taxRate: l.taxRate, listPrice: l.listPrice },
        qty: plainQty(l.orderedQty),
        unitPrice: trimPrice(l.unitPrice),
        discountPct: Number(l.discountPct) ? l.discountPct.replace(/\.?0+$/, '') : '',
      })
      continue
    }
    const p = l.package
    if (seen.has(p.group)) continue
    seen.add(p.group)
    const own = lines.filter((x) => x.package?.group === p.group)
    const sets = plainQty(p.qty)
    const perSet = (qty: string) => plainQty((Number(qty) / Number(sets)).toFixed(4))
    const gift = own.find((x) => x.lineKind === 'GIFT') ?? null
    out.push({
      kind: 'package',
      key: nextKey++,
      code: p.code,
      name: p.name,
      uomCode: p.uomCode,
      price: p.price,
      taxCode: l.taxCode,
      taxName: l.taxName,
      taxRate: l.taxRate,
      giftRule: gift ? 'CHOOSE_ONE' : 'NONE',
      items: own.filter((x) => x.lineKind === 'PACKAGE').map((x) => ({ itemCode: x.itemCode, itemName: x.itemName, qty: perSet(x.orderedQty), uomCode: x.uomCode, unitPrice: x.unitPrice })),
      gifts: gift ? [{ itemCode: gift.itemCode, itemName: gift.itemName, qty: perSet(gift.orderedQty), uomCode: gift.uomCode }] : [],
      qty: sets,
      giftItemCode: gift?.itemCode ?? null,
    })
  }
  return out
}

async function load() {
  loading.value = true
  try {
    order.value = isNew.value ? null : await salesOrdersApi.get(id.value)
    fillForm(order.value)
    setCrumb(order.value?.docNo ?? 'New sales order')
  } finally {
    loading.value = false
  }
  if (editable.value) void loadPackageChoices()
}
onMounted(load)

// ── Official receipts (phase 5): record a payment with its proof; Account verifies it ──
const receiptOpen = ref(false)
const receiptFor = computed(() => {
  const o = order.value
  const p = o?.payments
  return o && p ? { id: o.id, docNo: o.docNo, customerName: o.customer.name, open: p.open, anyPaid: Number(p.verified) + Number(p.waiting) > 0 } : null
})
async function receiptSaved(r: ReceiptDetail) {
  toast.add({ severity: 'success', summary: `${r.docNo} recorded`, detail: 'Waiting for Account to check it against the bank.', life: 4000 })
  show(await salesOrdersApi.get(order.value!.id))
}

function show(o: OrderDetail) {
  order.value = o
  fillForm(o)
  setCrumb(o.docNo)
  if (editable.value) void loadPackageChoices()
}

const searchCustomers = async (q: string) => (await salesLookupsApi.customers(q)).items
function onCustomerPicked(c: CustomerOption) {
  form.customer = c
  if (!form.contactName) form.contactName = c.contactName ?? ''
  if (!form.deliveryAddress) form.deliveryAddress = c.deliveryAddress ?? ''
}

// ── New customer (phase 5): when Sales Flow lets salespeople add one, Core makes it and the order uses it at once ──
const newCustomerOpen = ref(false)
const canAddCustomer = computed(() => editable.value && salesFlow.value.agentsAddCustomers && canDo('sales.order.edit'))
function onCustomerAdded(c: CustomerOption) {
  form.customer = c
  form.contactName = c.contactName ?? ''
  form.deliveryAddress = c.deliveryAddress ?? ''
  errors.value = { ...errors.value, customerCode: '' }
}

// ── Lines ────────────────────────────────────────────────────────────────────
const onLines = computed(() => Object.fromEntries(form.lines.flatMap((l, i) => (l.kind === 'item' ? [[l.item.code, i + 1]] : []))))
function addItems(picked: { item: SaleItemOption; qty: string }[]) {
  for (const { item, qty } of picked) {
    form.lines.push({
      kind: 'item',
      key: nextKey++,
      item: { code: item.code, name: item.name, uomCode: item.uomCode, taxCode: item.taxCode, taxName: item.taxName, taxRate: item.taxRate, listPrice: item.listPrice },
      qty,
      unitPrice: trimPrice(item.listPrice ?? item.lastSold?.price ?? ''),
      discountPct: '',
    })
  }
}
function removeLine(key: number) {
  form.lines = form.lines.filter((l) => l.key !== key)
}
function openPicker() {
  if (!form.customer) {
    errors.value = { ...errors.value, customerCode: 'Pick the customer first, so the right price list is used.' }
    return
  }
  pickerOpen.value = true
}

// ── Packages (phase 5) ───────────────────────────────────────────────────────
const packagePickerOpen = ref(false)
function addPackage({ pkg, qty, giftItemCode }: { pkg: PackageOption; qty: string; giftItemCode: string | null }) {
  form.lines.push({
    kind: 'package',
    key: nextKey++,
    code: pkg.code,
    name: pkg.name,
    uomCode: pkg.uomCode,
    price: pkg.price,
    taxCode: pkg.taxCode,
    taxName: pkg.taxName,
    taxRate: pkg.taxRate,
    giftRule: pkg.giftRule,
    items: pkg.items.map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, qty: plainQty(i.qty), uomCode: i.uomCode, unitPrice: i.unitPrice ?? '0' })),
    gifts: pkg.gifts,
    qty,
    giftItemCode,
  })
}
/** A draft's packages get their gift choices from Core again, so the agent can still change the gift. */
async function loadPackageChoices() {
  if (!form.lines.some((l) => l.kind === 'package')) return
  const running = (await salesLookupsApi.packages(form.docDate || undefined)).items
  for (const l of form.lines) {
    const p = l.kind === 'package' ? running.find((x) => x.code === l.code) : undefined
    if (l.kind === 'package' && p) {
      l.giftRule = p.giftRule
      l.gifts = p.gifts
    }
  }
  saved.value = snapshot()
}
/** Per-set quantity × whole sets, exactly: "6" × 2 → "12". */
function timesSets(qty: string, sets: string): string {
  if (!/^[1-9]\d*$/.test(sets)) return '0'
  const [whole = '0', frac = ''] = qty.split('.')
  const units = BigInt(whole + frac) * BigInt(sets)
  const s = units.toString().padStart(frac.length + 1, '0')
  return frac.length ? `${s.slice(0, -frac.length)}.${s.slice(-frac.length)}` : s
}
const packageParts = (l: EditPackage) => l.items.map((i) => ({ ...i, total: timesSets(i.qty, l.qty.trim()), preview: previewSaleLine(timesSets(i.qty, l.qty.trim()), i.unitPrice, '0', l.taxRate) }))
function linePreview(l: FormLine) {
  if (l.kind === 'item') return previewSaleLine(l.qty || '0', l.unitPrice || '0', l.discountPct || '0', l.item.taxRate)
  const parts = packageParts(l).map((p) => p.preview)
  if (parts.some((p) => p === null)) return null
  return {
    grossAmount: sumMoney(parts.map((p) => p!.grossAmount)),
    discountAmount: '0.00',
    amount: sumMoney(parts.map((p) => p!.amount)),
    taxAmount: sumMoney(parts.map((p) => p!.taxAmount)),
  }
}
const taxOf = (l: FormLine) => (l.kind === 'item' ? { code: l.item.taxCode, name: l.item.taxName } : { code: l.taxCode, name: l.taxName })
const giftName = (l: EditPackage) => l.gifts.find((g) => g.itemCode === l.giftItemCode)?.itemName ?? l.giftItemCode ?? ''

const previews = computed(() => form.lines.map(linePreview))

// ── Vouchers (phase 5) ───────────────────────────────────────────────────────
const MONEY = /^\d+(\.\d{1,2})?$/
/** Tax codes on the order with their name and rate, for the tax a voucher lowers. */
const lineTaxes = computed(() => {
  const out = new Map<string, { name: string; rate: string }>()
  for (const l of form.lines) {
    const t = taxOf(l)
    if (!out.has(t.code)) out.set(t.code, { name: t.name, rate: l.kind === 'item' ? l.item.taxRate : l.taxRate })
  }
  return out
})
const voucherTax = (v: EditVoucher) => v.taxCode ?? (lineTaxes.value.size === 1 ? [...lineTaxes.value.keys()][0]! : null)
const voucherPreviews = computed(() =>
  form.vouchers.map((v) => {
    const taxCode = voucherTax(v)
    const rate = taxCode ? lineTaxes.value.get(taxCode)?.rate : undefined
    return { key: v.key, taxCode, preview: MONEY.test(v.amount) && Number(v.amount) > 0 && rate !== undefined ? previewSaleLine('1', v.amount, '0', rate) : null }
  }),
)
function addVoucher() {
  form.vouchers.push({ key: nextKey++, voucherNo: '', description: 'Cash voucher', amount: '', taxCode: null, invoiceNo: null })
}
function removeVoucher(key: number) {
  form.vouchers = form.vouchers.filter((v) => v.key !== key)
}
const voucherErrors = (i: number) => ['voucherNo', 'amount', 'taxCode'].map((k) => errors.value[`vouchers[${i}].${k}`]).filter((m): m is string => Boolean(m))
const previewTotals = computed(() => {
  const ok = previews.value.filter((p) => p !== null)
  const gross = sumMoney(ok.map((p) => p!.grossAmount))
  const discount = sumMoney(ok.map((p) => p!.discountAmount))
  const taxes = new Map<string, { name: string; amounts: string[] }>()
  form.lines.forEach((l, i) => {
    const p = previews.value[i]
    if (!p) return
    const tax = taxOf(l)
    const entry = taxes.get(tax.code) ?? { name: tax.name, amounts: [] }
    entry.amounts.push(p.taxAmount)
    taxes.set(tax.code, entry)
  })
  // Vouchers lower the tax of the items they are on: round(amount × rate, 2), as the server does.
  for (const v of voucherPreviews.value) {
    const entry = v.preview && v.taxCode ? taxes.get(v.taxCode) : undefined
    if (entry && v.preview) entry.amounts.push(`-${v.preview.taxAmount}`)
  }
  const taxLines = [...taxes].map(([code, t]) => ({ code, name: t.name, amount: sumMoney(t.amounts) }))
  const voucherTotal = sumMoney(voucherPreviews.value.map((v) => v.preview?.amount ?? '0.00'))
  const net = sumMoney([...ok.map((p) => p!.amount), `-${voucherTotal}`])
  // 5-sen rounding is applied by the server on save; the preview shows the total before it.
  return { subtotal: gross, discountTotal: discount, voucherTotal, taxLines, rounding: '0.00', total: sumMoney([net, ...taxLines.map((t) => t.amount)]) }
})
const totals = computed(() => (editable.value ? previewTotals.value : order.value?.totals))

// ── Save, release, approval ──────────────────────────────────────────────────
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.customer) e.customerCode = 'Pick the customer from Master Data.'
  if (!form.lines.length) e.lines = 'Add at least one item.'
  form.lines.forEach((l, i) => {
    if (l.kind === 'package') {
      if (!/^[1-9]\d*$/.test(l.qty.trim())) e[`lines[${i}].qty`] = 'Packages are sold in whole sets.'
      if (l.giftRule === 'CHOOSE_ONE' && !l.giftItemCode) e[`lines[${i}].giftItemCode`] = `Pick the free gift for ${l.code}.`
      return
    }
    if (!isPositiveDecimal(l.qty)) e[`lines[${i}].qty`] = 'Quantity must be more than 0.'
    if (!/^\d+(\.\d{1,4})?$/.test(l.unitPrice)) e[`lines[${i}].unitPrice`] = 'Enter a price.'
    if (l.discountPct && !/^\d{1,3}(\.\d{1,2})?$/.test(l.discountPct)) e[`lines[${i}].discountPct`] = 'Discount like 5 or 7.5.'
  })
  form.vouchers.forEach((v, i) => {
    if (!v.voucherNo.trim()) e[`vouchers[${i}].voucherNo`] = 'Type the voucher number.'
    if (!MONEY.test(v.amount) || !(Number(v.amount) > 0)) e[`vouchers[${i}].amount`] = 'Amount more than 0, like 50.00.'
    if (!voucherTax(v) && lineTaxes.value.size > 1) e[`vouchers[${i}].taxCode`] = 'Pick which tax the voucher lowers.'
  })
  errors.value = e
  return Object.keys(e).length === 0
}

async function save(): Promise<OrderDetail | null> {
  if (!validate()) {
    toast.add({ severity: 'error', summary: 'Please check the highlighted fields.', life: 4000 })
    return null
  }
  saving.value = true
  try {
    const body = {
      customerCode: form.customer!.code,
      docDate: form.docDate || undefined,
      deliveryWantedBy: form.deliveryWantedBy || null,
      contactName: form.contactName,
      customerPoRef: form.customerPoRef,
      project: form.project,
      deliveryAddress: form.deliveryAddress,
      ...(askInstallation.value && { installOption: form.installOption, installDate: form.installOption === 'INSTALLATION' ? form.installDate || null : null }),
      lines: form.lines.map((l) =>
        l.kind === 'package'
          ? { packageCode: l.code, qty: l.qty.trim(), giftItemCode: l.giftItemCode }
          : { itemCode: l.item.code, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct || '0' },
      ),
      vouchers: form.vouchers.map((v) => ({ voucherNo: v.voucherNo.trim(), amount: v.amount, description: v.description.trim() || undefined, taxCode: voucherTax(v) })),
    }
    const result = isNew.value ? await salesOrdersApi.create(body) : await salesOrdersApi.update(id.value, { ...body, version: order.value!.version })
    toast.add({ severity: 'success', summary: isNew.value ? `${result.docNo} saved as draft` : 'Draft saved', detail: result.activity.find((a) => a.action === 'credit_check')?.message, life: 3500 })
    if (isNew.value) await router.replace(`/sales/orders/${result.id}`)
    show(result)
    return result
  } catch (error) {
    if (error instanceof ApiError) errors.value = { ...errors.value, ...error.fieldErrors }
    return null
  } finally {
    saving.value = false
  }
}

async function release() {
  if (dirty.value && !(await save())) return
  const o = order.value!
  if (!o.allowedActions.includes('release')) return
  // The app's rule: with every item in stock, the installation needs the customer's preferred date (phase 5).
  if (o.installation.dateNeeded && !o.installation.preferredDate) {
    errors.value = { ...errors.value, installDate: "Pick the customer's preferred installation date. It is needed when every item is in stock." }
    document.getElementById('so-install-date')?.focus()
    return
  }
  confirm.require({
    header: `Release ${o.docNo}?`,
    message: `${o.docNo} is locked and shown in the delivery list. After release, change it by revision or cancel the undelivered balance.`,
    acceptLabel: 'Release',
    rejectLabel: 'Cancel',
    accept: async () => {
      const result = await salesOrdersApi.release(o.id, o.version)
      show(result)
      toast.add({ severity: 'success', summary: `${result.docNo} released`, detail: 'Event sales.order.released saved.', life: 4000 })
    },
  })
}

async function requestApproval() {
  reasonError.value = ''
  if (!reason.value.trim()) {
    reasonError.value = 'Type a reason for the approver.'
    return
  }
  if (dirty.value && !(await save())) return
  const o = order.value!
  saving.value = true
  try {
    show(await salesOrdersApi.requestApproval(o.id, o.version, reason.value.trim()))
    reason.value = ''
    notifyApprovalsChanged()
    toast.add({ severity: 'success', summary: 'Approval requested', detail: `${o.docNo} is waiting for ${order.value?.approval.waitingFor ?? 'the approver'}.`, life: 4000 })
  } finally {
    saving.value = false
  }
}

function deleteDraft() {
  const o = order.value!
  confirm.require({
    header: `Delete ${o.docNo}?`,
    message: `The draft is removed. Its number ${o.docNo} is not used again.`,
    acceptLabel: 'Delete draft',
    rejectLabel: 'Keep it',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await salesOrdersApi.remove(o.id, o.version)
      toast.add({ severity: 'success', summary: `${o.docNo} deleted`, life: 3000 })
      notifyApprovalsChanged()
      void router.push('/sales/orders')
    },
  })
}

function keepAsDraft() {
  reason.value = ''
  toast.add({ severity: 'info', summary: 'Kept as draft', detail: 'The order stays a draft. Request approval when you are ready.', life: 3000 })
}
function backToEdit() {
  document.getElementById('so-lines')?.scrollIntoView({ behavior: 'smooth' })
}

function later(what: string) {
  toast.add({ severity: 'info', summary: what, detail: 'This comes with a later Sales step.', life: 3000 })
}
async function createProforma(orderId: string) {
  const p = await salesProformasApi.create({ salesOrderId: orderId })
  toast.add({ severity: 'success', summary: `${p.docNo} created`, detail: 'Deposit 30% by default. Check it, then release.', life: 3500 })
  void router.push(`/sales/proformas/${p.id}`)
}
async function createDelivery(orderId: string) {
  const d = await salesDeliveriesApi.create(orderId)
  toast.add({ severity: 'success', summary: `${d.docNo} created`, detail: 'Check what leaves the warehouse, then confirm.', life: 3500 })
  void router.push(`/sales/deliveries/${d.id}`)
}
const transferItems = computed(() => {
  const o = order.value
  if (!o) return []
  return [
    { label: 'Delivery order', disabled: !can('deliver'), command: () => createDelivery(o.id) },
    { label: 'Invoice', disabled: !can('invoice'), command: () => router.push({ path: '/sales/invoices/new', query: { order: o.id } }) },
    { label: 'Proforma invoice', disabled: !can('proforma'), command: () => createProforma(o.id) },
    { label: 'Cancel balance', disabled: !can('cancelBalance'), command: () => router.push({ path: '/sales/cancel-orders/new', query: { order: o.id } }) },
  ]
})

// ── Display ──────────────────────────────────────────────────────────────────
const title = computed(() => (isNew.value ? 'New sales order' : `Sales order ${order.value?.docNo ?? ''}`))
const chip = computed(() => {
  const o = order.value
  if (!o) return null
  if (o.balanceCancelled) return { status: 'CANCELLED', label: 'Balance cancelled' }
  if (o.status === 'PARTIAL') return { status: 'RELEASED', label: 'Released' }
  return { status: o.approval.state === 'APPROVED' && o.status === 'DRAFT' ? 'APPROVED' : o.status, label: o.approval.state === 'APPROVED' && o.status === 'DRAFT' ? 'Approved' : o.statusLabel }
})
const partialChip = computed(() => {
  const o = order.value
  return o && o.status === 'PARTIAL' ? `Partial · ${formatQty(o.quantities.delivered)} of ${formatQty(o.quantities.ordered)} delivered` : null
})
const released = computed(() => Boolean(order.value && !['DRAFT', 'PENDING_APPROVAL'].includes(order.value.status)))
const credit = computed(() => order.value?.credit.snapshot ?? null)
const showCreditFailed = computed(() => Boolean(order.value && order.value.status === 'DRAFT' && (order.value.credit.needsApproval || order.value.credit.blocked)))
/** The price range (phase 5): prices outside it wait for the Sales Manager. Shown on its own when credit is fine. */
const priceNeedsApproval = computed(() => Boolean(order.value && order.value.status === 'DRAFT' && order.value.price.needsApproval))
const showPricePanel = computed(() => priceNeedsApproval.value && !showCreditFailed.value)
const creditChip = computed(() => {
  const r = order.value?.credit.result
  if (r === 'OVER_LIMIT' || r === 'BLOCKED') return { status: 'REJECTED', label: 'Over limit', group: 'cancelled' as const }
  if (r === 'WARNED') return { status: 'PENDING_APPROVAL', label: 'Warning', group: 'pending' as const }
  if (r === 'APPROVED') return { status: 'APPROVED', label: 'Approved', group: 'done' as const }
  return { status: 'DONE', label: 'Passed', group: 'done' as const }
})
/** Credit bar: owed before (grey) and this order (purple) against the limit. */
const bar = computed(() => {
  const c = credit.value
  if (!c?.creditLimit || Number(c.creditLimit) <= 0) return null
  const limit = Number(c.creditLimit)
  const before = Number(c.owed) + Number(c.otherOpen)
  return { before: Math.min(100, (before / limit) * 100), mine: Math.max(0, Math.min(100 - (before / limit) * 100, (Number(c.thisDocument) / limit) * 100)) }
})
const lineHint = (l: EditLine) =>
  l.item.listPrice ? `Price list${order.value ? ` ${order.value.priceList.name}` : ''}: RM ${formatPrice(l.item.listPrice)}` : 'Not on the price list'
const belowList = (l: EditLine) => Boolean(l.item.listPrice && l.unitPrice && Number(l.unitPrice) < Number(l.item.listPrice))
/** With the price range on: a preview of the server's check for the hint under the line (net after discount vs the list). */
function outsideRange(l: EditLine): boolean {
  const r = order.value?.price.range
  const list = Number(l.item.listPrice ?? 0)
  if (!r || !list || !l.unitPrice) return false
  const net = Number(l.unitPrice) * (1 - Number(l.discountPct || 0) / 100)
  return net < list * (1 - Number(r.belowPct) / 100) - 0.00001 || net > list * (1 + Number(r.abovePct) / 100) + 0.00001
}
const lineNote = (l: EditLine) => {
  if (order.value?.price.rangeOn) return outsideRange(l) ? ` · outside the ${Number(order.value.price.range!.belowPct)}% below to ${Number(order.value.price.range!.abovePct)}% above range: the Sales Manager approves` : ''
  return belowList(l) ? ' · below the price list, invoices at this price need approval' : ''
}
const lineErrors = (i: number) =>
  ['itemCode', 'packageCode', 'qty', 'unitPrice', 'discountPct', 'giftItemCode'].map((k) => errors.value[`lines[${i}].${k}`]).filter((m): m is string => Boolean(m))

/** Released or locked order: a package shows as one line with its items and its gift under it (FsOrder.html). */
type ViewRow = { kind: 'line'; line: OrderLine; sub: boolean } | { kind: 'package'; key: string; pkg: NonNullable<OrderLine['package']>; amount: string; taxName: string }
const viewRows = computed<ViewRow[]>(() => {
  const lines = order.value?.lines ?? []
  const rows: ViewRow[] = []
  const seen = new Set<number>()
  for (const l of lines) {
    if (!l.package) {
      rows.push({ kind: 'line', line: l, sub: false })
      continue
    }
    if (seen.has(l.package.group)) continue
    seen.add(l.package.group)
    const own = lines.filter((x) => x.package?.group === l.package!.group)
    rows.push({ kind: 'package', key: `pk-${l.package.group}`, pkg: l.package, amount: sumMoney(own.map((x) => x.amount)), taxName: l.taxName })
    for (const x of own) rows.push({ kind: 'line', line: x, sub: true })
  }
  return rows
})
</script>

<template>
  <div v-if="loading" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else>
    <PageHeader :title="title" document :branch="order?.branch.code">
      <template #chip>
        <StatusChip v-if="chip" :status="chip.status" :label="chip.label" />
        <StatusChip v-else status="DRAFT" label="New" />
        <StatusChip v-if="partialChip" status="PARTIAL" :label="partialChip" />
      </template>
      <template v-if="order" #subtitle>
        {{ order.customer.name }}
        <template v-if="order.quotation">
          · from quotation <RouterLink :to="docRoute('SAL_QUOTATION', order.quotation.id)!" class="erp-link">{{ order.quotation.no }}</RouterLink>
        </template>
        <template v-else-if="order.enquiryNo"> · from enquiry {{ order.enquiryNo }}</template>
        · Revision {{ order.revision }}
      </template>
      <template v-else #subtitle>Pick the customer and add items. The SO number is given when you save.</template>

      <template #actions>
        <template v-if="editable">
          <RouterLink v-if="!isNew" to="/sales/orders" class="erp-btn erp-btn-secondary">Back</RouterLink>
          <button v-if="can('delete')" type="button" class="erp-btn erp-btn-delete" :disabled="saving" @click="deleteDraft">Delete draft</button>
          <button type="button" data-tour="action:save-draft" class="erp-btn" :class="isNew ? 'erp-btn-primary' : 'erp-btn-secondary'" :disabled="saving || (!isNew && !dirty)" @click="save">Save draft</button>
          <button v-if="!isNew && !showCreditFailed && !priceNeedsApproval" type="button" class="erp-btn erp-btn-primary" :disabled="saving || !can('release')" @click="release">Release</button>
        </template>
        <template v-else-if="order && released">
          <RouterLink :to="`/sales/orders/${order.id}/print`" class="erp-btn erp-btn-secondary">Print</RouterLink>
          <button type="button" class="erp-btn erp-btn-secondary" @click="later('Email')">Email</button>
          <button type="button" class="erp-btn erp-btn-secondary" @click="later('Revise')">Revise</button>
          <RouterLink :to="`/sales/orders/${order.id}/flow`" class="erp-btn erp-btn-secondary">Document flow</RouterLink>
          <button type="button" class="erp-btn erp-btn-primary" @click="transferMenu?.toggle($event)">Transfer to <ChevronDown :size="14" aria-hidden="true" /></button>
          <Menu ref="transferMenu" :model="transferItems" popup />
        </template>
        <RouterLink v-else to="/sales/orders" class="erp-btn erp-btn-secondary">Back</RouterLink>
      </template>
    </PageHeader>

    <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_330px]">
      <div class="flex min-w-0 flex-col gap-4">
        <NoticeBanner v-if="released && order">
          <span class="inline-flex items-center gap-2">
            <Lock :size="14" aria-hidden="true" />
            Released {{ order.releasedAt ? formatDateTime(order.releasedAt) : '' }} by {{ order.releasedByName }}. Header and lines are locked. Change by revision, or cancel the undelivered balance.
          </span>
        </NoticeBanner>
        <NoticeBanner v-else-if="order?.status === 'PENDING_APPROVAL'" kind="warning">
          Waiting for <strong>{{ order.approval.waitingFor }}</strong> to approve: {{ order.approval.reason }}. The order is locked until someone decides.
        </NoticeBanner>
        <NoticeBanner v-else-if="order?.approval.state === 'REJECTED' && order.status === 'DRAFT'" kind="error">
          Rejected by {{ order.approval.decidedBy }}<template v-if="order.approval.comment">: “{{ order.approval.comment }}”</template>. Change the order and request approval again.
        </NoticeBanner>
        <NoticeBanner v-else-if="order?.approval.state === 'APPROVED' && order.status === 'DRAFT'">
          Credit approved by {{ order.approval.decidedBy }}<template v-if="order.approval.comment"> · “{{ order.approval.comment }}”</template>. You can release the order.
        </NoticeBanner>

        <!-- Header fields (SalesOrderForm.html order) -->
        <section data-tour="so:header" class="erp-card grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-x-4 gap-y-3 px-5 py-[18px]">
          <FormField
            data-tour="so:customer"
            :data-filled="form.customer ? 'true' : 'false'"
            :label="form.customer ? `Customer · ${form.customer.code}` : 'Customer · from Master Data'"
            :error="errors.customerCode"
            for="so-customer"
          >
            <MasterDataPicker
              v-if="editable"
              v-model="form.customer"
              input-id="so-customer"
              :search="searchCustomers"
              :invalid="Boolean(errors.customerCode)"
              :display="(c) => c.name"
              placeholder="Type a customer code or name"
              @picked="onCustomerPicked"
            />
            <div v-else class="erp-input-ro">{{ form.customer?.name }}</div>
            <button v-if="canAddCustomer" type="button" class="erp-link self-start cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-erp-link" @click="newCustomerOpen = true">+ New customer</button>
          </FormField>
          <FormField label="Contact" for="so-contact">
            <input v-if="editable" id="so-contact" v-model="form.contactName" class="erp-input" maxlength="100" />
            <div v-else class="erp-input-ro">{{ form.contactName || '—' }}</div>
          </FormField>
          <FormField label="Order date" for="so-date">
            <DatePicker v-if="editable" input-id="so-date" :model-value="isoToDate(form.docDate)" date-format="d M yy" show-icon fluid class="erp-date" @update:model-value="form.docDate = dateToIso($event)" />
            <div v-else class="erp-input-ro">{{ formatDate(form.docDate) }}</div>
          </FormField>
          <FormField label="Delivery wanted by" for="so-wanted">
            <DatePicker
              v-if="editable"
              input-id="so-wanted"
              :model-value="isoToDate(form.deliveryWantedBy)"
              :min-date="isoToDate(form.docDate) ?? undefined"
              date-format="d M yy"
              show-icon
              show-button-bar
              fluid
              class="erp-date"
              @update:model-value="form.deliveryWantedBy = dateToIso($event)"
            />
            <div v-else class="erp-input-ro">{{ formatDate(form.deliveryWantedBy) || '—' }}</div>
          </FormField>

          <FormField label="Branch"><div class="erp-input-ro">{{ order?.branch.name ?? '—' }}</div></FormField>
          <FormField label="Sales agent"><div class="erp-input-ro">{{ order?.agent.name ?? user?.name }}</div></FormField>
          <FormField label="Currency · tax mode"><div class="erp-input-ro">{{ order?.currency ?? 'MYR' }} · Exclusive</div></FormField>
          <FormField label="Credit term"><div class="erp-input-ro">{{ form.customer ? `${order?.creditTermDays ?? form.customer.creditTermDays} days` : '—' }}</div></FormField>

          <FormField label="Customer PO ref" for="so-poref">
            <input v-if="editable" id="so-poref" v-model="form.customerPoRef" class="erp-input" maxlength="50" />
            <div v-else class="erp-input-ro">{{ form.customerPoRef || '—' }}</div>
          </FormField>
          <FormField label="Project" for="so-project">
            <input v-if="editable" id="so-project" v-model="form.project" class="erp-input" maxlength="100" />
            <div v-else class="erp-input-ro">{{ form.project || '—' }}</div>
          </FormField>
          <FormField label="Delivery address" class="col-span-2" for="so-address">
            <input v-if="editable" id="so-address" v-model="form.deliveryAddress" class="erp-input" maxlength="300" />
            <div v-else class="erp-input-ro">{{ form.deliveryAddress || '—' }}</div>
          </FormField>

          <template v-if="askInstallation">
            <FormField label="Installation" for="so-install">
              <select v-if="editable" id="so-install" v-model="form.installOption" class="erp-input">
                <option v-for="o in INSTALL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <div v-else class="erp-input-ro">{{ order?.installation.optionLabel ?? '—' }}</div>
            </FormField>
            <FormField label="Preferred date" :error="errors.installDate" for="so-install-date">
              <DatePicker
                v-if="editable"
                input-id="so-install-date"
                :model-value="isoToDate(form.installDate)"
                :min-date="isoToDate(form.docDate) ?? undefined"
                :disabled="form.installOption !== 'INSTALLATION'"
                date-format="d M yy"
                show-icon
                show-button-bar
                fluid
                class="erp-date"
                :invalid="Boolean(errors.installDate)"
                @update:model-value="form.installDate = dateToIso($event)"
              />
              <div v-else class="erp-input-ro">
                {{ order?.installation.option !== 'INSTALLATION' ? '—' : order.installation.preferredDate ? formatDate(order.installation.preferredDate) : order.installation.afterStock ? 'After stock arrives' : 'Not set' }}
              </div>
            </FormField>
            <p class="col-span-2 m-0 self-end pb-2 text-xs" :class="editable && order?.installation.dateNeeded && !form.installDate && form.installOption === 'INSTALLATION' ? 'text-attention' : 'text-erp-muted'">
              {{ editable ? installHint : order?.installation.option === 'INSTALLATION' ? 'The office books the installer and slot.' : '' }}
            </p>
          </template>
        </section>

        <!-- Lines -->
        <section id="so-lines" data-tour="so:lines" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="m-0 text-[15px] font-bold">Lines</h2>
            <span v-if="errors.lines" class="text-xs font-medium text-note-error-text">{{ errors.lines }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-table [&_td]:px-2.5 [&_th]:px-2.5">
              <thead>
                <tr v-if="editable">
                  <th>#</th>
                  <th>Item</th>
                  <th class="num">Qty</th>
                  <th>UOM</th>
                  <th class="num">Unit price</th>
                  <th class="num">Disc %</th>
                  <th>Tax</th>
                  <th class="num">Amount</th>
                  <th aria-label="Remove" />
                </tr>
                <tr v-else>
                  <th>Item</th>
                  <th>Ordered</th>
                  <th class="num">Delivered</th>
                  <th class="num">Invoiced</th>
                  <th class="num">Balance</th>
                  <th class="num">Unit price</th>
                  <th>Tax</th>
                  <th class="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="editable">
                  <tr v-if="!form.lines.length">
                    <td colspan="9" class="text-center text-erp-muted">No items yet. Click Add item to pick from Master Data.</td>
                  </tr>
                  <template v-for="(l, i) in form.lines" :key="l.key">
                    <template v-if="l.kind === 'package'">
                      <tr data-tour="so:line">
                        <td class="text-erp-muted">{{ i + 1 }}</td>
                        <td>
                          <div class="flex items-center gap-2 font-bold whitespace-nowrap">{{ l.code }} <StatusChip status="DRAFT" label="Package" group="draft" /></div>
                          <div class="text-xs text-erp-muted">{{ l.name }}</div>
                        </td>
                        <td class="num w-[90px] min-w-[76px]">
                          <input v-model="l.qty" class="erp-cell min-w-[60px]" inputmode="numeric" :aria-invalid="Boolean(errors[`lines[${i}].qty`])" :aria-label="`Sets, line ${i + 1}`" />
                        </td>
                        <td>{{ l.uomCode }}</td>
                        <td class="num">{{ formatMoney(l.price) }}</td>
                        <td class="num text-erp-muted">—</td>
                        <td class="whitespace-nowrap">{{ l.taxName }}</td>
                        <td class="num"><MoneyText :value="previews[i]?.amount ?? null" /></td>
                        <td class="w-8">
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-erp-muted hover:bg-erp-head" :aria-label="`Remove line ${i + 1}`" @click="removeLine(l.key)">
                            <X :size="14" />
                          </button>
                        </td>
                      </tr>
                      <tr v-for="p in packageParts(l)" :key="`${l.key}-${p.itemCode}`" class="text-xs text-erp-muted">
                        <td />
                        <td class="pl-6">{{ p.itemCode }} · {{ p.itemName }}</td>
                        <td class="num">{{ formatQty(p.total) }}</td>
                        <td>{{ p.uomCode }}</td>
                        <td class="num">{{ formatPrice(p.unitPrice) }}</td>
                        <td colspan="2" />
                        <td class="num"><MoneyText :value="p.preview?.amount ?? null" /></td>
                        <td />
                      </tr>
                      <tr v-if="l.giftRule !== 'NONE' && l.gifts.length" class="text-xs">
                        <td />
                        <td class="pl-6" colspan="3">
                          <template v-if="l.giftRule === 'CHOOSE_ONE' && l.gifts.length > 1">
                            <label class="flex items-center gap-2">
                              <span class="font-semibold">Free gift</span>
                              <select v-model="l.giftItemCode" class="erp-input h-8 w-auto text-xs" :aria-invalid="Boolean(errors[`lines[${i}].giftItemCode`])" :aria-label="`Free gift, line ${i + 1}`">
                                <option :value="null" disabled>Pick the gift</option>
                                <option v-for="g in l.gifts" :key="g.itemCode" :value="g.itemCode">{{ g.itemName }} ({{ g.itemCode }})</option>
                              </select>
                            </label>
                          </template>
                          <template v-else>
                            <span class="font-semibold">Free gift</span> · {{ l.giftRule === 'ALWAYS' ? l.gifts.map((g) => g.itemName).join(', ') : giftName(l) }}
                          </template>
                        </td>
                        <td class="num text-erp-muted" colspan="3">0.00 · leaves with the delivery</td>
                        <td class="num font-semibold text-chip-done-text">Free</td>
                        <td />
                      </tr>
                      <tr v-if="lineErrors(i).length">
                        <td />
                        <td colspan="8" class="!pt-0 text-xs text-note-error-text">{{ lineErrors(i).join(' ') }}</td>
                      </tr>
                    </template>
                    <template v-else>
                    <tr data-tour="so:line">
                      <td class="text-erp-muted">{{ i + 1 }}</td>
                      <td>
                        <div class="font-bold whitespace-nowrap">{{ l.item.code }}</div>
                        <div class="text-xs text-erp-muted">{{ l.item.name }}</div>
                      </td>
                      <td class="num w-[90px] min-w-[76px]">
                        <input v-model="l.qty" class="erp-cell min-w-[60px]" inputmode="decimal" :aria-invalid="Boolean(errors[`lines[${i}].qty`])" :aria-label="`Quantity, line ${i + 1}`" />
                      </td>
                      <td>{{ l.item.uomCode }}</td>
                      <td class="num w-[110px] min-w-[96px]">
                        <input v-model="l.unitPrice" class="erp-cell min-w-[80px]" inputmode="decimal" :aria-invalid="Boolean(errors[`lines[${i}].unitPrice`])" :aria-label="`Unit price, line ${i + 1}`" />
                      </td>
                      <td class="num w-[70px] min-w-[64px]">
                        <input v-model="l.discountPct" class="erp-cell min-w-[48px]" inputmode="decimal" placeholder="0" :aria-invalid="Boolean(errors[`lines[${i}].discountPct`])" :aria-label="`Discount %, line ${i + 1}`" />
                      </td>
                      <td class="whitespace-nowrap">{{ l.item.taxName }}</td>
                      <td class="num"><MoneyText :value="previews[i]?.amount ?? null" /></td>
                      <td class="w-8">
                        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-erp-muted hover:bg-erp-head" :aria-label="`Remove line ${i + 1}`" @click="removeLine(l.key)">
                          <X :size="14" />
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td />
                      <td colspan="8" class="!pt-0 text-xs" :class="lineNote(l) ? 'text-attention' : 'text-erp-muted'">
                        {{ lineHint(l) }}{{ lineNote(l) }}
                        <span v-for="m in lineErrors(i)" :key="m" class="ml-2 text-note-error-text">{{ m }}</span>
                      </td>
                    </tr>
                    </template>
                  </template>
                  <template v-for="(v, i) in form.vouchers" :key="v.key">
                    <tr>
                      <td class="text-erp-muted">{{ form.lines.length + i + 1 }}</td>
                      <td>
                        <div class="flex items-center gap-2"><StatusChip status="DRAFT" label="Voucher" group="draft" /><input v-model="v.description" class="erp-cell min-w-[220px] text-left!" maxlength="100" :aria-label="`Voucher description, line ${form.lines.length + i + 1}`" /></div>
                        <input v-model="v.voucherNo" class="erp-cell mt-1 w-full min-w-[220px] text-left!" maxlength="30" placeholder="Voucher no." :aria-invalid="Boolean(errors[`vouchers[${i}].voucherNo`])" :aria-label="`Voucher number, line ${form.lines.length + i + 1}`" />
                      </td>
                      <td class="num">1</td>
                      <td />
                      <td class="num w-[110px] min-w-[96px]">
                        <input v-model="v.amount" class="erp-cell min-w-[80px]" inputmode="decimal" placeholder="50.00" :aria-invalid="Boolean(errors[`vouchers[${i}].amount`])" :aria-label="`Voucher amount, line ${form.lines.length + i + 1}`" />
                      </td>
                      <td class="num text-erp-muted">—</td>
                      <td class="whitespace-nowrap">
                        <select v-if="lineTaxes.size > 1" v-model="v.taxCode" class="erp-input h-8 w-auto text-xs" :aria-invalid="Boolean(errors[`vouchers[${i}].taxCode`])" :aria-label="`Tax the voucher lowers, line ${form.lines.length + i + 1}`">
                          <option :value="null" disabled>Pick the tax</option>
                          <option v-for="[code, t] in lineTaxes" :key="code" :value="code">{{ t.name }}</option>
                        </select>
                        <template v-else>{{ [...lineTaxes.values()][0]?.name ?? '—' }}</template>
                      </td>
                      <td class="num">{{ voucherPreviews[i]?.preview ? `−${formatMoney(voucherPreviews[i]!.preview!.amount)}` : '—' }}</td>
                      <td class="w-8">
                        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-erp-muted hover:bg-erp-head" :aria-label="`Remove voucher ${v.voucherNo || i + 1}`" @click="removeVoucher(v.key)">
                          <X :size="14" />
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td />
                      <td colspan="8" class="!pt-0 text-xs text-erp-muted">
                        Lowers the amount taxed. The order's first invoice that covers it uses it; it never goes on a delivery order.
                        <span v-for="m in voucherErrors(i)" :key="m" class="ml-2 text-note-error-text">{{ m }}</span>
                      </td>
                    </tr>
                  </template>
                </template>

                <template v-else>
                  <template v-for="row in viewRows" :key="row.kind === 'package' ? row.key : row.line.id">
                  <tr v-if="row.kind === 'package'">
                    <td>
                      <div class="flex items-center gap-2 font-bold whitespace-nowrap">{{ row.pkg.code }} <StatusChip status="DRAFT" label="Package" group="draft" /></div>
                      <div class="text-xs text-erp-muted">{{ row.pkg.name }}</div>
                    </td>
                    <td class="erp-num">{{ formatQty(row.pkg.qty) }} {{ row.pkg.uomCode }}</td>
                    <td colspan="3" />
                    <td class="num">{{ formatMoney(row.pkg.price) }}</td>
                    <td class="whitespace-nowrap">{{ row.taxName }}</td>
                    <td class="num"><MoneyText :value="row.amount" /></td>
                  </tr>
                  <tr v-else :key="row.line.id" :class="{ 'text-xs': row.sub }">
                    <td :class="{ 'pl-6': row.sub }">
                      <template v-if="row.sub">
                        <span class="font-semibold">{{ row.line.itemCode }}</span> · {{ row.line.itemName }}
                        <span v-if="row.line.lineKind === 'GIFT'" class="font-semibold text-chip-done-text"> · free gift</span>
                      </template>
                      <template v-else>
                        <div class="font-bold whitespace-nowrap">{{ row.line.itemCode }}</div>
                        <div class="text-xs text-erp-muted">{{ row.line.itemName }}<template v-if="row.line.isBuyToOrder"> · buy to order</template></div>
                      </template>
                      <div v-if="row.line.purchase" class="text-xs" :class="row.line.purchase.state === 'NO_PO' || row.line.purchase.state === 'PO_CANCELLED' ? 'text-attention' : row.line.purchase.state === 'RECEIVED' ? 'text-chip-done-text' : 'text-erp-muted'">{{ row.line.purchase.label }}</div>
                    </td>
                    <td class="erp-num">{{ formatQty(row.line.orderedQty) }} {{ row.line.uomCode }}</td>
                    <td class="num">{{ formatQty(row.line.deliveredQty) }}</td>
                    <td class="num">{{ formatQty(row.line.invoicedQty) }}</td>
                    <td class="num font-bold text-mod-accent">{{ formatQty(row.line.balanceQty) }}</td>
                    <td class="num">
                      {{ formatPrice(row.line.unitPrice) }}
                      <div v-if="Number(row.line.discountPct)" class="text-xs text-erp-muted">less {{ Number(row.line.discountPct) }}%</div>
                    </td>
                    <td class="whitespace-nowrap">{{ row.sub ? '' : row.line.taxName }}</td>
                    <td class="num">
                      <span v-if="row.line.lineKind === 'GIFT'" class="font-semibold text-chip-done-text">Free</span>
                      <MoneyText v-else :value="row.line.amount" />
                    </td>
                  </tr>
                  </template>
                  <tr v-for="v in order?.vouchers ?? []" :key="v.voucherNo">
                    <td>
                      <div class="flex flex-wrap items-center gap-x-2 font-bold"><StatusChip status="DRAFT" label="Voucher" group="draft" /> {{ v.description }}</div>
                      <div class="text-xs text-erp-muted">no. {{ v.voucherNo }}<template v-if="v.invoiceNo"> · used on {{ v.invoiceNo }}</template></div>
                    </td>
                    <td class="erp-num">1</td>
                    <td colspan="3" />
                    <td class="num">−{{ formatMoney(v.amount) }}</td>
                    <td class="whitespace-nowrap">{{ v.taxName }}</td>
                    <td class="num">−{{ formatMoney(v.amount) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-if="editable" class="flex gap-2">
            <button type="button" data-tour="action:add-item" class="erp-btn erp-btn-secondary" @click="openPicker"><Plus :size="14" aria-hidden="true" />Add item</button>
            <button type="button" class="erp-btn erp-btn-secondary" @click="packagePickerOpen = true"><Gift :size="14" aria-hidden="true" />Add package</button>
            <button type="button" class="erp-btn erp-btn-secondary" :disabled="!form.lines.length" @click="addVoucher"><Ticket :size="14" aria-hidden="true" />Add voucher</button>
          </div>
          <NoticeBanner v-if="order?.stock.releaseNote" kind="warning">
            {{ order.stock.releaseNote }}
          </NoticeBanner>
          <NoticeBanner v-else-if="editable && order?.stock.draftWarning" kind="warning">
            Stock now: {{ order.stock.draftWarning }}. Short stock only warns; the order can still be released.
          </NoticeBanner>
        </section>

        <!-- S12 · Credit check failed -->
        <section v-if="showCreditFailed && order && credit" class="flex flex-col gap-4 rounded-xl border-2 border-note-error-border bg-erp-card px-5 py-[18px]">
          <div>
            <h2 class="m-0 text-[15px] font-bold text-note-error-text">Credit check did not pass</h2>
            <p class="m-0 mt-0.5 text-xs text-erp-muted">{{ order.customer.name }} ({{ order.customer.code }}) · {{ order.docNo }} · checked {{ credit.scope === 'BRANCH' ? 'per branch' : 'group-wide' }}</p>
          </div>
          <table class="erp-table">
            <thead>
              <tr><th>Check</th><th class="num">Limit</th><th class="num">Now</th><th class="num">This order</th><th class="num">After</th><th>Result</th></tr>
            </thead>
            <tbody>
              <tr>
                <td class="font-semibold">Credit limit</td>
                <td class="num">{{ credit.creditLimit ? formatMoney(credit.creditLimit) : 'No limit' }}</td>
                <td class="num">{{ formatMoney((Number(credit.owed) + Number(credit.otherOpen)).toFixed(2)) }}</td>
                <td class="num">{{ formatMoney(credit.thisDocument) }}</td>
                <td class="num">{{ formatMoney(credit.exposureAfter) }}</td>
                <td :class="Number(credit.overCredit) > 0 ? 'font-semibold text-note-error-text' : 'text-chip-done-text'">
                  {{ Number(credit.overCredit) > 0 ? `Over by ${formatMoney(credit.overCredit)}` : 'Within limit' }}
                </td>
              </tr>
              <tr>
                <td class="font-semibold">Overdue limit</td>
                <td class="num">{{ credit.overdueLimit ? formatMoney(credit.overdueLimit) : 'No limit' }}</td>
                <td class="num">{{ formatMoney(credit.overdue) }}</td>
                <td class="num">—</td>
                <td class="num">{{ formatMoney(credit.overdue) }}</td>
                <td :class="Number(credit.overOverdue) > 0 ? 'font-semibold text-note-error-text' : 'text-chip-done-text'">
                  {{ Number(credit.overOverdue) > 0 ? `Over by ${formatMoney(credit.overOverdue)}` : 'Within limit' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="m-0 text-[13px]">
            <template v-if="order.credit.blocked">Policy for <strong>Sales Order</strong>: block. This order cannot be released; reduce it or ask Finance.</template>
            <template v-else>Policy for <strong>Sales Order</strong>: require approval. </template>
            <RouterLink to="/sales/settings/credit-control" class="erp-link">See credit control policy</RouterLink>
          </p>
          <p v-if="priceNeedsApproval && !order.credit.blocked" class="m-0 text-[13px]">Also: {{ order.price.reason }}. The Sales Manager decides the price in the same request.</p>
          <template v-if="!order.credit.blocked && can('requestApproval')">
            <FormField label="Reason for the approver" :error="reasonError" for="so-reason">
              <textarea id="so-reason" v-model="reason" rows="3" class="erp-input h-auto py-2" maxlength="1000" :aria-invalid="Boolean(reasonError)" />
            </FormField>
            <p class="m-0 text-xs text-erp-muted">
              Send to {{ roleLabel(order.credit.approverRole ?? 'SALES_MANAGER') }}. Release stays blocked until it is approved. If the order is cancelled, the request is withdrawn automatically.
            </p>
            <div class="flex justify-end gap-2">
              <button type="button" class="erp-btn erp-btn-secondary" @click="backToEdit">Back to edit</button>
              <button type="button" class="erp-btn erp-btn-secondary" @click="keepAsDraft">Keep as draft</button>
              <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="requestApproval">Request approval</button>
            </div>
          </template>
        </section>

        <!-- The price range (phase 5): a price outside it needs the Sales Manager before release -->
        <section v-if="showPricePanel && order" class="flex flex-col gap-3 rounded-xl border-2 border-note-warn-border bg-erp-card px-5 py-[18px]">
          <div>
            <h2 class="m-0 text-[15px] font-bold text-note-warn-text">Price needs approval</h2>
            <p class="m-0 mt-0.5 text-xs text-erp-muted">
              {{ order.price.reason }}. A price more than {{ Number(order.price.range?.belowPct) }}% below or {{ Number(order.price.range?.abovePct) }}% above the customer's price list
              needs the Sales Manager's approval before the order can be released.
            </p>
          </div>
          <template v-if="can('requestApproval')">
            <FormField label="Reason for the approver" :error="reasonError" for="so-price-reason">
              <textarea id="so-price-reason" v-model="reason" rows="2" class="erp-input h-auto py-2" maxlength="1000" :aria-invalid="Boolean(reasonError)" />
            </FormField>
            <div class="flex justify-end gap-2">
              <button type="button" class="erp-btn erp-btn-secondary" @click="backToEdit">Back to edit</button>
              <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="requestApproval">Request approval</button>
            </div>
          </template>
        </section>

        <ActivityList v-if="order" :items="order.activity.filter((a) => a.action !== 'stock_warning')" />
      </div>

      <!-- Right panel -->
      <aside class="flex flex-col gap-4">
        <SideCard data-tour="so:totals" title="Totals (MYR)">
          <div v-if="totals" class="flex flex-col text-[13px]">
            <div class="flex justify-between gap-3 py-[5px]"><span class="text-erp-muted">Subtotal</span><MoneyText :value="totals.subtotal" /></div>
            <div class="flex justify-between gap-3 py-[5px]"><span class="text-erp-muted">Discount</span><MoneyText :value="totals.discountTotal" /></div>
            <div v-if="Number(totals.voucherTotal)" class="flex justify-between gap-3 py-[5px]"><span class="text-erp-muted">Vouchers</span><span class="erp-num">−{{ formatMoney(totals.voucherTotal!) }}</span></div>
            <div v-for="t in totals.taxLines" :key="t.code" class="flex justify-between gap-3 py-[5px]"><span class="text-erp-muted">Tax ({{ t.name }})</span><MoneyText :value="t.amount" /></div>
            <div v-if="!totals.taxLines.length" class="flex justify-between gap-3 py-[5px]"><span class="text-erp-muted">Tax</span><MoneyText value="0.00" /></div>
            <div class="flex justify-between gap-3 border-b border-erp-row py-[5px]"><span class="text-erp-muted">Rounding</span><MoneyText :value="totals.rounding" /></div>
            <div class="flex justify-between gap-3 pt-2 text-lg font-bold"><span>Total</span><MoneyText :value="totals.total" /></div>
          </div>
        </SideCard>

        <SideCard v-if="order && credit" data-tour="so:credit" :title="order.credit.live ? 'Credit now' : 'Credit at save'">
          <template #chip><StatusChip :status="creditChip.status" :label="creditChip.label" :group="creditChip.group" /></template>
          <div v-if="bar" class="flex h-2 overflow-hidden rounded bg-erp-track">
            <div class="h-full bg-erp-muted" :style="{ width: `${bar.before}%` }" />
            <div class="h-full bg-mod-primary" :style="{ width: `${bar.mine}%` }" />
          </div>
          <div class="flex flex-col text-[13px] erp-num">
            <div class="flex justify-between gap-3"><span>Owed before</span><span>{{ formatRm((Number(credit.owed) + Number(credit.otherOpen)).toFixed(2)) }}</span></div>
            <div class="flex justify-between gap-3"><span>This order</span><span>{{ formatRm(credit.thisDocument) }}</span></div>
            <div class="flex justify-between gap-3"><span>Limit</span><span>{{ credit.creditLimit ? formatRm(credit.creditLimit) : 'No limit' }}</span></div>
            <div v-if="credit.headroom !== null" class="flex justify-between gap-3 font-bold" :class="Number(credit.headroom) < 0 ? 'text-note-error-text' : 'text-chip-done-text'">
              <span>{{ Number(credit.headroom) < 0 ? 'Over by' : 'Headroom left' }}</span><span>{{ formatRm(Math.abs(Number(credit.headroom)).toFixed(2)) }}</span>
            </div>
          </div>
          <p class="m-0 text-xs text-erp-muted">
            Checked {{ credit.scope === 'BRANCH' ? 'per branch' : 'group-wide' }} · overdue {{ formatRm(credit.overdue) }}<template v-if="credit.overdueLimit"> of {{ formatRm(credit.overdueLimit) }} limit</template>
          </p>
        </SideCard>

        <SideCard v-if="order?.payments && order.payments.released" title="Payments">
          <template #chip><StatusChip :status="order.payments.status" :label="order.payments.label" :group="PAYMENT_GROUP[order.payments.status]" /></template>
          <div class="flex flex-col text-[13px] erp-num">
            <div class="flex justify-between gap-3"><span class="text-erp-muted">Verified</span><span>{{ formatRm(order.payments.verified) }}</span></div>
            <div v-if="Number(order.payments.waiting)" class="flex justify-between gap-3"><span class="text-erp-muted">Waiting for Account</span><span>{{ formatRm(order.payments.waiting) }}</span></div>
            <div class="flex justify-between gap-3 font-bold"><span>Still owed</span><span>{{ formatRm(order.payments.open) }}</span></div>
          </div>
          <ul v-if="order.payments.receipts.length" class="m-0 flex list-none flex-col gap-1 border-t border-erp-row p-0 pt-2 text-[13px]">
            <li v-for="p in order.payments.receipts" :key="p.id" class="flex items-center justify-between gap-2">
              <span class="min-w-0"><RouterLink :to="`/sales/receipts/${p.id}`" class="erp-link font-semibold">{{ p.docNo }}</RouterLink> <span class="text-erp-muted">· {{ p.kindLabel }} · {{ formatRm(p.amount) }}</span></span>
              <StatusChip :status="p.status" :label="p.statusLabel" :group="RECEIPT_GROUP[p.status]" />
            </li>
          </ul>
          <button v-if="order.payments.canRecord" type="button" class="erp-btn erp-btn-secondary justify-center" @click="receiptOpen = true"><Plus :size="14" aria-hidden="true" />Record payment</button>
          <p class="m-0 text-xs text-erp-muted">Only receipts Account has verified against the bank count as paid.</p>
        </SideCard>

        <LinkedDocs v-if="order && order.links.length" :docs="order.links" :route-of="docRoute" :flow-to="released ? `/sales/orders/${order.id}/flow` : null" />
      </aside>
    </div>

    <NewCustomerDialog v-model:visible="newCustomerOpen" @added="onCustomerAdded" />
    <ReceiptDialog v-model:visible="receiptOpen" :order="receiptFor" @saved="receiptSaved" />
    <ItemPickerDialog
      v-model:visible="pickerOpen"
      :context="`${order?.docNo ?? 'New order'} · ${form.customer?.name ?? ''} · ${order?.branch.name ?? form.customer?.branchCode ?? ''}${order ? ` · price list ${order.priceList.name}` : ''}`"
      :customer-code="form.customer?.code ?? null"
      :branch-code="order?.branch.code ?? form.customer?.branchCode ?? null"
      :branch-name="order?.branch.name ?? 'this branch'"
      :on-lines="onLines"
      @add="addItems"
    />
    <PackagePickerDialog
      v-model:visible="packagePickerOpen"
      :context="`${order?.docNo ?? 'New order'}${form.customer ? ` · ${form.customer.name}` : ''}`"
      :doc-date="form.docDate || today"
      @add="addPackage"
    />
  </template>
</template>
