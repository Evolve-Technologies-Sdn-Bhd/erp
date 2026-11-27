import {
  Ban,
  Banknote,
  ChartColumn,
  ChartLine,
  ClipboardList,
  File,
  FilePen,
  FileText,
  ListChecks,
  Mail,
  MessageSquare,
  ReceiptText,
  Shield,
  Target,
  Ticket,
  Truck,
  Undo2,
  Wallet,
  Workflow,
} from '@lucide/vue'
import type { MenuGroup } from '../common/menu'

/** The reports on S05 (SalesReports.html), in the order of its tabs; fully paid orders where official receipts are used (phase 5). */
export const SALES_REPORTS = [
  { key: 'by-customer', label: 'Sales by customer' },
  { key: 'by-item', label: 'Sales by item' },
  { key: 'open-orders', label: 'Open orders' },
  { key: 'quotation-conversion', label: 'Quotation conversion' },
  { key: 'customer-aging', label: 'Customer aging' },
  { key: 'invoice-register', label: 'Invoice register' },
  { key: 'e-invoice-status', label: 'e-Invoice status' },
  { key: 'paid-orders', label: 'Fully paid orders' },
] as const

/** Sales sidebar (SalesNavMap.html). Labels exactly as in the mockups. */
export const SALES_MENU: MenuGroup[] = [
  {
    key: 'transaction',
    title: 'Sales Transaction',
    icon: ClipboardList,
    to: '/sales/enquiries',
    items: [
      { key: 'enquiries', label: 'Enquiry', to: '/sales/enquiries', icon: MessageSquare },
      { key: 'draft-quotations', label: 'Draft Quotation', to: '/sales/quotations?status=draft', icon: FilePen },
      { key: 'quotations', label: 'Quotation', to: '/sales/quotations', icon: File },
      { key: 'orders', label: 'Sales Order', to: '/sales/orders', icon: File },
      { key: 'deliveries', label: 'Delivery Order', to: '/sales/deliveries', icon: Truck },
      { key: 'cancel-orders', label: 'Cancel Order', to: '/sales/cancel-orders', icon: Ban },
    ],
  },
  {
    key: 'billing',
    title: 'Billing',
    icon: ReceiptText,
    to: '/sales/invoices',
    items: [
      { key: 'proformas', label: 'Proforma Invoice', to: '/sales/proformas', icon: FileText },
      { key: 'invoices', label: 'Invoice', to: '/sales/invoices', icon: File },
      { key: 'cash-sales', label: 'Cash Sales', to: '/sales/cash-sales', icon: Banknote },
      { key: 'debit-notes', label: 'Debit Note', to: '/sales/debit-notes', icon: File },
      { key: 'returns', label: 'Sales Return', to: '/sales/returns', icon: Undo2 },
      // Phase 5: shown only with the Sales Flow switch "Salespeople record payments as official receipts".
      { key: 'receipts', label: 'Official Receipts', to: '/sales/receipts?status=waiting', icon: Wallet },
    ],
  },
  {
    key: 'policies',
    title: 'Operation Policies',
    icon: Shield,
    to: '/sales/settings/credit-control',
    items: [
      { key: 'credit-control', label: 'Credit Control', to: '/sales/settings/credit-control', icon: Shield },
      { key: 'sales-flow', label: 'Sales Flow', to: '/sales/settings/sales-flow', icon: Workflow },
      // Phase 5: shown only with the Sales Flow switch "Vouchers come from the voucher list".
      { key: 'vouchers', label: 'Vouchers', to: '/sales/settings/vouchers?status=running', icon: Ticket },
      // Phase 5: each branch's monthly target and its salespeople's share (the phone's Sales home shows it).
      { key: 'targets', label: 'Sales Targets', to: '/sales/settings/targets', icon: Target },
      { key: 'document-types', label: 'Document Types', to: '/sales/settings/document-types', icon: File },
      { key: 'enquiry-types', label: 'Enquiry Types', to: '/sales/settings/enquiry-types', icon: ListChecks },
      { key: 'excluded-items', label: 'Excluded Items', to: '/sales/settings/excluded-items', icon: Ban },
      { key: 'email-templates', label: 'Email Templates', to: '/sales/settings/email-templates', icon: Mail },
    ],
  },
  {
    key: 'reports',
    title: 'Reports',
    icon: ChartColumn,
    to: '/sales/reports/by-customer',
    items: SALES_REPORTS.map((r) => ({ key: `report-${r.key}`, label: r.label, to: `/sales/reports/${r.key}`, icon: ChartLine })),
  },
]
