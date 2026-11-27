<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import FormField from '@/components/erp/FormField.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import SideCard from '@/components/erp/SideCard.vue'
import { useSession } from '@/composables/useSession'
import { formatRm } from '@/utils/format'
import { salesTargetsApi } from '../api/sales'
import type { SalesTargets, TargetBranch } from '../types'

/**
 * S38 · Sales Targets (phase 5): each branch's target for a month, split between its salespeople. The phone's Sales home
 * shows a salesperson their own target against what they sold and what is fully paid. Read by anyone in Sales; set by
 * whoever holds sales.target.manage.
 */
const toast = useToast()
const { today } = useSession()
const month = ref('')
const data = ref<SalesTargets | null>(null)
const loading = ref(false)
const saving = ref('')
/** What is typed, per branch: its own target and each salesperson's. */
const forms = reactive<Record<string, { amount: string; agents: Record<string, string> }>>({})
const errors = reactive<Record<string, Record<string, string>>>({})

watch(today, (t) => t && !month.value && (month.value = t.slice(0, 7)), { immediate: true })

const shift = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, mo - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function fill(b: TargetBranch) {
  forms[b.code] = { amount: b.amount ?? '', agents: Object.fromEntries(b.agents.map((a) => [a.code, a.amount ?? ''])) }
  errors[b.code] = {}
}

async function load() {
  if (!month.value) return
  loading.value = true
  try {
    const view = await salesTargetsApi.view(month.value)
    view.branches.forEach(fill)
    data.value = view
  } finally {
    loading.value = false
  }
}
watch(month, load, { immediate: true })

const canManage = computed(() => Boolean(data.value?.canManage))
const num = (v: string) => (v.trim() ? Number(v.replace(/,/g, '')) : 0)
/** What is split so far, as typed (the server works it out again on save). */
function split(b: TargetBranch) {
  const f = forms[b.code]
  if (!f) return { allocated: 0, left: null as number | null }
  const allocated = Object.values(f.agents).reduce((s, v) => s + (Number.isFinite(num(v)) ? num(v) : 0), 0)
  return { allocated, left: f.amount.trim() ? num(f.amount) - allocated : null }
}

async function save(b: TargetBranch) {
  const f = forms[b.code]
  if (!f) return
  saving.value = b.code
  errors[b.code] = {}
  try {
    const saved = await salesTargetsApi.save({
      month: month.value,
      branchCode: b.code,
      amount: f.amount.trim() || null,
      agents: b.agents.map((a) => ({ agentCode: a.code, amount: (f.agents[a.code] ?? '').trim() || null })),
      version: b.version,
    })
    saved.branches.forEach(fill)
    data.value = saved
    toast.add({ severity: 'success', summary: `${b.name} targets saved`, detail: saved.monthText, life: 3000 })
  } catch (error) {
    if (error instanceof ApiError) {
      const fields = error.fieldErrors
      // agents[2].amount → the salesperson's code, so the message shows under their row.
      errors[b.code] = Object.fromEntries(Object.entries(fields).map(([k, v]) => {
        const m = /^agents\[(\d+)\]\./.exec(k)
        return [m ? (b.agents[Number(m[1])]?.code ?? k) : k, v]
      }))
      if (error.status === 409) await load()
    }
  } finally {
    saving.value = ''
  }
}
</script>

<template>
  <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_320px]">
    <section class="erp-card flex min-h-[560px] flex-col gap-4 px-6 py-[18px]">
      <PageHeader title="Sales Targets" subtitle="Each branch's target for the month, split between its salespeople." />
      <div class="flex items-center gap-2">
        <button type="button" class="erp-btn erp-btn-secondary h-[32px] px-3" aria-label="Previous month" @click="month = shift(month, -1)">‹</button>
        <span class="min-w-[150px] text-center text-[15px] font-bold">{{ data?.monthText ?? month }}</span>
        <button type="button" class="erp-btn erp-btn-secondary h-[32px] px-3" aria-label="Next month" @click="month = shift(month, 1)">›</button>
        <button v-if="today && month !== today.slice(0, 7)" type="button" class="erp-btn erp-btn-secondary h-[32px] px-3 text-xs" @click="month = today.slice(0, 7)">This month</button>
      </div>
      <NoticeBanner v-if="data && !canManage" kind="info">You can see the targets. Setting them needs the <em>Sales target · Set</em> permission (Configuration › Roles).</NoticeBanner>
      <p v-if="loading && !data" class="m-0 text-sm text-erp-muted">Loading…</p>
      <p v-if="data && !data.branches.length" class="m-0 text-sm text-erp-muted">You work in no branch, so there are no targets to show.</p>

      <div v-for="b in data?.branches ?? []" :key="b.code" class="flex flex-col gap-3 rounded-lg border border-erp-border px-4 py-3">
        <div class="flex items-end justify-between gap-4">
          <div>
            <div class="text-[15px] font-bold">{{ b.name }}</div>
            <div class="text-xs text-erp-muted">{{ b.code }} · {{ b.agents.length }} {{ b.agents.length === 1 ? 'salesperson' : 'salespeople' }}</div>
          </div>
          <FormField label="Branch target (RM)" :error="errors[b.code]?.amount" :for="`tg-${b.code}`" class="w-[200px]">
            <input v-if="canManage && forms[b.code]" :id="`tg-${b.code}`" v-model="forms[b.code]!.amount" class="erp-input text-right" inputmode="decimal" placeholder="No target" :aria-invalid="Boolean(errors[b.code]?.amount)" />
            <div v-else class="erp-input-ro text-right">{{ b.amount ? formatRm(b.amount) : 'No target' }}</div>
          </FormField>
        </div>

        <table class="w-full text-[13px]">
          <thead>
            <tr class="text-left text-xs text-erp-muted">
              <th class="py-1 font-semibold">Salesperson</th>
              <th class="py-1 text-right font-semibold">Target (RM)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in b.agents" :key="a.code" class="border-t border-erp-border">
              <td class="py-1.5">
                <div class="font-semibold">{{ a.name }}</div>
                <div class="text-xs text-erp-muted">{{ a.code }}</div>
              </td>
              <td class="w-[200px] py-1.5">
                <input v-if="canManage && forms[b.code]" v-model="forms[b.code]!.agents[a.code]" class="erp-input text-right" inputmode="decimal" placeholder="No target" :aria-label="`Target for ${a.name}`" :aria-invalid="Boolean(errors[b.code]?.[a.code])" />
                <div v-else class="text-right">{{ a.amount ? formatRm(a.amount) : '—' }}</div>
                <div v-if="errors[b.code]?.[a.code]" class="mt-1 text-xs font-medium text-note-error-text" role="alert">{{ errors[b.code]![a.code] }}</div>
              </td>
            </tr>
            <tr v-if="!b.agents.length"><td colspan="2" class="py-2 text-erp-muted">No salesperson works in this branch.</td></tr>
          </tbody>
        </table>

        <div class="flex items-center justify-between gap-4">
          <span class="text-xs" :class="(split(b).left ?? 0) < 0 ? 'text-attention' : 'text-erp-muted'">
            Split between salespeople: {{ formatRm(split(b).allocated.toFixed(2)) }}
            <template v-if="split(b).left !== null"> · {{ split(b).left! < 0 ? `${formatRm((-split(b).left!).toFixed(2))} more than the branch target` : `${formatRm(split(b).left!.toFixed(2))} not split yet` }}</template>
          </span>
          <button v-if="canManage" type="button" class="erp-btn erp-btn-primary" :disabled="saving === b.code" @click="save(b)">Save {{ b.name }}</button>
        </div>
      </div>
    </section>

    <div class="flex flex-col gap-4">
      <SideCard title="How it works">
        <p class="m-0 text-[13px] text-erp-subtle">Set the branch's target for the month, then each salesperson's share. Leave a box empty for no target.</p>
        <p class="m-0 text-[13px] text-erp-subtle">On the phone, a salesperson sees their own target against what they ordered this month (released orders) and what is fully paid (verified official receipts).</p>
        <p class="m-0 text-[13px] text-erp-subtle">The shares need not add up to the branch target; the page says when they do not.</p>
      </SideCard>
    </div>
  </div>
</template>
