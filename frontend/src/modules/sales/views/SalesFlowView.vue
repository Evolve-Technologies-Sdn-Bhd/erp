<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import PageHeader from '@/components/erp/PageHeader.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { salesSettingsApi } from '../api/sales'
import { setSalesFlow } from '../flow'
import type { PriceRangeSetting, SalesFlowData, SalesFlowSwitches } from '../types'

/** S34 · Sales flow (FsPolicies.html): which steps the company uses. */
const toast = useToast()
const { can } = useSession()

const data = ref<SalesFlowData | null>(null)
const draft = ref<SalesFlowSwitches | null>(null)
const range = ref<PriceRangeSetting>({ belowPct: '10', abovePct: '20' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const canManage = computed(() => can('sales.settings.manage'))

function reset() {
  draft.value = { ...data.value!.switches }
  range.value = { ...data.value!.range }
  errors.value = {}
}
onMounted(async () => {
  data.value = await salesSettingsApi.salesFlow()
  reset()
})
const dirty = computed(() => Boolean(data.value && draft.value && (JSON.stringify(data.value.switches) !== JSON.stringify(draft.value) || JSON.stringify(data.value.range) !== JSON.stringify(range.value))))

const ORDER: (keyof SalesFlowSwitches)[] = ['useEnquiries', 'officeDraftsQuotations']
const HINT: Record<keyof SalesFlowSwitches, string> = {
  useEnquiries: 'Off: Enquiry is hidden from the menu and cannot be created.',
  officeDraftsQuotations: 'Off: Draft Quotation is hidden. Sales agents build the quotation with the customer.',
  askInstallation: 'Installation, delivery only, or collect. An order with installation makes a job for the office to book.',
  agentsAddCustomers: 'A + New customer link on the sales order, for households that are not in the list yet.',
  priceRange: 'Off: a discount over the limit on a quotation needs the Sales Manager. On: the range below decides, on quotations and sales orders.',
  useReceipts: 'A Payments card on the released sales order, and Official Receipts in the Billing menu for Account.',
  reviseOrders: 'A Revise button on the released sales order, until a delivery order, invoice or cancel order is made from it.',
}

async function save() {
  saving.value = true
  try {
    const result = await salesSettingsApi.saveSalesFlow(draft.value!, range.value)
    data.value = result
    setSalesFlow(result.switches)
    reset()
    toast.add({ severity: 'success', summary: result.saved?.length ? 'Sales flow saved' : 'Nothing changed', detail: result.saved?.join(' · '), life: 4500 })
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!data || !draft" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else>
    <PageHeader title="Sales Flow">
      <template #subtitle>Which steps your company uses. Everything here is on for a company that sells from the office with enquiries and quotations.</template>
      <template v-if="canManage" #actions>
        <button type="button" class="erp-btn erp-btn-secondary" :disabled="!dirty || saving" @click="reset">Cancel</button>
        <button type="button" class="erp-btn erp-btn-add" :disabled="!dirty || saving" @click="save">Save changes</button>
      </template>
    </PageHeader>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Steps</h2>
      <div class="flex flex-col">
        <div v-for="k in ORDER" :key="k" class="flex items-center justify-between gap-4 border-b border-erp-row py-3 last:border-b-0">
          <span><span class="block text-[13px] font-bold">{{ data.labels[k] }}</span><span class="text-xs text-erp-subtle">{{ HINT[k] }}</span></span>
          <SwitchToggle v-model="draft[k]" :label="data.labels[k]" :disabled="!canManage" />
        </div>
      </div>
      <p class="m-0 text-xs text-erp-muted">Turning a step off hides it for new documents. Documents already made keep working.</p>
      <p v-if="!canManage" class="m-0 text-xs text-erp-muted">Only an admin with Operation Policies rights can change these.</p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Customers</h2>
      <div class="flex items-center justify-between gap-4 py-1">
        <span><span class="block text-[13px] font-bold">{{ data.labels.agentsAddCustomers }}</span><span class="text-xs text-erp-subtle">{{ HINT.agentsAddCustomers }}</span></span>
        <SwitchToggle v-model="draft.agentsAddCustomers" :label="data.labels.agentsAddCustomers" :disabled="!canManage" />
      </div>
      <p class="m-0 text-xs text-erp-muted">They get cash terms, no credit limit and the cash customer's price list, and show in Core as To complete until the office checks them. A phone number already on file is refused.</p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Prices</h2>
      <div class="flex items-center justify-between gap-4 py-1">
        <span><span class="block text-[13px] font-bold">{{ data.labels.priceRange }}</span><span class="text-xs text-erp-subtle">{{ HINT.priceRange }}</span></span>
        <SwitchToggle v-model="draft.priceRange" :label="data.labels.priceRange" :disabled="!canManage" />
      </div>
      <div class="flex flex-wrap items-end gap-4 text-[13px]" :class="{ 'opacity-50': !draft.priceRange }">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-erp-muted">Lowest: below the price list by</span>
          <span class="flex items-center gap-1.5"><input v-model="range.belowPct" class="erp-input w-24 text-right" inputmode="decimal" :disabled="!canManage" :aria-invalid="Boolean(errors.priceBelowPct)" />%</span>
          <span v-if="errors.priceBelowPct" class="text-xs text-note-error-text">{{ errors.priceBelowPct }}</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-erp-muted">Highest: above the price list by</span>
          <span class="flex items-center gap-1.5"><input v-model="range.abovePct" class="erp-input w-24 text-right" inputmode="decimal" :disabled="!canManage" :aria-invalid="Boolean(errors.priceAbovePct)" />%</span>
          <span v-if="errors.priceAbovePct" class="text-xs text-note-error-text">{{ errors.priceAbovePct }}</span>
        </label>
      </div>
      <p class="m-0 text-xs text-erp-muted">
        The price is the unit price after the line discount, against the customer's price list. Package items, free gifts and items without a list price are left out,
        and a price already approved on the quotation or the order is not asked again on the next document. Invoices follow the range too while Strict price list is on.
      </p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Payments</h2>
      <div class="flex items-center justify-between gap-4 py-1">
        <span><span class="block text-[13px] font-bold">{{ data.labels.useReceipts }}</span><span class="text-xs text-erp-subtle">{{ HINT.useReceipts }}</span></span>
        <SwitchToggle v-model="draft.useReceipts" :label="data.labels.useReceipts" :disabled="!canManage" />
      </div>
      <p class="m-0 text-xs text-erp-muted">
        Each payment is a deposit or the balance, with a photo or PDF of the slip. Account verifies it against the bank or the card settlement slip; only verified
        receipts count as paid, and whoever recorded a receipt never verifies it. Invoices and the books stay as they are.
      </p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Orders</h2>
      <div class="flex items-center justify-between gap-4 py-1">
        <span><span class="block text-[13px] font-bold">{{ data.labels.reviseOrders }}</span><span class="text-xs text-erp-subtle">{{ HINT.reviseOrders }}</span></span>
        <SwitchToggle v-model="draft.reviseOrders" :label="data.labels.reviseOrders" :disabled="!canManage" />
      </div>
      <p class="m-0 text-xs text-erp-muted">
        A revision keeps the order's number and customer; the earlier revision is kept to look at. Releasing a revision made after the installer is booked, or one that
        changes a price, needs the Sales Manager. Every revision is recorded on the order.
      </p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Installation</h2>
      <div class="flex items-center justify-between gap-4 py-1">
        <span><span class="block text-[13px] font-bold">{{ data.labels.askInstallation }}</span><span class="text-xs text-erp-subtle">{{ HINT.askInstallation }}</span></span>
        <SwitchToggle v-model="draft.askInstallation" :label="data.labels.askInstallation" :disabled="!canManage" />
      </div>
      <p class="m-0 text-xs text-erp-muted">When it is on, the customer's preferred installation date is needed to release an order whose items are all in stock. With items short, installation is arranged when stock arrives.</p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <h2 class="m-0 text-[15px] font-bold">Recent changes</h2>
      <table class="erp-table">
        <thead><tr><th>When</th><th>Who</th><th>What changed</th></tr></thead>
        <tbody>
          <tr v-if="!data.history.length"><td colspan="3" class="text-erp-muted">No changes yet.</td></tr>
          <tr v-for="h in data.history" :key="h.id">
            <td class="whitespace-nowrap">{{ formatDate(h.at.slice(0, 10)) }}</td>
            <td class="whitespace-nowrap">{{ h.userName.toLowerCase() === 'admin' ? 'admin' : h.userName }}</td>
            <td>{{ h.message }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>
