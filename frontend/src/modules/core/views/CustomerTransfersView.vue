<script setup lang="ts">
import { ref, watch } from 'vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import StatusTabs from '@/components/erp/StatusTabs.vue'
import { coreTransfersApi } from '../api/core'
import TransferDecision from '../components/TransferDecision.vue'
import type { CustomerTransfer } from '../types'

/**
 * C17 · Customer Transfers (phase 5): salespeople asking to take over another salesperson's customer, waiting first.
 * Whoever edits customers approves or rejects; the asker and the customer's salesperson are told.
 */
const TABS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]
const status = ref('pending')
const rows = ref<CustomerTransfer[]>([])
const counts = ref<Record<string, number>>({})
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await coreTransfersApi.list(status.value)
    rows.value = r.items
    counts.value = r.statusCounts
  } finally {
    loading.value = false
  }
}
watch(status, load, { immediate: true })
</script>

<template>
  <section class="erp-card flex min-h-[560px] grow flex-col gap-3 px-6 py-[18px]">
    <PageHeader title="Customer Transfers" subtitle="Salespeople asking to take over another salesperson's customer. They can key orders for it while you decide." />
    <StatusTabs :tabs="TABS" :counts="counts" :active="status" @select="(k: string) => (status = k)" />
    <p v-if="loading && !rows.length" class="m-0 text-sm text-erp-muted">Loading…</p>
    <p v-else-if="!rows.length" class="m-0 text-sm text-erp-muted">Nothing here.</p>
    <div v-for="t in rows" :key="t.id" class="rounded-lg border border-erp-border px-4 py-3">
      <TransferDecision :transfer="t" show-customer @decided="load" />
    </div>
  </section>
</template>
