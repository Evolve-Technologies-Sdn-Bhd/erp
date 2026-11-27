<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useModuleTheme } from '@/composables/useModuleTheme'
import { useCrumb } from '@/composables/usePageCrumb'
import { useShell } from '@/composables/useShell'
import { moduleDef } from '@/modules/registry'
import ModuleSidebar from './ModuleSidebar.vue'
import PrintStamp from './PrintStamp.vue'
import TopBar from './TopBar.vue'

/**
 * Frame for every page inside a module (MES AdminLayout): the top bar on the shell, the module's sidebar, and the page
 * as a rounded panel beside it. `home`: the module's home, the same frame without the breadcrumb. Colours come from
 * data-module. Reads everything from route meta: module, menuGroup, menuItem, title, parent.
 */
const props = withDefaults(defineProps<{ home?: boolean }>(), { home: false })
const route = useRoute()
const shell = useShell()

const module = computed(() => moduleDef(route.meta.module))
useModuleTheme(() => module.value.key)
const group = computed(() => module.value.menu.find((g) => g.key === route.meta.menuGroup) ?? module.value.menu[0]!)
const pageCrumb = useCrumb()

// Breadcrumb: Home › group › list title, or Home › list › document (pages may set the last crumb).
const crumbs = computed(() => {
  const items: { label: string; to?: string }[] = [{ label: 'Home', to: module.value.home }]
  if (route.meta.parent) {
    items.push({ label: route.meta.parent.title, to: route.meta.parent.to })
  } else if (route.meta.code !== 'P02' && group.value.title.toLowerCase() !== String(route.meta.title ?? '').toLowerCase()) {
    items.push({ label: group.value.title }) // not twice when the group is the page ("My Account")
  }
  items.push({ label: pageCrumb.value ?? route.meta.title ?? '' })
  return items
})
</script>

<template>
  <div :data-module="module.key" class="min-h-screen bg-erp-shell">
    <TopBar :module="module" :home="props.home" />
    <ModuleSidebar :module="module" :home="props.home" />

    <div
      class="erp-print-full px-2 pb-2 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      :class="shell.collapsed ? 'lg:pl-[88px]' : 'lg:pl-[296px]'"
    >
      <main v-if="props.home" data-tour="home:main" class="erp-page flex min-h-[calc(100dvh-4.5rem)] flex-col gap-5 p-4 md:p-6">
        <PrintStamp :module="module.label" />
        <slot />
      </main>
      <main v-else class="erp-page flex min-h-[calc(100dvh-4.5rem)] flex-col gap-3.5 p-4 md:p-6">
        <PrintStamp :module="module.label" />
        <nav data-tour="crumbs" class="erp-no-print flex flex-wrap items-center gap-1 text-xs" aria-label="Breadcrumb">
          <template v-for="(crumb, i) in crumbs" :key="i">
            <span v-if="i > 0" class="mx-0.5 text-erp-off-text" aria-hidden="true">/</span>
            <RouterLink v-if="crumb.to" :to="crumb.to" class="text-erp-off-text transition-colors hover:text-mod-primary">{{ crumb.label }}</RouterLink>
            <span v-else :class="i === crumbs.length - 1 ? 'font-medium text-erp-subtle' : 'text-erp-off-text'">{{ crumb.label }}</span>
          </template>
        </nav>
        <slot />
      </main>
    </div>
  </div>
</template>
