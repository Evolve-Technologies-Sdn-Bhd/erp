<script setup lang="ts">
/**
 * The status tabs of a list ("All 11  Draft 2  Pending approval 1 …"), counts from statusCounts. Drawn as the Zora MES
 * segmented control (.erp-tabs in main.css): a grey pill, the chosen tab lifted in white, each count a little fainter.
 */
defineProps<{
  tabs: { key: string; label: string; hideWhenEmpty?: boolean }[]
  counts: Record<string, number> | null | undefined
  active: string
}>()
defineEmits<{ select: [key: string] }>()
</script>

<template>
  <div data-tour="status-tabs" class="erp-tabs" role="tablist">
    <template v-for="tab in tabs" :key="tab.key">
      <button
        v-if="!tab.hideWhenEmpty || (counts?.[tab.key] ?? 0) > 0"
        type="button"
        role="tab"
        :aria-selected="active === tab.key"
        class="erp-tab"
        :class="{ on: active === tab.key }"
        @click="$emit('select', tab.key)"
      >
        {{ tab.label }} <span class="erp-tab-count">{{ counts?.[tab.key] ?? 0 }}</span>
      </button>
    </template>
  </div>
</template>
