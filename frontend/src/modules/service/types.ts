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
}

export interface JobDetail extends JobRow {
  branch: { code: string; name: string }
  customer: { code: string; name: string; email: string | null }
  contactName: string | null
  phone: string | null
  siteAddress: string | null
  preferredDate: string | null
  afterStock: boolean
  note: string | null
  source: 'SALES_ORDER' | 'MANUAL'
  salesOrderId: string | null
  cancelReason: string | null
  cancelledAt: string | null
  items: { lineNo: number; itemCode: string; itemName: string; qty: string; uomCode: string; serialNo: string | null }[]
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
  isActive: boolean
  version: number
  slots: { start: number; end: number; label: string }[]
  slotsText: string
}

export interface ServiceSettings {
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
}

export interface Board {
  date: string
  dateText: string
  today: string
  /** Where the clock is, when the board shows today. */
  nowMinutes: number | null
  people: (Person & { jobs: BoardJob[] })[]
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
