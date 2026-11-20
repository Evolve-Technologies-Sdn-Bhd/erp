<script setup lang="ts">
import BrandMark from './BrandMark.vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, LogOut } from '@lucide/vue'
import { useApprovalsCount } from '@/composables/useApprovalsCount'
import { useModuleTheme } from '@/composables/useModuleTheme'
import { useSession } from '@/composables/useSession'
import { moduleDef } from '@/modules/registry'
import { formatLongDate } from '@/utils/format'
import AccountMenu from './AccountMenu.vue'
import BranchSwitch from './BranchSwitch.vue'
import HelpButton from '@/tours/HelpButton.vue'
import ModuleSwitcher from './ModuleSwitcher.vue'
import PrintStamp from './PrintStamp.vue'

/** The module home frame: white header, content, footer (PurHome.html). No sidebar here. */
const route = useRoute()
const router = useRouter()
const { state, today, isJwt, signOut } = useSession()

/** Sign-in mode ends the session; dev mode goes back to the launcher, as before. */
async function leave() {
  if (isJwt.value) {
    await signOut()
    await router.push('/sign-in')
  } else await router.push('/')
}
const module = computed(() => moduleDef(route.meta.module))
useModuleTheme(() => module.value.key)
const { count: approvals } = useApprovalsCount(() => module.value)
const year = computed(() => (today.value ? today.value.slice(0, 4) : ''))
</script>

<template>
  <div :data-module="module.key" class="flex min-h-screen flex-col bg-erp-bg">
    <!-- Floating top bar, the same shape as the launcher and the module screens -->
    <div class="erp-no-print sticky top-0 z-20 px-4 pt-3 pb-2 backdrop-blur-sm md:px-6">
      <header class="flex h-14 items-center justify-between gap-4 rounded-2xl border border-erp-border bg-erp-card/95 px-4 shadow-sm md:px-5">
        <div class="flex items-center gap-3">
          <RouterLink to="/" class="flex items-center gap-3 text-erp-text no-underline" title="All modules">
            <BrandMark :size="38" />
            <div class="text-lg font-bold">Zora <span class="text-erp-link">Pro</span> ERP</div>
          </RouterLink>
          <ModuleSwitcher data-tour="home:switcher" :module="module" variant="chip" />
        </div>
        <div class="flex items-center gap-5">
          <RouterLink
            v-if="module.approvalsTo"
            data-tour="approvals"
            :to="module.approvalsTo"
            :aria-label="`Approvals, ${approvals ?? 0} waiting`"
            class="flex items-center gap-1.5 text-[13px] font-semibold text-mod-chip-text"
          >
            <Bell :size="18" aria-hidden="true" />Approvals
            <span v-if="approvals" class="rounded-[10px] bg-mod-side px-[7px] py-px text-[11px] font-bold text-erp-on-dark">{{ approvals }}</span>
          </RouterLink>
          <BranchSwitch data-tour="branch" />
          <HelpButton />
          <AccountMenu data-tour="account" variant="home" :subtitle="today ? formatLongDate(today) : ''" />
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-erp-input bg-erp-card text-erp-muted"
            @click="leave"
          >
            <LogOut :size="16" class="rotate-180" aria-hidden="true" />
          </button>
        </div>
      </header>
    </div>

    <main data-tour="home:main" class="flex grow flex-col gap-5 px-4 pt-3 pb-6 md:px-6">
      <PrintStamp :module="module.label" />
      <slot />
    </main>

    <div class="erp-no-print px-4 pb-3 md:px-6">
      <footer class="flex h-11 items-center justify-between rounded-2xl border border-erp-border bg-erp-card px-5 text-xs text-erp-muted shadow-sm">
        <span class="font-semibold text-erp-text">Zora Pro ERP<template v-if="state.tenantName"> · {{ state.tenantName }}</template></span>
        <span>© {{ year }} All rights reserved.</span>
      </footer>
    </div>
  </div>
</template>
