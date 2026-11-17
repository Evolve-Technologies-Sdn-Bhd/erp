import type { JobStage } from '../types'

type ChipGroup = 'draft' | 'pending' | 'released' | 'partial' | 'done' | 'cancelled'

/** Stage chip colours (SvcJobs.html): waiting amber, booked blue, accepted purple, done and after green, cancelled red. */
export const STAGE_GROUP: Record<JobStage, ChipGroup> = {
  NOT_BOOKED: 'pending',
  BOOKED: 'released',
  ACCEPTED: 'partial',
  DONE: 'done',
  CHECKED: 'done',
  CLOSED: 'done',
  CANCELLED: 'cancelled',
}

export const JOB_TYPE_OPTIONS = [
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'WARRANTY', label: 'Warranty' },
  { value: 'REPAIR', label: 'Repair' },
] as const
