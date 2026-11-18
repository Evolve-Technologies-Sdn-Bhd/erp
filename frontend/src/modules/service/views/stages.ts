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

/** Who suits the site (F3 part 4). */
export const SITE_TYPE_OPTIONS = [
  { value: 'LANDED', label: 'Landed house' },
  { value: 'CONDO', label: 'Condo / apartment' },
  { value: 'COMMERCIAL', label: 'Shop / office' },
] as const

/** Job-type colours on the Planning Board (SvcBoard.html legend): installation blue, service green, warranty purple, repair amber. */
export const TYPE_BLOCK: Record<string, string> = {
  INSTALLATION: 'bg-chip-released-bg text-chip-released-text border-chip-released-text/30',
  SERVICE: 'bg-chip-done-bg text-chip-done-text border-chip-done-text/30',
  WARRANTY: 'bg-chip-partial-bg text-chip-partial-text border-chip-partial-text/30',
  REPAIR: 'bg-chip-pending-bg text-chip-pending-text border-chip-pending-text/30',
}
export const TYPE_DOT: Record<string, string> = {
  INSTALLATION: 'bg-chip-released-text',
  SERVICE: 'bg-chip-done-text',
  WARRANTY: 'bg-chip-partial-text',
  REPAIR: 'bg-chip-pending-text',
}
