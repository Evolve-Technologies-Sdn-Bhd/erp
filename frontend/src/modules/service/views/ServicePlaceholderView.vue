<script setup lang="ts">
import { useRoute } from 'vue-router'
import NoticeBanner from '@/components/erp/NoticeBanner.vue'
import PageHeader from '@/components/erp/PageHeader.vue'

/** Stand-in for the Service screens of F3 part 2 (planning board, slots and stages). */
const route = useRoute()
</script>

<template>
  <section class="erp-card flex grow flex-col gap-4 px-6 py-[18px]">
    <PageHeader :title="route.meta.title ?? ''">
      <template #chip>
        <span class="rounded-xl bg-mod-chip-bg px-2.5 py-[3px] text-xs font-semibold text-mod-chip-text">{{ route.meta.code }}</span>
      </template>
    </PageHeader>
    <NoticeBanner kind="info">
      This screen comes with <strong>F3 part 2</strong>: slot groups and the planning board, where the office picks the person, the day and the slot.
      Until then jobs wait as <em>Not booked</em> in <RouterLink to="/service/jobs" class="erp-link">Jobs</RouterLink>.
    </NoticeBanner>
  </section>
</template>
