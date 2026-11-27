/** Service module types (phase 5, F3). Money and quantities arrive as strings. */

export type JobType = 'INSTALLATION' | 'SERVICE' | 'WARRANTY' | 'REPAIR'
export type JobStage = 'NOT_BOOKED' | 'BOOKED' | 'ACCEPTED' | 'DONE' | 'CHECKED' | 'CLOSED' | 'CANCELLED'
export type JobAction = 'edit' | 'cancel' | 'book' | 'unbook' | 'extend' | 'record' | 'close' | 'followUp'
/** Who suits the site (F3 part 4). */
export type SiteType = 'LANDED' | 'CONDO' | 'COMMERCIAL'

/** A job's timing and site, on every row: overdue since when (F3 part 4). */
export interface JobTimingView {
  overdue: boolean
  /** "Thu, 1 Oct, 2 PM" while overdue, or when a done job was late. */
  overdueSinceText: string | null
  siteType: SiteType | null
  siteTypeLabel: string | null
  /** The job category the sales order picked (a slot group code, phase 5): the board books with it first. */
  categoryCode: string | null
  /** Stock not ready 24 hours before the installation (phase 5): what is short. */
  atRisk: boolean
  atRiskNote: string | null
}

export interface JobRow extends JobTimingView {
  id: string
  docNo: string
  jobType: JobType
  typeLabel: string
  branchCode: string
  customerCode: string
  customerName: string
  area: string | null
  salesOrderNo: string | null
  preferredDate: string | null
  personName: string | null
  /** "Asks for Thu, 1 Oct", "After stock arrives" or "—" until booked. */
  whenText: string
  stage: JobStage
  stageLabel: string
  /** Paid on site: Paid, Not paid, No charge, or null before the visit. */
  paidLabel: string | null
  result: VisitResult | null
  createdAt: string
}

export type VisitResult = 'COMPLETE' | 'PARTIAL' | 'POSTPONED'
export type PaidStatus = 'PAID' | 'NOT_PAID' | 'NO_CHARGE'
export type PaidMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'CHEQUE'

export interface JobPhoto {
  id: string
  fileName: string
  mimeType: string
  downloadUrl: string
}

export interface VisitInput {
  result: VisitResult
  reason?: string
  arrivedAt?: string
  finishedAt?: string
  paidStatus?: PaidStatus
  paidMethod?: PaidMethod
  notPaidReason?: string
  note?: string
  nextDate?: string
  /** Parts coming back to the store (phase 5). */
  returns?: { itemCode: string; qty: string }[]
  /** Parts used on a service, warranty or repair job (phase 5). */
  parts?: { itemCode: string; qty: string }[]
}

export interface JobDetail extends JobRow {
  branch: { code: string; name: string }
  customer: { code: string; name: string; email: string | null }
  contactName: string | null
  phone: string | null
  siteAddress: string | null
  /** The order's salesperson (phase 5), alerted when the job is postponed, moved or at risk. */
  agentName: string | null
  atRiskSince: string | null
  postcode: string | null
  state: string | null
  /** What the office needs before booking and the job lacks: warned, never blocking. */
  missingForBooking: string[]
  missingText: string | null
  preferredDate: string | null
  afterStock: boolean
  note: string | null
  source: 'SALES_ORDER' | 'MANUAL'
  salesOrderId: string | null
  cancelReason: string | null
  cancelledAt: string | null
  items: { lineNo: number; itemCode: string; itemName: string; qty: string; uomCode: string; serialNo: string | null; extra: boolean }[]
  activity: { id: string; action: string; message: string; comment: string | null; userName: string; at: string }[]
  booking: {
    personId: string | null
    personName: string | null
    date: string
    start: number
    end: number
    slotGroupCode: string | null
    text: string
    /** When it should be finished: the slot end, or later when extended (F3 part 4). */
    expectedEnd: number
    expectedText: string
    extended: boolean
    extendReason: string | null
    /** "JB-0014 at 2 PM – 4 PM": later jobs that day this one now runs into. */
    runsInto: string[]
  } | null
  /** The stock the job needs, free once earlier jobs have theirs, and the warehouse's confirmation (phase 5). */
  stock: { confirms: boolean; pickAndSign: boolean; items: JobStockItem[]; confirmedAt: string | null; confirmedBy: string | null; signedBy: string | null }
  /** The delivery order Sales made for the job (phase 5). */
  delivery: { id: string; docNo: string | null; delivered: boolean } | null
  /** Parts the installer said come back (phase 5). */
  returns: ReturnedPart[]
  /** Parts used on a service, warranty or repair job (phase 5). */
  parts: { itemCode: string; itemName: string; uomCode: string; qty: string }[]
  /** The warranty claim (phase 5); null on other jobs. */
  warranty: { unit: Warranty | null; suggested: Assessment; assessment: Assessment | null; assessmentLabel: string | null; note: string | null; by: string | null; at: string | null; canAssess: boolean; exchange: boolean; canExchange: boolean } | null
  doneAt: string | null
  doneNote: string | null
  closedAt: string | null
  visit: {
    result: VisitResult
    resultLabel: string
    reason: string | null
    arrivedAt: string | null
    finishedAt: string | null
    paidStatus: PaidStatus | null
    paidLabel: string | null
    paidMethod: string | null
    notPaidReason: string | null
    recordedBy: string | null
    recordedAt: string | null
  } | null
  postponed: { reason: string | null; count: number } | null
  photos: JobPhoto[]
  followUpOf: { id: string; docNo: string | null } | null
  followUpJob: { id: string; docNo: string } | null
  /** The order's payment, from Sales' official receipts (phase 5); null when Sales has not said. */
  orderPayment: { status: 'UNPAID' | 'DEPOSIT' | 'FULLY_PAID'; label: string; paid: string | null; total: string | null } | null
  version: number
  allowedActions: JobAction[]
}

export interface JobInput {
  jobType?: JobType
  customerCode?: string
  contactName?: string
  phone?: string
  siteAddress?: string
  postcode?: string
  state?: string
  area?: string
  preferredDate?: string | null
  note?: string
  siteType?: SiteType | null
}

export interface ServiceHome {
  date: string
  today: { jobs: number; done: number }
  notBooked: { count: number; oldestDays: number | null }
  doneNotPaid: number
  /** Jobs past their expected completion with the visit not recorded (F3 part 4). */
  overdue: number
  /** Service reminders due this month (F6). */
  serviceDue: number
  stages: Record<string, number>
  waiting: JobRow[]
  byPerson: (Person & { jobs: number; done: number })[]
}

export type PersonRole = 'INSTALLER' | 'TECHNICIAN' | 'WARRANTY'

export interface Person {
  id: string
  name: string
  role: PersonRole
  roleLabel: string
  phone: string | null
  isActive: boolean
  version: number
  /** The jobs this person takes and the sites they go to (F3 part 4). */
  jobTypes: JobType[]
  siteTypes: SiteType[]
  takesText: string
  goesToText: string
  /** Claims a fee per job with their own invoice (F5): installers, not technicians. */
  claimsFees: boolean
}

export interface SlotGroup {
  id: string
  code: string
  name: string
  slotMinutes: number
  firstStart: number
  lastEnd: number
  jobTypes: JobType[]
  /** The job types the board picks this group for first. */
  defaultFor: JobType[]
  /** The sites the group is for: a category such as hacking or ceiling work may suit only some. */
  siteTypes: SiteType[]
  sitesText: string
  /** The installer's reference fee for a job of this category (F5), or null when not set. */
  feeAmount: string | null
  isActive: boolean
  version: number
  slots: { start: number; end: number; label: string }[]
  slotsText: string
}

/** An item a booked job needs, and what is free for it (phase 5). */
export interface JobStockItem {
  itemCode: string
  itemName: string
  uomCode: string
  needed: string
  onHand: string
  earlier: string
  free: string
  short: boolean
  /** Off: no RFID tag, so nobody counts it and it is never short. */
  counted: boolean
}

export type Assessment = 'COVERED' | 'CHARGEABLE' | 'REJECTED'
export type WarrantyState = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'VOID'

/** V11 · Warranties (phase 5). */
export interface Warranty {
  id: string
  customerCode: string
  customerName: string
  contactName: string | null
  phone: string | null
  siteAddress: string | null
  salesOrderNo: string | null
  jobId: string
  jobNo: string
  itemCode: string
  itemName: string
  uomCode: string
  qty: string
  serialNo: string | null
  warrantyMonths: number
  startOn: string
  endOn: string
  state: WarrantyState
  stateLabel: string
  voidReason: string | null
  version: number
  canEdit?: boolean
}

/** V10 · Returned Parts. */
export interface ReturnedPart {
  id: string
  jobId: string
  jobNo: string
  customerName: string
  personName: string | null
  itemCode: string
  itemName: string
  uomCode: string
  qty: string
  goodQty: string | null
  damagedQty: string | null
  note: string | null
  receivedAt: string | null
  receivedBy: string | null
  receivedText: string | null
  /** Not used, Job postponed, or One-to-one exchange. */
  reason: 'UNUSED' | 'POSTPONED' | 'EXCHANGE'
  reasonLabel: string
  /** Where an exchanged unit or damaged goods went, like WNTY. */
  location: string | null
  grnNo: string | null
  createdAt: string
  version: number
  canReceive?: boolean
}

/** V09 · Stock for Jobs. */
export interface StockJob {
  id: string
  docNo: string
  typeLabel: string
  branchCode: string
  customerName: string
  salesOrderNo: string | null
  personId: string | null
  personName: string | null
  siteAddress: string | null
  phone: string | null
  /** A one-to-one exchange under warranty. */
  exchange: boolean
  slotText: string
  warehouseCode: string | null
  items: JobStockItem[]
  shortText: string | null
  atRisk: boolean
  atRiskNote: string | null
  confirmedAt: string | null
  confirmedBy: string | null
  pickSignedBy: string | null
  /** Parts and accessories the warehouse added. */
  extras: { id: string; itemCode: string; itemName: string; qty: string; uomCode: string }[]
  canChangeParts: boolean
  deliveryId: string | null
  deliveryNo: string | null
  version: number
  canConfirm: boolean
  canUndo: boolean
}

export interface StockDay {
  date: string
  dateText: string
  today: string
  /** The company's warehouse confirms stock (Slots and Stages). */
  on: boolean
  /** The warehouse picks and signs: the delivery order is made then. */
  pickAndSign: boolean
  /** Today and the three days after. */
  days: { date: string; text: string; jobs: number; toDo: number }[]
  stockConnected: boolean
  counts: { jobs: number; confirmed: number; short: number }
  jobs: StockJob[]
}

export interface ServiceSettings {
  /** Service's own switches (phase 5). */
  general: { warehouseConfirms: boolean; pickAndSign: boolean; warrantyLocation: string }
  people: Person[]
  slotGroups: SlotGroup[]
  /** The roles, and the jobs a new person with that role starts with. */
  roles: { role: PersonRole; label: string; jobTypes: JobType[] }[]
  jobTypes: { value: JobType; label: string }[]
  siteTypes: { value: SiteType; label: string }[]
  stages: string[]
}

export interface BoardJob extends JobTimingView {
  id: string
  docNo: string
  jobType: JobType
  typeLabel: string
  customerName: string
  area: string | null
  start: number
  end: number
  slotText: string
  stage: JobStage
  stageLabel: string
  /** Until when the person is busy: past the slot end when the job was extended. */
  busyEnd: number
  extendedText: string | null
}

export interface BoardWaiting extends JobTimingView {
  id: string
  docNo: string
  jobType: JobType
  typeLabel: string
  customerName: string
  area: string | null
  salesOrderNo: string | null
  preferredDate: string | null
  afterStock: boolean
  whenText: string
  version: number
  asksForThisDay: boolean
  missingForBooking: string[]
  missingText: string | null
}

export interface Board {
  date: string
  dateText: string
  today: string
  /** Where the clock is, when the board shows today. */
  nowMinutes: number | null
  people: (Person & { jobs: BoardJob[]; unfinished: { id: string; docNo: string; why: string }[] })[]
  slotGroups: SlotGroup[]
  notBooked: BoardWaiting[]
}

export interface ServiceCustomerOption {
  code: string
  name: string
  contactName: string | null
  phone: string | null
  deliveryAddress: string | null
  area: string | null
  branchCode: string
}

/** A service reminder (F6). */
export interface ReminderRow {
  id: string
  customerCode: string
  customerName: string
  area: string | null
  itemCode: string
  itemName: string
  qty: string
  uomCode: string
  intervalMonths: number
  lastDoneOn: string
  dueOn: string
  dueText: string
  overdue: boolean
  status: 'UPCOMING' | 'JOB_MADE' | 'DISMISSED'
  statusLabel: string
  fromJobId: string
  fromJobNo: string
  jobId: string | null
  jobNo: string | null
  dismissReason: string | null
  version: number
}

/** Installer claims (F5). */
export type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'PAID' | 'CANCELLED'
export type ClaimAction = 'edit' | 'submit' | 'cancel' | 'approve' | 'return' | 'pay'

export interface ClaimPeriod {
  start: string
  end: string
  payOn: string
  text: string
}

/** A job as it would go on a claim: the fee by rule, late or not, and why it cannot be claimed. */
export interface EligibleJob {
  id: string
  docNo: string
  jobType: string
  typeLabel: string
  customerName: string
  salesOrderNo: string | null
  doneOn: string
  categoryName: string | null
  late: boolean
  referenceAmount: string
  claimable: boolean
  why: string | null
}

export interface ClaimRow {
  id: string
  docNo: string
  personName: string
  periodText: string
  payOn: string
  jobs: number
  total: string
  invoiceNo: string | null
  selfBilled: boolean
  status: ClaimStatus
  statusLabel: string
  paymentRef: string | null
}

export interface ClaimDetail {
  id: string
  docNo: string
  branchCode: string
  personId: string
  personName: string
  period: ClaimPeriod
  status: ClaimStatus
  statusLabel: string
  invoiceNo: string | null
  selfBilled: boolean
  note: string | null
  total: string
  submittedAt: string | null
  submittedByName: string | null
  decidedAt: string | null
  decidedByName: string | null
  returnReason: string | null
  paidOn: string | null
  paymentRef: string | null
  lines: { id: string; jobId: string; jobNo: string; typeLabel: string; customerName: string; salesOrderNo: string | null; categoryName: string | null; doneOn: string; late: boolean; referenceAmount: string; amount: string; reason: string | null }[]
  files: JobPhoto[]
  activity: { id: string; action: string; message: string; comment: string | null; userName: string; at: string }[]
  version: number
  allowedActions: ClaimAction[]
}

export interface ClaimInput {
  lines?: { jobId: string; amount?: string; reason?: string }[]
  invoiceNo?: string
  selfBilled?: boolean
  note?: string
  invoiceFileIds?: string[]
}
