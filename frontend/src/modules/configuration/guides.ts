import { admin, agent, salesManager } from '@/tours/guide.sales'
import { be, confirmText, openPage, press, row, status } from '@/tours/guide.steps'
import type { Guide, PageMatch, Tour, TourStep } from '@/tours/types'

/**
 * Configuration as guides: the Handbook's Configuration journeys A–I, step for step (dev mode). Who works here and what
 * they may do. Signing in itself is off in dev mode, so it is not among them. What a guide changes it takes back, except
 * the sample branch and salesperson it leaves inactive. Neutral words only; a company's own come from its file.
 */

const HOME = { path: '^/config$' }
const COMPANY = { path: '^/config/company$' }
const BRANCHES = { path: '^/config/branches$' }
const USERS = { path: '^/config/users$' }
const NEW_USER = { path: '^/config/users/new$' }
const USER = { path: '^/config/users/(?!new$)[^/]+$' }
const ROLES = { path: '^/config/roles$' }
const NEW_ROLE = { path: '^/config/roles/new$' }
const ROLE = { path: '^/config/roles/(?!new$)[^/]+$' }
const PERMISSIONS = { path: '^/config/permissions$' }
const SETTINGS = { path: '^/config/sign-in-settings$' }
const SECURITY_LOG = { path: '^/config/security-log$' }
const AUDIT = { path: '^/config/audit$' }
const ACCOUNT = { path: '^/account$' }
const LAUNCHER = { path: '^/$' }
const APPROVAL_RULES = { path: '^/purchase/settings/approval-rules$' }
const PURCHASE_HOME = { path: '^/purchase$' }
const ORDERS = { path: '^/sales/orders$' }
const CUSTOMERS = { path: '^/core/customers$' }
const CUSTOMER = { path: '^/core/customers/(?!new$)[^/]+$' }

const billing = (extra: Partial<TourStep> = {}) => be('SALES_BILLING', 'billing', 'billing clerk', extra)
const manager = (extra: Partial<TourStep> = {}) => salesManager('branchManager', extra)

const branches = () => openPage('organisation', 'Organisation', 'branches', 'Branches', BRANCHES)
const users = () => openPage('access', 'Users & Access', 'users', 'Users', USERS)
const roles = () => openPage('access', 'Users & Access', 'roles', 'Roles', ROLES)
const permissions = () => openPage('access', 'Users & Access', 'permissions', 'Who Can Do What', PERMISSIONS)
const securityLog = () => openPage('security', 'Security', 'security-log', 'Security Log', SECURITY_LOG)

/** Saved once the button is grey again. */
const save = (page: PageMatch, extra: Partial<TourStep> = {}): TourStep =>
  press('Save changes', { kind: 'appear', selector: '[data-tour="page-actions"] .erp-btn-primary:disabled' }, 'Save it', 'Click Save changes.', { page, waiting: 'Waiting for it to be saved.', ...extra })
/** A record in a list, by its code. */
const open = (list: PageMatch, code: string, to: PageMatch, extra: Partial<TourStep> = {}): TourStep => ({ target: 'list', page: list, pick: code, wait: { kind: 'page', to }, title: `Open ${code}`, text: `Click ${code}.`, placement: 'top', ...extra })
const search = (page: PageMatch, value: string, extra: Partial<TourStep> = {}): TourStep => ({ target: 'filters', page, wait: { kind: 'use' }, title: 'Find it', text: 'Type it in the search, then Next.', type: [{ field: 'Search', value }], ...extra })
/** A person, through the Users list's search; remembered, to come back to. */
const openUser = (code: string, extra: Partial<TourStep> = {}): TourStep[] => [
  search(USERS, code, { title: 'Find them', go: '/config/users', ...extra }),
  open(USERS, code, USER),
]
const look = (target: string, page: PageMatch, title: string, text: string, expect: string, extra: Partial<TourStep> = {}): TourStep => ({ target, page, title, text, expect, placement: 'top', ...extra })

const base: Pick<Tour, 'module' | 'journey' | 'pages' | 'requires'> = { module: 'config', journey: true, pages: 'any', requires: ['dev'] }
const book: Pick<Guide, 'book'> = { book: 'Configuration' }

const CONFIG_HOME: Tour = {
  ...base,
  id: 'guide.config.a',
  title: 'The Configuration home',
  summary: 'Who works here, what needs attention, and who may open it.',
  minutes: 2,
  startAt: '/config',
  guide: { ...book, letter: 'A', rows: 3, cast: 'Administrator, Sales agent', values: { counts: 'the company, its branches, people and roles', attention: 'Who must still set up two-factor, and roles nobody holds' } },
  steps: [
    { title: 'The Configuration home', text: 'Three steps, as two people. Nothing is changed.' },
    admin({ row: 1 }),
    look('cfg:cards', HOME, 'Who works here', 'Each card opens its list.', 'A card for {counts}.', { placement: 'bottom' }),

    look('cfg:attention', HOME, 'Needs attention', 'Checked when the page opens.', '{attention}.', { row: 2 }),
    look('cfg:security', HOME, 'Recent security events', 'The latest, newest first.', 'Roles changed, people added, links sent.'),

    agent('hqAgent', { row: 3, go: '/config' }),
    { target: 'no-access', go: '/config', page: HOME, title: 'Not for everyone', text: 'An agent opens Configuration.', expect: 'Configuration isn’t part of their role, and which permission opens it.', placement: 'bottom' },
    { target: 'acc:password', go: '/account', page: ACCOUNT, title: 'Only their own account', text: 'Everyone may open My account.', expect: 'Their password, two-factor and devices.', placement: 'bottom' },
  ],
}

const BRANCH_GUIDE: Tour = {
  ...base,
  id: 'guide.config.b',
  title: 'The company and a new branch',
  summary: 'Added under headquarters, with an approval limit from the first day, then closed.',
  minutes: 5,
  startAt: '/config/company',
  guide: { ...book, letter: 'B', rows: 5, cast: 'Administrator', values: { company: 'The company, with its registration, TIN and tax numbers', parent: 'the head office', branch: 'a branch people work in', only: 'who works only there', limit: 'the branch above it' } },
  steps: [
    { title: 'The company and a new branch', text: 'Five steps, as the administrator. The sample branch is closed at the end.' },
    admin({ row: 1 }),
    ...openPage('organisation', 'Organisation', 'company', 'Company', COMPANY),
    look('cfg:company', COMPANY, 'The company', 'One legal entity. Its branches are the places it works from.', '{company}.', { placement: 'bottom' }),

    ...row(2, branches()),
    { target: 'cfg:branch-tree', page: BRANCHES, pick: 'Add branch', wait: { kind: 'appear', selector: '[data-tour="cfg:branch"] input#code' }, title: 'A new branch', text: 'Click Add branch.', placement: 'right' },
    { target: 'cfg:branch', page: BRANCHES, wait: { kind: 'use' }, title: 'Its code and name', text: 'Type both and pick {parent} under Under branch. Then Next.', type: [{ field: 'Code', value: '{newBranch}' }, { field: 'Name', value: 'Sample showroom' }], placement: 'top' },
    press('Add branch', { kind: 'appear', selector: '[data-tour="cfg:in-use"]' }, 'Add it', 'Click Add branch.', { page: BRANCHES, waiting: 'Waiting for the branch to be added.' }),
    look('cfg:branch-tree', BRANCHES, 'In the tree', 'A code never changes, and is never used again.', '{newBranch} under {parent}, with 0 users.', { placement: 'right' }),

    { row: 3, target: 'ar:limits', go: '/purchase/settings/approval-rules', page: APPROVAL_RULES, title: 'Purchase knows it already', text: 'At the bottom of the PO limits.', expect: 'Sample showroom among the branches that follow the limit of {limit}.', placement: 'top' },

    { row: 4, target: 'cfg:branch-tree', go: '/config/branches', page: BRANCHES, pick: '{branch}', wait: { kind: 'click' }, title: 'A branch in use', text: 'Click {branch}.', placement: 'right' },
    { target: 'cfg:active', page: BRANCHES, wait: { kind: 'use' }, title: 'It cannot be closed', text: 'Turn Active off, read why not, and turn it on again. Then Next.', expect: '{only}. Give them another branch first.', placement: 'top' },

    { row: 5, target: 'cfg:branch-tree', page: BRANCHES, pick: '{newBranch}', wait: { kind: 'click' }, title: 'The sample one', text: 'Click {newBranch}.', placement: 'right' },
    { target: 'cfg:active', page: BRANCHES, wait: { kind: 'use' }, title: 'Nobody works there', text: 'Turn Active off, then Next.', placement: 'top' },
    save(BRANCHES),
    look('cfg:branch-tree', BRANCHES, 'Closed', 'A branch is closed, never deleted.', '{newBranch}, inactive.', { placement: 'right' }),
  ],
}

const NEW_PERSON: Tour = {
  ...base,
  id: 'guide.config.c',
  title: 'A new salesperson, and one who leaves',
  summary: 'Added with a role and a branch, sees nobody’s customers, then can no longer come in.',
  minutes: 6,
  startAt: '/config/users',
  guide: { ...book, letter: 'C', rows: 5, cast: 'Administrator, the new salesperson', values: { branchName: 'a branch', admin: 'your administrator' } },
  steps: [
    { title: 'A new salesperson', text: 'Five steps, as two people. The sample person is deactivated at the end.' },
    admin({ row: 1 }),
    ...users(),
    { target: 'cfg:new-user', page: USERS, wait: { kind: 'page', to: NEW_USER }, title: 'A new person', text: 'Click Add new user.' },
    { target: 'usr:person', page: NEW_USER, wait: { kind: 'use' }, title: 'Who they are', text: 'Type these, then Next.', type: [{ field: 'User code', value: '{newUser}' }, { field: 'Name', value: 'Sample salesperson' }, { field: 'Email', value: '{newEmail}' }], placement: 'bottom' },
    { target: 'usr:roles', page: NEW_USER, pick: 'Add role', wait: { kind: 'appear', selector: '[data-tour="usr:roles"] select' }, title: 'What they may do', text: 'Click Add role.', placement: 'top' },
    { target: 'usr:roles', page: NEW_USER, wait: { kind: 'use' }, title: 'Their role', text: 'Pick Sales agent under Role, then Next.', placement: 'top' },
    { target: 'usr:branches', page: NEW_USER, wait: { kind: 'use' }, title: 'Where they work', text: 'Turn on {branchName}, then Next.', placement: 'top' },
    press('Create user', { kind: 'page', to: USER }, 'Save it', 'Click Create user.', { page: NEW_USER, waiting: 'Waiting for the person to be added.' }),
    { target: 'page-header', page: USER, remember: 'person', title: '{newUser}', text: 'Nobody types a password for them.', expect: 'Active.' },

    { row: 2, target: 'usr:sign-in', page: USER, pick: '{newEmail}', optional: true, wait: { kind: 'appear', selector: '[data-tour="usr:email"]' }, title: 'Their link', text: 'Click the email with their link.', placement: 'top' },
    look('usr:email', USER, 'They set their own password', 'Emails are kept here until real email is connected.', 'A link that works once, for an hour.', { optional: true }),

    be('SALES_AGENT', 'newUser', 'new salesperson', { row: 3 }),
    look('list', ORDERS, 'Nobody else’s orders', 'A salesperson sees the orders of their own customers.', 'No orders yet.', { go: '/sales/orders' }),
    look('list', CUSTOMERS, 'Nobody else’s customers', 'Give them customers in Core: the sales agent of each.', 'No customers.', { go: '/core/customers' }),

    admin({ row: 4 }),
    press('Deactivate', status('INACTIVE'), 'They leave', confirmText('Deactivate'), { page: USER, go: '@person', waiting: 'Waiting for them to be deactivated.' }),
    look('page-header', USER, 'They can no longer come in', 'What they made keeps their name. Click your name, top right: they are not in the list.', 'Inactive.', { placement: 'bottom' }),

    ...row(5, openUser('{admin}')),
    look('page-actions', USER, 'But never the last one', 'Point at Deactivate on your own page.', 'It cannot be clicked. Nobody deactivates themselves, and the last administrator always stays.', { placement: 'bottom' }),
  ],
}

const ROLE_GUIDE: Tour = {
  ...base,
  id: 'guide.config.d',
  title: 'What a role may do',
  summary: 'One permission more, and the person has it at their next click.',
  minutes: 5,
  startAt: '/',
  guide: { ...book, letter: 'D', rows: 4, cast: 'Billing clerk, Administrator', values: { role: 'Billing' } },
  steps: [
    { title: 'What a role may do', text: 'Four steps, as two people. The last one takes it back.' },
    billing({ row: 1 }),
    look('launcher:tiles', LAUNCHER, 'Not Purchase', 'Billing does not buy.', 'No access on the Purchase tile.', { placement: 'bottom', go: '/' }),

    admin({ row: 2 }),
    { target: 'list:roles', go: '/config/roles', page: ROLES, pick: '{role}', wait: { kind: 'page', to: ROLE }, title: 'Their role', text: 'Click {role}.', placement: 'top' },
    { target: 'role:general', page: ROLE, remember: 'rolePage', title: 'The role', text: 'A set of permissions, and what they can see.', expect: 'Who holds it, on the right.', placement: 'bottom' },
    { target: 'role:permissions', page: ROLE, pick: 'Purchase', wait: { kind: 'appear', selector: '[data-tour="role:purchase"]' }, title: 'Let them look', text: 'Click Purchase at the bottom, to open its permissions.', placement: 'top' },
    { target: 'role:purchase', page: ROLE, wait: { kind: 'use' }, title: 'Only to look', text: 'Tick View in the Purchase line, then Next.', placement: 'top' },
    save(ROLE),

    billing({ row: 3 }),
    { target: 'launcher:tiles', go: '/', page: LAUNCHER, pick: 'Purchase', wait: { kind: 'page', to: PURCHASE_HOME }, title: 'Open Purchase', text: 'Click the Purchase tile.', expect: 'It opens, with no signing in again.' },
    look('page-header', { path: '^/purchase/orders$' }, 'Only to look', 'The purchase orders.', 'No Add new PO button, and the others are grey.', { go: '/purchase/orders', placement: 'bottom' }),

    admin({ row: 4 }),
    { target: 'role:permissions', go: '@rolePage', page: ROLE, wait: { kind: 'use' }, title: 'Take it back', text: 'Untick View in the Purchase line, then Next.', placement: 'top' },
    save(ROLE),
    look('role:closed', ROLE, 'As before', 'Reset to starter, at the top, brings a starter role back to how it came.', 'Purchase is among those with nothing.'),
  ],
}

const OWN_ROLE: Tour = {
  ...base,
  id: 'guide.config.e',
  title: 'A role of your own',
  summary: 'Made, compared with a starter role, and deleted.',
  minutes: 4,
  startAt: '/config/roles',
  guide: { ...book, letter: 'E', rows: 4, cast: 'Administrator', values: {} },
  steps: [
    { title: 'A role of your own', text: 'Four steps, as the administrator. Nobody gets the role.' },
    admin({ row: 1 }),
    ...roles(),
    press('Add new role', { kind: 'page', to: NEW_ROLE }, 'A new role', 'Click Add new role.', { page: ROLES }),
    { target: 'role:general', page: NEW_ROLE, wait: { kind: 'use' }, title: 'What it is for', text: 'Type both, then Next.', type: [{ field: 'Code', value: '{newRole}' }, { field: 'Name', value: 'Sample role' }], placement: 'bottom' },
    { target: 'role:permissions', page: NEW_ROLE, pick: 'Sales', wait: { kind: 'appear', selector: '[data-tour="role:sales"]' }, title: 'Open Sales', text: 'Click Sales at the bottom.', placement: 'top' },
    { target: 'role:sales', page: NEW_ROLE, wait: { kind: 'use' }, title: 'What it may do', text: 'Tick View in the Sales line and Edit in the Sales order line. Then Next.', placement: 'top' },
    press('Create role', { kind: 'page', to: ROLE }, 'Save it', 'Click Create role.', { page: NEW_ROLE, waiting: 'Waiting for the role to be made.' }),

    look('role:held', ROLE, 'Nobody has it yet', 'Give it to someone on their user page.', 'Custom, held by 0 users.', { row: 2, placement: 'left' }),
    { target: 'page-header', page: ROLE, remember: 'rolePage', title: 'A custom role', text: 'A starter role can be changed but not deleted. A custom one can go.', expect: '2 permissions.', placement: 'bottom' },

    ...row(3, permissions()),
    { target: 'perm:tabs', page: PERMISSIONS, pick: 'Compare two roles', wait: { kind: 'appear', selector: '[data-tour="perm:pick"]' }, title: 'Compare', text: 'Click Compare two roles.', placement: 'bottom' },
    { target: 'perm:pick', page: PERMISSIONS, wait: { kind: 'use' }, title: 'With which one', text: 'Pick Sample role under Compared with, then Next.', placement: 'bottom' },
    look('perm:compare', PERMISSIONS, 'How they differ', 'Sales agent on the left, Sample role on the right.', 'What an agent may do that the sample role may not.'),

    { row: 4, ...press('Delete', { kind: 'page', to: ROLES }, 'Delete it', confirmText('Delete'), { page: ROLE, go: '@rolePage', waiting: 'Waiting for it to be deleted.' }) },
    look('list:roles', ROLES, 'Gone', 'Only because nobody held it.', 'No Sample role in the list.'),
  ],
}

const COVER: Tour = {
  ...base,
  id: 'guide.config.f',
  title: 'Cover for someone on leave',
  summary: 'A second role that ends by itself on a day.',
  minutes: 4,
  startAt: '/config/users',
  guide: { ...book, letter: 'F', rows: 3, cast: 'Administrator', values: { billing: 'a billing clerk', coverRole: 'Sales store' } },
  steps: [
    { title: 'Cover for someone on leave', text: 'Three steps, as the administrator. The last one takes it back.' },
    admin({ row: 1 }),
    ...openUser('{billing}'),
    { target: 'page-header', page: USER, remember: 'person', title: 'The billing clerk', text: 'The store is on leave until next week.', expect: 'One role today.', placement: 'bottom' },
    { target: 'usr:roles', page: USER, pick: 'Add role', wait: { kind: 'appear', selector: '[data-tour="usr:roles"] select' }, title: 'A second role', text: 'Click Add role.', placement: 'top' },
    { target: 'usr:roles', page: USER, wait: { kind: 'use' }, title: 'Until when', text: 'Pick {coverRole} under Role and type {nextWeek} under Until. Then Next.', placement: 'top' },
    save(USER),
    look('usr:roles', USER, 'It ends by itself', 'On that day it stops, and nobody has to remember.', '{coverRole}, until {nextWeek}.'),

    { row: 2, target: 'usr:effective', page: USER, pick: 'See what they can do', wait: { kind: 'page', to: PERMISSIONS }, title: 'What they can do now', text: 'Click See what they can do.', placement: 'left' },
    look('perm:person', PERMISSIONS, 'Both roles together', 'A person gets the sum of their roles.', 'Which role each permission is from.'),

    { row: 3, target: 'usr:roles', go: '@person', page: USER, wait: { kind: 'use' }, title: 'Take it back', text: 'Click the × on {coverRole}, then Next.', placement: 'top' },
    save(USER),
    look('usr:activity', USER, 'Logged', 'At the bottom of the list.', 'The role given, and taken back.', { placement: 'left' }),
  ],
}

const SCOPES: Tour = {
  ...base,
  id: 'guide.config.g',
  title: 'Who sees which branch',
  summary: 'A manager gets one branch more, and one customer is shown to every branch.',
  minutes: 6,
  startAt: '/sales/orders',
  guide: { ...book, letter: 'G', rows: 6, cast: 'Branch sales manager, Administrator', values: { branchManager: 'a branch sales manager', branchName: 'another branch', branch: 'that branch', mine: 'Only the orders of their own branches', more: 'The other branch’s orders too', customer: 'a customer of that branch' } },
  steps: [
    { title: 'Who sees which branch', text: 'Six steps, as two people. Both changes are taken back.' },
    manager({ row: 1 }),
    look('list', ORDERS, 'Their branches', 'The sales orders.', '{mine}.', { go: '/sales/orders' }),

    admin({ row: 2 }),
    ...openUser('{branchManager}'),
    { target: 'page-header', page: USER, remember: 'person', title: 'The manager', text: 'They work in the branches under their name.', expect: 'Not {branch}.', placement: 'bottom' },
    { target: 'usr:branches', page: USER, wait: { kind: 'use' }, title: 'One branch more', text: 'Turn on {branchName}, then Next.', placement: 'top' },
    save(USER),

    manager({ row: 3 }),
    look('list', ORDERS, 'At their next click', 'The same list.', '{more}.', { go: '/sales/orders' }),

    admin({ row: 4 }),
    { target: 'usr:branches', go: '@person', page: USER, wait: { kind: 'use' }, title: 'Take it back', text: 'Turn off {branchName}, then Next.', placement: 'top' },
    save(USER),

    { row: 5, target: 'list', go: '/core/customers', page: CUSTOMERS, pick: '{customer}', wait: { kind: 'page', to: CUSTOMER }, title: 'One customer for everyone', text: 'Click {customer}.', placement: 'top' },
    { target: 'cus:all-branches', page: CUSTOMER, wait: { kind: 'use' }, title: 'Visible to all branches', text: 'Turn it on, then Next.', placement: 'top' },
    save(CUSTOMER),
    manager({ go: '/core/customers' }),
    search(CUSTOMERS, '{customer}', { title: 'The manager again' }),
    look('list', CUSTOMERS, 'They see it', 'Its orders still belong to its branch.', '{customer}.'),

    admin({ row: 6 }),
    { target: 'list', go: '/core/customers', page: CUSTOMERS, pick: '{customer}', wait: { kind: 'page', to: CUSTOMER }, title: 'Take it back', text: 'Click {customer}.', placement: 'top' },
    { target: 'cus:all-branches', page: CUSTOMER, wait: { kind: 'use' }, title: 'Only its own branch', text: 'Turn it off, then Next.', placement: 'top' },
    save(CUSTOMER),
  ],
}

const SIGN_IN: Tour = {
  ...base,
  id: 'guide.config.h',
  title: 'Sign-in settings and My account',
  summary: 'A stricter lock, logged and put back, and what each person keeps for themselves.',
  minutes: 4,
  startAt: '/config/sign-in-settings',
  guide: { ...book, letter: 'H', rows: 4, cast: 'Administrator, Sales agent', values: { lock: '5' } },
  steps: [
    { title: 'Sign-in settings', text: 'Four steps, as two people. They count once real sign-in is on; here people switch.' },
    admin({ row: 1 }),
    ...openPage('security', 'Security', 'sign-in-settings', 'Sign-in Settings', SETTINGS),
    { target: 'set:lockout', page: SETTINGS, wait: { kind: 'use' }, title: 'A stricter lock', text: 'Type 3 over the {lock}, then Next.', type: [{ field: 'Lock the account after', value: '3' }], placement: 'bottom' },
    save(SETTINGS),

    ...row(2, securityLog()),
    look('list', SECURITY_LOG, 'Logged', 'The first line. Nobody can change or delete it.', 'Wrong passwords {lock} → 3, and who changed it.'),

    ...row(3, openPage('security', 'Security', 'sign-in-settings', 'Sign-in Settings', SETTINGS)),
    { target: 'set:lockout', page: SETTINGS, wait: { kind: 'use' }, title: 'Put it back', text: 'Type {lock} over the 3, then Next.', type: [{ field: 'Lock the account after', value: '{lock}' }], placement: 'bottom' },
    save(SETTINGS),

    agent('hqAgent', { row: 4 }),
    look('acc:password', ACCOUNT, 'My account', 'Everyone changes their own password.', 'At least 10 characters. Common passwords are refused.', { go: '/account', placement: 'bottom' }),
    look('acc:two-factor', ACCOUNT, 'Two-factor', 'A code from the phone. Some roles must have it.', 'Off: an agent may turn it on.'),
    look('acc:devices', ACCOUNT, 'Where they are signed in', 'A lost phone is signed out from here.', 'No devices: in this demo nobody signs in.'),
  ],
}

const LOGS: Tour = {
  ...base,
  id: 'guide.config.i',
  title: 'The security log and the audit trail',
  summary: 'Who changed what, with the old and the new value.',
  minutes: 3,
  startAt: '/config/security-log',
  guide: { ...book, letter: 'I', rows: 4, cast: 'Administrator, Sales agent', after: ['D'], values: { role: 'Billing', roleCode: 'SALES_BILLING' } },
  steps: [
    { title: 'Who changed what', text: 'Four steps, as two people. Nothing is changed.' },
    admin({ row: 1 }),
    ...securityLog(),
    search(SECURITY_LOG, '{role}'),
    look('list', SECURITY_LOG, 'Who may do what', 'Sign-ins, locks, roles and people.', 'Role changed, when guide D gave and took back Purchase.'),

    ...row(2, openPage('security', 'Security', 'audit', 'Audit Trail', AUDIT)),
    search(AUDIT, '{roleCode}'),
    look('list', AUDIT, 'Every change', 'In every module, not only here.', 'The same changes, with who made them.'),

    { row: 3, target: 'list', page: AUDIT, wait: { kind: 'appear', selector: '[data-tour="audit:change"]' }, waiting: 'Waiting for you to click one.', title: 'Before and after', text: 'Click what happened in the first line.', placement: 'top' },
    look('audit:change', AUDIT, 'Before and after', 'Changes made together share one request number.', 'How many permissions before, and after.'),

    agent('hqAgent', { row: 4 }),
    { target: 'no-access', go: '/config/audit', page: AUDIT, title: 'Not for everyone', text: 'Whoever reviews gets the Auditor role: they read everything and change nothing.', expect: 'The audit trail isn’t part of an agent’s role.', placement: 'bottom' },
  ],
}

export const CONFIG_GUIDES: Tour[] = [CONFIG_HOME, BRANCH_GUIDE, NEW_PERSON, ROLE_GUIDE, OWN_ROLE, COVER, SCOPES, SIGN_IN, LOGS]
