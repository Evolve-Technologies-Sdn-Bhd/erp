<script setup lang="ts">
import { ref } from 'vue'
import { ListFilter, Search, X } from '@lucide/vue'

/**
 * A list's table box, as the MES data grid (Material Master): one bordered box holding the toolbar (the search pill
 * and the count on the left; Filter, the page's tools and Add on the right), the filters panel when opened, the bar of
 * what can be done with the ticked rows, the table (DataList, default slot) and the footer (the pager).
 */
const props = defineProps<{ count?: string; placeholder?: string; activeFilters?: number; selected?: number }>()
const search = defineModel<string>('search')
const filtersOpen = ref((props.activeFilters ?? 0) > 0)
</script>

<template>
  <div class="erp-box">
    <div class="erp-box-bar">
      <label v-if="search !== undefined" class="erp-box-search">
        <Search :size="15" class="shrink-0 text-erp-off-text" aria-hidden="true" />
        <input v-model="search" type="text" :placeholder="placeholder ?? 'Search'" :aria-label="placeholder ?? 'Search this list'" />
        <button v-if="search" type="button" class="erp-box-clear" aria-label="Clear search" @click="search = ''"><X :size="13" aria-hidden="true" /></button>
      </label>
      <span v-if="count" class="erp-num text-[13px] text-erp-muted">{{ count }}</span>
      <div class="ml-auto flex flex-wrap items-center gap-0.5">
        <button v-if="$slots.filters" type="button" class="erp-box-tool" :class="{ 'is-on': filtersOpen || activeFilters }" :aria-expanded="filtersOpen" @click="filtersOpen = !filtersOpen">
          <ListFilter :size="15" aria-hidden="true" />Filter
          <span v-if="activeFilters" class="erp-box-count">{{ activeFilters }}</span>
        </button>
        <slot name="tools" />
        <span v-if="$slots.add" class="ml-1.5 flex"><slot name="add" /></span>
      </div>
    </div>
    <div v-if="$slots.filters && filtersOpen" class="erp-box-filters"><slot name="filters" /></div>
    <div v-if="selected" class="erp-box-selection">
      <span class="mr-2 text-[13px] font-medium">{{ selected }} selected</span>
      <slot name="selection" />
    </div>
    <slot />
    <div v-if="$slots.footer" class="erp-box-foot"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.erp-box {
  overflow: visible;
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius);
  background: var(--erp-card);
  box-shadow: var(--erp-card-shadow);
}
.erp-box-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--erp-border);
}
.erp-box-search {
  display: flex;
  width: 16rem;
  max-width: 100%;
  height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 12px;
  border-radius: 9999px;
  background: var(--erp-gray-100);
  transition:
    background-color 150ms,
    box-shadow 150ms;
}
.erp-box-search:hover {
  background: var(--erp-gray-200);
}
.erp-box-search:focus-within {
  background: var(--erp-card);
  box-shadow: 0 0 0 1px var(--erp-gray-300);
}
.erp-box-search input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--erp-text);
  outline: none;
}
.erp-box-search input::placeholder {
  color: var(--erp-muted);
}
.erp-box-clear {
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-gray-400);
}
.erp-box-clear:hover {
  background: var(--erp-gray-200);
  color: var(--erp-text);
}
/* Quiet tools (MES dg-tool); the page's own buttons in the tools slot use .erp-btn-import / -export */
.erp-box-tool {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-gray-600);
}
.erp-box-tool:hover,
.erp-box-tool.is-on {
  background: var(--erp-gray-100);
  color: var(--erp-text);
}
.erp-box-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border-radius: 9999px;
  background: var(--mod-primary);
  color: var(--erp-on-dark);
  font-size: 11px;
  font-weight: 600;
}
.erp-box-filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 12px;
  margin: 10px 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--erp-head-bg);
}
.erp-box-selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--erp-border);
  background: color-mix(in srgb, var(--mod-primary) 6%, var(--erp-card));
}
.erp-box-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--erp-border);
}
</style>
