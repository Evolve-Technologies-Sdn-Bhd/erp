import { SALES_TOURS } from '@/modules/sales/tours'
import { SERVICE_TOURS } from '@/modules/service/tours'
import { WMS_TOURS } from '@/modules/wms/tours'
import { JOURNEYS } from './journeys'
import type { Tour } from './types'
import { WELCOME_TOUR } from './welcome.tour'

/**
 * Every guided tour. Module tours live with their module (modules/<module>/tours.ts) and are added here, the way the
 * menus are gathered in modules/registry.ts. A tour that needs a feature (Tour.requires) is only offered where it is on.
 */
export const TOURS: Tour[] = [WELCOME_TOUR, ...JOURNEYS, ...SALES_TOURS, ...SERVICE_TOURS, ...WMS_TOURS]

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id)
}
