<script setup lang="ts">
import { ref, watch } from 'vue'
import { ImageOff } from '@lucide/vue'
import { fileObjectUrl } from '@/api/http'

/**
 * A stored picture (an API path such as /attachments/:id/download). A plain <img> link cannot send the signed-in
 * user's token, so the picture is fetched first and shown from memory. Without one, an empty box with an icon.
 */
const props = withDefaults(defineProps<{ src: string | null; alt: string; fit?: 'contain' | 'cover' }>(), { fit: 'contain' })

const url = ref<string | null>(null)
const failed = ref(false)
watch(
  () => props.src,
  async (src) => {
    url.value = null
    failed.value = false
    if (!src) return
    try {
      const loaded = await fileObjectUrl(src)
      if (props.src === src) url.value = loaded
    } catch {
      if (props.src === src) failed.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <img v-if="url" :src="url" :alt="alt" class="block h-full w-full" :class="fit === 'cover' ? 'object-cover' : 'object-contain'" />
  <div v-else class="flex h-full w-full items-center justify-center bg-erp-head text-erp-subtle" role="img" :aria-label="src && !failed ? `Loading the picture of ${alt}` : `No picture of ${alt}`">
    <ImageOff v-if="!src || failed" :size="18" aria-hidden="true" />
  </div>
</template>
