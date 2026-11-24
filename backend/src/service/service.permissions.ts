import type { ModulePermissions } from '../platform/context/permission.rules';

/**
 * Service permissions (CLAUDE.md → Phase 5 · Installation module). F3 part 1 needs viewing and the office's job work;
 * booking, the installer's part and the settings bring their own keys with their parts. Administrator holds them all.
 * No starter role gets them yet: a company that turns the module on grants them in Roles (A09), or the installer roles
 * come with the installer's part.
 */
export const SERVICE_PERMISSIONS = {
  VIEW: 'service.view',
  /** Add a job by hand, change its site and note, cancel it. */
  JOB_EDIT: 'service.job.edit',
  /** Book, move and take jobs off the Planning Board; extend a booked job; close done jobs. */
  JOB_BOOK: 'service.job.book',
  /** Record what happened at the visit: result, photos, paid or not (F3 part 3). Installers on the phone app later. */
  JOB_RECORD: 'service.job.record',
  /** The warehouse: confirm a booked job's stock before its delivery order (V09). */
  STOCK_CONFIRM: 'service.stock.confirm',
  /** People and slot groups (V05). */
  SETTINGS_MANAGE: 'service.settings.manage',
  /** Key an installer's claim and submit it (F5); installers themselves with the phone app later. */
  CLAIM_EDIT: 'service.claim.edit',
  /** Account: approve or send back a claim, and record its payment. */
  CLAIM_APPROVE: 'service.claim.approve',
} as const;

const P = SERVICE_PERMISSIONS;

export const SERVICE_PERMISSION_CATALOGUE: ModulePermissions = {
  module: 'service',
  label: 'Service',
  viewKey: P.VIEW,
  permissions: [
    { key: P.VIEW, object: 'Service', action: 'View' },
    { key: P.JOB_EDIT, object: 'Job', action: 'Edit and cancel' },
    { key: P.JOB_BOOK, object: 'Job', action: 'Book and close' },
    { key: P.JOB_RECORD, object: 'Job', action: 'Record the visit' },
    { key: P.STOCK_CONFIRM, object: 'Job', action: 'Confirm stock' },
    { key: P.SETTINGS_MANAGE, object: 'Service', action: 'People and slots' },
    { key: P.CLAIM_EDIT, object: 'Installer claim', action: 'Key and submit' },
    { key: P.CLAIM_APPROVE, object: 'Installer claim', action: 'Approve and pay' },
  ],
  starterGrants: {},
};
