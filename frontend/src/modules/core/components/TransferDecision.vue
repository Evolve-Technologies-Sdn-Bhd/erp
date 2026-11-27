<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'
import { coreTransfersApi } from '../api/core'
import type { CustomerTransfer } from '../types'

/**
 * A salesperson's request to take over another salesperson's customer (phase 5): who asks, why, and the office's
 * Approve or Reject (a rejection says why). Used on the customer page and the Customer Transfers list.
 */
const props = defineProps<{ transfer: CustomerTransfer; showCustomer?: boolean }>()
const emit = defineEmits<{ decided: [t: CustomerTransfer] }>()
const toast = useToast()
const note = ref('')
const error = ref('')
const busy = ref(false)

async function decide(approve: boolean) {
  error.value = ''
  if (!approve && !note.value.trim()) {
    error.value = 'Say why, so the salesperson knows.'
    return
  }
  busy.value = true
  try {
    const t = approve
      ? await coreTransfersApi.approve(props.transfer.id, props.transfer.version, note.value.trim() || null)
      : await coreTransfersApi.reject(props.transfer.id, props.transfer.version, note.value.trim())
    toast.add({ severity: 'success', summary: approve ? `${t.customerName} is now ${t.toAgentName}'s customer` : `Request from ${t.toAgentName} rejected`, life: 3500 })
    note.value = ''
    emit('decided', t)
  } catch (e) {
    if (e instanceof ApiError) error.value = e.fieldErrors.note ?? e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="m-0 text-[13px]">
      <strong>{{ transfer.toAgentName }}</strong> asks to take over
      <RouterLink v-if="showCustomer" :to="`/core/customers/${transfer.customerId}`" class="erp-link font-semibold">{{ transfer.customerName }} ({{ transfer.customerCode }})</RouterLink>
      <template v-else>this customer</template>
      from <strong>{{ transfer.fromAgentName ?? 'no salesperson' }}</strong>, {{ formatDateTime(transfer.createdAt) }}: “{{ transfer.reason }}”
    </p>
    <p v-if="transfer.status === 'PENDING'" class="m-0 text-xs text-erp-muted">While you decide, {{ transfer.toAgentName }} sees the customer and can key orders for it. The orders they make stay theirs whatever you decide.</p>
    <p v-else class="m-0 text-xs text-erp-muted">{{ transfer.statusLabel }} by {{ transfer.decidedBy }}<template v-if="transfer.decidedAt"> on {{ formatDateTime(transfer.decidedAt) }}</template><template v-if="transfer.decisionNote">: “{{ transfer.decisionNote }}”</template></p>
    <div v-if="transfer.allowedActions.length" class="flex flex-wrap items-start gap-2">
      <input v-model="note" class="erp-input min-w-[240px] flex-1" maxlength="300" placeholder="Note to the salesperson (needed to reject)" aria-label="Note to the salesperson" />
      <button type="button" class="erp-btn erp-btn-primary" :disabled="busy" @click="decide(true)">Approve</button>
      <button type="button" class="erp-btn erp-btn-delete" :disabled="busy" @click="decide(false)">Reject</button>
    </div>
    <span v-if="error" class="text-xs font-medium text-note-error-text" role="alert">{{ error }}</span>
  </div>
</template>
