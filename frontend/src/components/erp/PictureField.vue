<script setup lang="ts">
import { ref } from 'vue'
import { ApiError } from '@/api/http'
import { uploadPicture } from '@/api/files'
import AuthImage from './AuthImage.vue'

/**
 * A record's picture (an item or a package): shows it, uploads a new one and takes it off. The upload only stores the
 * file; the record keeps it when the record itself is saved.
 */
const model = defineModel<string | null>({ default: null })
defineProps<{ editable: boolean; alt: string; error?: string | null }>()

const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const problem = ref('')

async function picked(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!PICTURE_TYPES.includes(file.type)) {
    problem.value = 'Pick a JPG, PNG or WEBP picture.'
    return
  }
  problem.value = ''
  uploading.value = true
  try {
    model.value = (await uploadPicture(file)).id
  } catch (error) {
    if (error instanceof ApiError) problem.value = error.message
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="aspect-[4/3] overflow-hidden rounded-lg border border-erp-border">
      <AuthImage :src="model ? `/attachments/${model}/download` : null" :alt="alt" />
    </div>
    <div v-if="editable" class="flex flex-wrap gap-2">
      <button type="button" class="erp-btn erp-btn-secondary" :disabled="uploading" @click="input?.click()">
        {{ uploading ? 'Uploading…' : model ? 'Change picture' : 'Upload picture' }}
      </button>
      <button v-if="model" type="button" class="erp-btn erp-btn-secondary" :disabled="uploading" @click="model = null">Remove</button>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :aria-label="`Picture of ${alt}`" @change="picked" />
    </div>
    <p v-if="problem || error" class="m-0 text-xs font-medium text-note-error-text" role="alert">{{ problem || error }}</p>
    <p v-else-if="editable" class="m-0 text-xs text-erp-muted">JPG, PNG or WEBP. Salespeople see it when they pick. Kept when you save.</p>
  </div>
</template>
