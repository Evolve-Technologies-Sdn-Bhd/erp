<script setup lang="ts">
import { computed } from 'vue'
import BarRows from '@/components/erp/BarRows.vue'
import FilterSelect from '@/components/erp/FilterSelect.vue'
import KpiCard from '@/components/erp/KpiCard.vue'
import MoneyText from '@/components/erp/MoneyText.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import ReportActions from '@/components/erp/ReportActions.vue'
import { useReport } from '@/composables/useReport'
import { downloadCsv } from '@/utils/csv'
import { formatDate, formatMonthYear, formatRm } from '@/utils/format'
import { salesReportsApi } from '../api/sales'

/** S05 · Fully paid orders (phase 5): what a month's commission is worked out from. Shown where official receipts are used. */
const { data: report, loading, filters, setFilter } = useReport(['period', 'branch', 'agent', 'group'], salesReportsApi.paidOrders)

const options = computed(() => {
  const f = report.value?.filters
  return {
    periods: (report.value?.periods ?? []).map((p) => ({ value: p, label: formatMonthYear(p) })),
    branches: (f?.branches ?? []).map((b) => ({ value: b.code, label: b.name })),
    agents: (f?.agents ?? []).map((a) => ({ value: a.code, label: a.name })),
    groups: (f?.groups ?? []).map((g) => ({ value: g, label: g })),
  }
})
const bars = computed(() => (report.value?.byAgent ?? []).slice(0, 10).map((a) => ({ key: a.agentCode, label: a.agentName, value: a.beforeTax, sub: `${a.count} ${a.count === 1 ? 'order' : 'orders'}` })))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function exportCsv() {
  const r = report.value
  if (!r) return
  downloadCsv(`fully-paid-orders-${r.period}.csv`, [
    ['Fully paid on', 'Sales order', 'Order date', 'Customer', 'Salesperson code', 'Salesperson', 'Branch', 'Before tax (RM)', 'Total (RM)'],
    ...r.rows.map((x) => [x.paidOn, x.docNo, x.docDate, x.customerName, x.agentCode, x.agentName, x.branchCode, x.beforeTax, x.total]),
    ['Total', '', '', '', '', '', '', r.totals.beforeTax, r.totals.total],
  ])
}
</script>

<template>
  <PageHeader title="Fully paid orders" subtitle="Sales orders paid in full in the month, per salesperson. Only a fully paid order earns commission.">
    <template #chip>
      <span v-if="report" class="rounded-xl bg-chip-released-bg px-2.5 py-[3px] text-xs font-semibold text-chip-released-text">{{ formatMonthYear(report.period) }}</span>
    </template>
    <template #actions><ReportActions :can-export="Boolean(report)" @export="exportCsv" /></template>
  </PageHeader>

  <div class="grid grid-cols-4 gap-3 print:hidden max-lg:not-print:grid-cols-2">
    <FilterSelect label="Fully paid in" :model-value="filters.period || report?.period || ''" :options="options.periods" @update:model-value="setFilter('period', $event)" />
    <FilterSelect label="Branch" all="all" :model-value="filters.branch ?? ''" :options="options.branches" @update:model-value="setFilter('branch', $event)" />
    <FilterSelect label="Salesperson" all="all" :model-value="filters.agent ?? ''" :options="options.agents" @update:model-value="setFilter('agent', $event)" />
    <FilterSelect label="Customer group" all="all" :model-value="filters.group ?? ''" :options="options.groups" @update:model-value="setFilter('group', $event)" />
  </div>

  <div class="grid grid-cols-4 gap-4 max-lg:not-print:grid-cols-2">
    <div class="erp-card flex flex-col gap-1 border-mod-light-border bg-mod-light px-5 py-4">
      <span class="text-[13px] font-semibold text-mod-accent">Fully paid, before tax</span>
      <span class="text-[22px] font-bold text-mod-accent">{{ report ? formatRm(report.kpis.paid.beforeTax) : '—' }}</span>
      <span class="text-xs text-mod-accent">{{ report ? plural(report.kpis.paid.count, 'order', 'orders') : '' }}</span>
    </div>
    <KpiCard label="Salespeople" :value="report ? report.kpis.agents.count : '—'" sub="with a fully paid order" :loading="loading && !report" />
    <KpiCard label="Deposit paid" :value="report ? report.kpis.deposit.count : '—'" :sub="report ? `${formatRm(report.kpis.deposit.amount)} still to pay` : ''" :loading="loading && !report" />
    <KpiCard label="Nothing paid yet" :value="report ? report.kpis.unpaid.count : '—'" :sub="report ? formatRm(report.kpis.unpaid.amount) : ''" :loading="loading && !report" />
  </div>

  <section v-if="report && bars.length" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
    <h2 class="m-0 text-[15px] font-bold">By salesperson, before tax</h2>
    <BarRows :rows="bars" />
  </section>

  <section v-if="report" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
    <h2 class="m-0 text-[15px] font-bold">Salespeople</h2>
    <table class="erp-table">
      <thead><tr><th>Salesperson</th><th class="num">Orders</th><th class="num">Before tax (RM)</th><th class="num">Total (RM)</th></tr></thead>
      <tbody>
        <tr v-if="!report.byAgent.length"><td colspan="4" class="text-erp-muted">No order became fully paid in this month.</td></tr>
        <tr v-for="a in report.byAgent" :key="a.agentCode">
          <td><span class="font-semibold">{{ a.agentName }}</span> <span class="text-xs text-erp-muted">{{ a.agentCode }}</span></td>
          <td class="num">{{ a.count }}</td>
          <td class="num font-semibold"><MoneyText :value="a.beforeTax" /></td>
          <td class="num"><MoneyText :value="a.total" /></td>
        </tr>
      </tbody>
    </table>
  </section>

  <section v-if="report" class="erp-card flex flex-col gap-3 px-5 py-[18px]">
    <h2 class="m-0 text-[15px] font-bold">Orders</h2>
    <div class="overflow-x-auto">
      <table class="erp-table">
        <thead><tr><th>Fully paid on</th><th>Sales order</th><th>Customer</th><th>Salesperson</th><th class="num">Before tax</th><th class="num">Total (RM)</th></tr></thead>
        <tbody>
          <tr v-if="!report.rows.length"><td colspan="6" class="text-erp-muted">No order became fully paid in this month.</td></tr>
          <tr v-for="r in report.rows" :key="r.id">
            <td class="whitespace-nowrap">{{ formatDate(r.paidOn) }}</td>
            <td class="whitespace-nowrap"><RouterLink :to="`/sales/orders/${r.id}`" class="erp-link font-semibold">{{ r.docNo }}</RouterLink><span class="block text-xs text-erp-muted">{{ formatDate(r.docDate) }}</span></td>
            <td>{{ r.customerName }}</td>
            <td>{{ r.agentName }}</td>
            <td class="num font-semibold"><MoneyText :value="r.beforeTax" /></td>
            <td class="num"><MoneyText :value="r.total" /></td>
          </tr>
          <tr v-if="report.rows.length" class="bg-erp-head font-bold">
            <td colspan="4">Total · {{ plural(report.rows.length, 'order', 'orders') }}</td>
            <td class="num"><MoneyText :value="report.totals.beforeTax" /></td>
            <td class="num"><MoneyText :value="report.totals.total" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="m-0 text-xs text-erp-muted">{{ report.footnote }}</p>
  </section>
</template>
