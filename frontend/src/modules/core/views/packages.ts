import type { PackageStatus } from '../types'

/** Chip colours of package statuses (CorePackages.html): running green, scheduled amber, ended grey. */
export const PACKAGE_STATUS_GROUP: Record<PackageStatus, 'done' | 'pending' | 'draft'> = {
  RUNNING: 'done',
  SCHEDULED: 'pending',
  ENDED: 'draft',
}
