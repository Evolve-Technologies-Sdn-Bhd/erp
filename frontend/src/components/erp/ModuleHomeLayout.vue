<script setup lang="ts">
import ModuleLayout from './ModuleLayout.vue'

/**
 * A module's home. Since the UI refresh (U2) it has the same frame as every page inside the module, sidebar included
 * (as in the MES), without the breadcrumb.
 */
</script>

<template>
  <ModuleLayout home>
    <slot />
  </ModuleLayout>
</template>
