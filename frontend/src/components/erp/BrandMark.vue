<script setup lang="ts">
/**
 * The Zora Pro ERP logo, the MES design with "PRO / ERP" (public/images/logo): the app icon on small screens and
 * the full logo from xl up, black in light mode and white in dark mode. In the top bar, sign-in and no-access pages.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <span class="brand-mark inline-flex shrink-0 items-center" :style="{ height: `${size}px` }">
    <img src="/images/logo/zora-app-icon.svg" alt="" aria-hidden="true" class="brand-icon h-full w-auto xl:hidden" />
    <img src="/images/logo/zora-pro-erp.svg" alt="" aria-hidden="true" class="brand-full brand-light hidden h-full w-auto xl:block" />
    <img src="/images/logo/zora-pro-erp-dark.svg" alt="" aria-hidden="true" class="brand-full brand-dark hidden h-full w-auto" />
  </span>
</template>

<style>
/* Not scoped: the switch reads the dark class on <html>. */
@media (min-width: 1280px) {
  html.dark .brand-mark .brand-light {
    display: none;
  }
  html.dark .brand-mark .brand-dark {
    display: block;
  }
}
</style>
