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
} as const;

const P = SERVICE_PERMISSIONS;

export const SERVICE_PERMISSION_CATALOGUE: ModulePermissions = {
  module: 'service',
  label: 'Service',
  viewKey: P.VIEW,
  permissions: [
    { key: P.VIEW, object: 'Service', action: 'View' },
    { key: P.JOB_EDIT, object: 'Job', action: 'Edit and cancel' },
  ],
  starterGrants: {},
};
