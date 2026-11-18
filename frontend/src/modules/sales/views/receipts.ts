import type { ReceiptStatus } from '../types'

type ChipGroup = 'draft' | 'pending' | 'released' | 'partial' | 'done' | 'cancelled'

/** Official receipt chips (phase 5): waiting amber, sent back red, verified green, cancelled grey. */
export const RECEIPT_GROUP: Record<ReceiptStatus, ChipGroup> = {
  WAITING: 'pending',
  RETURNED: 'cancelled',
  VERIFIED: 'done',
  CANCELLED: 'draft',
}

/** Order payment chips: unpaid amber, deposit paid blue, fully paid green. */
export const PAYMENT_GROUP: Record<string, ChipGroup> = { UNPAID: 'pending', DEPOSIT: 'released', FULLY_PAID: 'done' }
