/** Names the Service module uses for activity, links, numbering and events (CLAUDE.md → Phase 5 · Installation module). */

export const SVC_ENTITY = {
  JOB: 'SVC_JOB',
} as const;

/** Document numbers: JB-0001 (FIELD_SALES_SEED_DATA.md choice 8). The sequence is made on the first job. */
export const SVC_DOC_TYPE = {
  JOB: 'SVC_JOB',
} as const;

export const SVC_SEQUENCES = [{ docType: SVC_DOC_TYPE.JOB, name: 'Service job', prefix: 'JB-', digits: 4 }] as const;

/** Events the Service module publishes. No module listens yet; the phone app and Finance will. */
export const SVC_EVENT = {
  JOB_CREATED: 'service.job.created',
  JOB_CANCELLED: 'service.job.cancelled',
  JOB_BOOKED: 'service.job.booked',
} as const;

/** Who makes a job from a released sales order. */
export const SYSTEM_USER = { code: 'SYSTEM', name: 'System' } as const;
