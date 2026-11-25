import { api } from '@/api/http'
import type { ListQuery, ListResponse } from '@/api/list'
import type {
  NewCustomerInput,
  CancelDetail,
  CashKpis,
  CashListItem,
  CashSaleDetail,
  CashSaleInput,
  CancelListItem,
  CancelOpenOrder,
  CancelOrderLines,
  CreditControlData,
  SalesFlowData,
  SalesFlowSwitches,
  PriceRangeSetting,
  VoucherInput,
  VoucherOption,
  VoucherRow,
  ReceiptDetail,
  ReceiptInput,
  ReceiptRow,
  CreditRuleRow,
  CustomerCardData,
  DocumentTypesData,
  EmailPreview,
  EmailTemplateRow,
  EnquiryTypesData,
  EnquiryTypeSetting,
  ExclusionsData,
  DebitDetail,
  DebitInvoiceView,
  DebitListItem,
  CustomerOption,
  DeliveryDetail,
  DeliveryInput,
  DeliveryListItem,
  DeliveryOverview,
  EnquiryDetail,
  EnquiryInput,
  EnquiryListItem,
  EnquiryTypeOption,
  PackageOption,
  InboxDetail,
  InvoiceCandidates,
  InvoiceDetail,
  InvoiceKpis,
  InvoiceListItem,
  InboxList,
  ItemSearchResult,
  OrderDetail,
  OrderInput,
  OrderListItem,
  ProformaDetail,
  ProformaKpis,
  ProformaListItem,
  ProformaRequestKind,
  QuotationDetail,
  ReturnDetail,
  ReturnInvoiceView,
  ReturnKpis,
  ReturnListItem,
  QuotationInput,
  QuotationListItem,
  SalesByCustomerReport,
  SalesByItemReport,
  SalesDashboard,
  SalesOrderFlow,
  OpenOrdersReport,
  QuotationConversionReport,
  CustomerAgingReport,
  InvoiceRegisterReport,
  PaidOrdersReport,
  EInvoiceStatusReport,
} from '../types'

export const salesApi = {
  dashboard: (query: Record<string, string> = {}) => api<SalesDashboard>('/sales/dashboard', { query }),
  approvalsCount: () => api<{ waitingForMe: number }>('/sales/approvals/count', { silent: true }),
}

export const salesOrdersApi = {
  list: (query: ListQuery) => api<ListResponse<OrderListItem>>('/sales/orders', { query }),
  get: (id: string) => api<OrderDetail>(`/sales/orders/${id}`),
  flow: (id: string) => api<SalesOrderFlow>(`/sales/orders/${id}/flow`),
  create: (input: OrderInput) => api<OrderDetail>('/sales/orders', { method: 'POST', body: input }),
  update: (id: string, input: Partial<OrderInput> & { version: number }) => api<OrderDetail>(`/sales/orders/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/orders/${id}`, { method: 'DELETE', query: { version } }),
  requestApproval: (id: string, version: number, reason: string) =>
    api<OrderDetail>(`/sales/orders/${id}/request-approval`, { method: 'POST', body: { version, reason } }),
  release: (id: string, version: number, silent = false) => api<OrderDetail>(`/sales/orders/${id}/release`, { method: 'POST', body: { version }, silent }),
  revise: (id: string, version: number, reason: string) => api<OrderDetail>(`/sales/orders/${id}/revise`, { method: 'POST', body: { version, reason } }),
  discardRevision: (id: string, version: number) => api<OrderDetail>(`/sales/orders/${id}/discard-revision`, { method: 'POST', body: { version } }),
}

export type QuotationList = ListResponse<QuotationListItem> & { expiringSoon: { docNo: string; validUntil: string }[] }

export const salesQuotationsApi = {
  list: (query: ListQuery) => api<QuotationList>('/sales/quotations', { query }),
  get: (id: string) => api<QuotationDetail>(`/sales/quotations/${id}`),
  create: (input: QuotationInput) => api<QuotationDetail>('/sales/quotations', { method: 'POST', body: input }),
  update: (id: string, input: Partial<QuotationInput> & { version: number }) => api<QuotationDetail>(`/sales/quotations/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/quotations/${id}`, { method: 'DELETE', query: { version } }),
  requestApproval: (id: string, version: number, reason: string) =>
    api<QuotationDetail>(`/sales/quotations/${id}/request-approval`, { method: 'POST', body: { version, reason } }),
  release: (id: string, version: number, silent = false) => api<QuotationDetail>(`/sales/quotations/${id}/release`, { method: 'POST', body: { version }, silent }),
  email: (id: string) => api<{ sentTo: string }>(`/sales/quotations/${id}/email`, { method: 'POST' }),
  revise: (id: string, version: number) => api<QuotationDetail>(`/sales/quotations/${id}/revise`, { method: 'POST', body: { version } }),
  lost: (id: string, version: number, reason: string) => api<QuotationDetail>(`/sales/quotations/${id}/lost`, { method: 'POST', body: { version, reason } }),
  transfer: (id: string, version: number, lineNos?: number[]) =>
    api<{ orderId: string; orderNo: string }>(`/sales/quotations/${id}/transfer`, { method: 'POST', body: { version, lineNos } }),
}

export const salesEnquiriesApi = {
  list: (query: ListQuery) => api<ListResponse<EnquiryListItem>>('/sales/enquiries', { query }),
  get: (id: string) => api<EnquiryDetail>(`/sales/enquiries/${id}`),
  create: (input: EnquiryInput) => api<EnquiryDetail>('/sales/enquiries', { method: 'POST', body: input }),
  update: (id: string, input: EnquiryInput & { version: number }) => api<EnquiryDetail>(`/sales/enquiries/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/enquiries/${id}`, { method: 'DELETE', query: { version } }),
  forward: (id: string, version: number) => api<EnquiryDetail>(`/sales/enquiries/${id}/forward`, { method: 'POST', body: { version } }),
  createQuotation: (id: string) => api<QuotationDetail>(`/sales/enquiries/${id}/quotation`, { method: 'POST' }),
  lost: (id: string, version: number, reason: string) => api<EnquiryDetail>(`/sales/enquiries/${id}/lost`, { method: 'POST', body: { version, reason } }),
  customerCard: (code: string) => api<CustomerCardData | null>(`/sales/enquiries/customer-card/${encodeURIComponent(code)}`),
}

export const salesDeliveriesApi = {
  overview: () => api<DeliveryOverview>('/sales/deliveries/overview'),
  list: (query: ListQuery) => api<ListResponse<DeliveryListItem>>('/sales/deliveries', { query }),
  get: (id: string) => api<DeliveryDetail>(`/sales/deliveries/${id}`),
  create: (salesOrderId: string) => api<DeliveryDetail>('/sales/deliveries', { method: 'POST', body: { salesOrderId } }),
  update: (id: string, input: DeliveryInput) => api<DeliveryDetail>(`/sales/deliveries/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/deliveries/${id}`, { method: 'DELETE', query: { version } }),
  requestApproval: (id: string, version: number, reason: string) =>
    api<DeliveryDetail>(`/sales/deliveries/${id}/request-approval`, { method: 'POST', body: { version, reason } }),
  confirm: (id: string, version: number) => api<DeliveryDetail>(`/sales/deliveries/${id}/confirm`, { method: 'POST', body: { version } }),
  /** The signed delivery order (phase 5): collect, check-in, sign, refuse, accept-unsigned, return-refusal. */
  signStep: (id: string, step: string, body: { version: number; note?: string; signerName?: string; reason?: string; fileIds?: string[] }) =>
    api<DeliveryDetail>(`/sales/deliveries/${id}/${step}`, { method: 'POST', body }),
}

export type InvoiceList = ListResponse<InvoiceListItem> & { kpis: InvoiceKpis }
type InvoiceFields = { docDate?: string; customerPoRef?: string; note?: string }
type DirectLine = { itemCode: string; qty: string; unitPrice: string; discountPct?: string }

export const salesInvoicesApi = {
  list: (query: ListQuery) => api<InvoiceList>('/sales/invoices', { query }),
  candidates: (customerCode: string) => api<InvoiceCandidates>('/sales/invoices/candidates', { query: { customerCode } }),
  createFromOrder: (input: InvoiceFields & { salesOrderId: string; lines: { soLineId: string; qty: string }[] }) =>
    api<InvoiceDetail>('/sales/invoices/from-order', { method: 'POST', body: input }),
  createDirect: (input: InvoiceFields & { customerCode: string; lines: DirectLine[] }) => api<InvoiceDetail>('/sales/invoices', { method: 'POST', body: input }),
  get: (id: string) => api<InvoiceDetail>(`/sales/invoices/${id}`),
  update: (id: string, input: InvoiceFields & { version: number; quantities?: { lineNo: number; qty: string }[]; customerCode?: string; lines?: DirectLine[] }) =>
    api<InvoiceDetail>(`/sales/invoices/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/invoices/${id}`, { method: 'DELETE', query: { version } }),
  requestApproval: (id: string, version: number, reason: string) =>
    api<InvoiceDetail>(`/sales/invoices/${id}/request-approval`, { method: 'POST', body: { version, reason } }),
  release: (id: string, version: number) => api<InvoiceDetail>(`/sales/invoices/${id}/release`, { method: 'POST', body: { version } }),
  email: (id: string) => api<{ sentTo: string }>(`/sales/invoices/${id}/email`, { method: 'POST' }),
}

export type ProformaList = ListResponse<ProformaListItem> & { kpis: ProformaKpis; lastUsed: { docNo: string; invoiceNo: string | null; usedAt: string | null } | null }
type ProformaFields = { requestKind?: ProformaRequestKind; depositPct?: string; docDate?: string; payBy?: string; attention?: string; note?: string }

export const salesProformasApi = {
  list: (query: ListQuery) => api<ProformaList>('/sales/proformas', { query }),
  orders: () => api<{ items: { id: string; docNo: string; customerName: string; total: string; docDate: string }[] }>('/sales/proformas/orders'),
  create: (input: ProformaFields & { salesOrderId: string }) => api<ProformaDetail>('/sales/proformas', { method: 'POST', body: input }),
  get: (id: string) => api<ProformaDetail>(`/sales/proformas/${id}`),
  update: (id: string, input: ProformaFields & { version: number }) => api<ProformaDetail>(`/sales/proformas/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/proformas/${id}`, { method: 'DELETE', query: { version } }),
  release: (id: string, version: number) => api<ProformaDetail>(`/sales/proformas/${id}/release`, { method: 'POST', body: { version } }),
  email: (id: string) => api<{ sentTo: string }>(`/sales/proformas/${id}/email`, { method: 'POST' }),
  cancel: (id: string, version: number) => api<ProformaDetail>(`/sales/proformas/${id}/cancel`, { method: 'POST', body: { version } }),
}

export type CancelList = ListResponse<CancelListItem> & { totals: { value: string; since: string | null }; reasons: string[] }
type CancelFields = { reason?: string; docDate?: string; askedBy?: string; customerRef?: string; note?: string }

export const salesCancelOrdersApi = {
  list: (query: ListQuery) => api<CancelList>('/sales/cancel-orders', { query }),
  openOrders: () => api<{ items: CancelOpenOrder[] }>('/sales/cancel-orders/open-orders'),
  orderLines: (orderId: string) => api<CancelOrderLines>(`/sales/cancel-orders/order-lines/${orderId}`),
  create: (input: CancelFields & { salesOrderId: string; lines: { soLineId: string; qty: string }[] }) => api<CancelDetail>('/sales/cancel-orders', { method: 'POST', body: input }),
  get: (id: string) => api<CancelDetail>(`/sales/cancel-orders/${id}`),
  update: (id: string, input: CancelFields & { version: number; lines?: { soLineId: string; qty: string }[] }) =>
    api<CancelDetail>(`/sales/cancel-orders/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/cancel-orders/${id}`, { method: 'DELETE', query: { version } }),
  release: (id: string, version: number) => api<CancelDetail>(`/sales/cancel-orders/${id}/release`, { method: 'POST', body: { version } }),
}

export type ReturnList = ListResponse<ReturnListItem> & { units: string; kpis: ReturnKpis; reasons: string[] }
type ReturnFields = { reason?: string; docDate?: string; location?: string; creditMethod?: 'CREDIT_NOTE' | 'REFUND'; customerRef?: string; note?: string }

export const salesReturnsApi = {
  list: (query: ListQuery) => api<ReturnList>('/sales/returns', { query }),
  invoices: (q: string) => api<{ items: { id: string; docNo: string; docDate: string; customerName: string; total: string; isMigrated: boolean }[] }>('/sales/returns/invoices', { query: { q } }),
  invoiceLines: (invoiceId: string) => api<ReturnInvoiceView>(`/sales/returns/invoice-lines/${invoiceId}`),
  create: (input: ReturnFields & { invoiceId: string; lines: { invoiceLineId: string; qty: string }[] }) => api<ReturnDetail>('/sales/returns', { method: 'POST', body: input }),
  get: (id: string) => api<ReturnDetail>(`/sales/returns/${id}`),
  update: (id: string, input: ReturnFields & { version: number; lines?: { invoiceLineId: string; qty: string }[] }) =>
    api<ReturnDetail>(`/sales/returns/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/returns/${id}`, { method: 'DELETE', query: { version } }),
  release: (id: string, version: number) => api<ReturnDetail>(`/sales/returns/${id}/release`, { method: 'POST', body: { version } }),
}

export type DebitList = ListResponse<DebitListItem> & { since: string | null; reasons: string[] }
type DebitFields = { reason?: string; docDate?: string; note?: string }
type ChargeLine = { itemCode: string; qty: string; unitPrice: string }

export const salesDebitNotesApi = {
  list: (query: ListQuery) => api<DebitList>('/sales/debit-notes', { query }),
  invoices: (q: string) => api<{ items: { id: string; docNo: string; docDate: string; customerName: string; customerCode: string; total: string; isMigrated: boolean }[] }>('/sales/debit-notes/invoices', { query: { q } }),
  invoice: (invoiceId: string) => api<DebitInvoiceView>(`/sales/debit-notes/invoice/${invoiceId}`),
  create: (input: DebitFields & { invoiceId: string; lines: ChargeLine[] }) => api<DebitDetail>('/sales/debit-notes', { method: 'POST', body: input }),
  get: (id: string) => api<DebitDetail>(`/sales/debit-notes/${id}`),
  update: (id: string, input: DebitFields & { version: number; invoiceId?: string; lines?: ChargeLine[] }) => api<DebitDetail>(`/sales/debit-notes/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/debit-notes/${id}`, { method: 'DELETE', query: { version } }),
  release: (id: string, version: number) => api<DebitDetail>(`/sales/debit-notes/${id}/release`, { method: 'POST', body: { version } }),
}

export type CashList = ListResponse<CashListItem> & { kpis: CashKpis; counters: string[] }

export const salesCashSalesApi = {
  list: (query: ListQuery) => api<CashList>('/sales/cash-sales', { query }),
  create: (input: CashSaleInput) => api<CashSaleDetail>('/sales/cash-sales', { method: 'POST', body: input }),
  get: (id: string) => api<CashSaleDetail>(`/sales/cash-sales/${id}`),
  update: (id: string, input: CashSaleInput & { version: number }) => api<CashSaleDetail>(`/sales/cash-sales/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string, version: number) => api<{ deleted: boolean; docNo: string }>(`/sales/cash-sales/${id}`, { method: 'DELETE', query: { version } }),
  release: (id: string, version: number) => api<CashSaleDetail>(`/sales/cash-sales/${id}/release`, { method: 'POST', body: { version } }),
}

export const salesSettingsApi = {
  creditControl: () => api<CreditControlData>('/sales/settings/credit-control'),
  saveCreditControl: (input: { creditScope: 'GROUP' | 'BRANCH'; rules: CreditRuleRow[] } & CreditControlData['toggles']) =>
    api<CreditControlData>('/sales/settings/credit-control', { method: 'PUT', body: input }),
  salesFlow: (options: { silent?: boolean } = {}) => api<SalesFlowData>('/sales/settings/sales-flow', options),
  saveSalesFlow: (switches: SalesFlowSwitches, range?: PriceRangeSetting, autoCancelDays?: number) =>
    api<SalesFlowData>('/sales/settings/sales-flow', {
      method: 'PUT',
      body: { ...switches, ...(range && { priceBelowPct: range.belowPct, priceAbovePct: range.abovePct }), ...(autoCancelDays !== undefined && { autoCancelDays }) },
    }),
  /** Phase 5: runs the automatic cancel now (it also runs every hour). */
  lapseCheck: () => api<{ warned: string[]; cancelled: { soNo: string; cancelNo: string }[] }>('/sales/orders/lapse-check', { method: 'POST' }),
  documentTypes: () => api<DocumentTypesData>('/sales/settings/document-types'),
  saveDocumentTypes: (sequences: { docType: string; resetEvery: 'NEVER' | 'MONTH'; perBranch: boolean }[]) =>
    api<DocumentTypesData>('/sales/settings/document-types', { method: 'PUT', body: { sequences } }),
  addOrderType: (input: { name: string; meaning: string; isDefault?: boolean }) => api<DocumentTypesData>('/sales/settings/order-types', { method: 'POST', body: input }),
  enquiryTypes: () => api<EnquiryTypesData>('/sales/settings/enquiry-types'),
  saveEnquiryType: (code: string | null, input: Pick<EnquiryTypeSetting, 'name' | 'details' | 'defaultAgentRule' | 'isActive'>) =>
    code
      ? api<EnquiryTypesData>(`/sales/settings/enquiry-types/${encodeURIComponent(code)}`, { method: 'PUT', body: input })
      : api<EnquiryTypesData>('/sales/settings/enquiry-types', { method: 'POST', body: input }),
  addSource: (name: string) => api<EnquiryTypesData>('/sales/settings/enquiry-sources', { method: 'POST', body: { name } }),
  exclusions: (query: { q?: string; branch?: string; state?: string }) => api<ExclusionsData>('/sales/settings/excluded-items', { query }),
  addExclusion: (input: { itemCode: string; branchCode: string; reason: string; fromDate?: string; untilDate?: string }) =>
    api<ExclusionsData>('/sales/settings/excluded-items', { method: 'POST', body: input }),
  removeExclusion: (id: string) => api<ExclusionsData>(`/sales/settings/excluded-items/${id}/remove`, { method: 'POST' }),
  templates: () => api<{ items: EmailTemplateRow[]; variables: string[] }>('/sales/settings/email-templates'),
  saveTemplate: (key: string, input: { subject: string; body: string; attachPdf: boolean; copyAgent: boolean }) =>
    api<{ items: EmailTemplateRow[]; variables: string[] }>(`/sales/settings/email-templates/${key}`, { method: 'PUT', body: input }),
  newTemplate: (input: { name: string; description?: string }) =>
    api<{ items: EmailTemplateRow[]; variables: string[]; key: string }>('/sales/settings/email-templates', { method: 'POST', body: input }),
  previewTemplate: (key: string, draft: { subject?: string; body?: string }) =>
    api<EmailPreview>(`/sales/settings/email-templates/${key}/preview`, { method: 'POST', body: draft, silent: true }),
  sendTest: (key: string) => api<{ sentTo: string }>(`/sales/settings/email-templates/${key}/test`, { method: 'POST' }),
}

type ReportQuery = Record<string, string | undefined>

export const salesReportsApi = {
  byCustomer: (query: { period?: string; branch?: string; agent?: string; group?: string }) => api<SalesByCustomerReport>('/sales/reports/by-customer', { query }),
  byItem: (query: ReportQuery) => api<SalesByItemReport>('/sales/reports/by-item', { query }),
  openOrders: (query: ReportQuery) => api<OpenOrdersReport>('/sales/reports/open-orders', { query }),
  quotationConversion: (query: ReportQuery) => api<QuotationConversionReport>('/sales/reports/quotation-conversion', { query }),
  customerAging: (query: ReportQuery) => api<CustomerAgingReport>('/sales/reports/customer-aging', { query }),
  paidOrders: (query: ReportQuery) => api<PaidOrdersReport>('/sales/reports/paid-orders', { query }),
  invoiceRegister: (query: ReportQuery) => api<InvoiceRegisterReport>('/sales/reports/invoice-register', { query }),
  eInvoiceStatus: (query: ReportQuery) => api<EInvoiceStatusReport>('/sales/reports/e-invoice-status', { query }),
}

/** Dev only: stands in for Finance recording a receipt (fin_receipt_stub), so deposit flows can be tried. */
export const devFinanceApi = {
  recordReceipt: (input: { appliesToType: 'PROFORMA' | 'INVOICE'; appliesToNo: string; customerCode: string; amount: string }) =>
    api<{ receiptNo: string; amount: string }>('/dev/finance/receipts', { method: 'POST', body: input }),
}

/** Files on a Sales document: uploaded straight onto the document (proof of delivery, photos). */
export const salesFilesApi = {
  upload: (file: File, kind: string, entityType: string, entityId: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    form.append('entityType', entityType)
    form.append('entityId', entityId)
    return api<{ id: string; fileName: string; mimeType: string; downloadUrl: string }>('/attachments', { method: 'POST', body: form })
  },
}

export const salesApprovalsApi = {
  list: (status: 'waiting' | 'approved' | 'rejected') => api<InboxList>('/sales/approvals', { query: { status } }),
  get: (id: string) => api<InboxDetail>(`/sales/approvals/${id}`),
  approve: (id: string, comment: string) => api<{ outcome: string; docNo: string }>(`/sales/approvals/${id}/approve`, { method: 'POST', body: { comment } }),
  reject: (id: string, comment: string) => api<{ outcome: string; docNo: string }>(`/sales/approvals/${id}/reject`, { method: 'POST', body: { comment } }),
}

export const salesLookupsApi = {
  customers: (q: string) => api<{ items: CustomerOption[] }>('/sales/lookups/customers', { query: { q } }),
  items: (query: { q?: string; customerCode?: string; branchCode?: string; group?: string; sellableOnly?: string }) =>
    api<ItemSearchResult>('/sales/lookups/items', { query }),
  agents: () => api<{ items: { code: string; name: string; branchCodes: string[] }[] }>('/sales/lookups/agents'),
  branches: () => api<{ items: { code: string; name: string }[] }>('/sales/lookups/branches'),
  enquiryTypes: () => api<{ types: EnquiryTypeOption[]; sources: { code: string; name: string }[] }>('/sales/lookups/enquiry-types'),
  /** Vouchers an order of this date may take (phase 5); nothing while the company does not control them. */
  vouchers: (date?: string, orderId?: string) => api<{ items: VoucherOption[] }>('/sales/lookups/vouchers', { query: { date, orderId } }),
  packages: (date?: string) => api<{ date: string; items: PackageOption[] }>('/sales/lookups/packages', { query: { date } }),
}

/** Phase 5 · a new household customer from the sales order (S11) — /api/v1/sales/customers. Core makes it. */
export const salesCustomersApi = {
  add: (input: NewCustomerInput) => api<CustomerOption>('/sales/customers', { method: 'POST', body: input }),
}

/** Phase 5 · official receipts (S35, S36) — /api/v1/sales/receipts. Account verifies them against the bank. */
export const salesReceiptsApi = {
  list: (query: ListQuery & { order?: string }) => api<ListResponse<ReceiptRow> & { waitingAmount: string }>('/sales/receipts', { query }),
  get: (id: string) => api<ReceiptDetail>(`/sales/receipts/${id}`),
  create: (body: ReceiptInput & { salesOrderId: string }) => api<ReceiptDetail>('/sales/receipts', { method: 'POST', body }),
  update: (id: string, body: ReceiptInput & { version: number }) => api<ReceiptDetail>(`/sales/receipts/${id}`, { method: 'PATCH', body }),
  cancel: (id: string, version: number, reason: string) => api<ReceiptDetail>(`/sales/receipts/${id}/cancel`, { method: 'POST', body: { version, reason } }),
  verify: (id: string, version: number, reference: string) => api<ReceiptDetail>(`/sales/receipts/${id}/verify`, { method: 'POST', body: { version, reference } }),
  sendBack: (id: string, version: number, reason: string) => api<ReceiptDetail>(`/sales/receipts/${id}/send-back`, { method: 'POST', body: { version, reason } }),
  /** A photo or PDF of the slip, stored first; the receipt's save links it. */
  uploadProof: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'PAYMENT_PROOF')
    return api<{ id: string; fileName: string; mimeType: string; downloadUrl: string }>('/attachments', { method: 'POST', body: form })
  },
}

/** S37 · Vouchers (phase 5). */
export const salesVouchersApi = {
  list: (query: ListQuery) => api<ListResponse<VoucherRow> & { on: boolean; canManage: boolean }>('/sales/vouchers', { query }),
  create: (body: VoucherInput) => api<VoucherRow>('/sales/vouchers', { method: 'POST', body }),
  update: (id: string, body: VoucherInput) => api<VoucherRow>(`/sales/vouchers/${id}`, { method: 'PATCH', body }),
  end: (id: string, version: number) => api<VoucherRow>(`/sales/vouchers/${id}/end`, { method: 'POST', body: { version } }),
  remove: (id: string, version: number) => api<{ deleted: boolean }>(`/sales/vouchers/${id}`, { method: 'DELETE', query: { version } }),
}
