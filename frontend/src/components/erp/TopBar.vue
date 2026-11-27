<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Bell, Menu } from '@lucide/vue'
import { useApprovalsCount } from '@/composables/useApprovalsCount'
import { useSession } from '@/composables/useSession'
import { useShell } from '@/composables/useShell'
import type { ModuleDef } from '@/modules/registry'
import { formatTime, formatTopBarDate } from '@/utils/format'
import HelpButton from '@/tours/HelpButton.vue'
import AccountMenu from './AccountMenu.vue'
import AlertsButton from './AlertsButton.vue'
import BrandMark from './BrandMark.vue'
import BranchSwitch from './BranchSwitch.vue'
import ModuleSwitcher from './ModuleSwitcher.vue'
import PageSearch from './PageSearch.vue'

/**
 * The top bar (MES AppHeader). It sits on the shell, not on a panel: the brand on the left, the module switcher and the
 * search in the middle, the person's controls on the right (Approvals, branch, alerts, Help, account). Inside a module
 * it opens the sidebar on a phone. `home`: a module's home; no module: the launcher.
 */
const props = withDefaults(defineProps<{ module?: ModuleDef | null; home?: boolean }>(), { module: null, home: false })
const shell = useShell()
const { today, now } = useSession()
const { count: approvals } = useApprovalsCount(() => props.module)

const clock = ref(formatTime(now()))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (clock.value = formatTime(now())), 15_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <header class="erp-topbar flex h-16 shrink-0 items-center gap-3 px-3 sm:px-4">
    <!-- Left: the menu on a phone, the brand -->
    <div class="flex shrink-0 items-center gap-2">
      <button v-if="module" type="button" class="tb-btn lg:hidden" aria-label="Open menu" @click="shell.mobileOpen = !shell.mobileOpen">
        <Menu :size="18" aria-hidden="true" />
      </button>
      <RouterLink to="/" class="flex items-center gap-2.5 rounded-full text-erp-text no-underline" title="All modules" aria-label="Zora Pro ERP, all modules">
        <BrandMark :size="32" />
        <span class="erp-display hidden text-base font-semibold whitespace-nowrap xl:inline">Zora <span class="text-erp-brand">Pro</span> ERP</span>
      </RouterLink>
    </div>

    <!-- Middle: switch module, search -->
    <div class="flex min-w-0 flex-1 items-center justify-center gap-2">
      <ModuleSwitcher v-if="home" data-tour="home:switcher" :module="module" />
      <ModuleSwitcher v-else-if="module" data-tour="rail:switcher" :module="module" />
      <ModuleSwitcher v-else on-launcher />
      <PageSearch data-tour="search" :module="module" class="w-full max-w-[28rem] max-md:hidden" />
    </div>

    <!-- Right: the person's controls -->
    <div class="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
      <span v-if="today" class="erp-num hidden pr-1.5 text-right text-xs leading-tight text-erp-muted 2xl:block">
        {{ formatTopBarDate(today) }}<br />{{ clock }}
      </span>
      <RouterLink
        v-if="module?.approvalsTo"
        data-tour="approvals"
        :to="module.approvalsTo"
        :aria-label="`Approvals, ${approvals ?? 0} waiting`"
        class="tb-pill"
      >
        <Bell :size="16" aria-hidden="true" /><span class="max-sm:hidden">Approvals</span>
        <span v-if="approvals" class="rounded-full bg-mod-primary px-[7px] py-px text-[11px] font-semibold text-erp-on-dark">{{ approvals }}</span>
      </RouterLink>
      <BranchSwitch v-if="module" data-tour="branch" />
      <AlertsButton />
      <HelpButton />
      <AccountMenu data-tour="account" :variant="module ? 'module' : 'launcher'" />
    </div>
  </header>
</template>

<style scoped>
.erp-topbar {
  position: sticky;
  top: 0;
  z-index: 35;
  background: var(--erp-shell);
}
.tb-btn {
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--erp-muted);
  transition:
    background-color 150ms,
    color 150ms;
}
.tb-btn:hover {
  background: var(--erp-gray-200);
  color: var(--erp-text);
}
.tb-pill {
  display: inline-flex;
  height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-text);
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 150ms;
}
.tb-pill:hover {
  background: var(--erp-muted-bg);
}
</style>
