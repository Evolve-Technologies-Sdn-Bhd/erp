import './assets/main.css'

import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

import App from './App.vue'
import router from './router'
import { applyTheme } from './composables/useTheme'
import { installSelectMenus } from './components/erp/selectMenu'

applyTheme()

/**
 * PrimeVue for the heavy widgets (DataTable, Select, DatePicker, Dialog, Toast). Its primary colour points at
 * the module variables, so dialogs and focus rings follow green Purchase / purple Sales.
 * Fields, dropdown panels and option rows are sized as in the Zora MES design: tighter than Aura's defaults, 10px
 * corners, and no glow on focus (main.css draws the neutral border and the soft halo instead).
 */
const ErpPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: 'var(--mod-light)',
      100: 'var(--mod-light-border)',
      200: 'var(--mod-light-border)',
      300: 'var(--mod-line)',
      400: 'var(--mod-line)',
      500: 'var(--mod-primary)',
      600: 'var(--mod-accent)',
      700: 'var(--mod-active)',
      800: 'var(--mod-active)',
      900: 'var(--mod-active)',
      950: 'var(--mod-active)',
    },
    formField: {
      paddingX: '0.6875rem',
      paddingY: '0.375rem',
      sm: { paddingX: '0.5rem', paddingY: '0.3rem' },
      lg: { paddingX: '0.75rem', paddingY: '0.55rem' },
      borderRadius: '10px',
      focusRing: { width: '0', style: 'solid', color: 'transparent', offset: '0', shadow: 'none' },
      transitionDuration: '0.15s',
    },
    overlay: {
      select: { borderRadius: '14px', shadow: 'var(--dd-shadow)' },
      popover: { borderRadius: '14px', shadow: 'var(--dd-shadow)' },
      modal: { borderRadius: '20px', shadow: 'var(--erp-panel-shadow)' },
    },
    list: {
      padding: '6px',
      gap: '1px',
      option: { padding: '6px 10px', borderRadius: '8px' },
    },
  },
})

installSelectMenus()

createApp(App)
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: ErpPreset,
      options: {
        darkModeSelector: '.dark',
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
  })
  .use(ToastService)
  .use(ConfirmationService)
  .directive('tooltip', Tooltip)
  .mount('#app')
