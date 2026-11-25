<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { ChevronLeft, ChevronRight, Printer } from '@lucide/vue'
import { ApiError } from '@/api/http'
import FormField from '@/components/erp/FormField.vue'
import MasterDataPicker from '@/components/erp/MasterDataPicker.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { formatDateTime, formatQty } from '@/utils/format'
import { serviceApi, serviceStockApi } from '../api/service'
import type { StockDay, StockJob } from '../types'

/**
 * V09 · Stock for Jobs (phase 5): the warehouse's list of a day's booked jobs, tomorrow first. Each job shows what it
 * needs, what is free once earlier jobs have theirs, and whether the warehouse has confirmed it. Confirming is their
 * word: short figures warn, they never block. A confirmed job gets its delivery order 24 hours before; where the
 * warehouse picks and signs, it adds parts, someone signs, and the delivery order is made then.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const day = ref<StockDay | null>(null)
const busy = ref('')
const asked = computed(() => (typeof route.query.date === 'string' ? route.query.date : undefined))

async function load() {
  day.value = await serviceStockApi.day(asked.value)
}
onMounted(load)
watch(asked, load)

const goTo = (date: string) => router.replace({ query: { ...route.query, date } })
function shift(days: number) {
  const d = new Date(`${day.value!.date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  void goTo(d.toISOString().slice(0, 10))
}

// ── One installer's jobs ─────────────────────────────────────────────────────
const person = computed(() => (typeof route.query.person === 'string' ? route.query.person : ''))
const people = computed(() => [...new Map((day.value?.jobs ?? []).map((j) => [j.personId ?? '', j.personName ?? '—'])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
const jobs = computed(() => (day.value?.jobs ?? []).filter((j) => !person.value || j.personId === person.value))
const pickPerson = (id: string) => router.replace({ query: { ...route.query, person: id || undefined } })
const printTo = (jobId?: string) => ({ path: '/service/stock/print', query: { date: day.value?.date, ...(jobId ? { job: jobId } : person.value && { person: person.value }) } })

async function act(j: StockJob, what: 'confirm' | 'undo') {
  busy.value = j.id
  try {
    day.value = await serviceStockApi[what](j.id, j.version)
    toast.add({ severity: 'success', summary: what === 'confirm' ? `${j.docNo} stock confirmed` : `${j.docNo} not confirmed`, life: 3000 })
  } catch {
    await load()
  } finally {
    busy.value = ''
  }
}

// ── Pick and sign ────────────────────────────────────────────────────────────
const signing = ref<StockJob | null>(null)
const signedBy = ref('')
const signError = ref('')
function openSign(j: StockJob) {
  signedBy.value = ''
  signError.value = ''
  signing.value = j
}
async function sign() {
  const j = signing.value!
  busy.value = j.id
  try {
    day.value = await serviceStockApi.confirm(j.id, j.version, signedBy.value.trim())
    signing.value = null
    toast.add({ severity: 'success', summary: `${j.docNo} picked and signed`, detail: j.salesOrderNo ? 'Its delivery order is being made.' : undefined, life: 3500 })
  } catch (error) {
    if (error instanceof ApiError) signError.value = error.fieldErrors.signedBy ?? ''
    if (!signError.value) {
      signing.value = null
      await load()
    }
  } finally {
    busy.value = ''
  }
}

// ── Parts and accessories the warehouse adds ─────────────────────────────────
interface Part { code: string; name: string; uomCode: string }
const adding = ref<StockJob | null>(null)
const part = reactive({ item: null as Part | null, qty: '1' })
const partErrors = ref<Record<string, string>>({})
const searchParts = async (q: string) => (await serviceApi.stockItems(q)).items
function openPart(j: StockJob) {
  Object.assign(part, { item: null, qty: '1' })
  partErrors.value = {}
  adding.value = j
}
async function addPart() {
  const j = adding.value!
  if (!part.item) {
    partErrors.value = { itemCode: 'Pick a stock item from the list.' }
    return
  }
  busy.value = j.id
  try {
    day.value = await serviceStockApi.addPart(j.id, { version: j.version, itemCode: part.item.code, qty: part.qty.trim() })
    adding.value = null
    toast.add({ severity: 'success', summary: `${part.item.code} added to ${j.docNo}`, life: 2500 })
  } catch (error) {
    if (error instanceof ApiError) partErrors.value = error.fieldErrors
    if (!Object.keys(partErrors.value).length) {
      adding.value = null
      await load()
    }
  } finally {
    busy.value = ''
  }
}
async function removePart(j: StockJob, itemId: string) {
  busy.value = j.id
  try {
    day.value = await serviceStockApi.removePart(j.id, itemId, j.version)
  } catch {
    await load()
  } finally {
    busy.value = ''
  }
}
const subtitle = computed(() =>
  day.value?.pickAndSign
    ? "What a day's booked jobs need. Prepare each one, add any parts, then pick and sign: its delivery order is made then."
    : "What a day's booked jobs need. Confirm each one once the goods are there; its delivery order is made 24 hours before the job.",
)
</script>

<template>
  <section data-tour="svc:stock-day" class="erp-card flex grow flex-col gap-4 px-6 py-[18px]">
    <PageHeader title="Stock for Jobs" :subtitle="subtitle">
      <template #actions>
        <RouterLink v-if="day?.jobs.length" :to="printTo()" data-tour="svc:pick-list" class="erp-btn erp-btn-secondary"><Printer :size="14" aria-hidden="true" />Pick list</RouterLink>
      </template>
    </PageHeader>

    <div v-if="!day" class="py-10 text-center text-[13px] text-erp-muted">Loading…</div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Day before" @click="shift(-1)"><ChevronLeft :size="16" /></button>
        <span class="min-w-[170px] text-center text-[15px] font-bold">{{ day.dateText }} {{ day.date.slice(0, 4) }}</span>
        <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Next day" @click="shift(1)"><ChevronRight :size="16" /></button>
        <div v-if="day.pickAndSign" data-tour="svc:stock-days" class="flex flex-wrap gap-1.5">
          <button
            v-for="(d, i) in day.days" :key="d.date" type="button" class="cursor-pointer rounded-lg border px-2.5 py-1 text-xs"
            :class="d.date === day.date ? 'border-mod-primary bg-mod-light font-bold text-mod-accent' : 'border-erp-border bg-erp-card text-erp-text'" :aria-pressed="d.date === day.date" @click="goTo(d.date)"
          >{{ i === 0 ? 'Today' : `Day +${i}` }} · {{ d.toDo ? `${d.toDo} to pick` : d.jobs ? 'all picked' : 'no jobs' }}</button>
        </div>
        <select v-if="people.length > 1 || person" :value="person" class="erp-input h-9 w-auto" aria-label="Installer" data-tour="svc:stock-person" @change="pickPerson(($event.target as HTMLSelectElement).value)">
          <option value="">Everyone</option>
          <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <span class="ml-auto text-[13px]">
          <strong>{{ day.counts.jobs }}</strong> job{{ day.counts.jobs === 1 ? '' : 's' }} · <strong>{{ day.counts.confirmed }}</strong> {{ day.pickAndSign ? 'picked' : 'confirmed' }}
          <template v-if="day.counts.short"> · <strong class="text-chip-cancelled-text">{{ day.counts.short }}</strong> short</template>
        </span>
      </div>

      <NoticeBanner v-if="!day.on" kind="warning">The warehouse does not confirm stock yet. Turn it on in Service › Slots and Stages to confirm jobs here and get their delivery orders made.</NoticeBanner>
      <p v-if="!jobs.length" class="m-0 py-8 text-center text-[13px] text-erp-muted">{{ person && day.jobs.length ? 'This person has no booked jobs that need stock on this day.' : 'No booked jobs need stock on this day.' }}</p>

      <article v-for="j in jobs" :key="j.id" data-tour="svc:stock-job" class="flex flex-col gap-2 rounded-xl border px-4 py-3" :class="j.atRisk ? 'border-note-error-border' : 'border-erp-border'">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <RouterLink :to="`/service/jobs/${j.id}`" class="erp-link font-semibold">{{ j.docNo }}</RouterLink>
          <span class="font-semibold">{{ j.slotText }}</span>
          <span>{{ j.personName }}</span>
          <span class="text-erp-muted">{{ j.typeLabel }}<template v-if="j.exchange">, one-to-one exchange</template> · {{ j.customerName }}<template v-if="j.salesOrderNo"> · {{ j.salesOrderNo }}</template><template v-if="j.warehouseCode"> · {{ j.warehouseCode }}</template></span>
          <span class="ml-auto flex items-center gap-2">
            <RouterLink v-if="j.deliveryId" :to="`/sales/deliveries/${j.deliveryId}`" class="erp-link font-semibold">{{ j.deliveryNo }}</RouterLink>
            <StatusChip v-if="j.atRisk" status="AT_RISK" label="At risk" group="cancelled" :title="j.atRiskNote ?? ''" />
            <StatusChip v-if="j.confirmedAt" status="CONFIRMED" :label="j.pickSignedBy ? `Picked, signed by ${j.pickSignedBy}` : 'Stock confirmed'" group="done" :title="`${j.confirmedBy}, ${formatDateTime(j.confirmedAt)}`" />
            <RouterLink v-if="day.pickAndSign" :to="printTo(j.id)" class="erp-btn erp-btn-secondary" :aria-label="`Pick list of ${j.docNo}`"><Printer :size="14" aria-hidden="true" /></RouterLink>
            <button v-if="day.pickAndSign && j.canChangeParts" type="button" data-tour="svc:add-part" class="erp-btn erp-btn-secondary" :disabled="busy === j.id" @click="openPart(j)">Add a part</button>
            <button v-if="j.canUndo" type="button" class="erp-btn erp-btn-secondary" :disabled="busy === j.id" @click="act(j, 'undo')">Undo</button>
            <template v-if="j.canConfirm && (j.items.length || !day.pickAndSign)">
              <button v-if="day.pickAndSign" type="button" data-tour="action:pick-sign" class="erp-btn erp-btn-primary" :disabled="busy === j.id" @click="openSign(j)">Pick &amp; sign</button>
              <button v-else type="button" data-tour="action:confirm-stock" class="erp-btn erp-btn-primary" :disabled="busy === j.id" @click="act(j, 'confirm')">Confirm stock</button>
            </template>
          </span>
        </div>
        <table v-if="j.items.length" class="erp-table">
          <thead><tr><th>Item</th><th class="num">Needed</th><th class="num">On hand</th><th class="num">Held by earlier jobs</th><th class="num">Free</th></tr></thead>
          <tbody>
            <tr v-for="i in j.items" :key="i.itemCode">
              <td><span class="font-semibold">{{ i.itemCode }}</span> <span class="text-xs text-erp-muted">{{ i.itemName }}</span></td>
              <td class="num">{{ formatQty(i.needed) }} {{ i.uomCode }}</td>
              <template v-if="i.counted">
                <td class="num">{{ formatQty(i.onHand) }}</td>
                <td class="num">{{ formatQty(i.earlier) }}</td>
                <td class="num" :class="i.short ? 'font-bold text-chip-cancelled-text' : ''">{{ formatQty(i.free) }}</td>
              </template>
              <td v-else class="num text-erp-muted" colspan="3">No RFID tag: not counted</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="m-0 text-xs text-erp-muted">Nothing to take from the store. Add a part if the job needs one.</p>
        <div v-if="j.extras.length" data-tour="svc:extras" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span class="text-erp-muted">Added by the warehouse:</span>
          <span v-for="x in j.extras" :key="x.id" class="inline-flex items-center gap-1.5">
            {{ formatQty(x.qty) }} {{ x.uomCode }} {{ x.itemCode }}
            <button v-if="j.canChangeParts" type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 text-xs" :disabled="busy === j.id" :aria-label="`Take off ${x.itemCode}`" @click="removePart(j, x.id)">Take off</button>
          </span>
        </div>
        <p v-if="j.shortText && !j.confirmedAt" class="m-0 text-xs text-attention">Short: {{ j.shortText }}. You can still {{ day.pickAndSign ? 'pick and sign' : 'confirm' }} if the goods are really there.</p>
      </article>
    </template>

    <Dialog :visible="Boolean(signing)" data-tour="svc:pick-sign" modal :draggable="false" class="erp-dialog" :style="{ width: '440px' }" :header="`Pick and sign ${signing?.docNo ?? ''}`" @update:visible="signing = null">
      <div class="flex flex-col gap-3 text-[13px]">
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="i in signing?.items ?? []" :key="i.itemCode">{{ formatQty(i.needed) }} {{ i.uomCode }} <span class="font-semibold">{{ i.itemCode }}</span> <span class="text-erp-muted">{{ i.itemName }}</span></li>
        </ul>
        <FormField label="Signed by" :error="signError" for="ps-name"><input id="ps-name" v-model="signedBy" class="erp-input" maxlength="100" placeholder="Who picked and signed" /></FormField>
        <p v-if="signing?.salesOrderNo" class="m-0 text-xs text-erp-muted">The delivery order is made now. {{ signing.salesOrderNo }} can no longer be revised.</p>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="signing = null">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="Boolean(busy)" @click="sign">Pick and sign</button>
      </template>
    </Dialog>

    <Dialog :visible="Boolean(adding)" data-tour="svc:part-dialog" modal :draggable="false" class="erp-dialog" :style="{ width: '460px' }" :header="`Add a part to ${adding?.docNo ?? ''}`" @update:visible="adding = null">
      <div class="grid grid-cols-[1fr_90px] gap-3 text-[13px]">
        <FormField label="Part or accessory" :error="partErrors.itemCode" for="part-item"><MasterDataPicker v-model="part.item" input-id="part-item" :search="searchParts" :invalid="Boolean(partErrors.itemCode)" /></FormField>
        <FormField label="Quantity" :error="partErrors.qty" for="part-qty"><input id="part-qty" v-model="part.qty" class="erp-input text-right" inputmode="decimal" /></FormField>
        <p class="col-span-2 m-0 text-xs text-erp-muted">It goes with this job only: it is not on the sales order, the delivery order or the invoice.</p>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="adding = null">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" data-tour-sensitive :disabled="Boolean(busy)" @click="addPart">Add the part</button>
      </template>
    </Dialog>
  </section>
</template>
