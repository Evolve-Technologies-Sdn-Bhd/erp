<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DatePicker from 'primevue/datepicker'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { Lock, Plus, X } from '@lucide/vue'
import { ApiError } from '@/api/http'
import ActivityList from '@/components/erp/ActivityList.vue'
import FormField from '@/components/erp/FormField.vue'
import MasterDataPicker from '@/components/erp/MasterDataPicker.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import PictureField from '@/components/erp/PictureField.vue'
import SideCard from '@/components/erp/SideCard.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { usePageCrumb } from '@/composables/usePageCrumb'
import { useSession } from '@/composables/useSession'
import { formatDate, formatMoney, formatPrice, formatQty } from '@/utils/format'
import { coreLookupsApi, corePackagesApi, corePriceListsApi } from '../api/core'
import type { GiftRule, ItemFormOptions, PackageAction, PackageDetail, PackageInput, SellableItemOption } from '../types'
import { PACKAGE_STATUS_GROUP } from './packages'

/** C16 · Package: its items, one price, and a free gift (CorePackageForm.html) */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const setCrumb = usePageCrumb()
const session = useSession()

const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')

const pkg = ref<PackageDetail | null>(null)
const options = ref<ItemFormOptions | null>(null)
const priceLists = ref<{ code: string; name: string }[]>([])
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

interface Line {
  key: number
  item: SellableItemOption | null
  itemId: string | null
  qty: string
  uomCode: string
}
let nextKey = 1
const form = reactive({
  code: '',
  name: '',
  uomCode: 'SET',
  salesTaxCode: '',
  priceListCode: '',
  packagePrice: '',
  giftRule: 'NONE' as GiftRule,
  runsFrom: '',
  runsUntil: '',
  category: '',
  terms: '',
  pictureId: null as string | null,
  items: [] as Line[],
  gifts: [] as Line[],
})

const GIFT_RULES: { v: GiftRule; t: string }[] = [
  { v: 'NONE', t: 'No gift' },
  { v: 'ALWAYS', t: 'These gifts, always' },
  { v: 'CHOOSE_ONE', t: 'Customer chooses 1' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const isoToDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`) : null)
const dateToIso = (value: unknown) => (value instanceof Date ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` : '')

const lineOut = (l: Line) => ({ itemCode: l.item?.code ?? '', qty: l.qty.trim(), uomCode: l.uomCode })
const snapshot = () => JSON.stringify({ ...form, items: form.items.map(lineOut), gifts: form.gifts.map(lineOut) })
const saved = ref('')
const dirty = computed(() => snapshot() !== saved.value)
const can = (a: PackageAction) => Boolean(pkg.value?.allowedActions.includes(a))
const editable = computed(() => (isNew.value ? session.can('core.price_list.edit') : can('edit')))

const toLine = (l: { itemId: string | null; itemCode: string; itemName: string; qty: string; uomCode: string }): Line => ({
  key: nextKey++,
  item: { code: l.itemCode, name: l.itemName, baseUom: l.uomCode, units: [l.uomCode] },
  itemId: l.itemId,
  qty: formatQty(l.qty),
  uomCode: l.uomCode,
})

function fill(p: PackageDetail | null) {
  if (p) {
    Object.assign(form, {
      code: p.code, name: p.name, uomCode: p.uomCode, salesTaxCode: p.salesTaxCode, priceListCode: p.priceListCode, packagePrice: p.packagePrice,
      giftRule: p.giftRule, runsFrom: p.runsFrom, runsUntil: p.runsUntil ?? '', items: p.items.map(toLine), gifts: p.gifts.map(toLine),
      category: p.category ?? '', terms: p.terms ?? '', pictureId: p.pictureId,
    })
  } else {
    Object.assign(form, {
      code: '', name: '', uomCode: 'SET', salesTaxCode: options.value?.taxCodes.find((t) => t.type === 'SALES_TAX')?.code ?? '',
      priceListCode: priceLists.value[0]?.code ?? '', packagePrice: '', giftRule: 'NONE', runsFrom: session.today.value, runsUntil: '', items: [], gifts: [],
      category: '', terms: '', pictureId: null,
    })
  }
  saved.value = snapshot()
  errors.value = {}
}

function show(p: PackageDetail) {
  pkg.value = p
  fill(p)
  setCrumb(p.code)
}

onMounted(async () => {
  loading.value = true
  try {
    const [opts, lists, detail] = await Promise.all([
      coreLookupsApi.itemForm(),
      corePriceListsApi.list({ page: 1, pageSize: 100, status: 'active' }),
      isNew.value ? Promise.resolve(null) : corePackagesApi.get(id.value),
    ])
    options.value = opts
    priceLists.value = lists.items.map((l) => ({ code: l.code, name: l.name }))
    pkg.value = detail
    fill(detail)
    setCrumb(detail?.code ?? 'New package')
  } finally {
    loading.value = false
  }
})

/** Active categories, plus the one the package already has if it was made inactive since. */
const categoryOptions = computed(() => {
  const active = options.value?.packageCategories ?? []
  return form.category && !active.includes(form.category) ? [...active, form.category] : active
})

const searchSellable = async (q: string) => (await coreLookupsApi.sellableItems(q)).items
const searchGifts = async (q: string) => (await coreLookupsApi.activeItems(q)).items
const addLine = (list: Line[]) => list.push({ key: nextKey++, item: null, itemId: null, qty: '1', uomCode: '' })
function pick(l: Line, item: SellableItemOption | null) {
  l.item = item
  l.itemId = null
  l.uomCode = item?.units[0] ?? ''
}
const lineError = (list: 'items' | 'gifts', i: number) =>
  errors.value[`${list}[${i}].itemCode`] ?? errors.value[`${list}[${i}].uomCode`] ?? errors.value[`${list}[${i}].qty`]

function body(): PackageInput {
  return {
    name: form.name.trim(),
    uomCode: form.uomCode,
    salesTaxCode: form.salesTaxCode,
    priceListCode: form.priceListCode,
    packagePrice: form.packagePrice.trim(),
    giftRule: form.giftRule,
    runsFrom: form.runsFrom,
    runsUntil: form.runsUntil || null,
    category: form.category || null,
    terms: form.terms.trim() || null,
    pictureId: form.pictureId,
    items: form.items.map(lineOut),
    gifts: form.giftRule === 'NONE' ? [] : form.gifts.map(lineOut),
  }
}

async function save() {
  saving.value = true
  errors.value = {}
  try {
    const result = isNew.value
      ? await corePackagesApi.create({ code: form.code.trim().toUpperCase(), ...body() })
      : await corePackagesApi.update(id.value, { ...body(), version: pkg.value!.version })
    toast.add({ severity: 'success', summary: isNew.value ? `Package ${result.code} created` : 'Package saved', life: 3000 })
    if (isNew.value) await router.replace(`/core/packages/${result.id}`)
    show(result)
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}

function endNow() {
  const p = pkg.value!
  confirm.require({
    header: `End ${p.code} now?`,
    message: 'Today is its last day. Orders that already have it keep it.',
    acceptLabel: 'End now',
    rejectLabel: 'Keep it running',
    accept: async () => {
      show(await corePackagesApi.end(p.id, p.version))
      toast.add({ severity: 'success', summary: `${p.code} ends today`, life: 3000 })
    },
  })
}

function remove() {
  const p = pkg.value!
  confirm.require({
    header: `Delete ${p.code}?`,
    message: `The package goes with its items and gifts. The code ${p.code} is not used again.`,
    acceptLabel: 'Delete',
    rejectLabel: 'Keep it',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await corePackagesApi.remove(p.id, p.version)
      toast.add({ severity: 'success', summary: `${p.code} deleted`, life: 3000 })
      void router.push('/core/packages')
    },
  })
}

const subtitle = computed(() =>
  isNew.value ? 'Several items sold together at one price. The code cannot change after saving.' : 'Sold as one line on a quotation or sales order. The code cannot change after saving.',
)
/** The saved numbers for a line, while that line still holds the saved item. They are worked out again on save. */
const savedLine = (i: number, l: Line) => {
  const s = pkg.value?.items[i]
  return s && s.itemCode === l.item?.code ? s : null
}
</script>

<template>
  <div v-if="loading" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else>
    <section class="erp-card px-6 py-[18px]">
      <PageHeader :title="isNew ? 'New package' : `Package ${pkg?.code ?? ''}`" :subtitle="subtitle" document>
        <template #chip>
          <StatusChip v-if="pkg" :status="pkg.status" :label="pkg.statusLabel" :group="PACKAGE_STATUS_GROUP[pkg.status]" />
        </template>
        <template #actions>
          <template v-if="isNew">
            <RouterLink to="/core/packages" class="erp-btn erp-btn-secondary">Cancel</RouterLink>
            <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="save">Save package</button>
          </template>
          <template v-else-if="pkg">
            <button v-if="can('delete')" type="button" class="erp-btn erp-btn-delete" :disabled="saving || dirty" @click="remove">Delete</button>
            <button v-if="can('end')" type="button" class="erp-btn erp-btn-secondary" :disabled="saving || dirty" :title="dirty ? 'Save or undo your changes first.' : undefined" @click="endNow">End now</button>
            <button v-if="editable" type="button" class="erp-btn erp-btn-primary" :disabled="saving || !dirty" @click="save">Save package</button>
            <RouterLink v-else to="/core/packages" class="erp-btn erp-btn-secondary">Back</RouterLink>
          </template>
        </template>
      </PageHeader>
    </section>

    <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_320px]">
      <div class="flex min-w-0 flex-col gap-4">
        <!-- General -->
        <section class="erp-card flex flex-col gap-3.5 px-[18px] py-4">
          <h2 class="m-0 text-[15px] font-bold">General</h2>
          <div class="grid grid-cols-4 gap-x-[18px] gap-y-3.5">
            <FormField v-if="isNew" label="Code" for="code" :error="errors.code">
              <input id="code" v-model="form.code" class="erp-input uppercase placeholder:normal-case" maxlength="30" placeholder="PK-DIN-06" />
            </FormField>
            <div v-else class="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-erp-muted">
              <span class="flex justify-between gap-2">
                <label for="code">Code</label>
                <span class="inline-flex items-center gap-1.5"><Lock :size="12" aria-hidden="true" />Never changes</span>
              </span>
              <div id="code" class="erp-input-ro">{{ form.code }}</div>
            </div>
            <FormField label="Name shown to customers" for="name" :error="errors.name" class="col-span-2">
              <input id="name" v-model="form.name" class="erp-input" maxlength="100" :disabled="!editable" />
            </FormField>
            <FormField label="Unit" for="uom" :error="errors.uomCode">
              <select id="uom" v-model="form.uomCode" class="erp-input" :disabled="!editable">
                <option v-for="u in options?.uoms ?? []" :key="u.code" :value="u.code">{{ u.code }} · {{ u.name }}</option>
              </select>
            </FormField>
            <FormField label="Runs from" for="runsFrom" :error="errors.runsFrom">
              <DatePicker
                v-if="editable"
                input-id="runsFrom"
                :model-value="isoToDate(form.runsFrom)"
                date-format="d M yy"
                fluid
                class="erp-date"
                :invalid="Boolean(errors.runsFrom)"
                @update:model-value="form.runsFrom = dateToIso($event)"
              />
              <div v-else class="erp-input-ro">{{ formatDate(form.runsFrom) }}</div>
            </FormField>
            <FormField label="Runs until" for="runsUntil" :error="errors.runsUntil">
              <DatePicker
                v-if="editable"
                input-id="runsUntil"
                :model-value="isoToDate(form.runsUntil)"
                date-format="d M yy"
                placeholder="No end"
                show-button-bar
                fluid
                class="erp-date"
                :invalid="Boolean(errors.runsUntil)"
                @update:model-value="form.runsUntil = dateToIso($event)"
                @clear-click="form.runsUntil = ''"
              />
              <div v-else class="erp-input-ro">{{ form.runsUntil ? formatDate(form.runsUntil) : 'No end' }}</div>
            </FormField>
            <FormField label="Sales tax" for="tax" :error="errors.salesTaxCode">
              <select id="tax" v-model="form.salesTaxCode" class="erp-input" :disabled="!editable">
                <option v-for="t in options?.taxCodes ?? []" :key="t.code" :value="t.code">{{ t.name }}</option>
              </select>
            </FormField>
            <FormField label="Items priced from" for="priceList" :error="errors.priceListCode">
              <select id="priceList" v-model="form.priceListCode" class="erp-input" :disabled="!editable">
                <option v-for="l in priceLists" :key="l.code" :value="l.code">{{ l.code }} · {{ l.name }}</option>
              </select>
            </FormField>
            <FormField label="Category" for="category" :error="errors.category">
              <select id="category" v-model="form.category" class="erp-input" :disabled="!editable">
                <option value="">—</option>
                <option v-for="c in categoryOptions" :key="c" :value="c">{{ c }}</option>
              </select>
            </FormField>
          </div>
          <NoticeBanner v-if="pkg?.endedOn" kind="info">Ended early: {{ formatDate(pkg.endedOn) }} is its last day.</NoticeBanner>
        </section>

        <!-- Items -->
        <section class="erp-card flex flex-col gap-3.5 px-[18px] py-4">
          <h2 class="m-0 text-[15px] font-bold">Items in the package</h2>
          <p v-if="errors.items" class="m-0 text-xs font-medium text-note-error-text" role="alert">{{ errors.items }}</p>
          <table class="erp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="w-[110px]">Qty</th>
                <th class="w-[100px]">Unit</th>
                <th class="num">List price</th>
                <th class="num">List value</th>
                <th class="num">Price in package</th>
                <th v-if="editable" class="w-[40px]"><span class="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!form.items.length"><td :colspan="editable ? 7 : 6" class="text-erp-muted">No items yet.</td></tr>
              <template v-for="(l, i) in form.items" :key="l.key">
                <tr>
                  <td>
                    <MasterDataPicker v-if="editable" :model-value="l.item" :search="searchSellable" placeholder="Type an item code or name" :input-id="`pkg-item-${l.key}`" @update:model-value="pick(l, $event)" />
                    <template v-else>
                      <RouterLink v-if="l.itemId" :to="`/core/items/${l.itemId}`" class="erp-link font-semibold">{{ l.item?.code }}</RouterLink>
                      <span v-else class="font-semibold">{{ l.item?.code }}</span>
                      · {{ l.item?.name }}
                    </template>
                  </td>
                  <td><input v-model="l.qty" class="erp-input text-right" inputmode="decimal" :disabled="!editable" :aria-label="`Quantity of ${l.item?.code ?? 'the item'}`" /></td>
                  <td>
                    <select v-model="l.uomCode" class="erp-input" :disabled="!editable || !l.item" :aria-label="`Unit of ${l.item?.code ?? 'the item'}`">
                      <option v-for="u in l.item?.units ?? []" :key="u" :value="u">{{ u }}</option>
                    </select>
                  </td>
                  <td class="num">{{ savedLine(i, l) ? (savedLine(i, l)!.listPrice ? formatMoney(savedLine(i, l)!.listPrice) : 'No price') : '' }}</td>
                  <td class="num">{{ savedLine(i, l) ? formatMoney(savedLine(i, l)!.listValue) : '' }}</td>
                  <td class="num whitespace-nowrap">
                    <template v-if="savedLine(i, l)?.unitPrice">{{ formatPrice(savedLine(i, l)!.unitPrice) }} each · {{ formatMoney(savedLine(i, l)!.amount) }}</template>
                  </td>
                  <td v-if="editable" class="text-right">
                    <button type="button" class="cursor-pointer border-0 bg-transparent p-1 text-erp-muted hover:text-note-error-text" :aria-label="`Remove ${l.item?.code ?? 'the item'}`" @click="form.items.splice(i, 1)"><X :size="15" /></button>
                  </td>
                </tr>
                <tr v-if="lineError('items', i)">
                  <td :colspan="editable ? 7 : 6" class="pt-0 text-xs font-medium text-note-error-text" role="alert">{{ lineError('items', i) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
          <div v-if="editable"><button type="button" class="erp-btn erp-btn-secondary" @click="addLine(form.items)"><Plus :size="14" aria-hidden="true" />Add item</button></div>
          <div class="grid grid-cols-4 gap-x-[18px] gap-y-3.5">
            <div class="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-erp-muted"><span>Normal value</span><div class="erp-input-ro">{{ pkg ? `RM ${formatMoney(pkg.normalValue)}` : 'After saving' }}</div></div>
            <FormField label="Package price (before tax)" for="price" :error="errors.packagePrice">
              <input id="price" v-model="form.packagePrice" class="erp-input text-right" inputmode="decimal" placeholder="2700.00" :disabled="!editable" />
            </FormField>
            <div class="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-erp-muted"><span>Customer saves</span><div class="erp-input-ro">{{ pkg?.saves ? `RM ${formatMoney(pkg.saves)}` : '—' }}</div></div>
            <div class="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-erp-muted"><span>Price spread</span><div class="erp-input-ro">By list value</div></div>
          </div>
          <NoticeBanner v-if="pkg?.priceWarning" kind="warning">{{ pkg.priceWarning }}</NoticeBanner>
          <p class="m-0 text-xs text-erp-muted">The package price is spread over its items by their list value, so each item has a real price for delivery, invoice and returns. The numbers update when you save.</p>
        </section>

        <!-- Free gift -->
        <section class="erp-card flex flex-col gap-3.5 px-[18px] py-4">
          <h2 class="m-0 text-[15px] font-bold">Free gift</h2>
          <div class="flex flex-wrap gap-5 text-[13px]" role="radiogroup" aria-label="Free gift">
            <label v-for="o in GIFT_RULES" :key="o.v" class="inline-flex cursor-pointer items-center gap-2">
              <input v-model="form.giftRule" type="radio" :value="o.v" :disabled="!editable" />{{ o.t }}
            </label>
          </div>
          <p v-if="errors.gifts" class="m-0 text-xs font-medium text-note-error-text" role="alert">{{ errors.gifts }}</p>
          <template v-if="form.giftRule !== 'NONE'">
            <table class="erp-table">
              <thead>
                <tr>
                  <th>Gift item</th>
                  <th class="w-[110px]">Qty</th>
                  <th class="w-[100px]">Unit</th>
                  <th v-if="editable" class="w-[40px]"><span class="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!form.gifts.length"><td :colspan="editable ? 4 : 3" class="text-erp-muted">No gifts yet.</td></tr>
                <template v-for="(g, i) in form.gifts" :key="g.key">
                  <tr>
                    <td>
                      <MasterDataPicker v-if="editable" :model-value="g.item" :search="searchGifts" placeholder="Type an item code or name" :input-id="`pkg-gift-${g.key}`" @update:model-value="pick(g, $event)" />
                      <template v-else><span class="font-semibold">{{ g.item?.code }}</span> · {{ g.item?.name }}</template>
                    </td>
                    <td><input v-model="g.qty" class="erp-input text-right" inputmode="decimal" :disabled="!editable" :aria-label="`Quantity of ${g.item?.code ?? 'the gift'}`" /></td>
                    <td>
                      <select v-model="g.uomCode" class="erp-input" :disabled="!editable || !g.item" :aria-label="`Unit of ${g.item?.code ?? 'the gift'}`">
                        <option v-for="u in g.item?.units ?? []" :key="u" :value="u">{{ u }}</option>
                      </select>
                    </td>
                    <td v-if="editable" class="text-right">
                      <button type="button" class="cursor-pointer border-0 bg-transparent p-1 text-erp-muted hover:text-note-error-text" :aria-label="`Remove ${g.item?.code ?? 'the gift'}`" @click="form.gifts.splice(i, 1)"><X :size="15" /></button>
                    </td>
                  </tr>
                  <tr v-if="lineError('gifts', i)">
                    <td :colspan="editable ? 4 : 3" class="pt-0 text-xs font-medium text-note-error-text" role="alert">{{ lineError('gifts', i) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
            <div v-if="editable"><button type="button" class="erp-btn erp-btn-secondary" @click="addLine(form.gifts)"><Plus :size="14" aria-hidden="true" />Add gift</button></div>
          </template>
          <p class="m-0 text-xs text-erp-muted">A gift is added to the order at RM 0.00 and prints as Free, so its stock still goes out on the delivery order.</p>
        </section>

        <!-- Terms -->
        <section class="erp-card flex flex-col gap-3.5 px-[18px] py-4">
          <h2 class="m-0 text-[15px] font-bold">Terms shown to customers</h2>
          <FormField label="What the package includes, its warranty and conditions" for="terms" :error="errors.terms">
            <textarea
              id="terms"
              v-model="form.terms"
              rows="6"
              maxlength="4000"
              class="erp-input h-auto py-2 text-[13px] leading-relaxed text-erp-text"
              :disabled="!editable"
              placeholder="For example: 3 years warranty on the unit, 1 year on parts. Filter change every 6 months, labour charged."
            />
          </FormField>
          <p class="m-0 text-xs text-erp-muted">Salespeople read this when they pick the package on an order.</p>
        </section>
      </div>

      <div class="flex flex-col gap-4">
        <SideCard title="Picture">
          <PictureField v-model="form.pictureId" :editable="editable" :alt="form.name || 'the package'" :error="errors.pictureId" />
        </SideCard>
        <template v-if="pkg">
          <SideCard title="Where it is used">
            <p class="m-0 text-[13px] text-erp-muted">A package on a sales order can only be ended, not deleted. The package list shows how many orders carry each one.</p>
          </SideCard>
          <ActivityList v-if="pkg.activity.length" :items="pkg.activity" />
        </template>
        <SideCard v-else title="New package">
          <p class="m-0 text-[13px] text-erp-muted">Once saved, the normal value and each item's price in the package are worked out from the price list you pick.</p>
        </SideCard>
      </div>
    </div>
  </template>
</template>

<style scoped>
.erp-input:disabled {
  color: var(--erp-subtle);
  background: var(--erp-head-bg);
  border-color: var(--erp-border);
  opacity: 1;
}
</style>
