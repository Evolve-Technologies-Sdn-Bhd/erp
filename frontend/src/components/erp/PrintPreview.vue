<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ChevronLeft, Mail, Minus, Plus, Printer } from '@lucide/vue'

/**
 * The frame of every print preview (S20 InvoicePrint.html): a dark top bar with Back, Download PDF, Email and Print;
 * an options panel; and the A4 sheet, zoomable on screen. Printing uses the browser's own print, so "Save as PDF" in
 * the print dialog gives the PDF.
 *
 * On paper only the sheet prints. The paper's bottom margin carries the document number and "Page n of m", which
 * Chrome and Edge count for a document running over several pages.
 */
const props = defineProps<{
  module: 'sales' | 'purchase' | 'service'
  backTo: string
  backLabel: string
  heading: string
  /** Shown in the paper's bottom margin, left: "PO-0003 · This is a computer-generated purchase order." */
  footer: string
  /** Browser tab title, also the suggested file name for "Save as PDF". */
  fileTitle: string
  ready: boolean
  /** Email is offered only where the document can be emailed now. */
  emailLabel?: string
  canEmail?: boolean
}>()
const emit = defineEmits<{ email: [] }>()
const toast = useToast()
const zoom = ref(100)

function print() {
  window.print()
}
function downloadPdf() {
  toast.add({ severity: 'info', summary: 'Download PDF', detail: 'Choose “Save as PDF” as the printer in the print dialog.', life: 4000 })
  window.print()
}

// The paper's own margins and footer, for as long as the preview is open.
let pageStyle: HTMLStyleElement | null = null
const cssString = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
function applyPageStyle() {
  if (!pageStyle) return
  pageStyle.textContent = `@page {
    size: A4; margin: 12mm 12mm 14mm;
    @bottom-left { content: ${cssString(props.footer)}; font: 8px Inter, system-ui, sans-serif; color: #667085; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8px Inter, system-ui, sans-serif; color: #667085; }
  }`
}
onMounted(() => {
  pageStyle = document.createElement('style')
  pageStyle.dataset.erpPrint = 'document'
  document.head.appendChild(pageStyle)
  applyPageStyle()
})
watch(() => props.footer, applyPageStyle)
watch(
  () => props.fileTitle,
  (title) => {
    if (title) document.title = title
  },
  { immediate: true },
)
onBeforeUnmount(() => pageStyle?.remove())
</script>

<template>
  <div :data-module="module" class="flex min-h-screen flex-col bg-erp-bg text-erp-text print:block print:min-h-0 print:bg-white">
    <div data-tour="print:bar" class="flex items-center gap-4 bg-erp-text px-5 py-2.5 text-white print:hidden">
      <RouterLink :to="backTo" class="flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-white no-underline">
        <ChevronLeft :size="14" aria-hidden="true" />Back to {{ backLabel }}
      </RouterLink>
      <span class="h-5 w-px bg-white/30" aria-hidden="true" />
      <h1 class="m-0 min-w-0 grow truncate text-base font-bold">{{ heading }}</h1>
      <span class="text-xs whitespace-nowrap text-white/70">A4</span>
      <button type="button" class="erp-btn border-0 bg-white/15 text-white" :disabled="!ready" @click="downloadPdf">Download PDF</button>
      <button v-if="emailLabel" type="button" class="erp-btn border-0 bg-white/15 text-white" :disabled="!ready || !canEmail" @click="emit('email')">
        <Mail :size="14" aria-hidden="true" />{{ emailLabel }}
      </button>
      <button type="button" class="erp-btn erp-btn-primary" :disabled="!ready" @click="print"><Printer :size="14" aria-hidden="true" />Print</button>
    </div>

    <div class="flex grow print:block">
      <aside class="flex w-[280px] shrink-0 flex-col gap-3 border-r border-erp-border bg-erp-card px-5 py-5 text-[13px] print:hidden">
        <slot name="options" />
      </aside>

      <main class="relative flex grow justify-center overflow-auto px-6 py-5 print:block print:overflow-visible print:p-0">
        <div v-if="ready" class="erp-sheet shadow-md" :style="{ transform: `scale(${zoom / 100})` }">
          <slot />
          <!-- On paper this line is in the page margin, with the page number. -->
          <div class="mt-5 flex justify-between text-[9px] text-erp-muted print:hidden">
            <span>{{ footer }}</span><span>Page numbers print at the foot of each page</span>
          </div>
        </div>
        <p v-else class="m-0 text-[13px] text-erp-muted">Loading…</p>

        <div class="fixed right-6 bottom-6 flex items-center gap-3 rounded-[10px] border border-erp-border bg-erp-card px-3 py-2 text-[13px] shadow-sm print:hidden">
          <button type="button" class="cursor-pointer border-0 bg-transparent p-1" aria-label="Zoom out" @click="zoom = Math.max(50, zoom - 10)"><Minus :size="14" /></button>
          <span class="w-10 text-center">{{ zoom }}%</span>
          <button type="button" class="cursor-pointer border-0 bg-transparent p-1" aria-label="Zoom in" @click="zoom = Math.min(150, zoom + 10)"><Plus :size="14" /></button>
        </div>
      </main>
    </div>
  </div>
</template>
