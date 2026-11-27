export type ApprovalKind = 'CREDIT' | 'PRICE' | 'DISCOUNT' | 'REVISION'
export type ChipGroup = 'draft' | 'pending' | 'released' | 'partial' | 'done' | 'cancelled'

/** S01 · the four KPI cards (the charts below them come from the board, api/boards.ts). */
export interface SalesDashboard {
  today: string
  kpis: {
    openOrders: { count: number; total: string; released: number; partial: number }
    toInvoice: { count: number; amount: string; oldestDays: number | null }
    waitingForMe: { count: number; summary: string }
    customersOverdue: { count: number; amount: string }
  }
}

export interface LinkedDoc {
  type: string
  id: string | null
  docNo: string
  summary: string
  status: string | null
  label: string | null
  group: ChipGroup | null
  upstream: boolean
}

export interface ActivityItem {
  id: string
  action: string
  message: string
  comment: string | null
  userCode: string
  userName: string
  at: string
}

// ── Pickers (S04) ───────────────────────────────────────────────────────────

export interface CustomerOption {
  code: string
  name: string
  branchCode: string
  contactName: string | null
  deliveryAddress: string | null
  creditTermDays: number
  priceListCode: string
  creditLimit: string | null
  defaultAgentCode: string | null
}

export type ItemState = 'ACTIVE' | 'OUT_OF_STOCK' | 'EXCLUDED' | 'NOT_FOR_SALE'

export interface SaleItemOption {
  code: string
  name: string
  group: string
  uomCode: string
  type: string
  isBuyToOrder: boolean
  taxCode: string
  taxName: string
  taxRate: string
  listPrice: string | null
  lastSold: { price: string; date: string; docNo: string } | null
  inStock: string | null
  /** Held for booked installations (phase 5): already taken off inStock. */
  heldQty: string | null
  state: ItemState
  reason: string | null
  /** The item's picture in Core, when it has one (phase 5). */
  pictureUrl: string | null
}

export interface ItemSearchResult {
  branchCode: string
  priceListCode: string | null
  items: SaleItemOption[]
  groups: string[]
}

// ── Sales orders (S10, S11, S12) ────────────────────────────────────────────

export type OrderAction = 'edit' | 'delete' | 'requestApproval' | 'release' | 'email' | 'deliver' | 'invoice' | 'proforma' | 'cancelBalance' | 'flow' | 'revise' | 'discardRevision'

export interface OrderListItem {
  id: string
  docNo: string
  docDate: string
  customerName: string
  isBuyToOrder: boolean
  agentName: string
  /** Phase 5: "Pre-order · waiting for stock" or "· stock arrived"; null for other orders. */
  preOrder: { label: string; stockArrived: boolean } | null
  total: string
  orderedQty: string
  deliveredQty: string
  invoicedAmount: string
  status: string
  statusLabel: string
  balanceCancelled: boolean
  credit: string
  overLimit: boolean
  isMigrated: boolean
  version: number
  allowedActions: OrderAction[]
}

export interface CreditSnapshot {
  scope: string
  checkedAt: string
  creditLimit: string | null
  owed: string
  otherOpen: string
  thisDocument: string
  exposureAfter: string
  headroom: string | null
  overCredit: string
  overdue: string
  overdueLimit: string | null
  overOverdue: string
  result: string
}

export interface OrderLine {
  id: string
  lineNo: number
  itemCode: string
  itemName: string
  uomCode: string
  taxCode: string
  taxName: string
  taxRate: string
  listPrice: string | null
  unitPrice: string
  discountPct: string
  orderedQty: string
  deliveredQty: string
  invoicedQty: string
  cancelledQty: string
  balanceQty: string
  grossAmount: string
  discountAmount: string
  amount: string
  taxAmount: string
  isBuyToOrder: boolean
  purchaseOrderNo: string | null
  purchase: BuyToOrderStatus | null
  /** ITEM, PACKAGE (an item of a package) or GIFT (phase 5). */
  lineKind: 'ITEM' | 'PACKAGE' | 'GIFT'
  package: OrderLinePackage | null
}

/** A voucher on a sales order (phase 5): typed number, amount off before tax, the tax it lowers. */
export interface OrderVoucher {
  voucherNo: string
  description: string
  amount: string
  taxCode: string
  taxName: string
  taxAmount: string
  /** The invoice that used it (orders only). */
  invoiceNo?: string | null
}

/** The package a line belongs to: lines of one package share its group. */
export interface OrderLinePackage {
  group: number
  code: string
  name: string
  qty: string
  price: string
  uomCode: string
  /** What the package includes and its warranty, as they were when the order was saved; printed on the order. */
  terms: string | null
}

/** A running package for Add package on the order form (phase 5). */
/** A voucher an order may take from the list (phase 5). */
export interface VoucherOption {
  voucherNo: string
  description: string
  amount: string
  validUntil: string | null
  /** Orders that may still use it; null for no limit. */
  left: number | null
}

/** S37 · a voucher on the list (phase 5). */
/** S38 · Sales targets (phase 5): a branch's month and its salespeople's share. */
export interface TargetBranch {
  code: string
  name: string
  amount: string | null
  /** The branch-month's version (0 before anything was set) */
  version: number
  allocated: string
  left: string | null
  over: boolean
  agents: { code: string; name: string; amount: string | null }[]
}

export interface SalesTargets {
  month: string
  monthText: string
  canManage: boolean
  branches: TargetBranch[]
}

export interface VoucherRow {
  id: string
  voucherNo: string
  description: string
  amount: string
  validFrom: string
  validUntil: string | null
  maxUses: number | null
  uses: number
  usesText: string
  status: 'SCHEDULED' | 'RUNNING' | 'USED_UP' | 'ENDED'
  statusLabel: string
  version: number
  allowedActions: ('edit' | 'end' | 'delete')[]
}
export interface VoucherInput {
  voucherNo: string
  description: string
  amount: string
  validFrom: string
  validUntil: string | null
  maxUses: number | null
  version?: number
}

export interface PackageOption {
  code: string
  name: string
  uomCode: string
  price: string
  giftRule: 'NONE' | 'ALWAYS' | 'CHOOSE_ONE'
  taxCode: string
  taxName: string
  taxRate: string
  normalValue: string | null
  saves: string | null
  runsUntil: string | null
  /** The tab it shows under (Core › Reference lists › Package categories). */
  category: string | null
  /** What it includes and its warranty terms, as customers read them. */
  terms: string | null
  pictureUrl: string | null
  items: { itemCode: string; itemName: string; qty: string; uomCode: string; unitPrice: string | null }[]
  gifts: { itemCode: string; itemName: string; qty: string; uomCode: string }[]
  problem: string | null
}

/** Where a buy-to-order line stands with Purchase (from Purchase's events). */
export interface BuyToOrderStatus {
  state: 'WAITING_PO' | 'NO_PO' | 'ON_ORDER' | 'PART_RECEIVED' | 'RECEIVED' | 'PO_CANCELLED'
  label: string
}

export interface SaleTotals {
  subtotal: string
  discountTotal: string
  /** Order vouchers off, before tax (sales orders and invoices, phase 5). */
  voucherTotal?: string
  taxLines: { code: string; name: string; amount: string }[]
  rounding: string
  total: string
}

export interface OrderDetail {
  id: string
  docNo: string
  revision: number
  docDate: string
  status: string
  statusLabel: string
  balanceCancelled: boolean
  isMigrated: boolean
  version: number
  customer: { code: string; name: string; active: boolean }
  contactName: string | null
  branch: { code: string; name: string }
  agent: { code: string; name: string }
  warehouseCode: string
  deliveryWantedBy: string | null
  promisedDate: string | null
  currency: string
  taxMode: string
  creditTermDays: number
  priceList: { code: string; name: string }
  customerPoRef: string | null
  project: string | null
  deliveryAddress: string | null
  /** Phase 5: kept with the installation option, for the installer's address. */
  deliveryPostcode: string | null
  deliveryState: string | null
  /** Phase 5: this order's own phone, billing, and how the customer will pay. Empty: the customer's / not said. */
  contactPhone: string | null
  billingName: string | null
  billingAddress: string | null
  paymentMode: PaymentMode | null
  paymentModeLabel: string | null
  paymentMethod: OrderPaymentMethod | null
  paymentMethodLabel: string | null
  orderTypeCode: string
  quotation: { id: string; no: string } | null
  enquiryNo: string | null
  lines: OrderLine[]
  totals: SaleTotals
  vouchers: OrderVoucher[]
  installation: OrderInstallation
  /** Revisions (phase 5): the one in draft, why the order cannot be revised now, and the earlier ones kept read-only. */
  revisions: OrderRevisions
  /** The installer's booking, from Service (phase 5). */
  installBooking: string | null
  /** Pre-order (phase 5): short stock made the whole order a pre-order. */
  preOrder: { switchOn: boolean; isPreOrder: boolean; shortAtRelease: string | null; label: string | null; stockArrived: boolean; willBe: boolean }
  /** Share on WhatsApp (phase 5): the customer's number (null: pick the chat in WhatsApp) and the message; null when it is not offered. */
  share: { number: string | null; text: string } | null
  quantities: { ordered: string; delivered: string; uomCode: string }
  credit: { result: string | null; snapshot: CreditSnapshot | null; live: boolean; needsApproval: boolean; blocked: boolean; approverRole: string | null }
  /** Official receipts (phase 5): null while the company does not use them. */
  payments: OrderPayments | null
  /** The price range (phase 5): lines priced outside it need the Sales Manager before release. */
  price: {
    rangeOn: boolean
    range: PriceRangeSetting | null
    outside: number
    reason: string | null
    lineIds: string[]
    needsApproval: boolean
  }
  approval: {
    state: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
    reason: string | null
    note: string | null
    requestedBy: string | null
    requestedAt: string | null
    waitingFor: string | null
    decidedBy: string | null
    decidedAt: string | null
    comment: string | null
  }
  stock: { draftWarning: string | null; releaseNote: string | null; inventoryConnected: boolean }
  releasedAt: string | null
  releasedByName: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: OrderAction[]
}

export interface OrderLineInput {
  itemCode: string
  qty: string
  unitPrice: string
  discountPct?: string
}

export interface OrderInput {
  customerCode: string
  docDate?: string
  deliveryWantedBy?: string | null
  contactName?: string
  customerPoRef?: string
  project?: string
  deliveryAddress?: string
  /** An item with its price, or a package (phase 5) with whole sets and the chosen gift. */
  lines: (OrderLineInput | { packageCode: string; qty: string; giftItemCode: string | null })[]
  vouchers?: { voucherNo: string; amount: string; description?: string; taxCode?: string | null }[]
  installOption?: InstallOption | null
  installDate?: string | null
  deliveryPostcode?: string | null
  deliveryState?: string | null
}

/** Phase 5: sales order revisions under the same number. */
export interface OrderRevisions {
  number: number
  switchOn: boolean
  inRevision: boolean
  reason: string | null
  since: string | null
  /** What the revision in draft changes so far, in plain words. */
  changes: string[]
  needsApproval: boolean
  approvalReason: string | null
  /** Why a released order cannot be revised now. */
  notRevisable: string | null
  history: {
    revisionNo: number
    reason: string
    revisedBy: string
    revisedAt: string
    replacedAt: string | null
    changes: string | null
    total: string
    lines: { lineNo: number; itemCode: string; itemName: string; uomCode: string; qty: string; unitPrice: string; discountPct: string; amount: string }[]
  }[]
}

/** Phase 5: installation, delivery only or collect, asked when the company turns it on (S34). */
export type InstallOption = 'INSTALLATION' | 'DELIVERY' | 'COLLECT'
/** The install site on a sales order (phase 5): the same codes as Service's job. */
export type SiteType = 'LANDED' | 'CONDO' | 'COMMERCIAL'
/** How the customer will pay (phase 5); official receipts still decide what is paid. */
export type PaymentMode = 'PAID' | 'COD' | 'LATER'
export type OrderPaymentMethod = 'CASH' | 'TRANSFER' | 'DUITNOW' | 'CARD' | 'CARD_EPP' | 'CHEQUE'
/** A job category from Service (its slot groups): the salesperson picks one with the installation. */
export interface JobCategoryOption {
  code: string
  name: string
  minutes: number
  jobTypes: string[]
  siteTypes: SiteType[]
}
export interface OrderInstallation {
  asked: boolean
  option: InstallOption | null
  optionLabel: string | null
  preferredDate: string | null
  /** The install site (landed house, condo / apartment, shop / office), given to the job (phase 5). */
  siteType: SiteType | null
  siteTypeLabel: string | null
  /** The job category (a Service slot group code), given to the job (phase 5). */
  jobCategory: string | null
  /** Some items are short: installation is arranged when stock arrives. */
  afterStock: boolean
  /** A draft installation whose items are all in stock needs the date before release. */
  dateNeeded: boolean
  text: string | null
}

// ── Approvals (S02) ─────────────────────────────────────────────────────────

export interface InboxCard {
  id: string
  entityType: string
  entityId: string
  docNo: string
  title: string
  customerName: string
  reason: string
  kind: ApprovalKind
  kindLabel: string
  amount: string | null
  requestedByName: string
  requestedAt: string
  myDecision: string | null
}

export interface InboxList {
  items: InboxCard[]
  counts: { waiting: number; approved: number; rejected: number }
  recentDecisions: { requestId: string; docNo: string; reason: string; decision: string; decidedAt: string }[]
}

export interface CreditPanel {
  type: 'CREDIT'
  orderId: string
  customerName: string
  owedNow: string
  over60: string
  otherOpen: string
  thisOrder: string
  exposureAfter: string
  creditLimit: string | null
  overdue: string
  overdueLimit: string | null
  lastPayment: { amount: string; date: string } | null
  history: { docNo: string; total: string; paid: string }[]
  lastCreditApproval: string | null
}

export interface PricePanel {
  type: 'PRICE'
  customerName: string
  total: string
  lines: { itemCode: string; itemName: string; qty: string; uomCode: string; unitPrice: string; listPrice: string | null; belowPct: string | null; abovePct?: string | null; amount: string }[]
}

export interface DiscountPanel {
  type: 'DISCOUNT'
  customerName: string
  total: string
  marginPct: string | null
  lines: { itemCode: string; itemName: string; qty: string; uomCode: string; unitPrice: string; discountPct: string; amount: string }[]
}

export interface InboxDetail extends InboxCard {
  status: string
  requesterNote: string | null
  canDecide: boolean
  decision: { byName: string | null; at: string | null; comment: string | null; status: string } | null
  panel: CreditPanel | PricePanel | DiscountPanel
}

// ── Enquiries (S06, S07) ────────────────────────────────────────────────────

export type EnquiryAction = 'edit' | 'delete' | 'forward' | 'createQuotation' | 'markLost'

export interface EnquiryListItem {
  id: string
  docNo: string
  docDate: string
  customerName: string
  isProspect: boolean
  contactName: string | null
  status: string
  statusLabel: string
  agentName: string
  typeName: string
  sourceName: string
  branchName: string
  budget: string | null
  quotation: { no: string; id: string | null } | null
  isMigrated: boolean
  version: number
  canDelete: boolean
}

export interface EnquiryTypeDetail {
  label: string
  kind: 'TEXT' | 'CHOICE' | 'FILE' | 'NUMBER' | 'DATE'
  required: boolean
  choices?: string[]
}

export interface EnquiryTypeOption {
  code: string
  name: string
  details: EnquiryTypeDetail[]
}

export interface CustomerCardData {
  code: string
  name: string
  status: string
  category: string | null
  area: string | null
  creditTermDays: number
  creditLimit: string | null
  owedNow: string
  priceList: string
  defaultAgent: string | null
  branchCode: string
  contactName: string | null
  phone: string | null
  email: string | null
}

export interface EnquiryDetail {
  id: string
  docNo: string
  docDate: string
  status: string
  statusLabel: string
  isMigrated: boolean
  version: number
  isProspect: boolean
  customerCode: string | null
  customerName: string
  contactName: string | null
  phone: string | null
  email: string | null
  branch: { code: string; name: string }
  enquiryTypeCode: string
  typeName: string
  sourceCode: string
  sourceName: string
  agent: { code: string; name: string }
  budget: string | null
  neededBy: string | null
  customerRef: string | null
  description: string | null
  details: Record<string, string>
  items: { lineNo: number; itemCode: string; itemName: string; uomCode: string; qty: string; remarks: string | null }[]
  quotation: { id: string; no: string } | null
  lostReason: string | null
  customerCard: CustomerCardData | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: EnquiryAction[]
}

export interface EnquiryInput {
  isProspect?: boolean
  customerCode?: string
  prospectName?: string
  branchCode?: string
  contactName?: string
  phone?: string
  email?: string
  docDate?: string
  enquiryTypeCode?: string
  sourceCode?: string
  agentCode?: string
  budget?: string | null
  neededBy?: string | null
  customerRef?: string
  description?: string
  details?: Record<string, string>
  items?: { itemCode: string; qty: string; remarks?: string }[]
  forward?: boolean
}

// ── Quotations (S08, S09) ───────────────────────────────────────────────────

export type QuotationAction = 'edit' | 'delete' | 'requestApproval' | 'release' | 'email' | 'revise' | 'transfer' | 'markLost'

export interface QuotationListItem {
  id: string
  docNo: string
  revision: number
  docDate: string
  validUntil: string | null
  customerName: string
  agentName: string
  total: string
  salesOrder: { no: string; id: string | null } | null
  status: string
  label: string
  expired: boolean
  isMigrated: boolean
  version: number
  allowedActions: QuotationAction[]
}

export interface QuotationLine {
  id: string
  lineNo: number
  itemCode: string
  itemName: string
  uomCode: string
  taxCode: string
  taxName: string
  taxRate: string
  qty: string
  listPrice: string | null
  unitPrice: string
  discountPct: string
  grossAmount: string
  discountAmount: string
  amount: string
  taxAmount: string
  lastSold: { price: string; date: string; docNo: string } | null
}

export interface QuotationDetail {
  id: string
  docNo: string
  revision: number
  docDate: string
  validUntil: string | null
  status: string
  label: string
  expired: boolean
  isMigrated: boolean
  version: number
  customer: { code: string; name: string; active: boolean; email: string | null }
  contactName: string | null
  agent: { code: string; name: string }
  branch: { code: string; name: string }
  currency: string
  taxMode: string
  creditTermDays: number
  priceList: { code: string; name: string }
  customerNote: string | null
  internalNote: string | null
  enquiry: { id: string; no: string } | null
  enquiryItems: { itemCode: string; itemName: string; qty: string; uomCode: string }[]
  salesOrder: { id: string | null; no: string } | null
  lostReason: string | null
  lines: QuotationLine[]
  totals: SaleTotals
  marginPct: string | null
  discount: { over: boolean; highest: string; limitPct: string }
  /** The company's price rule (phase 5): the discount limit, or the range around the price list. */
  priceCheck: PriceCheck
  creditWarning: string | null
  approval: { state: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string | null; waitingFor: string | null; decidedBy: string | null; comment: string | null }
  revisions: { id: string; revision: number; status: string; docDate: string; total: string }[]
  attachments: { id: string; fileName: string; mimeType: string; kind: string; downloadUrl: string }[]
  releasedAt: string | null
  emailedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: QuotationAction[]
}

export interface QuotationInput {
  customerCode: string
  docDate?: string
  validUntil?: string | null
  contactName?: string
  customerNote?: string
  internalNote?: string
  enquiryId?: string
  lines: OrderLineInput[]
}

// ── Delivery orders (S15, S16) ──────────────────────────────────────────────

export type DeliveryAction = 'edit' | 'delete' | 'requestApproval' | 'confirm' | 'attach' | 'collect' | 'checkIn' | 'sign' | 'refuse' | 'acceptUnsigned' | 'returnRefusal'
export type WaitingState = 'READY' | 'NO_STOCK' | 'PURCHASE' | 'DEPOSIT'

export interface DeliveryOverview {
  kpis: {
    waiting: { orders: number; units: string }
    dueSoon: { orders: number; orderNos: string[] }
    drafts: { count: number; docNos: string[] }
    deliveredThisMonth: { units: string; deliveries: number }
  }
  waiting: {
    orderId: string
    orderNo: string
    customerName: string
    lineNo: number
    itemCode: string
    itemName: string
    uomCode: string
    balance: string
    wantedBy: string | null
    onHand: string
    isBuyToOrder: boolean
    purchaseOrderNo: string | null
    purchase: BuyToOrderStatus | null
    state: WaitingState
    proforma: { docNo: string; amount: string } | null
    draft: { id: string; docNo: string } | null
  }[]
  inventoryConnected: boolean
}

export interface DeliveryListItem {
  id: string
  docNo: string
  branchCode: string
  docDate: string
  customerName: string
  salesOrderId: string | null
  salesOrderNo: string
  qty: string
  vehicle: string | null
  driver: string | null
  consignmentNote: string | null
  status: string
  statusLabel: string
  isMigrated: boolean
  version: number
}

export interface DeliveryDetail {
  id: string
  docNo: string
  docDate: string
  status: 'DRAFT' | 'CONFIRMED'
  statusLabel: string
  /** The customer's signature (phase 5); null where the steps do not apply. */
  signature: {
    state: 'TO_COLLECT' | 'COLLECTED' | 'REFUSED' | 'DELIVERED'
    collectedAt: string | null
    collectedByName: string | null
    signedAt: string | null
    signerName: string | null
    refusedAt: string | null
    refusedByName: string | null
    refuseReason: string | null
    refuseReturned: string | null
    unsignedByName: string | null
  } | null
  isMigrated: boolean
  version: number
  customer: { code: string; name: string }
  branchCode: string
  warehouseCode: string
  vehicle: string | null
  driver: string | null
  consignmentNote: string | null
  deliverTo: string | null
  receiver: string | null
  warehouseNote: string | null
  order: { id: string | null; no: string; status: string | null; wantedBy: string | null; agentName: string | null; ordered: string; deliveredAfter: string; pct: number; leftAfter: string }
  lines: { id: string; lineNo: number; itemCode: string; itemName: string; uomCode: string; orderedQty: string; deliveredBeforeQty: string; balanceQty: string; qty: string; leftAfterQty: string; inStock: string }[]
  depositHold: { proformaNo: string; amount: string } | null
  credit: {
    result: string | null
    snapshot: CreditSnapshot | null
    live: boolean
    warning: CreditSnapshot | null
    needsApproval: boolean
    blocked: boolean
    approverRole: string | null
  }
  approval: { state: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string | null; waitingFor: string | null; decidedBy: string | null; comment: string | null }
  attachments: { id: string; fileName: string; mimeType: string; kind: string | null; downloadUrl: string }[]
  inventoryConnected: boolean
  confirmedAt: string | null
  confirmedByName: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: DeliveryAction[]
}

export interface DeliveryInput {
  version: number
  docDate?: string
  vehicle?: string
  driver?: string
  consignmentNote?: string
  deliverTo?: string
  receiver?: string
  warehouseNote?: string
  lines?: { lineNo: number; qty: string }[]
}

// ── Invoices (S17–S20) ──────────────────────────────────────────────────────

export type InvoiceAction = 'edit' | 'delete' | 'requestApproval' | 'release' | 'email' | 'print' | 'debitNote' | 'return'
export type PaymentKey = 'DRAFT' | 'PENDING' | 'UNPAID' | 'OVERDUE' | 'PAID'

export interface InvoiceListItem {
  id: string
  docNo: string
  docDate: string
  kind: 'FROM_ORDER' | 'DIRECT'
  salesOrderId: string | null
  salesOrderNo: string | null
  customerName: string
  total: string
  balance: string
  dueDate: string | null
  payment: { key: PaymentKey; label: string }
  accounts: 'QUEUED' | 'POSTED' | 'OLD_SYSTEM' | null
  eInvoice: 'PENDING' | 'SUBMITTED' | null
  isMigrated: boolean
  version: number
}

export interface InvoiceKpis {
  balanceDue: { amount: string; invoices: number }
  overdue: { amount: string; customers: number }
  financeWaiting: number
  eInvoicePending: number
}

export interface InvoiceCandidates {
  customer: { code: string; name: string; creditTermDays: number; status: string }
  orders: {
    id: string
    docNo: string
    docDate: string
    status: string
    canInvoiceQty: string
    summary: string
    detail: string
    customerPoRef: string | null
    agentName: string
    creditTermDays: number
    deliveries: { id: string; no: string }[]
    lines: {
      soLineId: string
      lineNo: number
      itemCode: string
      itemName: string
      uomCode: string
      orderedQty: string
      deliveredQty: string
      invoicedQty: string
      canInvoiceQty: string
      unitPrice: string
      discountPct: string
      taxCode: string
      taxName: string
      taxRate: string
    }[]
  }[]
  earlierInvoices: { docNo: string; docDate: string; total: string; state: string; isMigrated: boolean }[]
}

export interface InvoiceLine {
  id: string
  lineNo: number
  soLineId: string | null
  itemCode: string
  itemName: string
  uomCode: string
  qty: string
  listPrice: string | null
  unitPrice: string
  discountPct: string
  taxCode: string
  taxName: string
  taxRate: string
  grossAmount: string
  discountAmount: string
  amount: string
  taxAmount: string
  belowListPct: string | null
  canInvoiceQty: string | null
  orderLine: { orderedQty: string; deliveredQty: string; invoicedQty: string } | null
}

export interface InvoiceDetail {
  id: string
  docNo: string
  docDate: string
  kind: 'FROM_ORDER' | 'DIRECT'
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'RELEASED'
  isMigrated: boolean
  version: number
  payment: { key: PaymentKey; label: string }
  customer: { code: string; name: string; tin: string | null; email: string | null; deliveryAddress: string | null }
  billTo: string | null
  contactName: string | null
  branch: { code: string; name: string }
  agent: { code: string; name: string }
  creditTermDays: number
  dueDate: string | null
  currency: string
  taxMode: string
  customerPoRef: string | null
  note: string | null
  order: { id: string | null; no: string; ordered: string | null } | null
  deliveries: { id: string | null; no: string }[]
  lines: InvoiceLine[]
  totals: SaleTotals
  vouchers: OrderVoucher[]
  amounts: {
    total: string
    credited: string
    creditedBy: { id: string; no: string }[]
    debited: string
    deposit: string
    proformaNo: string | null
    pendingDeposit: { proformaNo: string; amount: string } | null
    paid: string
    balance: string
  }
  payments: { receiptNo: string; date: string; amount: string; method: string; note: string | null }[]
  posting: { accounts: 'QUEUED' | 'POSTED' | 'OLD_SYSTEM' | null; eInvoice: 'PENDING' | 'SUBMITTED' | null }
  checks: {
    priceBelowList: { count: number; highestPct: number } | null
    /** Why the prices need the Sales Manager: below the list, or outside the range (phase 5). */
    priceReason: string | null
    credit: { action: string; snapshot: CreditSnapshot } | null
    creditBlocked: boolean
    needsApproval: boolean
    needsPrice: boolean
    needsCredit: boolean
  }
  approval: { state: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string | null; note: string | null; requestedBy: string | null; waitingFor: string | null; decidedBy: string | null; comment: string | null }
  print: { companyName: string; amountInWords: string }
  releasedAt: string | null
  emailedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: InvoiceAction[]
}

// ── Proformas (S21, S22) ────────────────────────────────────────────────────

export type ProformaAction = 'edit' | 'delete' | 'release' | 'email' | 'cancel'
export type ProformaStatus = 'DRAFT' | 'SENT' | 'PAID' | 'USED' | 'CANCELLED'
export type ProformaRequestKind = 'DEPOSIT_PCT' | 'PAY_BEFORE_RELEASE'

export interface ProformaListItem {
  id: string
  docNo: string
  docDate: string
  customerName: string
  salesOrderId: string | null
  salesOrderNo: string
  request: string
  amount: string
  received: string | null
  status: ProformaStatus
  label: string
  usedOnInvoice: string | null
  isMigrated: boolean
  version: number
}

export interface ProformaKpis {
  requested: { amount: string; count: number }
  received: { amount: string; count: number }
  waiting: { amount: string; docs: { docNo: string; status: string }[] }
}

export interface ProformaDetail {
  id: string
  docNo: string
  branchCode: string
  docDate: string
  status: ProformaStatus
  label: string
  isMigrated: boolean
  version: number
  customer: { code: string; name: string }
  attention: string | null
  agent: { code: string; name: string }
  order: { id: string | null; no: string; status: string | null }
  payBy: string | null
  currency: string
  requestKind: ProformaRequestKind
  depositPct: string | null
  request: string
  orderValue: { subtotal: string; tax: string; total: string; taxName: string }
  amount: string
  received: string
  receipts: { receiptNo: string; date: string; amount: string; method: string }[]
  usedOnInvoice: string | null
  usedAt: string | null
  note: string | null
  lines: { lineNo: number; itemCode: string; itemName: string; uomCode: string; qty: string; unitPrice: string; discountPct: string; taxName: string; amount: string }[]
  otherProformas: { id: string; docNo: string; docDate: string; amount: string; label: string }[]
  releasedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: ProformaAction[]
}

// ── Cancel orders (S13, S14) ────────────────────────────────────────────────

export type CancelAction = 'edit' | 'delete' | 'release'

export interface CancelListItem {
  id: string
  docNo: string
  docDate: string
  salesOrderId: string | null
  salesOrderNo: string
  customerName: string
  summary: string | null
  total: string
  reason: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
}

export interface CancelOpenOrder {
  id: string
  docNo: string
  customerName: string
  open: string
  promisedDate: string | null
  waitingFor: string
  linkedToPo: boolean
}

export interface CancelOrderLines {
  id: string
  no: string
  status: string | null
  customer: { code: string; name: string }
  contactName: string | null
  total: string
  invoiced: string
  lines: {
    soLineId: string
    lineNo: number
    itemCode: string
    itemName: string
    uomCode: string
    unitPrice: string
    discountPct: string
    taxRate: string
    orderedQty: string
    deliveredQty: string
    invoicedQty: string
    cancelledQty: string
    balanceQty: string
    isBuyToOrder: boolean
    purchaseOrderNo: string | null
  }[]
}

export interface CancelDetail {
  id: string
  docNo: string
  branchCode: string
  docDate: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
  reason: string
  askedBy: string | null
  customerRef: string | null
  note: string | null
  summary: string | null
  total: string
  order: CancelOrderLines
  lines: {
    id: string
    lineNo: number
    soLineId: string | null
    itemCode: string
    itemName: string
    uomCode: string
    orderedQty: string
    deliveredQty: string
    invoicedQty: string
    balanceQty: string
    cancelQty: string
    amount: string
    taxAmount: string
    linkedPo: string | null
  }[]
  recent: { id: string; docNo: string; docDate: string; salesOrderNo: string; customerName: string; qty: string; reason: string; status: string }[]
  reasons: string[]
  releasedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: CancelAction[]
}

// ── Sales returns (S27, S28) ────────────────────────────────────────────────

export type ReturnAction = 'edit' | 'delete' | 'release' | 'attach'

export interface ReturnListItem {
  id: string
  docNo: string
  docDate: string
  customerName: string
  invoiceId: string | null
  invoiceNo: string
  summary: string | null
  reason: string
  goodsTo: 'DAMAGED' | 'STOCK'
  goodsToLabel: string
  total: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
}

export interface ReturnKpis {
  credited: { amount: string; count: number }
  drafts: { count: number; first: string | null }
  topReason: { reason: string; units: string; of: string } | null
  creditNotesQueued: number
  wentTo: { label: string; units: string }[]
}

export interface ReturnLocationOption {
  key: string
  goodsTo: 'DAMAGED' | 'STOCK'
  warehouseCode: string
  locationCode: string
  label: string
  placeName: string
}

export interface ReturnInvoiceView {
  id: string | null
  no: string
  docDate: string | null
  isMigrated: boolean
  salesOrderNo: string | null
  customer: { code: string; name: string; active: boolean }
  total: string
  paid: string
  balance: string
  locations: ReturnLocationOption[]
  lines: {
    invoiceLineId: string
    lineNo: number
    itemCode: string
    itemName: string
    uomCode: string
    invoicedQty: string
    returnedQty: string
    maxQty: string
    unitPrice: string
    discountPct: string
    grossPrice: string
    taxRate: string
  }[]
}

export interface ReturnDetail {
  id: string
  docNo: string
  branchCode: string
  docDate: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
  reason: string
  goodsTo: 'DAMAGED' | 'STOCK'
  location: string | null
  locationLabel: string
  creditMethod: 'CREDIT_NOTE' | 'REFUND'
  customerRef: string | null
  note: string | null
  summary: string | null
  totals: { subtotal: string; tax: string; total: string }
  invoice: ReturnInvoiceView
  lines: { id: string; lineNo: number; invoiceLineId: string | null; itemCode: string; itemName: string; uomCode: string; invoicedQty: string; returnedBeforeQty: string; maxQty: string; qty: string; unitPrice: string; amount: string; taxAmount: string }[]
  checks: { key: string; ok: boolean; text: string }[]
  attachments: { id: string; fileName: string; mimeType: string; downloadUrl: string }[]
  reasons: string[]
  creditMethods: { value: string; label: string }[]
  releasedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: ReturnAction[]
}

// ── Debit notes (S25, S26) ──────────────────────────────────────────────────

export type DebitNoteAction = 'edit' | 'delete' | 'release'

export interface DebitListItem {
  id: string
  docNo: string
  docDate: string
  customerName: string
  invoiceId: string | null
  invoiceNo: string
  reason: string
  summary: string | null
  total: string
  eInvoice: 'PENDING' | 'SUBMITTED' | 'OLD_SYSTEM' | null
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
}

export interface DebitInvoiceView {
  id: string | null
  invoiceId: string | null
  no: string
  branchCode: string
  dueDate: string | null
  customer: { code: string; name: string }
  balance: string
  debitNotes: { id: string; docNo: string; docDate: string; reason: string; total: string; status: string; isMigrated: boolean }[]
}

export interface DebitDetail {
  id: string
  docNo: string
  branchCode: string
  docDate: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
  reason: string
  summary: string | null
  note: string | null
  dueDate: string | null
  totals: { subtotal: string; tax: string; total: string; taxLines: { code: string; name: string; amount: string }[] }
  invoice: DebitInvoiceView
  lines: { id: string; lineNo: number; itemCode: string; itemName: string; uomCode: string; taxCode: string; taxName: string; taxRate: string; qty: string; unitPrice: string; amount: string; taxAmount: string }[]
  reasons: string[]
  releasedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: DebitNoteAction[]
}

// ── Cash sales (S23, S24) ───────────────────────────────────────────────────

export type CashSaleAction = 'edit' | 'delete' | 'release'
export type PaymentMethod = 'CASH' | 'CARD' | 'DUITNOW' | 'TRANSFER'

export interface CashListItem {
  id: string
  docNo: string
  docDate: string
  buyer: string
  summary: string | null
  paidBy: string
  total: string
  eInvoice: string
  ownPending: boolean
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
}

export interface CashKpis {
  today: { amount: string; count: number; drafts: string[] }
  month: { amount: string; count: number; name: string }
  paidBy: { method: string; label: string; pct: number }[]
  consolidated: { count: number; due: string }
}

export interface CashSaleDetail {
  id: string
  docNo: string
  docDate: string
  status: 'DRAFT' | 'RELEASED'
  isMigrated: boolean
  version: number
  counterName: string | null
  customer: { code: string; name: string }
  servedBy: { code: string; name: string }
  buyerName: string | null
  buyerPhone: string | null
  buyerTin: string | null
  ownEInvoice: boolean
  eInvoice: string
  consolidatedDue: string | null
  taxMode: string
  branchCode: string
  warehouseCode: string
  paymentMethod: PaymentMethod
  paymentRef: string | null
  amountReceived: string
  change: string
  balance: string
  lines: { id: string; lineNo: number; itemCode: string; itemName: string; uomCode: string; taxCode: string; taxName: string; taxRate: string; qty: string; unitPrice: string; discountPct: string; amount: string; taxAmount: string }[]
  totals: { beforeTax: string; tax: string; taxName: string; rounding: string; total: string }
  stockWarning: string | null
  inventoryConnected: boolean
  releasedAt: string | null
  links: LinkedDoc[]
  activity: ActivityItem[]
  allowedActions: CashSaleAction[]
}

export interface CashSaleInput {
  docDate?: string
  buyerName?: string
  buyerPhone?: string
  buyerTin?: string
  ownEInvoice?: boolean
  paymentMethod?: PaymentMethod
  paymentRef?: string
  amountReceived?: string
  lines?: { itemCode: string; qty: string; unitPrice: string }[]
}

// ── Document flow (S03) ─────────────────────────────────────────────────────

export interface SalesOrderFlow {
  order: { id: string; docNo: string; status: string; customerName: string; ordered: string; delivered: string; open: string; uomCode: string }
  chain: (LinkedDoc & { current: boolean })[]
  quantity: {
    itemCode: string
    itemName: string
    more: number
    rows: { type: string; id: string | null; docNo: string; date: string | null; fromPrevious: string; movedToNext: string; stillOpen: string; label: string; group: LinkedDoc['group'] }[]
  } | null
  audit: (ActivityItem & { docNo: string })[]
  stillOpen: { qty: string; uomCode: string; wantedBy: string | null; delivered: boolean; canDeliver: boolean; canCancel: boolean } | null
  waiting: { finance: number; eInvoice: number; inventory: number }
}

// ── Operation Policies (S29–S33) ────────────────────────────────────────────

export type CreditActionCode = 'ALLOW' | 'WARN' | 'APPROVAL' | 'BLOCK'
export type PolicyToggleKey = 'stockCheck' | 'invoiceFromDelivered' | 'strictPriceList' | 'roundTo5Sen' | 'showMargin' | 'skipCreditForSystem'

export interface CreditRuleRow {
  docType: 'QUOTATION' | 'SALES_ORDER' | 'DELIVERY' | 'INVOICE' | 'CASH_SALE'
  overCreditAction: CreditActionCode
  overOverdueAction: CreditActionCode
  approverRole: string | null
}

export interface SettingChange {
  id: string
  at: string
  userName: string
  message: string
}

export interface CreditControlData {
  creditScope: 'GROUP' | 'BRANCH'
  toggles: Record<PolicyToggleKey, boolean>
  toggleLabels: Record<PolicyToggleKey, string>
  rules: CreditRuleRow[]
  history: SettingChange[]
  lastChange: { at: string; userName: string } | null
  saved?: string[]
}

/** S34 · which steps the company uses. Both are on in the standard flow. */
export interface SalesFlowSwitches {
  useEnquiries: boolean
  officeDraftsQuotations: boolean
  askInstallation: boolean
  /** An installation with every item in stock may be released without the preferred date (phase 5). */
  installDateLater: boolean
  agentsAddCustomers: boolean
  /** The price comes from the price list and is never typed on a quotation or sales order (phase 5). */
  fixedPrices: boolean
  /** Vouchers on an order are picked from the voucher list (phase 5). */
  voucherControl: boolean
  /** Salespeople set prices within a range of the price list; outside it the Sales Manager approves (phase 5). */
  priceRange: boolean
  /** Salespeople record customer payments as official receipts; Account verifies them (phase 5). */
  useReceipts: boolean
  /** Salespeople revise a released order until it is delivered (phase 5). */
  reviseOrders: boolean
  /** Short stock makes the whole order a pre-order (phase 5). */
  preOrders: boolean
  /** An order with no receipt and no delivery order is cancelled after a number of days (phase 5). */
  autoCancel: boolean
  /** Whoever keys orders opens WhatsApp with the released order's summary for the customer (phase 5). */
  shareWhatsapp: boolean
  /** Stock of booked installations is held: other orders count what is left (phase 5). */
  holdStock: boolean
  /** The delivery order is made 24 hours before the installation (phase 5). */
  autoDelivery: boolean
  /** A delivery order of an installation is delivered when the customer signs (phase 5). */
  signedDelivery: boolean
  /** A delivered installation drafts its invoice (phase 5). */
  autoInvoice: boolean
  /** Verified receipts lower the balance of their order's invoices (phase 5). */
  receiptsPayInvoices: boolean
}

export type ReceiptStatus = 'WAITING' | 'VERIFIED' | 'RETURNED' | 'CANCELLED'
export type ReceiptKind = 'DEPOSIT' | 'BALANCE'
export type ReceiptMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'CARD_EPP' | 'CHEQUE'
export type ReceiptAction = 'edit' | 'cancel' | 'verify' | 'sendBack'
export type OrderPaymentStatus = 'UNPAID' | 'DEPOSIT' | 'FULLY_PAID'

/** An official receipt in a list (phase 5). Money arrives as strings. */
export interface ReceiptRow {
  id: string
  docNo: string
  /** The day the money was received. */
  docDate: string
  status: ReceiptStatus
  statusLabel: string
  branchCode: string
  salesOrderId: string
  salesOrderNo: string
  customerCode: string
  customerName: string
  kind: ReceiptKind
  kindLabel: string
  method: ReceiptMethod
  methodLabel: string
  amount: string
  recordedByName: string
  createdAt: string
}

export interface ReceiptDetail extends ReceiptRow {
  recordedAt: string
  payerRef: string | null
  note: string | null
  verifiedRef: string | null
  verifiedAt: string | null
  verifiedByName: string | null
  returnReason: string | null
  cancelReason: string | null
  proofs: { id: string; fileName: string; mimeType: string; downloadUrl: string }[]
  order: { id: string; docNo: string; total: string; payment: OrderPaymentStatus; paymentLabel: string; verified: string; waiting: string; open: string } | null
  activity: { id: string; action: string; message: string; comment: string | null; userName: string; at: string }[]
  version: number
  allowedActions: ReceiptAction[]
}

export interface ReceiptInput {
  docDate: string
  kind: ReceiptKind
  method: ReceiptMethod
  amount: string
  payerRef?: string
  note?: string
  /** Files uploaded first; on a change, the new ones only. */
  proofIds: string[]
}

/** The Payments card of a sales order (phase 5): only verified receipts count as paid. */
export interface OrderPayments {
  status: OrderPaymentStatus
  label: string
  total: string
  verified: string
  waiting: string
  open: string
  receipts: ReceiptRow[]
  canRecord: boolean
  released: boolean
}

/** Whether a document's prices need the Sales Manager (phase 5): discount limit, or the range around the price list. */
export interface PriceCheck {
  mode: 'DISCOUNT' | 'RANGE'
  /** Needs approval now (not approved yet). */
  over: boolean
  /** "Price 12% below the price list on 1 line (allowed: 10% below to 20% above)", or the discount text. */
  reason: string | null
  range: PriceRangeSetting | null
}

/** The allowed range around the price list, in percent (phase 5). */
export interface PriceRangeSetting {
  belowPct: string
  abovePct: string
}

/** A new household customer typed on the sales order (phase 5). Core fills in the rest. */
export interface NewCustomerInput {
  name: string
  phone: string
  address: string
  email: string | null
  idNumber: string | null
}

export interface SalesFlowData {
  switches: SalesFlowSwitches
  range: PriceRangeSetting
  /** Days after release before an order with no receipt and no delivery order is cancelled (phase 5). */
  autoCancelDays: number
  labels: Record<keyof SalesFlowSwitches, string>
  history: SettingChange[]
  saved?: string[]
}

export interface DocumentTypesData {
  sequences: { docType: string; name: string; format: string; nextNumber: string | null; resetEvery: 'NEVER' | 'MONTH'; perBranch: boolean; printTemplate: string | null }[]
  orderTypes: { code: string; name: string; meaning: string; isDefault: boolean; isActive: boolean }[]
  history: SettingChange[]
  saved?: string[]
}

export interface EnquiryTypeSetting {
  code: string
  name: string
  details: EnquiryTypeDetail[]
  defaultAgentRule: 'CUSTOMER' | 'ROUND_ROBIN'
  isActive: boolean
  usedThisMonth: number
}

export interface EnquiryTypesData {
  types: EnquiryTypeSetting[]
  sources: { code: string; name: string; isActive: boolean; thisMonth: number; becameQuotations: number }[]
}

export interface ExclusionRow {
  id: string
  itemCode: string
  itemName: string
  branchCode: string
  branchName: string
  reason: string
  fromDate: string
  untilDate: string | null
  addedByName: string
  state: 'ACTIVE' | 'SCHEDULED' | 'ENDED'
  removedAt: string | null
}

export interface ExclusionsData {
  items: ExclusionRow[]
  counts: { active: number; endedThisYear: number }
  reasons: string[]
  branches: { code: string; name: string }[]
}

export interface EmailTemplateRow {
  key: string
  name: string
  description: string
  subject: string
  body: string
  attachPdf: boolean
  copyAgent: boolean
  isActive: boolean
}

export interface EmailPreview {
  docNo: string | null
  to: string | null
  cc: string | null
  subject: string
  body: string
  attachment: string | null
}

// ── Reports (S05) ───────────────────────────────────────────────────────────

export interface SalesByCustomerReport {
  period: string
  periods: string[]
  kpis: {
    ordered: { amount: string; orders: number }
    invoiced: { amount: string; pct: number }
    cancelled: { amount: string; docs: string[] }
    open: { amount: string }
  }
  rows: { customerCode: string; customerName: string; orders: number; ordered: string; invoiced: string; cancelled: string; open: string; sharePct: string }[]
  totals: { orders: number; ordered: string; invoiced: string; cancelled: string; open: string }
  agents: { agentCode: string; agentName: string; orders: number; ordered: string }[]
  notes: string[]
  footnote: string
  filters: { branches: { code: string; name: string }[]; agents: { code: string; name: string }[]; groups: string[] }
}

export interface ReportFilterOptions {
  branches: { code: string; name: string }[]
  agents: { code: string; name: string }[]
  groups: string[]
}

export interface SalesByItemReport {
  period: string
  periods: string[]
  kpis: {
    ordered: { amount: string; items: number; orders: number }
    invoiced: { amount: string; pct: number }
    best: { itemCode: string; itemName: string; amount: string; sharePct: string } | null
    open: { amount: string }
  }
  rows: {
    itemCode: string
    itemName: string
    itemGroup: string | null
    uomCode: string
    orders: number
    orderedQty: string
    deliveredQty: string
    invoicedQty: string
    ordered: string
    invoiced: string
    open: string
    sharePct: string
  }[]
  totals: { orders: number; ordered: string; invoiced: string; open: string }
  groups: { group: string; items: number; ordered: string; sharePct: string }[]
  notes: string[]
  footnote: string
  filters: ReportFilterOptions & { itemGroups: string[] }
}

export type OpenReason = 'READY' | 'NO_STOCK' | 'PURCHASE' | 'DEPOSIT' | 'CANCELLING' | 'APPROVAL' | 'DRAFT' | 'TO_INVOICE'

export interface OpenOrdersReport {
  today: string
  kpis: {
    open: { orders: number; ordered: string; released: number; partial: number; approval: number; draft: number }
    toDeliver: { amount: string; units: string; toInvoice: string }
    dueSoon: { orders: number; orderNos: string[]; late: string[] }
    approval: { orders: number; amount: string }
  }
  byReason: { key: OpenReason; label: string; amount: string; lines: number }[]
  byCustomer: { customerCode: string; customerName: string; orders: number; openValue: string }[]
  orders: {
    id: string
    docNo: string
    docDate: string
    status: string
    balanceCancelled: boolean
    isMigrated: boolean
    customerCode: string
    customerName: string
    agentName: string
    branchCode: string
    wantedBy: string | null
    promisedDate: string | null
    late: boolean
    dueSoon: boolean
    total: string
    openValue: string
    lines: {
      lineNo: number
      itemCode: string
      itemName: string
      uomCode: string
      ordered: string
      delivered: string
      invoiced: string
      cancelled: string
      open: string
      toInvoice: string
      openValue: string
      reason: OpenReason
      reasonLabel: string
      detail: string | null
    }[]
  }[]
  totals: { ordered: string; openValue: string }
  inventoryConnected: boolean
  filters: ReportFilterOptions
}

export type QuoteOutcome = 'WON' | 'OPEN' | 'EXPIRED' | 'LOST'

export interface QuotationConversionReport {
  period: string
  periods: string[]
  kpis: {
    sent: { count: number; amount: string }
    won: { count: number; amount: string; pct: number; valuePct: number; avgDays: string | null }
    lost: { count: number; amount: string; topReason: string | null }
    open: { count: number; amount: string; expiringSoon: string[]; expired: number }
  }
  outcomes: { key: QuoteOutcome; label: string; count: number; amount: string }[]
  agents: { agentCode: string; agentName: string; sent: number; won: number; open: number; expired: number; lost: number; wonAmount: string; pct: number }[]
  reasons: { reason: string; count: number; amount: string }[]
  rows: {
    id: string
    docNo: string
    revision: number
    docDate: string
    validUntil: string | null
    customerName: string
    agentName: string
    total: string
    outcome: QuoteOutcome
    outcomeLabel: string
    salesOrderNo: string | null
    daysToOrder: number | null
    lostReason: string | null
    expiresSoon: boolean
    isMigrated: boolean
  }[]
  footnote: string
  filters: ReportFilterOptions
}

export interface CustomerAgingReport {
  today: string
  steps: 4 | 6 | 12
  basis: 'due' | 'invoice'
  columns: { key: string; label: string }[]
  kpis: {
    due: { amount: string; invoices: number }
    overdue: { amount: string; customers: number }
    over60: { amount: string; customers: string[] }
    notDue: { amount: string }
  }
  rows: {
    customerCode: string
    customerName: string
    invoices: number
    balance: string
    overdue: string
    cells: Record<string, string>
    oldestDays: number
    creditLimit: string | null
    overLimit: boolean
  }[]
  totals: { balance: string; overdue: string; cells: Record<string, string> }
  invoices: { id: string; docNo: string; docDate: string; dueDate: string | null; customerName: string; total: string; balance: string; days: number; column: string; isMigrated: boolean }[]
  footnote: string
  filters: ReportFilterOptions
}

export type EInvoiceState = 'WAITING' | 'SUBMITTED' | 'FAILED' | 'OLD_SYSTEM'

/** S05 · fully paid orders (phase 5). */
export interface PaidOrdersReport {
  period: string
  periods: string[]
  kpis: { paid: { count: number; beforeTax: string; total: string }; agents: { count: number }; deposit: { count: number; amount: string }; unpaid: { count: number; amount: string } }
  byAgent: { agentCode: string; agentName: string; count: number; beforeTax: string; total: string }[]
  rows: { id: string; docNo: string; docDate: string; paidOn: string; customerName: string; agentCode: string; agentName: string; branchCode: string; beforeTax: string; total: string }[]
  totals: { beforeTax: string; total: string }
  filters: ReportFilterOptions
  footnote: string
}

export interface InvoiceRegisterReport {
  period: string
  periods: string[]
  kpis: {
    invoiced: { amount: string; count: number }
    debitNotes: { amount: string; count: number }
    credited: { amount: string; count: number }
    net: { amount: string }
  }
  rows: {
    id: string
    type: 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE'
    typeLabel: string
    docNo: string
    docDate: string
    customerName: string
    reference: string | null
    beforeTax: string
    tax: string
    total: string
    balance: string | null
    dueDate: string | null
    payment: { key: PaymentKey; label: string } | null
    eInvoice: { state: EInvoiceState; label: string } | null
    isMigrated: boolean
    to: string | null
  }[]
  totals: { beforeTax: string; tax: string; total: string }
  notes: string[]
  footnote: string
  filters: ReportFilterOptions
}

export interface EInvoiceStatusReport {
  today: string
  period: string
  periods: string[]
  connected: boolean
  kpis: {
    waiting: { count: number; amount: string; oldestDays: number }
    submitted: { count: number }
    problems: { count: number }
    consolidated: { month: string; count: number; amount: string; due: string; late: boolean } | null
  }
  rows: {
    id: string
    type: 'INVOICE' | 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'CASH_SALE'
    typeLabel: string
    docNo: string
    docDate: string
    customerName: string
    tin: string | null
    total: string
    state: EInvoiceState
    stateLabel: string
    since: string
    days: number
    problem: string | null
    to: string
  }[]
  consolidated: { month: string; count: number; amount: string; due: string; late: boolean }[]
  footnote: string
  filters: { branches: { code: string; name: string }[] }
}
