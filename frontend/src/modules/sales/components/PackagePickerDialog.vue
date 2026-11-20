<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import AuthImage from '@/components/erp/AuthImage.vue'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { salesLookupsApi } from '../api/sales'
import type { PackageOption } from '../types'

/**
 * Add package (phase 5, F1 part 3): the packages running on the order date, as picture cards under their categories,
 * with what the customer saves, the free gift and the terms. The order keeps a package as its items priced from it,
 * so Core decides the prices, not the form or the picture.
 */
const props = defineProps<{
  /** "SO-0009 · Klinik Sihat Jaya" */
  context: string
  /** The order date; packages running on it are offered. */
  docDate: string
}>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ add: [pick: { pkg: PackageOption; qty: string; giftItemCode: string | null }] }>()

const ALL = 'All'
const OTHER = 'Other'
const packages = ref<PackageOption[]>([])
const loading = ref(false)
const chosen = ref<string | null>(null)
const qty = ref('1')
const gift = ref('')
const tab = ref(ALL)

watch(visible, async (open) => {
  if (!open) return
  chosen.value = null
  qty.value = '1'
  gift.value = ''
  tab.value = ALL
  loading.value = true
  try {
    packages.value = (await salesLookupsApi.packages(props.docDate || undefined)).items
  } finally {
    loading.value = false
  }
})

/** The categories the running packages are in (Core › Reference lists); packages without one go under Other. */
const categories = computed(() => {
  const named = [...new Set(packages.value.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort()
  return named.length && packages.value.some((p) => !p.category) ? [...named, OTHER] : named
})
const shown = computed(() => (tab.value === ALL ? packages.value : packages.value.filter((p) => (p.category ?? OTHER) === tab.value)))

const pkg = computed(() => packages.value.find((p) => p.code === chosen.value) ?? null)
const wholeSets = computed(() => /^[1-9]\d*$/.test(qty.value.trim()))
const needsGift = computed(() => pkg.value?.giftRule === 'CHOOSE_ONE')
const ready = computed(() => Boolean(pkg.value && !pkg.value.problem && wholeSets.value && (!needsGift.value || gift.value)))

function pick(p: PackageOption) {
  if (p.problem) return
  chosen.value = p.code
  gift.value = p.giftRule === 'CHOOSE_ONE' && p.gifts.length === 1 ? p.gifts[0]!.itemCode : ''
}
const itemsText = (p: PackageOption) => p.items.map((i) => `${formatQty(i.qty)} × ${i.itemName}`).join(', ')
function giftText(p: PackageOption) {
  if (p.giftRule === 'NONE' || !p.gifts.length) return 'No gift'
  if (p.giftRule === 'ALWAYS') return p.gifts.map((g) => g.itemName).join(', ')
  return `Choose 1 of ${p.gifts.length}`
}

function add() {
  if (!ready.value || !pkg.value) return
  emit('add', { pkg: pkg.value, qty: qty.value.trim(), giftItemCode: needsGift.value ? gift.value : null })
  visible.value = false
}
</script>

<template>
  <Dialog v-model:visible="visible" data-tour="package-picker" modal :draggable="false" class="erp-dialog" :style="{ width: '960px' }">
    <template #header>
      <div>
        <h2 class="m-0 text-xl font-bold">Add package</h2>
        <p class="m-0 mt-1 text-[13px] text-erp-muted">{{ context }} · packages running on {{ formatDate(docDate) }}</p>
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <div v-if="categories.length" class="flex flex-wrap gap-1.5" role="tablist" aria-label="Package categories">
        <button v-for="c in [ALL, ...categories]" :key="c" type="button" role="tab" class="pk-tab" :class="{ on: tab === c }" :aria-selected="tab === c" @click="tab = c">{{ c }}</button>
      </div>

      <div class="max-h-[380px] overflow-y-auto pr-1">
        <p v-if="loading" class="m-0 py-6 text-center text-[13px] text-erp-muted">Loading…</p>
        <p v-else-if="!packages.length" class="m-0 py-6 text-center text-[13px] text-erp-muted">No package is running on this date. Packages are made in Core.</p>
        <div v-else class="grid grid-cols-3 gap-3">
          <button
            v-for="p in shown"
            :key="p.code"
            type="button"
            class="pk-card"
            :class="{ on: chosen === p.code }"
            :disabled="Boolean(p.problem)"
            :aria-pressed="chosen === p.code"
            :aria-label="`Pick ${p.code} ${p.name}`"
            @click="pick(p)"
          >
            <div class="aspect-[4/3] overflow-hidden rounded-md border border-erp-border">
              <AuthImage :src="p.pictureUrl" :alt="p.name" />
            </div>
            <div class="mt-2 text-xs font-semibold text-erp-muted">{{ p.code }}<template v-if="p.category"> · {{ p.category }}</template></div>
            <div class="text-[13px] font-bold leading-snug">{{ p.name }}</div>
            <div class="mt-1 flex items-baseline justify-between gap-2">
              <span class="text-[15px] font-bold">RM {{ formatMoney(p.price) }} <span class="text-xs font-normal text-erp-muted">/ {{ p.uomCode }}</span></span>
              <span v-if="p.saves" class="text-xs font-semibold text-erp-muted">Saves {{ formatMoney(p.saves) }}</span>
            </div>
            <div class="mt-1 text-xs text-erp-muted">{{ itemsText(p) }}</div>
            <div class="text-xs text-erp-muted">Gift: {{ giftText(p) }}<template v-if="p.runsUntil"> · until {{ formatDate(p.runsUntil) }}</template></div>
            <div v-if="p.problem" class="mt-1 text-xs font-semibold text-attention">{{ p.problem }}</div>
          </button>
        </div>
      </div>

      <div v-if="pkg" class="grid grid-cols-[120px_1fr] items-start gap-x-4 gap-y-3 rounded-lg border border-erp-border px-4 py-3 text-[13px]">
        <label for="pk-qty" class="pt-2 font-semibold">Sets</label>
        <div>
          <input id="pk-qty" v-model="qty" class="erp-input w-[120px]" inputmode="numeric" :aria-invalid="!wholeSets" />
          <p v-if="!wholeSets" class="m-0 mt-1 text-xs text-note-error-text">Packages are sold in whole sets.</p>
        </div>
        <template v-if="needsGift">
          <span class="font-semibold">Free gift</span>
          <div class="flex flex-col gap-1.5">
            <label v-for="g in pkg.gifts" :key="g.itemCode" class="flex items-center gap-2">
              <input v-model="gift" type="radio" name="gift" :value="g.itemCode" />
              {{ g.itemName }} <span class="text-erp-muted">· {{ g.itemCode }} · {{ formatQty(g.qty) }} {{ g.uomCode }} per set</span>
            </label>
          </div>
        </template>
        <template v-if="pkg.terms">
          <span class="font-semibold">Terms</span>
          <div class="max-h-[140px] overflow-y-auto whitespace-pre-line text-xs text-erp-subtle">{{ pkg.terms }}</div>
        </template>
        <span class="font-semibold">On the order</span>
        <div class="text-xs text-erp-muted">
          One package line, kept as its items at the package's prices:
          <span v-for="(i, n) in pkg.items" :key="i.itemCode">{{ n ? ', ' : '' }}{{ i.itemCode }} {{ i.unitPrice ? formatPrice(i.unitPrice) : '—' }}</span>.
          The gift goes on the order at 0.00 and leaves with the delivery.
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="erp-btn erp-btn-secondary" @click="visible = false">Cancel</button>
      <button type="button" class="erp-btn erp-btn-primary" :disabled="!ready" @click="add">Add package</button>
    </template>
  </Dialog>
</template>

<style scoped>
.pk-tab {
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--erp-text);
  cursor: pointer;
  background: var(--erp-card);
  border: 1px solid var(--erp-border);
  border-radius: 999px;
}
.pk-tab.on {
  color: var(--erp-on-dark);
  background: var(--mod-primary);
  border-color: var(--mod-primary);
}
.pk-card {
  display: flex;
  flex-direction: column;
  padding: 10px;
  font: inherit;
  color: var(--erp-text);
  text-align: left;
  cursor: pointer;
  background: var(--erp-card);
  border: 1px solid var(--erp-border);
  border-radius: 10px;
}
.pk-card:hover:not(:disabled) {
  border-color: var(--mod-light-border);
}
.pk-card.on {
  background: var(--mod-light);
  border-color: var(--mod-primary);
  box-shadow: 0 0 0 1px var(--mod-primary);
}
.pk-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
