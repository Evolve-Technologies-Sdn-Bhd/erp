import { reactive } from 'vue'
import { sessionApi } from '@/api/session'
import { loadSalesFlow, salesFlow } from '@/modules/sales/flow'
import type { SalesFlowSwitches } from '@/modules/sales/types'
import type { Requirement } from './tour.rules'
import type { Tour } from './types'

/**
 * Which features this company has switched on, for the tours that need one (Tour.requires): the Service module and a
 * connected WMS from the launcher's tiles, the Sales Flow switches from the Sales settings. Asked once per person.
 */
const state = reactive({ owner: '', dev: false, open: new Set<string>(), built: new Set<string>() })

/** mode: dev mode lets one person switch to another, which journeys need. */
export async function loadFeatures(owner: string, mode: string): Promise<void> {
  state.owner = owner
  state.dev = mode === 'dev'
  state.open = new Set()
  state.built = new Set()
  if (!owner) return
  try {
    const tiles = await sessionApi.modules()
    if (state.owner !== owner) return
    state.open = new Set(tiles.items.filter((t) => t.state === 'OPEN').map((t) => t.code))
    state.built = new Set(tiles.items.filter((t) => t.state === 'OPEN' || t.state === 'NO_ACCESS').map((t) => t.code))
  } catch {
    /* no module tours until it answers; the rest of Help works */
  }
}

/** forCompany: a journey or guide changes person, so a module this person may not open still counts. */
export function meets(requirement: Requirement | string, forCompany = false): boolean {
  if (requirement === 'dev') return state.dev
  if (requirement === 'service' || requirement === 'wms') return (forCompany ? state.built : state.open).has(requirement)
  if (requirement.startsWith('sales:')) {
    loadSalesFlow()
    // Prices and vouchers the salesperson types, the other way of fixedPrices and voucherControl.
    if (requirement === 'sales:freePrices') return !salesFlow.value.fixedPrices
    if (requirement === 'sales:freeVouchers') return !salesFlow.value.voucherControl
    return Boolean(salesFlow.value[requirement.slice('sales:'.length) as keyof SalesFlowSwitches])
  }
  return false
}

export const available = (tour: Tour): boolean => (tour.requires ?? []).every((r) => meets(r, !!tour.journey))
