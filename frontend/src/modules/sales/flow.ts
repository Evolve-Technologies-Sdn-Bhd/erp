import { computed, reactive } from 'vue'
import { salesSettingsApi } from './api/sales'
import { SALES_MENU } from './menu'
import type { SalesFlowSwitches } from './types'
import type { MenuGroup } from '../common/menu'

/**
 * Sales flow (S34): which steps the company uses. The sidebar, the home tiles and the page search all read the menu
 * from here, so a step that is switched off disappears everywhere at once. Until the settings arrive (or if they
 * cannot be read) the standard flow shows, which is what every company has unless it changed it.
 */
const STANDARD: SalesFlowSwitches = { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false }
const state = reactive<{ switches: SalesFlowSwitches; asked: boolean }>({ switches: { ...STANDARD }, asked: false })

/** Menu items a switch hides when it is off. */
const HIDDEN_WHEN_OFF: Record<keyof SalesFlowSwitches, string[]> = {
  useEnquiries: ['enquiries', 'enquiry-types'],
  officeDraftsQuotations: ['draft-quotations'],
  askInstallation: [],
  agentsAddCustomers: [],
}

export const salesFlow = computed(() => state.switches)

/** After a save on S34, so the menu changes at once. */
export function setSalesFlow(switches: SalesFlowSwitches): void {
  state.switches = { ...switches }
}

/** Asks the server once. A failure (not signed in yet, no Sales access) leaves the standard flow and may be retried. */
export function loadSalesFlow(): void {
  if (state.asked) return
  state.asked = true
  salesSettingsApi
    .salesFlow({ silent: true })
    .then((d) => setSalesFlow(d.switches))
    .catch(() => (state.asked = false))
}

const visibleMenu = computed<MenuGroup[]>(() => {
  const hidden = new Set(
    (Object.keys(HIDDEN_WHEN_OFF) as (keyof SalesFlowSwitches)[]).filter((k) => !state.switches[k]).flatMap((k) => HIDDEN_WHEN_OFF[k]),
  )
  if (!hidden.size) return SALES_MENU
  return SALES_MENU.map((g) => {
    const items = g.items.filter((i) => !hidden.has(i.key))
    // A group's own link must not point at a page that is now hidden.
    const to = items.some((i) => i.to === g.to) ? g.to : (items[0]?.to ?? g.to)
    return { ...g, to, items }
  })
})

/** The Sales menu as this company uses it. */
export function salesMenu(): MenuGroup[] {
  return visibleMenu.value
}
