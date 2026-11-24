<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Eye } from '@lucide/vue'
import { run, stepText } from './engine'

/** A guide step's extras: what to type (each with a copy button) and what the person should see. */
const step = computed(() => run.tour?.steps[run.index] ?? null)
const rows = computed(() => (step.value?.type ?? []).map((t) => ({ field: stepText(t.field), value: stepText(t.value) })))
const expect = computed(() => stepText(step.value?.expect))

const copied = ref('')
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    window.setTimeout(() => (copied.value = ''), 1500)
  } catch {
    /* no clipboard: the words are there to type */
  }
}
</script>

<template>
  <dl v-if="rows.length" class="tour-type">
    <template v-for="r in rows" :key="r.field">
      <dt>{{ r.field }}</dt>
      <dd>
        <span class="min-w-0 font-semibold break-words text-erp-text">{{ r.value }}</span>
        <button type="button" class="tour-icon-btn tour-copy" :aria-label="`Copy ${r.value}`" title="Copy" @click="copy(r.value)">
          <component :is="copied === r.value ? Check : Copy" :size="13" aria-hidden="true" />
        </button>
      </dd>
    </template>
  </dl>
  <p v-if="expect" class="tour-note tour-note-see"><Eye :size="14" class="shrink-0" aria-hidden="true" /><span><strong>You should see:</strong> {{ expect }}</span></p>
</template>
