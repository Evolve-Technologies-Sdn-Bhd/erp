import type { InjectionKey, Ref } from 'vue'

/** What the table inside a ListBox tells the box, so the box's toolbar can drive it (MES TableTools + grid). */
export interface BoxTable {
  columns: Ref<{ index: number; label: string }[]>
  hidden: Ref<string[]>
  toggleColumn: (label: string) => void
  showAll: () => void
  selected: Ref<number>
  clearSelection: () => void
  download: (format: 'csv' | 'xlsx', onlySelected: boolean) => void
}

export interface BoxContext {
  register: (t: BoxTable) => void
  openFilters: () => void
}

export const LIST_BOX: InjectionKey<BoxContext> = Symbol('erp-list-box')
