<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { salesLookupsApi } from '../api/sales'
import type { PackageOption } from '../types'

/**
 * Add package (phase 5, F1 part 3): the packages running on the order date, with what the customer saves and the free
 * gift. The order keeps a package as its items priced from it, so Core decides the prices, not the form.
 */
const props = defineProps<{
  /** "SO-0009 · Klinik Sihat Jaya" */
  context: string
  /** The order date; packages running on it are offered. */
  docDate: string
}>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ add: [pick: { pkg: PackageOption; qty: string; giftItemCode: string | null }] }>()

const packages = ref<PackageOption[]>([])
const loading = ref(false)
const chosen = ref<string | null>(null)
const qty = ref('1')
const gift = ref('')

watch(visible, async (open) => {
  if (!open) return
  chosen.value = null
  qty.value = '1'
  gift.value = ''
  loading.value = true
  try {
    packages.value = (await salesLookupsApi.packages(props.docDate || undefined)).items
  } finally {
    loading.value = false
  }
})

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
  <Dialog v-model:visible="visible" modal :draggable="false" class="erp-dialog" :style="{ width: '820px' }">
    <template #header>
      <div>
        <h2 class="m-0 text-xl font-bold">Add package</h2>
        <p class="m-0 mt-1 text-[13px] text-erp-muted">{{ context }} · packages running on {{ formatDate(docDate) }}</p>
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <div class="max-h-[320px] overflow-y-auto rounded-lg border border-erp-border">
        <table class="erp-table">
          <thead class="sticky top-0 z-[1]">
            <tr>
              <th class="w-8" aria-label="Pick" />
              <th>Package</th>
              <th>Items</th>
              <th class="num">Price (RM)</th>
              <th class="num">Saves</th>
              <th>Free gift</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td colspan="6" class="text-center text-erp-muted">Loading…</td></tr>
            <tr v-else-if="!packages.length"><td colspan="6" class="text-center text-erp-muted">No package is running on this date. Packages are made in Core.</td></tr>
            <tr v-for="p in packages" :key="p.code" :class="{ off: Boolean(p.problem) }" class="cursor-pointer" @click="pick(p)">
              <td><input type="radio" name="package" :checked="chosen === p.code" :disabled="Boolean(p.problem)" :aria-label="`Pick ${p.code}`" @change="pick(p)" /></td>
              <td>
                <div class="font-semibold whitespace-nowrap">{{ p.code }}</div>
                <div class="text-xs text-erp-muted">{{ p.name }}<template v-if="p.runsUntil"> · until {{ formatDate(p.runsUntil) }}</template></div>
                <div v-if="p.problem" class="text-xs font-semibold text-attention">{{ p.problem }}</div>
              </td>
              <td class="text-xs">{{ itemsText(p) }}</td>
              <td class="num">{{ formatMoney(p.price) }} / {{ p.uomCode }}</td>
              <td class="num">{{ p.saves === null ? '—' : formatMoney(p.saves) }}</td>
              <td class="text-xs">{{ giftText(p) }}</td>
            </tr>
          </tbody>
        </table>
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
