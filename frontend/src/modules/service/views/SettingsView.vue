<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { Plus } from '@lucide/vue'
import FormField from '@/components/erp/FormField.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import StatusChip from '@/components/erp/StatusChip.vue'
import { useSession } from '@/composables/useSession'
import { serviceApi } from '../api/service'
import type { Person, PersonRole, ServiceSettings, SlotGroup } from '../types'
import { JOB_TYPE_OPTIONS } from './stages'

/**
 * V05 · Slots and Stages (SvcSettings.html, kept simple): the people the office books, the slot groups the Planning
 * Board offers, who takes which job, and the fixed stages.
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

// ── People ───────────────────────────────────────────────────────────────────
const personOpen = ref(false)
const person = reactive({ id: '', name: '', role: 'INSTALLER' as PersonRole, phone: '', isActive: true, version: 0 })
function openPerson(p: Person | null) {
  Object.assign(person, p ? { id: p.id, name: p.name, role: p.role, phone: p.phone ?? '', isActive: p.isActive, version: p.version } : { id: '', name: '', role: 'INSTALLER', phone: '', isActive: true, version: 0 })
  errors.value = {}
  personOpen.value = true
}
async function savePerson() {
  if (!person.name.trim()) {
    errors.value = { name: 'Type the name.' }
    return
  }
  saving.value = true
  try {
    data.value = person.id
      ? await serviceApi.updatePerson(person.id, { name: person.name, role: person.role, phone: person.phone, isActive: person.isActive, version: person.version })
      : await serviceApi.addPerson({ name: person.name, role: person.role, phone: person.phone })
    personOpen.value = false
    toast.add({ severity: 'success', summary: `${person.name} saved`, life: 2500 })
  } finally {
    saving.value = false
  }
}

// ── Slot groups ──────────────────────────────────────────────────────────────
const groupOpen = ref(false)
const group = reactive({ id: '', name: '', hours: '2', from: '10:00', to: '18:00', jobTypes: [] as string[], isActive: true, version: 0 })
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const toMinutes = (t: string) => {
  const [h = '0', m = '0'] = t.split(':')
  return Number(h) * 60 + Number(m)
}
function openGroup(g: SlotGroup | null) {
  Object.assign(group, g
    ? { id: g.id, name: g.name, hours: String(g.slotMinutes / 60), from: toTime(g.firstStart), to: toTime(g.lastEnd), jobTypes: [...g.jobTypes], isActive: g.isActive, version: g.version }
    : { id: '', name: '', hours: '2', from: '10:00', to: '18:00', jobTypes: ['INSTALLATION'], isActive: true, version: 0 })
  errors.value = {}
  groupOpen.value = true
}
async function saveGroup() {
  const body = { name: group.name, slotMinutes: Math.round(Number(group.hours) * 60), firstStart: toMinutes(group.from), lastEnd: toMinutes(group.to), jobTypes: group.jobTypes, isActive: group.isActive }
  saving.value = true
  try {
    data.value = group.id ? await serviceApi.updateSlotGroup(group.id, { ...body, version: group.version }) : await serviceApi.addSlotGroup(body)
    groupOpen.value = false
    toast.add({ severity: 'success', summary: `${group.name} saved`, life: 2500 })
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
        <thead><tr><th>Name</th><th>Role</th><th>Takes</th><th>Phone</th><th>Status</th><th aria-label="Edit" /></tr></thead>
        <tbody>
          <tr v-for="p in data.people" :key="p.id">
            <td class="font-semibold">{{ p.name }}</td>
            <td>{{ p.roleLabel }}</td>
            <td>{{ data.roles.find((r) => r.role === p.role)?.jobTypes.map(typeLabel).join(', ') }}</td>
            <td>{{ p.phone ?? '—' }}</td>
            <td><StatusChip :status="p.isActive ? 'DONE' : 'CANCELLED'" :label="p.isActive ? 'Active' : 'Not active'" :group="p.isActive ? 'done' : 'draft'" /></td>
            <td class="text-right"><button v-if="canManage" type="button" class="erp-link border-0 bg-transparent p-0 text-[13px]" @click="openPerson(p)">Edit</button></td>
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
        <thead><tr><th>Group</th><th>Slot length</th><th>Slots in a day</th><th>Used for</th><th>Status</th><th aria-label="Edit" /></tr></thead>
        <tbody>
          <tr v-for="g in data.slotGroups" :key="g.id">
            <td class="font-semibold">{{ g.name }}</td>
            <td>{{ g.slotMinutes % 60 ? `${g.slotMinutes} minutes` : `${g.slotMinutes / 60} hour${g.slotMinutes === 60 ? '' : 's'}` }}</td>
            <td>{{ g.slotsText }}</td>
            <td>{{ g.jobTypes.map(typeLabel).join(', ') }}</td>
            <td><StatusChip :status="g.isActive ? 'DONE' : 'CANCELLED'" :label="g.isActive ? 'Active' : 'Not in use'" :group="g.isActive ? 'done' : 'draft'" /></td>
            <td class="text-right"><button v-if="canManage" type="button" class="erp-link border-0 bg-transparent p-0 text-[13px]" @click="openGroup(g)">Edit</button></td>
          </tr>
        </tbody>
      </table>
      <p class="m-0 text-xs text-erp-muted">A change applies to new bookings. Jobs already booked keep their times.</p>
    </section>

    <div class="grid grid-cols-[3fr_2fr] items-start gap-4">
      <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
        <h2 class="m-0 text-[15px] font-bold">Who takes which job</h2>
        <table class="erp-table">
          <thead><tr><th>Role</th><th v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="text-center">{{ t.label }}</th><th>People</th></tr></thead>
          <tbody>
            <tr v-for="r in data.roles" :key="r.role">
              <td class="font-semibold">{{ r.label }}</td>
              <td v-for="t in JOB_TYPE_OPTIONS" :key="t.value" class="text-center">{{ r.jobTypes.includes(t.value) ? '✓' : '—' }}</td>
              <td>{{ r.people.join(', ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="erp-card flex flex-col gap-3 px-5 py-[18px]">
        <h2 class="m-0 text-[15px] font-bold">Stages</h2>
        <p class="m-0 text-[13px] font-semibold">{{ data.stages.join(' → ') }}</p>
        <p class="m-0 text-xs text-erp-muted">
          Kept short on purpose. A booked job is done when the work is finished, and closed when the office has nothing left to do on it.
          A job can be cancelled until it is done.
        </p>
      </section>
    </div>

    <Dialog v-model:visible="personOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '440px' }" :header="person.id ? `Edit ${person.name}` : 'Add person'">
      <div class="flex flex-col gap-3">
        <FormField label="Name" :error="errors.name" for="sp-name"><input id="sp-name" v-model="person.name" class="erp-input" maxlength="100" /></FormField>
        <FormField label="Role" for="sp-role">
          <select id="sp-role" v-model="person.role" class="erp-input"><option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option></select>
        </FormField>
        <FormField label="Phone" for="sp-phone"><input id="sp-phone" v-model="person.phone" class="erp-input" maxlength="40" /></FormField>
        <label v-if="person.id" class="flex items-center gap-2 text-[13px]"><input v-model="person.isActive" type="checkbox" />Active: shown on the Planning Board</label>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="personOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="savePerson">Save</button>
      </template>
    </Dialog>

    <Dialog v-model:visible="groupOpen" modal :draggable="false" class="erp-dialog" :style="{ width: '480px' }" :header="group.id ? `Edit ${group.name}` : 'Add slot group'">
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
        <label v-if="group.id" class="col-span-3 flex items-center gap-2 text-[13px]"><input v-model="group.isActive" type="checkbox" />In use on the Planning Board</label>
      </div>
      <template #footer>
        <button type="button" class="erp-btn erp-btn-secondary" @click="groupOpen = false">Cancel</button>
        <button type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="saveGroup">Save</button>
      </template>
    </Dialog>
  </template>
</template>
