import type { Component } from 'vue'
import { ChartLine, ClipboardCheck, Database, Factory, Sun, Warehouse, Wrench } from '@lucide/vue'
import type { ModuleTile } from '@/api/session'
import { MODULES } from './registry'

export interface TileStyle {
  icon: Component
  /** The module colour (a theme token) … */
  color: string
  /** … and its art: the deep corner of the gradient and the glow that blooms through it (MES module cards). */
  deep: string
  glow: string
  description: string
}

/** Tile colour (theme tokens), icon and one-line purpose per module: the launcher, the module switcher and search. */
export const TILE_STYLE: Record<ModuleTile['code'], TileStyle> = {
  core: { icon: Database, color: 'var(--tile-core)', deep: 'var(--tile-core-deep)', glow: 'var(--tile-core-glow)', description: 'Items, customers, suppliers, tax and price lists.' },
  purchase: { icon: ClipboardCheck, color: 'var(--tile-purchase)', deep: 'var(--tile-purchase-deep)', glow: 'var(--tile-purchase-glow)', description: 'Requests, quotes, orders, goods receipt and supplier bills.' },
  sales: { icon: ChartLine, color: 'var(--tile-sales)', deep: 'var(--tile-sales-deep)', glow: 'var(--tile-sales-glow)', description: 'Enquiries, quotations, sales orders and delivery.' },
  mes: { icon: Factory, color: 'var(--tile-mes)', deep: 'var(--tile-mes-deep)', glow: 'var(--tile-mes-glow)', description: 'Production orders and shop-floor tracking.' },
  wms: { icon: Warehouse, color: 'var(--tile-wms)', deep: 'var(--tile-wms-deep)', glow: 'var(--tile-wms-glow)', description: 'Warehouse locations, picking and stock moves.' },
  config: { icon: Sun, color: 'var(--tile-config)', deep: 'var(--tile-config-deep)', glow: 'var(--tile-config-glow)', description: 'Users, roles and company settings.' },
  service: { icon: Wrench, color: 'var(--tile-service)', deep: 'var(--tile-service-deep)', glow: 'var(--tile-service-glow)', description: 'Installation, service, warranty and repair jobs.' },
}

/** The inline style that paints a `.erp-mesh` surface in a module's colours. */
export const meshStyle = (s: Pick<TileStyle, 'color' | 'deep' | 'glow'>): Record<string, string> => ({
  '--mesh-base': s.color,
  '--mesh-deep': s.deep,
  '--mesh-glow': s.glow,
})

/** A module this app has built and the person may open (the server gives it a route). */
export const isBuilt = (t: ModuleTile): boolean => !!t.route && t.code in MODULES
