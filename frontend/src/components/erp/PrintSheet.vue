<script setup lang="ts">
/**
 * The body of a printed document on its A4 sheet, the same for every document (S20 InvoicePrint.html is the model):
 * company and title, the parties (Bill to, Deliver to, Supplier …), the document's facts, the lines, the totals, then
 * notes and signatures. Each print view maps its document onto these props; slots add what only one document has
 * (the invoice's e-Invoice block, a delivery order's receiver).
 *
 * The lines table repeats its heading on every page and never splits a line; the totals and the signatures stay
 * together, so a long document breaks cleanly over several pages.
 */
export interface PrintParty {
  label: string
  /** First line prints bold (the name). */
  lines: string[]
}
export interface PrintFact {
  label: string
  value: string
}
export interface PrintColumn {
  key: string
  label: string
  align?: 'right'
  /** Wraps long text (descriptions); every other column stays on one line. */
  wrap?: boolean
}
export interface PrintCell {
  text: string
  /** Smaller grey second line under the text. */
  sub?: string[]
  bold?: boolean
}
export type PrintRow = Record<string, string | PrintCell>
export interface PrintTotal {
  label: string
  value: string
  strong?: boolean
}

withDefaults(
  defineProps<{
    company: string
    companyLines?: string[]
    logo?: boolean
    title: string
    docNo: string
    /** "Revision 2", "Draft — not valid until released" … under the number. */
    docNote?: string
    parties: PrintParty[]
    facts: PrintFact[]
    columns: PrintColumn[]
    rows: PrintRow[]
    totals?: PrintTotal[]
    words?: string
    notes?: { label: string; text: string }[]
    signatures?: string[]
    closing?: string
  }>(),
  { companyLines: () => [], logo: false, docNote: '', totals: () => [], words: '', notes: () => [], signatures: () => [], closing: '' },
)

const cell = (value: string | PrintCell | undefined): PrintCell => (typeof value === 'object' ? value : { text: value ?? '' })
</script>

<template>
  <div class="flex items-start justify-between gap-6">
    <div class="flex items-start gap-3">
      <div v-if="logo" class="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-erp-input text-[9px] text-erp-muted">LOGO</div>
      <div>
        <div class="text-[15px] font-bold">{{ company }}</div>
        <div v-for="(line, n) in companyLines" :key="n" class="text-erp-subtle">{{ line }}</div>
      </div>
    </div>
    <div class="shrink-0 text-right">
      <div class="text-[20px] leading-tight font-bold tracking-wide">{{ title }}</div>
      <div class="text-[13px] font-bold">{{ docNo }}</div>
      <div v-if="docNote" class="mt-0.5 text-erp-subtle">{{ docNote }}</div>
    </div>
  </div>

  <div class="mt-6 grid gap-4" :style="{ gridTemplateColumns: `${parties.map(() => 'minmax(0,1fr)').join(' ')} minmax(0,1.1fr)` }">
    <div v-for="p in parties" :key="p.label" class="min-w-0">
      <div class="text-[9px] text-erp-muted uppercase">{{ p.label }}</div>
      <template v-for="(line, n) in p.lines" :key="n">
        <div :class="{ 'font-bold': n === 0 }" class="wrap-break-word">{{ line }}</div>
      </template>
    </div>
    <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 gap-y-0.5">
      <template v-for="f in facts" :key="f.label">
        <dt class="text-erp-subtle whitespace-nowrap">{{ f.label }}</dt>
        <dd class="m-0 text-right wrap-break-word">{{ f.value }}</dd>
      </template>
    </dl>
  </div>

  <slot name="before-lines" />

  <table class="mt-6">
    <thead>
      <tr>
        <th v-for="c in columns" :key="c.key" :class="{ num: c.align === 'right' }">{{ c.label }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, i) in rows" :key="i">
        <td v-for="c in columns" :key="c.key" :class="[{ num: c.align === 'right' }, c.wrap ? 'w-full' : 'whitespace-nowrap']">
          <span :class="{ 'font-semibold': cell(row[c.key]).bold }">{{ cell(row[c.key]).text }}</span>
          <div v-for="(s, n) in cell(row[c.key]).sub ?? []" :key="n" class="text-erp-subtle whitespace-normal">{{ s }}</div>
        </td>
      </tr>
      <tr v-if="!rows.length">
        <td :colspan="columns.length" class="text-erp-muted">No lines.</td>
      </tr>
    </tbody>
  </table>

  <div class="erp-sheet-foot mt-5 flex justify-between gap-6">
    <div class="min-w-0">
      <template v-if="words">
        <div class="text-[9px] text-erp-muted uppercase">Amount in words</div>
        <div>{{ words }}</div>
      </template>
      <div v-for="n in notes" :key="n.label" class="mt-3 max-w-95">
        <div class="text-[9px] text-erp-muted uppercase">{{ n.label }}</div>
        <div class="whitespace-pre-line">{{ n.text }}</div>
      </div>
    </div>
    <dl v-if="totals.length" class="m-0 grid w-60 shrink-0 grid-cols-[1fr_auto] content-start gap-y-1">
      <template v-for="t in totals" :key="t.label">
        <dt :class="t.strong ? 'border-t border-erp-text pt-1.5 text-[13px] font-bold' : ''">{{ t.label }}</dt>
        <dd class="m-0 text-right tabular-nums" :class="t.strong ? 'border-t border-erp-text pt-1.5 text-[13px] font-bold' : ''">{{ t.value }}</dd>
      </template>
    </dl>
  </div>

  <div class="erp-sheet-foot mt-auto flex items-end justify-between gap-6 pt-10">
    <div class="min-w-0"><slot name="foot" /></div>
    <div v-if="signatures.length" class="flex shrink-0 gap-8 pt-10">
      <div v-for="s in signatures" :key="s" class="w-40 border-t border-erp-text pt-1 text-center">{{ s }}</div>
    </div>
  </div>
  <div v-if="closing" class="erp-sheet-foot mt-4 text-erp-subtle">{{ closing }}</div>
</template>
