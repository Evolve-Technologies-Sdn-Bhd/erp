<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ChevronLeft, ChevronRight, Plus } from '@lucide/vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import { useSession } from '@/composables/useSession'
import { formatDate } from '@/utils/format'
import { serviceApi, serviceJobsApi } from '../api/service'
import type { Board, BoardWaiting, JobType, Person, SlotGroup } from '../types'
import { TYPE_BLOCK, TYPE_DOT } from './stages'

/**
 * V02 · Planning Board (SvcBoard.html, kept simple): one day at a time. Pick a job, a slot group (only those for its type
 * and its kind of site, the type's default first), then a free slot on someone who takes that job and goes to its kind of
 * site. Two jobs for one person can never overlap, an extended job keeps its person busy, and an overdue job is marked;
 * the server checks again on booking. What the office needs before booking and the job lacks is warned, never blocking.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const { can } = useSession()

const board = ref<Board | null>(null)
const loading = ref(true)
const busy = ref(false)
/** The job being booked: one waiting on the left, or a booked one being moved (?job=). */
const picked = ref<(BoardWaiting & { moving?: boolean; bookedPerson?: string | null }) | null>(null)
const groupCode = ref('')

const date = computed(() => (typeof route.query.date === 'string' ? route.query.date : ''))

async function load() {
  loading.value = true
  try {
    board.value = await serviceApi.board(date.value || undefined)
    await pickFromQuery()
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => route.query.date, load)

/** ?job= picks a job when the board opens: from the job page's Book or Move. */
async function pickFromQuery() {
  const id = typeof route.query.job === 'string' ? route.query.job : null
  if (!id || picked.value?.id === id) return
  const waiting = board.value?.notBooked.find((j) => j.id === id)
  if (waiting) return pick(waiting)
  const j = await serviceJobsApi.get(id)
  if (j.stage !== 'BOOKED') return
  pick({
    id: j.id, docNo: j.docNo, jobType: j.jobType, typeLabel: j.typeLabel, customerName: j.customerName, area: j.area, salesOrderNo: j.salesOrderNo,
    preferredDate: j.preferredDate, afterStock: j.afterStock, whenText: j.whenText, version: j.version, asksForThisDay: false, moving: true, bookedPerson: j.booking?.personName ?? null,
    overdue: j.overdue, overdueSinceText: j.overdueSinceText, siteType: j.siteType, siteTypeLabel: j.siteTypeLabel, categoryCode: j.categoryCode,
    missingForBooking: j.missingForBooking, missingText: j.missingText, atRisk: j.atRisk, atRiskNote: j.atRiskNote,
  })
}

function pick(j: (BoardWaiting & { moving?: boolean; bookedPerson?: string | null }) | null) {
  picked.value = picked.value?.id === j?.id ? null : j
  // The category the salesperson picked on the order first (phase 5), then the job type's default slot group
  // (Slots and Stages), else the first that fits the job.
  const groups = picked.value ? groupsFor(picked.value) : []
  groupCode.value =
    (groups.find((g) => g.code === picked.value!.categoryCode) ?? groups.find((g) => g.defaultFor.includes(picked.value!.jobType)) ?? groups[0])?.code ?? ''
}

function goTo(d: string) {
  void router.replace({ query: { ...route.query, date: d } })
}
function shift(days: number) {
  const base = new Date(`${board.value?.date ?? date.value}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  goTo(base.toISOString().slice(0, 10))
}

/** The slot groups for a job: of its type, and for its kind of site when that is set (hacking or ceiling work may suit only some). */
const groupsFor = (j: Pick<BoardWaiting, 'jobType' | 'siteType'>): SlotGroup[] =>
  board.value?.slotGroups.filter((g) => g.jobTypes.includes(j.jobType) && (!j.siteType || g.siteTypes.includes(j.siteType))) ?? []
const group = computed(() => board.value?.slotGroups.find((g) => g.code === groupCode.value) ?? null)
const past = computed(() => Boolean(board.value && board.value.date < board.value.today))

// ── The time grid ────────────────────────────────────────────────────────────
const dayStart = computed(() => Math.min(540, ...(board.value?.slotGroups.map((g) => g.firstStart) ?? [])))
const dayEnd = computed(() => Math.max(1080, ...(board.value?.slotGroups.map((g) => g.lastEnd) ?? [])))
const hours = computed(() => {
  const out: number[] = []
  for (let m = dayStart.value; m < dayEnd.value; m += 60) out.push(m)
  return out
})
const pct = (m: number) => ((m - dayStart.value) / (dayEnd.value - dayStart.value)) * 100
const hourLabel = (m: number) => {
  const h = Math.floor(m / 60)
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
}

/** Why a person cannot take the picked job, or null: the job type they take, then the kind of site they go to. */
function notSuited(p: Person): string | null {
  const j = picked.value
  if (!j) return null
  if (!p.jobTypes.includes(j.jobType)) return `does not take ${j.typeLabel.toLowerCase()} jobs`
  if (j.siteType && !p.siteTypes.includes(j.siteType)) return `does not go to ${j.siteTypeLabel?.toLowerCase()} sites`
  return null
}
/** Free slots of the chosen group for a person who suits the picked job: none that overlap their other jobs, extensions included. */
function freeSlots(personId: string) {
  const p = board.value?.people.find((x) => x.id === personId)
  if (!p || !picked.value || !group.value || past.value || notSuited(p)) return []
  const others = p.jobs.filter((j) => j.id !== picked.value!.id)
  return group.value.slots.filter((s) => !others.some((o) => s.start < o.busyEnd && o.start < s.end))
}
const hidden = computed(() => (picked.value ? (board.value?.people.filter((p) => notSuited(p)) ?? []) : []))

function bookSlot(personId: string, slot: { start: number; end: number; label: string }) {
  const j = picked.value
  const p = board.value?.people.find((x) => x.id === personId)
  if (!j || !p || !group.value) return
  const g = group.value
  confirm.require({
    header: `${j.moving ? 'Move' : 'Book'} ${j.docNo}?`,
    message: `${j.typeLabel} for ${j.customerName}: ${p.name}, ${board.value!.dateText}, ${slot.label} (${g.name}).${j.missingText ? ` ${j.missingText}` : ''}`,
    acceptLabel: j.moving ? 'Move' : 'Book',
    rejectLabel: 'Cancel',
    accept: async () => {
      busy.value = true
      try {
        const latest = await serviceJobsApi.get(j.id)
        const booked = await serviceJobsApi.book(j.id, { version: latest.version, personId, date: board.value!.date, slotGroupCode: g.code, start: slot.start })
        toast.add({ severity: 'success', summary: `${j.docNo} ${j.moving ? 'moved' : 'booked'}`, detail: `${p.name}, ${board.value!.dateText}, ${slot.label}`, life: 3500 })
        const short = booked.stock.confirms ? booked.stock.items.filter((i) => i.short) : []
        if (short.length) toast.add({ severity: 'warn', summary: `${j.docNo}: stock is short`, detail: `${short.map((i) => `${i.itemCode}: ${Number(i.free)} free, ${Number(i.needed)} needed`).join('; ')}. It is booked all the same.`, life: 6000 })
        picked.value = null
        if (route.query.job) await router.replace({ query: { ...route.query, job: undefined } })
        await load()
      } catch {
        await load()
      } finally {
        busy.value = false
      }
    },
  })
}
</script>

<template>
  <section class="erp-card flex grow flex-col gap-4 px-6 py-[18px]">
    <PageHeader title="Planning Board" subtitle="One day at a time. Pick a job, a person and a free slot. Two jobs for one person can never overlap.">
      <template #actions>
        <RouterLink v-if="can('service.job.edit')" to="/service/jobs/new" class="erp-btn erp-btn-add"><Plus :size="14" :stroke-width="2.5" aria-hidden="true" />New job</RouterLink>
      </template>
    </PageHeader>

    <div v-if="board" data-tour="svc:day" class="flex items-center gap-2">
      <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Day before" @click="shift(-1)"><ChevronLeft :size="16" /></button>
      <span class="min-w-[170px] text-center text-[15px] font-bold">{{ board.dateText }} {{ board.date.slice(0, 4) }}</span>
      <button type="button" class="erp-btn erp-btn-secondary h-9 w-9 justify-center px-0" aria-label="Next day" @click="shift(1)"><ChevronRight :size="16" /></button>
      <button v-if="board.date !== board.today" type="button" class="erp-btn erp-btn-secondary" @click="goTo(board.today)">Today</button>
      <span v-if="past" class="text-xs text-erp-muted">A day that has passed: nothing can be booked on it.</span>
    </div>

    <div v-if="loading && !board" class="py-10 text-center text-[13px] text-erp-muted">Loading…</div>

    <div v-else-if="board" class="grid items-start gap-4 grid-cols-[290px_minmax(0,1fr)]">
      <!-- Waiting to be booked -->
      <aside data-tour="svc:not-booked" class="flex flex-col gap-2">
        <h2 class="m-0 text-[13px] font-bold">Not booked ({{ board.notBooked.length }})</h2>
        <p v-if="!board.notBooked.length && !picked?.moving" class="m-0 text-xs text-erp-muted">Everything is booked.</p>
        <div
          v-if="picked?.moving"
          class="rounded-lg border-2 border-mod-primary bg-mod-light px-3 py-2 text-[13px]"
        >
          <div class="font-semibold">Moving {{ picked.docNo }} · {{ picked.typeLabel }}</div>
          <div class="text-xs text-erp-muted">{{ picked.customerName }} · now with {{ picked.bookedPerson }}</div>
        </div>
        <button
          v-for="j in board.notBooked"
          :key="j.id"
          type="button"
          class="flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors"
          :class="picked?.id === j.id ? 'border-2 border-mod-primary bg-mod-light' : 'border-erp-border bg-erp-card hover:border-mod-line'"
          @click="pick(j)"
        >
          <span class="flex items-center gap-1.5 font-semibold">
            <span class="h-2 w-2 rounded-full" :class="TYPE_DOT[j.jobType]" aria-hidden="true" />{{ j.docNo }} · {{ j.typeLabel }}
            <span v-if="j.asksForThisDay" class="text-attention" title="The customer asks for this day">★</span>
            <span v-if="j.overdue" class="ml-auto rounded bg-chip-cancelled-bg px-1.5 text-[11px] text-chip-cancelled-text" :title="`Overdue since ${j.overdueSinceText}`">Overdue</span>
            <span v-else-if="j.missingText" class="ml-auto rounded bg-chip-pending-bg px-1.5 text-[11px] text-chip-pending-text" :title="j.missingText">Details missing</span>
          </span>
          <span class="text-xs">{{ j.customerName }}<template v-if="j.area"> · {{ j.area }}</template><template v-if="j.siteTypeLabel"> · {{ j.siteTypeLabel }}</template></span>
          <span class="text-xs text-erp-muted">{{ j.salesOrderNo ? `${j.salesOrderNo} · ` : '' }}{{ j.whenText.toLowerCase() === '—' ? 'no date asked' : j.whenText.replace('Asks', 'asks') }}</span>
        </button>

        <div v-if="picked" data-tour="svc:pick" class="mt-2 flex flex-col gap-2 rounded-lg border border-erp-border bg-erp-head px-3 py-3 text-[13px]">
          <label class="flex flex-col gap-1 font-semibold">
            Slot group
            <select v-model="groupCode" class="erp-input">
              <option v-for="g in groupsFor(picked)" :key="g.code" :value="g.code">{{ g.name }} · {{ g.slotMinutes / 60 }} h</option>
            </select>
          </label>
          <p v-if="!groupsFor(picked).length" class="m-0 text-xs text-note-error-text">
            No slot group is for {{ picked.typeLabel.toLowerCase() }} jobs{{ picked.siteTypeLabel ? ` at ${picked.siteTypeLabel.toLowerCase()} sites` : '' }}. Add one in Slots and Stages.
          </p>
          <p v-if="picked.missingText" data-tour="svc:missing" class="m-0 rounded-md border border-note-warn-border bg-note-warn-bg px-2 py-1.5 text-xs text-note-warn-text">
            {{ picked.missingText }} You can still book; fill them in on
            <RouterLink :to="`/service/jobs/${picked.id}`" class="erp-link font-semibold">{{ picked.docNo }}</RouterLink>.
          </p>
          <p v-else class="m-0 text-xs text-erp-muted">Click a free slot on the right to {{ picked.moving ? 'move' : 'book' }} {{ picked.docNo }}.</p>
          <button type="button" class="erp-btn erp-btn-secondary" @click="pick(null)">Cancel</button>
        </div>
      </aside>

      <!-- The day -->
      <div data-tour="svc:people" class="flex min-w-0 flex-col gap-2">
        <p v-if="!board.people.length" class="m-0 rounded-lg border border-dashed border-erp-border px-4 py-6 text-center text-[13px] text-erp-muted">
          Nobody to book yet. Add your installers and technicians in <RouterLink to="/service/settings" class="erp-link">Slots and Stages</RouterLink>.
        </p>
        <template v-else>
          <div class="grid grid-cols-[170px_minmax(0,1fr)] text-[11px] font-semibold text-erp-muted">
            <span />
            <div class="relative h-4">
              <span v-for="h in hours" :key="h" class="absolute -translate-x-1/2" :style="{ left: `${pct(h)}%` }">{{ hourLabel(h) }}</span>
            </div>
          </div>
          <div
            v-for="p in board.people"
            :key="p.id"
            class="grid grid-cols-[170px_minmax(0,1fr)] items-stretch rounded-lg border border-erp-border"
            :class="{ 'opacity-40': Boolean(notSuited(p)) }"
          >
            <div class="flex flex-col justify-center border-r border-erp-border px-3 py-2">
              <span class="text-[13px] font-semibold">{{ p.name }}</span>
              <span class="text-xs text-erp-muted">{{ p.roleLabel }} · {{ p.jobs.length }} job{{ p.jobs.length === 1 ? '' : 's' }}</span>
              <RouterLink v-for="u in p.unfinished.slice(0, 2)" :key="u.id" :to="`/service/jobs/${u.id}`" data-tour="svc:unfinished" class="text-xs font-semibold text-chip-cancelled-text no-underline hover:underline" :title="`${u.docNo}: ${u.why}`">Unfinished: {{ u.docNo }}</RouterLink>
              <span v-if="p.unfinished.length > 2" class="text-xs text-chip-cancelled-text">and {{ p.unfinished.length - 2 }} more</span>
            </div>
            <div class="relative h-[64px]">
              <span v-for="h in hours" :key="h" class="absolute top-0 bottom-0 border-l border-erp-row" :style="{ left: `${pct(h)}%` }" aria-hidden="true" />
              <RouterLink
                v-for="j in p.jobs"
                :key="j.id"
                :to="`/service/jobs/${j.id}`"
                class="absolute top-1.5 bottom-1.5 flex flex-col justify-center overflow-hidden rounded-md border text-[11px] leading-tight"
                :class="[TYPE_BLOCK[j.jobType], picked?.id === j.id ? 'ring-2 ring-mod-primary' : j.overdue ? 'ring-2 ring-chip-cancelled-text' : '', j.busyEnd - j.start <= 60 ? 'px-1' : 'px-2']"
                :style="{ left: `${pct(j.start)}%`, width: `${pct(j.busyEnd) - pct(j.start)}%` }"
                :title="[`${j.docNo} · ${j.typeLabel} · ${j.customerName} · ${j.slotText} · ${j.stageLabel}`, j.extendedText, j.overdue ? `Overdue since ${j.overdueSinceText}` : null, j.atRisk ? `At risk: ${j.atRiskNote}` : null].filter(Boolean).join(' · ')"
              >
                <!-- The extension past the slot, shaded so the slot itself still reads -->
                <span
                  v-if="j.busyEnd > j.end"
                  class="absolute top-0 right-0 bottom-0 border-l border-dashed border-current opacity-15 bg-current"
                  :style="{ width: `${((j.busyEnd - j.end) / (j.busyEnd - j.start)) * 100}%` }"
                  aria-hidden="true"
                />
                <span class="truncate font-semibold">{{ j.busyEnd - j.start <= 60 ? j.docNo : `${j.docNo} · ${j.typeLabel}` }}</span>
                <span class="truncate">{{ j.customerName }}</span>
                <span class="truncate" :class="j.overdue || j.atRisk ? 'font-semibold text-chip-cancelled-text' : 'opacity-75'">{{ j.overdue ? 'Overdue' : j.atRisk ? 'At risk: stock' : j.extendedText ?? j.stageLabel }}</span>
              </RouterLink>
              <span
                v-if="board.nowMinutes !== null && board.nowMinutes > dayStart && board.nowMinutes < dayEnd"
                class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-chip-cancelled-text/60"
                :style="{ left: `${pct(board.nowMinutes)}%` }"
                aria-hidden="true"
              />
              <button
                v-for="s in freeSlots(p.id)"
                :key="s.start"
                type="button"
                class="absolute top-1.5 bottom-1.5 rounded-md border-2 border-dashed border-mod-line bg-mod-light text-[11px] font-semibold text-mod-accent hover:bg-mod-chip-bg"
                :style="{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }"
                :disabled="busy"
                :aria-label="`Book ${p.name}, ${s.label}`"
                @click="bookSlot(p.id, s)"
              >
                Free · {{ s.label }}
              </button>
            </div>
          </div>
          <p v-if="hidden.length" class="m-0 text-xs text-erp-muted">
            Greyed out for {{ picked?.docNo }}: {{ hidden.map((p) => `${p.name} ${notSuited(p)}`).join('; ') }}.
          </p>
          <div class="flex flex-wrap gap-4 pt-1 text-xs text-erp-muted">
            <span v-for="t in (['INSTALLATION', 'SERVICE', 'WARRANTY', 'REPAIR'] as JobType[])" :key="t" class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full" :class="TYPE_DOT[t]" aria-hidden="true" />{{ t.charAt(0) + t.slice(1).toLowerCase() }}
            </span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-4 rounded-sm border-2 border-dashed border-mod-line bg-mod-light" aria-hidden="true" />Free slot</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-4 rounded-sm ring-2 ring-chip-cancelled-text" aria-hidden="true" />Overdue</span>
            <span v-if="board.nowMinutes !== null" class="flex items-center gap-1.5"><span class="h-3 w-0.5 bg-chip-cancelled-text/60" aria-hidden="true" />Now</span>
            <span v-if="board.date !== board.today">Showing {{ formatDate(board.date) }}</span>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
