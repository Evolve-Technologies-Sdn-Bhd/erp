import type { ModulePermissions } from '../platform/context/permission.rules';
import { SAL_ROLE } from './shared/sales.constants';

/**
 * Sales permissions (CLAUDE.md → Phase 2 · Roles and permissions). Put on actions with @RequirePermission.
 * Approving is not a permission here: approval steps name a role or person (platform approvals).
 */
export const SALES_PERMISSIONS = {
  VIEW: 'sales.view',
  ENQUIRY_EDIT: 'sales.enquiry.edit',
  QUOTATION_EDIT: 'sales.quotation.edit',
  QUOTATION_RELEASE: 'sales.quotation.release',
  ORDER_EDIT: 'sales.order.edit',
  ORDER_RELEASE: 'sales.order.release',
  DELIVERY_EDIT: 'sales.delivery.edit',
  DELIVERY_CONFIRM: 'sales.delivery.confirm',
  INVOICE_EDIT: 'sales.invoice.edit',
  INVOICE_RELEASE: 'sales.invoice.release',
  PROFORMA_EDIT: 'sales.proforma.edit',
  CASH_SALE_EDIT: 'sales.cash_sale.edit',
  DEBIT_NOTE_EDIT: 'sales.debit_note.edit',
  RETURN_EDIT: 'sales.return.edit',
  RETURN_RECEIVE: 'sales.return.receive',
  CANCEL_ORDER_EDIT: 'sales.cancel_order.edit',
  CANCEL_ORDER_RELEASE: 'sales.cancel_order.release',
  /** Record the customer's signature on a delivery order, or that they refused (phase 5; the installer's app later). */
  DELIVERY_SIGN: 'sales.delivery.sign',
  /** Management: accept a delivery order the customer did not sign, and cancel an order after its delivery order (phase 5). No starter role. */
  EXCEPTION_APPROVE: 'sales.exception.approve',
  MARGIN_VIEW: 'sales.margin.view',
  SETTINGS_MANAGE: 'sales.settings.manage',
  /** Record a customer payment as an official receipt, with its proof (phase 5). */
  RECEIPT_EDIT: 'sales.receipt.edit',
  /** Verify an official receipt against the bank, or send it back (Account; phase 5). */
  RECEIPT_VERIFY: 'sales.receipt.verify',
} as const;

const P = SALES_PERMISSIONS;

/** Role → permissions (SalesUxGuide.html → "Who does what"). ADMIN holds every permission already. */
export const SALES_ROLE_GRANTS: Record<string, string[]> = {
  [SAL_ROLE.AGENT]: [
    P.VIEW, P.ENQUIRY_EDIT, P.QUOTATION_EDIT, P.QUOTATION_RELEASE, P.ORDER_EDIT, P.ORDER_RELEASE, P.CANCEL_ORDER_EDIT, P.RETURN_EDIT,
    P.RECEIPT_EDIT,
  ],
  [SAL_ROLE.BILLING]: [P.VIEW, P.INVOICE_EDIT, P.INVOICE_RELEASE, P.PROFORMA_EDIT, P.DEBIT_NOTE_EDIT, P.RECEIPT_EDIT],
  [SAL_ROLE.STORE]: [P.VIEW, P.DELIVERY_EDIT, P.DELIVERY_CONFIRM, P.RETURN_RECEIVE],
  [SAL_ROLE.COUNTER]: [P.VIEW, P.CASH_SALE_EDIT],
  [SAL_ROLE.MANAGER]: [
    P.VIEW, P.ENQUIRY_EDIT, P.QUOTATION_EDIT, P.QUOTATION_RELEASE, P.ORDER_EDIT, P.ORDER_RELEASE, P.CANCEL_ORDER_EDIT,
    P.CANCEL_ORDER_RELEASE, P.MARGIN_VIEW, P.RECEIPT_EDIT,
  ],
  [SAL_ROLE.FINANCE_MANAGER]: [P.VIEW, P.RECEIPT_VERIFY],
};

/** The Sales catalogue: labels for the role editor (A09), and the grants above as the starter roles. */
export const SALES_PERMISSION_CATALOGUE: ModulePermissions = {
  module: 'sales',
  label: 'Sales',
  viewKey: P.VIEW,
  permissions: [
    { key: P.VIEW, object: 'Sales', action: 'View' },
    { key: P.MARGIN_VIEW, object: 'Sales', action: 'See margin' },
    { key: P.ENQUIRY_EDIT, object: 'Enquiry', action: 'Edit' },
    { key: P.QUOTATION_EDIT, object: 'Quotation', action: 'Edit' },
    { key: P.QUOTATION_RELEASE, object: 'Quotation', action: 'Release' },
    { key: P.ORDER_EDIT, object: 'Sales order', action: 'Edit' },
    { key: P.ORDER_RELEASE, object: 'Sales order', action: 'Release' },
    { key: P.DELIVERY_EDIT, object: 'Delivery order', action: 'Edit' },
    { key: P.DELIVERY_CONFIRM, object: 'Delivery order', action: 'Confirm' },
    { key: P.INVOICE_EDIT, object: 'Invoice', action: 'Edit' },
    { key: P.INVOICE_RELEASE, object: 'Invoice', action: 'Release' },
    { key: P.PROFORMA_EDIT, object: 'Proforma', action: 'Edit' },
    { key: P.CASH_SALE_EDIT, object: 'Cash sale', action: 'Edit' },
    { key: P.DEBIT_NOTE_EDIT, object: 'Debit note', action: 'Edit' },
    { key: P.RETURN_EDIT, object: 'Sales return', action: 'Edit' },
    { key: P.RETURN_RECEIVE, object: 'Sales return', action: 'Receive goods' },
    { key: P.CANCEL_ORDER_EDIT, object: 'Cancel order', action: 'Edit' },
    { key: P.CANCEL_ORDER_RELEASE, object: 'Cancel order', action: 'Release' },
    { key: P.DELIVERY_SIGN, object: 'Delivery order', action: 'Record the signature' },
    { key: P.EXCEPTION_APPROVE, object: 'Management', action: 'Accept unsigned, cancel after the delivery order' },
    { key: P.RECEIPT_EDIT, object: 'Official receipt', action: 'Record' },
    { key: P.RECEIPT_VERIFY, object: 'Official receipt', action: 'Verify' },
    { key: P.SETTINGS_MANAGE, object: 'Operation policies', action: 'Manage' },
  ],
  starterGrants: SALES_ROLE_GRANTS,
};
