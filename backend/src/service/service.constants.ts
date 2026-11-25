/** Names the Service module uses for activity, links, numbering and events (CLAUDE.md → Phase 5 · Installation module). */

export const SVC_ENTITY = {
  JOB: 'SVC_JOB',
  /** An installer's claim (F5). */
  CLAIM: 'SVC_CLAIM',
} as const;

/** Document numbers: JB-0001 (FIELD_SALES_SEED_DATA.md choice 8). The sequence is made on the first job. */
export const SVC_DOC_TYPE = {
  JOB: 'SVC_JOB',
  CLAIM: 'SVC_CLAIM',
  /** The goods receipt of a unit exchanged under warranty: GRN-W-0001. */
  EXCHANGE_GRN: 'SVC_GRN',
} as const;

export const SVC_SEQUENCES = [
  { docType: SVC_DOC_TYPE.JOB, name: 'Service job', prefix: 'JB-', digits: 4 },
  { docType: SVC_DOC_TYPE.CLAIM, name: 'Installer claim', prefix: 'CL-', digits: 4 },
  { docType: SVC_DOC_TYPE.EXCHANGE_GRN, name: 'Goods receipt of an exchanged unit', prefix: 'GRN-W-', digits: 4 },
] as const;

/** Events the Service module publishes. No module listens yet; the phone app and Finance will. */
export const SVC_EVENT = {
  JOB_CREATED: 'service.job.created',
  JOB_CANCELLED: 'service.job.cancelled',
  JOB_BOOKED: 'service.job.booked',
  /** A booked job is off the board again: taken off, or the visit postponed. Sales clears the booking it shows. */
  JOB_UNBOOKED: 'service.job.unbooked',
  /** The office gave a booked job longer: a new expected completion that day, with the reason (F3 part 4). */
  JOB_EXTENDED: 'service.job.extended',
  /** A booked job is within 24 hours and its stock is confirmed: Sales drafts its delivery order (phase 5). */
  JOB_DELIVERY_DUE: 'service.job.delivery_due',
  /** The picked goods of a postponed job are all back at the store: Sales checks its delivery order in (phase 5). */
  GOODS_BACK: 'service.job.goods_back',
  /** The store received a part an installer brought back (phase 5): good and damaged. Inventory later. */
  PARTS_RETURNED: 'service.parts.returned',
  /** A complete installation registered its units under warranty (phase 5). */
  WARRANTY_REGISTERED: 'service.warranty.registered',
  /** The visit is recorded as complete or partly done: what fees and commission will count (F5). */
  JOB_DONE: 'service.job.done',
  /** Account approved an installer's claim (F5): to pay on its pay day. Finance later. */
  CLAIM_APPROVED: 'service.claim.approved',
  /** Account paid it, with the payment voucher number. */
  CLAIM_PAID: 'service.claim.paid',
} as const;

/** Who makes a job from a released sales order. */
export const SYSTEM_USER = { code: 'SYSTEM', name: 'System' } as const;
