<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import FormField from '@/components/erp/FormField.vue'
import { salesCustomersApi } from '../api/sales'
import type { CustomerOption } from '../types'

/**
 * Phase 5 · a new household customer from the sales order (S11), when Sales Flow lets salespeople add one (S34).
 * Core makes it on cash terms with no credit limit, and the office completes the rest.
 */
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ added: [customer: CustomerOption] }>()
const toast = useToast()

const blank = () => ({ name: '', phone: '', address: '', email: '', idNumber: '' })
const form = reactive(blank())
const errors = ref<Record<string, string>>({})
const saving = ref(false)
watch(visible, (open) => {
  if (open) {
    Object.assign(form, blank())
    errors.value = {}
  }
})

async function save() {
  const missing: Record<string, string> = {}
  if (!form.name.trim()) missing.name = "Type the customer's name."
  if (!form.phone.trim()) missing.phone = "Type the customer's phone number."
  if (!form.address.trim()) missing.address = 'Type the address. It is used for delivery and installation.'
  errors.value = missing
  if (Object.keys(missing).length) return
  saving.value = true
  try {
    const customer = await salesCustomersApi.add({
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      email: form.email.trim() || null,
      idNumber: form.idNumber.trim() || null,
    })
    toast.add({ severity: 'success', summary: `Customer ${customer.code} added`, detail: 'The office completes the rest in Core.', life: 4500 })
    emit('added', customer)
    visible.value = false
  } catch (error) {
    if (error instanceof ApiError) errors.value = error.body.code === 'PHONE_IN_USE' ? { phone: error.body.message } : error.fieldErrors
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" data-tour="new-customer" modal :draggable="false" class="erp-dialog" :style="{ width: '520px' }" header="New customer">
    <div class="flex flex-col gap-3">
      <p class="m-0 text-[13px] text-erp-subtle">For a customer who is not in the list yet. They are on cash terms with no credit limit; the office completes the rest in Core.</p>
      <FormField label="Name" for="nc-name" :error="errors.name">
        <input id="nc-name" v-model="form.name" class="erp-input" maxlength="150" autocomplete="off" />
      </FormField>
      <div class="grid grid-cols-2 gap-3">
        <FormField label="Phone" for="nc-phone" :error="errors.phone">
          <input id="nc-phone" v-model="form.phone" class="erp-input" maxlength="30" inputmode="tel" autocomplete="off" placeholder="012-345 6789" />
        </FormField>
        <FormField label="Email (optional)" for="nc-email" :error="errors.email">
          <input id="nc-email" v-model="form.email" class="erp-input" maxlength="150" inputmode="email" autocomplete="off" />
        </FormField>
      </div>
      <FormField label="Address" for="nc-address" :error="errors.address">
        <textarea id="nc-address" v-model="form.address" rows="3" class="erp-input h-auto py-2 text-[13px] text-erp-text" maxlength="300" placeholder="Where the goods go and the installer comes" />
      </FormField>
      <FormField label="NRIC number (optional)" for="nc-id" :error="errors.idNumber">
        <input id="nc-id" v-model="form.idNumber" class="erp-input" maxlength="30" autocomplete="off" placeholder="900101-01-1234" />
      </FormField>
    </div>
    <template #footer>
      <button type="button" class="erp-btn erp-btn-secondary" @click="visible = false">Cancel</button>
      <!-- data-tour-sensitive: it makes a customer, so a guided tour never presses it -->
      <button type="button" data-tour-sensitive class="erp-btn erp-btn-primary" :disabled="saving" @click="save">Add customer</button>
    </template>
  </Dialog>
</template>
