<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Menu from 'primevue/menu'
import { Ellipsis } from '@lucide/vue'

/** The "⋯" at the end of a list row (MES TableActionMenu): the row's pages, opened from a small menu. */
const props = defineProps<{ items: { label: string; to: string }[]; name?: string }>()
const router = useRouter()
const menu = ref<InstanceType<typeof Menu> | null>(null)
const model = () => props.items.map((i) => ({ label: i.label, command: () => void router.push(i.to) }))
</script>

<template>
  <button type="button" class="erp-row-menu" :aria-label="name ? `Actions for ${name}` : 'Actions'" aria-haspopup="true" @click="menu?.toggle($event)">
    <Ellipsis :size="16" aria-hidden="true" />
  </button>
  <Menu ref="menu" :model="model()" popup append-to="body" />
</template>

<style scoped>
.erp-row-menu {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-muted);
}
.erp-row-menu:hover {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
</style>
