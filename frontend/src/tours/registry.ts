import { SALES_TOURS } from '@/modules/sales/tours'
import type { Tour } from './types'
import { WELCOME_TOUR } from './welcome.tour'

/**
 * Every guided tour. Module tours live with their module (modules/<module>/tours.ts) and are added here, the way the
 * menus are gathered in modules/registry.ts.
 */
export const TOURS: Tour[] = [WELCOME_TOUR, ...SALES_TOURS]

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id)
}
