<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { Plus } from '@lucide/vue'
import { ApiError } from '@/api/http'
import FormField from '@/components/erp/FormField.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { useSession } from '@/composables/useSession'
import { serviceApi } from '../api/service'
import type { JobType, Person, PersonRole, ServiceSettings, SiteType, SlotGroup } from '../types'
import { JOB_TYPE_OPTIONS, SITE_TYPE_OPTIONS } from './stages'

/**
 * V05 · Slots and Stages (SvcSettings.html, kept simple): the people the office books, with the jobs they take and the
 * sites they go to, the slot groups the Planning Board offers (each for some job types and sites, a company's job
 * categories) with the one it picks first per job type, and the stages.
 */
const toast = useToast()
const { can } = useSession()
const canManage = computed(() => can('service.settings.manage'))
const data = ref<ServiceSettings | null>(null)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
onMounted(async () => {
  data.value = await serviceApi.settings()
})

const ROLES: { value: PersonRole; label: string }[] = [
  { value: 'INSTALLER', label: 'Installer' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'WARRANTY', label: 'Warranty' },
]
const typeLabel = (t: string) => JOB_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t
const activePeople = computed(() => data.value?.people.filter((p) => p.isActive) ?? [])

// ── People ───────────────────────────────────────────────────────────────────
const personOpen = ref(false)
const person = reactive({ id: '', name: '', role: 'INSTALLER' as PersonRole, phone: '', jobTypes: [] as JobType[], siteTypes: [] as SiteType[], isActive: true, version: 0 })
const ALL_SITES = SITE_TYPE_OPTIONS.map((s) => s.value as SiteType)
const startingJobs = (role: PersonRole) => [...(data.value?.roles.find((r) => r.role === role)?.jobTypes ?? [])]
function openPerson(p: Person | null) {
  Object.assign(person, p
    ? { id: p.id, name: p.name, role: p.role, phone: p.phone ?? '', jobTypes: [...p.jobTypes], siteTypes: [...p.siteTypes], isActive: p.isActive, version: p.version }
    : { id: '', name: '', role: 'INSTALLER', phone: '', jobTypes: startingJobs('INSTALLER'), siteTypes: [...ALL_SITES], isActive: true, version: 0 })
  errors.value = {}
  personOpen.value = true
}
/** A new person starts with what their role takes; after that the ticks are theirs. */
function onRole() {
  if (!person.id) person.jobTypes = startingJobs(person.role)
}
async function savePerson() {
  const e: Record<string, string> = {}
  if (!person.name.trim()) e.name = 'Type the name.'
  if (!person.jobTypes.length) e.jobTypes = 'Pick the jobs this person takes.'
  if (!person.siteTypes.length) e.siteTypes = 'Pick the sites this person goes to.'
  errors.value = e
  if (Object.keys(e).length) return
  saving.value = true
  try {
    const body = { name: person.name, role: person.role, phone: person.phone, jobTypes: person.jobTypes, siteTypes: person.siteTypes }
    data.value = person.id
      ? await serviceApi.updatePerson(person.id, { ...body, isActive: person.isActive, version: person.version })
      : await serviceApi.addPerson(body)
    personOpen.value = false
    toast.add({ severity: 'success', summary: `${person.name} saved`, life: 2500 })
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}

// ── Slot groups ──────────────────────────────────────────────────────────────
const groupOpen = ref(false)
const group = reactive({ id: '', name: '', hours: '2', from: '10:00', to: '18:00', jobTypes: [] as string[], defaultFor: [] as string[], siteTypes: [] as string[], isActive: true, version: 0 })
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toMinutes = (t: string) => {
  const [h = '0', m = '0'] = t.split(':')
  return Number(h) * 60 + Number(m)
}
function openGroup(g: SlotGroup | null) {
  Object.assign(group, g
    ? { id: g.id, name: g.name, hours: String(g.slotMinutes / 60), from: toTime(g.firstStart), to: toTime(g.lastEnd), jobTypes: [...g.jobTypes], defaultFor: [...g.defaultFor], siteTypes: [...g.siteTypes], isActive: g.isActive, version: g.version }
    : { id: '', name: '', hours: '2', from: '10:00', to: '18:00', jobTypes: ['INSTALLATION'], defaultFor: [], siteTypes: [...ALL_SITES], isActive: true, version: 0 })
  errors.value = {}
  groupOpen.value = true
}
/** The group this job type uses first now, other than the one being edited. */
const defaultElsewhere = (t: string) => data.value?.slotGroups.find((g) => g.id !== group.id && g.defaultFor.includes(t as JobType))?.name ?? null
async function saveGroup() {
  if (!group.siteTypes.length) {
    errors.value = { siteTypes: 'Pick the sites this slot group is for.' }
    return
  }
  const body = {
    name: group.name, slotMinutes: Math.round(Number(group.hours) * 60), firstStart: toMinutes(group.from), lastEnd: toMinutes(group.to),
    jobTypes: group.jobTypes, defaultFor: group.defaultFor.filter((t) => group.jobTypes.includes(t)), siteTypes: group.siteTypes, isActive: group.isActive,
  }
  saving.value = true
  try {
    data.value = group.id ? await serviceApi.updateSlotGroup(group.id, { ...body, version: group.version }) : await serviceApi.addSlotGroup(body)
    groupOpen.value = false
    toast.add({ severity: 'success', summary: `${group.name} saved`, life: 2500 })
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!data" class="erp-card px-6 py-10 text-center text-[13px] text-erp-muted">Loading…</div>

  <template v-else>
    <PageHeader title="Slots and Stages" subtitle="The time slots the Planning Board offers, who takes which job, and the steps a job goes through." />

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <div class="flex items-center justify-between gap-3">
        <h2 class="m-0 text-[15px] font-bold">People</h2>
        <button v-if="canManage" type="button" class="erp-btn erp-btn-secondary" @click="openPerson(null)"><Plus :size="14" aria-hidden="true" />Add person</button>
      </div>
      <p v-if="!data.people.length" class="m-0 text-[13px] text-erp-muted">Nobody yet. Add your installers, technicians and warranty staff: the Planning Board shows a row for each.</p>
      <table v-else class="erp-table">
        <thead><tr><th>Name</th><th>Role</th><th>Takes</th><th>Goes to</th><th>Phone</th><th>Status</th><th aria-label="Edit" /></tr></thead>
        <tbody>
          <tr v-for="p in data.people" :key="p.id">
            <td class="font-semibold">{{ p.name }}</td>
            <td>{{ p.roleLabel }}</td>
            <td>{{ p.takesText }}</td>
            <td>{{ p.goesToText }}</td>
            <td>{{ p.phone ?? '—' }}</td>
            <td><StatusChip :status="p.isActive ? 'DONE' : 'CANCELLED'" :label="p.isActive ? 'Active' : 'Not active'" :group="p.isActive ? 'done' : 'draft'" /></td>
            <td class="text-right"><button v-if="canManage" type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 text-[13px] text-erp-link" @click="openPerson(p)">Edit</button></td>
          </tr>
        </tbody>
      </table>
      <p class="m-0 text-xs text-erp-muted">People here need no ERP sign-in. They get one when the phone app comes.</p>
    </section>

    <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
      <div class="flex items-center justify-between gap-3">
        <h2 class="m-0 text-[15px] font-bold">Slot groups</h2>
        <button v-if="canManage" type="button" class="erp-btn erp-btn-secondary" @click="openGroup(null)"><Plus :size="14" aria-hidden="true" />Add slot group</button>
      </div>
      <table class="erp-table">
        <thead><tr><th>Group</th><th>Slot length</th><th>Slots in a day</th><th>Used for</th><th>Sites</th><th>Picked first for</th><th>Status</th><th aria-label="Edit" /></tr></thead>
        <tbody>
          <tr v-for="g in data.slotGroups" :key="g.id">
            <td class="font-semibold">{{ g.name }}</td>
            <td>{{ g.slotMinutes % 60 ? `${g.slotMinutes} minutes` : `${g.slotMinutes / 60} hour${g.slotMinutes === 60 ? '' : 's'}` }}</td>
            <td>{{ g.slotsText }}</td>
            <td>{{ g.jobTypes.map(typeLabel).join(', ') }}</td>
            <td>{{ g.sitesText === 'any site' ? 'Any site' : g.sitesText }}</td>
            <td>{{ g.defaultFor.map(typeLabel).join(', ') || '—' }}</td>
            <td><StatusChip :status="g.isActive ? 'DONE' : 'CANCELLED'" :label="g.isActive ? 'Active' : 'Not in use'" :group="g.isActive ? 'done' : 'draft'" /></td>
            <td class="text-right"><button v-if="canManage" type="button" class="erp-link cursor-pointer border-0 bg-transparent p-0 text-[13px] text-erp-link" @click="openGroup(g)">Edit</button></td>
          </tr>
        </tbody>
      </table>
      <p class="m-0 text-xs text-erp-muted">
        The Planning Board offers a job only the groups for its type and its kind of site, and picks the one shown for its type first; the office can still pick another.
        A change applies to new bookings: jobs already booked keep their times.
      </p>
    </section>

    <div class="grid grid-cols-[3fr_2fr] items-start gap-4">
      <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
        <h2 class="m-0 text-[15px] font-bold">Who takes which job</h2>
        <p v-if="!activePeople.length" class="m-0 text-[13px] text-erp-muted">Nobody yet.</p>
        <table v-else class="erp-table">
          <thead><tr><th>Person</th><th v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="text-center">{{ t.label }}</th><th>Goes to</th></tr></thead>
          <tbody>
            <tr v-for="p in activePeople" :key="p.id">
              <td class="font-semibold">{{ p.name }}</td>
              <td v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="text-center">{{ p.jobTypes.includes(t.value) ? '✓' : '—' }}</td>
              <td>{{ p.goesToText }}</td>
            </tr>
          </tbody>
        </table>
        <p class="m-0 text-xs text-erp-muted">Each person takes their own job types; the role only sets what a new person starts with. The board offers a job only to people who take it and go to its kind of site.</p>
      </section>
      <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
        <h2 class="m-0 text-[15px] font-bold">Stages</h2>
        <p class="m-0 text-[13px] font-semibold">{{ data.stages.join(' → ') }}</p>
        <p class="m-0 text-xs text-erp-muted">
          Kept short on purpose. A booked job is done when the work is finished, and closed when the office has nothing left to do on it.
          A job can be cancelled until it is done.
        </p>
        <p class="m-0 text-xs text-erp-muted">
          A booked job is expected to finish at the end of its slot; the office can extend it with a reason. Once that time has passed with the visit not recorded,
          the job is overdue, and it stays so until the visit is recorded.
        </p>
      </section>
    </div>

    <Dialog v-model:visible="personOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '480px' }" :header="person.id ? `Edit ${person.name}` : 'Add person'">
      <div class="flex flex-col gap-3">
        <FormField label="Name" :error="errors.name" for="sp-name"><input id="sp-name" v-model="person.name" class="erp-input" maxlength="100" /></FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Role" for="sp-role">
            <select id="sp-role" v-model="person.role" class="erp-input" @change="onRole"><option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option></select>
          </FormField>
          <FormField label="Phone" for="sp-phone"><input id="sp-phone" v-model="person.phone" class="erp-input" maxlength="40" /></FormField>
        </div>
        <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 text-[13px]">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Takes</legend>
          <div class="flex flex-wrap gap-4">
            <label v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="flex items-center gap-1.5"><input v-model="person.jobTypes" type="checkbox" :value="t.value" />{{ t.label }}</label>
          </div>
          <span v-if="errors.jobTypes" class="text-xs text-note-error-text">{{ errors.jobTypes }}</span>
        </fieldset>
        <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 text-[13px]">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Goes to</legend>
          <div class="flex flex-wrap gap-4">
            <label v-for="s in SITE_TYPE_OPTIONS" :key="s.value" class="flex items-center gap-1.5"><input v-model="person.siteTypes" type="checkbox" :value="s.value" />{{ s.label }}</label>
          </div>
          <span v-if="errors.siteTypes" class="text-xs text-note-error-text">{{ errors.siteTypes }}</span>
        </fieldset>
        <label v-if="person.id" class="flex items-center gap-2 text-[13px]"><input v-model="person.isActive" type="checkbox" />Active: shown on the Planning Board</label>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="personOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="savePerson">Save</button>
      </template>
    </Dialog>

    <Dialog v-model:visible="groupOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '520px' }" :header="group.id ? `Edit ${group.name}` : 'Add slot group'">
      <div class="grid grid-cols-3 gap-3">
        <FormField label="Name" class="col-span-3" for="sg-name"><input id="sg-name" v-model="group.name" class="erp-input" maxlength="60" /></FormField>
        <FormField label="Slot length (hours)" for="sg-hours">
          <select id="sg-hours" v-model="group.hours" class="erp-input"><option v-for="h in ['0.5', '1', '1.5', '2', '3', '4', '6', '8']" :key="h" :value="h">{{ h }}</option></select>
        </FormField>
        <FormField label="First start" for="sg-from"><input id="sg-from" v-model="group.from" type="time" step="1800" class="erp-input" /></FormField>
        <FormField label="Last end" for="sg-to"><input id="sg-to" v-model="group.to" type="time" step="1800" class="erp-input" /></FormField>
        <fieldset class="col-span-3 m-0 flex flex-wrap gap-4 border-0 p-0 text-[13px]">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Used for</legend>
          <label v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="flex items-center gap-1.5"><input v-model="group.jobTypes" type="checkbox" :value="t.value" />{{ t.label }}</label>
        </fieldset>
        <fieldset class="col-span-3 m-0 flex flex-col gap-1 border-0 p-0 text-[13px]">
          <legend class="mb-1 text-xs font-medium text-erp-muted">For these sites</legend>
          <div class="flex flex-wrap gap-4">
            <label v-for="s in SITE_TYPE_OPTIONS" :key="s.value" class="flex items-center gap-1.5"><input v-model="group.siteTypes" type="checkbox" :value="s.value" />{{ s.label }}</label>
          </div>
          <span v-if="errors.siteTypes" class="text-xs text-note-error-text">{{ errors.siteTypes }}</span>
        </fieldset>
        <fieldset class="col-span-3 m-0 flex flex-col gap-1 border-0 p-0 text-[13px]">
          <legend class="mb-1 text-xs font-medium text-erp-muted">Picked first on the board for</legend>
          <div class="flex flex-wrap gap-4">
            <label v-for="t in JOB_TYPE_OPTIONS.filter((o) => group.jobTypes.includes(o.value))" :key="t.value" class="flex items-center gap-1.5">
              <input v-model="group.defaultFor" type="checkbox" :value="t.value" />{{ t.label }}
            </label>
          </div>
          <span v-for="t in group.defaultFor.filter((x) => group.jobTypes.includes(x) && defaultElsewhere(x))" :key="t" class="text-xs text-erp-muted">
            {{ typeLabel(t) }} is picked first in {{ defaultElsewhere(t) }} now; saving moves it here.
          </span>
          <span v-if="errors.defaultFor" class="text-xs text-note-error-text">{{ errors.defaultFor }}</span>
        </fieldset>
        <label v-if="group.id" class="col-span-3 flex items-center gap-2 text-[13px]"><input v-model="group.isActive" type="checkbox" />In use on the Planning Board</label>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="groupOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="saveGroup">Save</button>
      </template>
    </Dialog>
  </template>
</template>
