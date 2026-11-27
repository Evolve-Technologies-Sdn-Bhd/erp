<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import FormField from '@/components/erp/FormField.vue'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'
import PictureField from '@/components/erp/PictureField.vue'
import SideCard from '@/components/erp/SideCard.vue'
import { configSettingsApi } from '../api/config'
import type { AppContentView } from '../types'

/**
 * A15 · Phone App (phase 5): what the company's phones show — its DuitNow QR picture and the name customers see when
 * they scan, the contacts on the Help page and the office hours. Nothing is shown on the phones until it is set here.
 */
const toast = useToast()
const data = ref<AppContentView | null>(null)
const form = reactive({ duitNowFileId: null as string | null, duitNowName: '', officeHours: '', contacts: [] as { label: string; phone: string }[] })
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const editable = computed(() => Boolean(data.value?.allowedActions.includes('edit')))

function fill(v: AppContentView) {
  data.value = v
  Object.assign(form, { duitNowFileId: v.duitNowFileId, duitNowName: v.duitNowName ?? '', officeHours: v.officeHours ?? '', contacts: v.contacts.map((c) => ({ ...c })) })
  errors.value = {}
}
onMounted(async () => fill(await configSettingsApi.appContent()))

async function save() {
  if (!data.value) return
  saving.value = true
  errors.value = {}
  try {
    fill(
      await configSettingsApi.saveAppContent({
        duitNowFileId: form.duitNowFileId,
        duitNowName: form.duitNowName.trim() || null,
        officeHours: form.officeHours.trim() || null,
        contacts: form.contacts.filter((c) => c.label.trim() || c.phone.trim()),
        version: data.value.version,
      }),
    )
    toast.add({ severity: 'success', summary: 'Saved', detail: 'The phones show it the next time they sign in.', life: 3500 })
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="grid grow items-start gap-4 grid-cols-[minmax(0,1fr)_320px]">
    <section class="erp-card flex flex-col gap-4 px-6 py-[18px]">
      <PageHeader title="Phone App" subtitle="What the company's phones show: the DuitNow QR for customers, and who to call.">
        <template #actions>
          <button v-if="editable" type="button" class="erp-btn erp-btn-primary" :disabled="saving" @click="save">Save</button>
        </template>
      </PageHeader>
      <NoticeBanner v-if="data && !editable" kind="info">You can see what the phones show. Changing it needs <em>Sign-in settings · Manage</em>.</NoticeBanner>

      <div class="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
        <div class="flex flex-col gap-2">
          <h2 class="m-0 text-[15px] font-bold">DuitNow QR</h2>
          <PictureField v-model="form.duitNowFileId" :editable="editable" alt="DuitNow QR" :error="errors.duitNowFileId" />
        </div>
        <div class="flex flex-col gap-3">
          <FormField label="Name customers see when they scan" :error="errors.duitNowName" for="pa-name">
            <input id="pa-name" v-model="form.duitNowName" class="erp-input" maxlength="100" placeholder="e.g. Intact Water Sdn Bhd" :disabled="!editable" :aria-invalid="Boolean(errors.duitNowName)" />
          </FormField>
          <p class="m-0 text-xs text-erp-muted">Upload the QR from the bank (PNG or JPG). Salespeople and installers show it on the payment screens; the customer checks the name in their banking app before paying. Without a QR the phones show none.</p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="m-0 text-[15px] font-bold">Help contacts</h2>
        <div v-for="(c, i) in form.contacts" :key="i" class="grid grid-cols-[minmax(0,1fr)_200px_auto] items-start gap-2">
          <FormField :label="i === 0 ? 'Who' : ''" :error="errors[`contacts[${i}].label`]" :for="`pa-c${i}`">
            <input :id="`pa-c${i}`" v-model="c.label" class="erp-input" maxlength="60" placeholder="e.g. Sales Admin" :disabled="!editable" />
          </FormField>
          <FormField :label="i === 0 ? 'Phone' : ''" :error="errors[`contacts[${i}].phone`]" :for="`pa-p${i}`">
            <input :id="`pa-p${i}`" v-model="c.phone" class="erp-input" maxlength="30" placeholder="03-5524 1180" :disabled="!editable" />
          </FormField>
          <button v-if="editable" type="button" class="erp-btn erp-btn-secondary self-end" :aria-label="`Remove ${c.label || 'contact'}`" @click="form.contacts.splice(i, 1)">Remove</button>
        </div>
        <p v-if="!form.contacts.length" class="m-0 text-sm text-erp-muted">No contacts: the phones say they are not set up yet.</p>
        <button v-if="editable && form.contacts.length < 10" type="button" class="erp-btn erp-btn-secondary self-start" @click="form.contacts.push({ label: '', phone: '' })">+ Add a contact</button>
      </div>

      <FormField label="Office hours" :error="errors.officeHours" for="pa-hours" class="max-w-[360px]">
        <input id="pa-hours" v-model="form.officeHours" class="erp-input" maxlength="100" placeholder="e.g. Mon–Sat, 9:00 AM – 6:00 PM" :disabled="!editable" />
      </FormField>
    </section>

    <SideCard title="How it works">
      <p class="m-0 text-[13px] text-erp-subtle">The phones read this when they sign in. Nothing is shown that is not set here: no sample QR, no sample numbers.</p>
      <p class="m-0 text-[13px] text-erp-subtle">Every change is in the Audit Trail.</p>
    </SideCard>
  </div>
</template>
