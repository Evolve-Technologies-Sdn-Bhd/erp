<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import PageHeader from '@/components/erp/PageHeader.vue'
import SwitchToggle from '@/components/erp/SwitchToggle.vue'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { salesSettingsApi } from '../api/sales'
import { setSalesFlow } from '../flow'
import type { SalesFlowData, SalesFlowSwitches } from '../types'

/** S34 · Sales flow (FsPolicies.html): which steps the company uses. */
const toast = useToast()
const { can } = useSession()

const data = ref<SalesFlowData | null>(null)
const draft = ref<SalesFlowSwitches | null>(null)
const saving = ref(false)
const canManage = computed(() => can('sales.settings.manage'))

function reset() {
  draft.value = { ...data.value!.switches }
}
onMounted(async () => {
  data.value = await salesSettingsApi.salesFlow()
  reset()
})
const dirty = computed(() => Boolean(data.value && draft.value && JSON.stringify(data.value.switches) !== JSON.stringify(draft.value)))

const ORDER: (keyof SalesFlowSwitches)[] = ['useEnquiries', 'officeDraftsQuotations']
const HINT: Record<keyof SalesFlowSwitches, string> = {
  useEnquiries: 'Off: Enquiry is hidden from the menu and cannot be created.',
  officeDraftsQuotations: 'Off: Draft Quotation is hidden. Sales agents build the quotation with the customer.',
  askInstallation: 'Installation, delivery only, or collect. An order with installation makes a job for the office to book.',
}

async function save() {
  saving.value = true
  try {
    const result = await salesSettingsApi.saveSalesFlow(draft.value!)
    data.value = result
    setSalesFlow(result.switches)
    reset()
    toast.add({ severity: 'success', summary: result.saved?.length ? 'Sales flow saved' : 'Nothing changed', detail: result.saved?.join(' · '), life: 4500 })
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
