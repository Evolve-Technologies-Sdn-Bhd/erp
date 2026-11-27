<script setup lang="ts">
import { computed } from 'vue'

/**
 * The one way to show a status (DESIGN_TOKENS.md → Status chips). Maps a document status to a colour group, drawn as
 * the Zora MES badge: a light tint, a hairline border and a dot, so it reads as a status at a glance.
 * Pass `label` when a screen uses its own word for a status ("Partially received", "Short 5").
 */
type ChipGroup = 'draft' | 'pending' | 'released' | 'partial' | 'done' | 'cancelled'

const props = defineProps<{
  status: string
  label?: string
  group?: ChipGroup
}>()

const GROUPS: Record<string, ChipGroup> = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending',
  TO_MATCH: 'pending',
  WAITING_FOR_CREDIT: 'pending',
  SUBMITTED: 'released',
  RELEASED: 'released',
  WAITING: 'released',
  READY: 'pending',
  SENT: 'released',
  PARTIAL: 'partial',
  DONE: 'done',
  CONVERTED: 'done',
  AWARDED: 'done',
  SETTLED: 'done',
  APPROVED: 'done',
  PAID: 'done',
  CONFIRMED: 'done',
  REJECTED: 'cancelled',
  CANCELLED: 'cancelled',
  CLOSED: 'cancelled',
}

const LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  TO_MATCH: 'To match',
  WAITING_FOR_CREDIT: 'Waiting for credit',
  SUBMITTED: 'Submitted',
  RELEASED: 'Released',
  WAITING: 'Waiting',
  READY: 'Ready to compare',
  SENT: 'Sent',
  PARTIAL: 'Partial',
  DONE: 'Done',
  CONVERTED: 'Converted',
  AWARDED: 'Awarded',
  SETTLED: 'Settled',
  APPROVED: 'Approved',
  PAID: 'Paid',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
}

const group = computed<ChipGroup>(() => props.group ?? GROUPS[props.status] ?? 'draft')
const text = computed(() => props.label ?? LABELS[props.status] ?? props.status)
</script>

<template>
  <!-- data-status: the status code, so a guided tour can see a document change (Released, Confirmed …) -->
  <span class="erp-chip" :class="`erp-chip-${group}`" :data-status="status">{{ text }}</span>
</template>

<style scoped>
.erp-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 7px;
  border: 1px solid var(--c-border);
  border-radius: 9999px;
  background: var(--c-bg);
  color: var(--c-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  letter-spacing: -0.005em;
  white-space: nowrap;
}
.erp-chip::before {
  content: '';
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 9999px;
  background: var(--c-dot);
}
.erp-chip-draft {
  --c-bg: var(--chip-draft-bg);
  --c-border: var(--chip-draft-border);
  --c-text: var(--chip-draft-text);
  --c-dot: var(--chip-draft-dot);
}
.erp-chip-pending {
  --c-bg: var(--chip-pending-bg);
  --c-border: var(--chip-pending-border);
  --c-text: var(--chip-pending-text);
  --c-dot: var(--chip-pending-dot);
}
.erp-chip-released {
  --c-bg: var(--chip-released-bg);
  --c-border: var(--chip-released-border);
  --c-text: var(--chip-released-text);
  --c-dot: var(--chip-released-dot);
}
.erp-chip-partial {
  --c-bg: var(--chip-partial-bg);
  --c-border: var(--chip-partial-border);
  --c-text: var(--chip-partial-text);
  --c-dot: var(--chip-partial-dot);
}
.erp-chip-done {
  --c-bg: var(--chip-done-bg);
  --c-border: var(--chip-done-border);
  --c-text: var(--chip-done-text);
  --c-dot: var(--chip-done-dot);
}
.erp-chip-cancelled {
  --c-bg: var(--chip-cancelled-bg);
  --c-border: var(--chip-cancelled-border);
  --c-text: var(--chip-cancelled-text);
  --c-dot: var(--chip-cancelled-dot);
}
</style>
