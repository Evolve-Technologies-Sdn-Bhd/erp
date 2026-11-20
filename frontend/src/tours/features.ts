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
const state = reactive({ owner: '', open: new Set<string>() })

export async function loadFeatures(owner: string): Promise<void> {
  state.owner = owner
  state.open = new Set()
  if (!owner) return
  try {
    const tiles = await sessionApi.modules()
    if (state.owner === owner) state.open = new Set(tiles.items.filter((t) => t.state === 'OPEN').map((t) => t.code))
  } catch {
    /* no module tours until it answers; the rest of Help works */
  }
}

export function meets(requirement: Requirement | string): boolean {
  if (requirement === 'service' || requirement === 'wms') return state.open.has(requirement)
  if (requirement.startsWith('sales:')) {
    loadSalesFlow()
    return Boolean(salesFlow.value[requirement.slice('sales:'.length) as keyof SalesFlowSwitches])
  }
  return false
}

export const available = (tour: Tour): boolean => (tour.requires ?? []).every(meets)
