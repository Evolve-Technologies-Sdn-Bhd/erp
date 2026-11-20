import type { Tour } from '@/tours/types'

/**
 * The warehouse inside the ERP, from the client demo handbook's journeys B and C: the WMS home, Inventory and EPC
 * Lookup. Offered only where a WMS is connected. Everything here is read only.
 */
const WAREHOUSE: Tour = {
  id: 'wms.warehouse',
  title: 'The warehouse in the ERP',
  summary: 'Live stock from the WMS: what is on hand, where it is, and one tag’s story.',
  module: 'wms',
  pages: ['W00', 'W01', 'W03'],
  permission: 'wms.view',
  requires: ['wms'],
  minutes: 2,
  startAt: '/wms',
  steps: [
    {
      target: 'wms:read-only',
      page: { code: 'W00' },
      optional: true,
      title: 'Read only, and live',
      text: 'Everything here comes from the WMS as it is scanned. Changes are made in the WMS, by scan or on its website.',
    },
    {
      target: 'home:kpis',
      page: { code: 'W00' },
      title: 'The warehouse at a glance',
      text: 'Units on hand, items below their reorder level, receivings still to scan in and shipments waiting. Click a card for the list behind it.',
    },
    {
      target: 'home:tiles',
      page: { code: 'W00' },
      wait: { kind: 'page', to: { code: 'W01' } },
      title: 'Open Inventory',
      text: 'Five screens: Inventory, Stock Location, EPC Lookup, Receiving and Shipping. Click Inventory.',
    },
    {
      target: 'filters',
      page: { code: 'W01' },
      title: 'Narrow it down',
      text: 'Pick a warehouse, a group or a status, or search for an item.',
    },
    {
      target: 'list',
      page: { code: 'W01' },
      title: 'Stock per item',
      text: 'One row per item and a column per warehouse. The status compares the units on the shelf with the reorder level set in Core.',
      why: 'One RFID tag is one unit. Units reserved for a shipment still count here.',
      placement: 'top',
    },
    {
      target: 'menu:epc-lookup',
      page: { code: 'W01' },
      wait: { kind: 'page', to: { code: 'W03' } },
      title: 'One tag’s story',
      text: 'Open EPC Lookup in the menu.',
      placement: 'right',
    },
    {
      target: 'wms:epc',
      page: { code: 'W03' },
      wait: { kind: 'appear', selector: '[data-tour="wms:tag"]' },
      waiting: 'Waiting for a tag. Skip this step if you have none to hand.',
      title: 'Look up a tag',
      text: 'Scan a tag or type its EPC and click Look up: where it is, which item, and what happened to it from receiving to shipping.',
    },
    {
      target: 'help',
      title: 'Changes happen in the WMS',
      text: 'Open in WMS, on the WMS home, takes you to the WMS website. Lists here refresh every 15 seconds, so a scan shows soon after.',
    },
  ],
}

export const WMS_TOURS: Tour[] = [WAREHOUSE]
