<script setup lang="ts">
import BrandMark from '@/components/erp/BrandMark.vue'
/**
 * The frame of the sign-in pages (CfgSignIn.html, CfgTwoFactor.html), in the shell of the MES design: the logo on the
 * shell, then one centred card on the page panel.
 */
withDefaults(defineProps<{ width?: 'narrow' | 'wide' }>(), { width: 'narrow' })
</script>

<template>
  <div data-module="config" class="flex min-h-screen flex-col bg-erp-shell">
    <header class="flex h-16 shrink-0 items-center gap-2.5 px-4 sm:px-6">
      <BrandMark :size="32" />
      <div class="erp-display text-base font-semibold">Zora <span class="text-erp-brand">Pro</span> ERP</div>
    </header>
    <div class="flex grow px-2 pb-2">
      <main class="erp-page flex grow justify-center px-4 pt-[72px] pb-10">
        <section class="erp-card flex h-fit w-full flex-col gap-4 rounded-2xl px-8 py-7" :class="width === 'wide' ? 'max-w-[518px]' : 'max-w-[398px]'">
          <slot />
        </section>
      </main>
    </div>
  </div>
</template>
