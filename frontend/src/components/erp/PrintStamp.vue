<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSession } from '@/composables/useSession'
import { useViewBranch } from '@/composables/useViewBranch'
import { formatDateTime } from '@/utils/format'

/**
 * Shown only on paper: who printed a screen, when, and which branches it covers. Screens printed with the browser's
 * own print (reports, lists, homes) otherwise lose that context once they leave the screen.
 */
defineProps<{ module: string }>()

const { state, user, now } = useSession()
const { showing, several } = useViewBranch()
const printedAt = ref(formatDateTime(now()))
const refresh = () => (printedAt.value = formatDateTime(now()))
onMounted(() => window.addEventListener('beforeprint', refresh))
onBeforeUnmount(() => window.removeEventListener('beforeprint', refresh))

const company = computed(() => state.tenantName || 'Zora Pro ERP')
</script>

<template>
  <div class="erp-print-stamp hidden" aria-hidden="true">
    <span><strong>{{ company }}</strong> · {{ module }}<template v-if="several"> · {{ showing }}</template></span>
    <span>Printed {{ printedAt }}<template v-if="user"> by {{ user.name }}</template></span>
  </div>
</template>
