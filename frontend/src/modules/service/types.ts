/** Service module types (phase 5, F3). Money and quantities arrive as strings. */

export type JobType = 'INSTALLATION' | 'SERVICE' | 'WARRANTY' | 'REPAIR'
export type JobStage = 'NOT_BOOKED' | 'BOOKED' | 'ACCEPTED' | 'DONE' | 'CHECKED' | 'CLOSED' | 'CANCELLED'
export type JobAction = 'edit' | 'cancel' | 'book' | 'unbook' | 'record' | 'close' | 'followUp'

export interface JobRow {
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
  booking: { personId: string | null; personName: string | null; date: string; start: number; end: number; slotGroupCode: string | null; text: string } | null
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
}

export interface ServiceHome {
  date: string
  today: { jobs: number; done: number }
  notBooked: { count: number; oldestDays: number | null }
  doneNotPaid: number
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
}

export interface SlotGroup {
  id: string
  code: string
  name: string
  slotMinutes: number
  firstStart: number
  lastEnd: number
  jobTypes: JobType[]
  isActive: boolean
  version: number
  slots: { start: number; end: number; label: string }[]
  slotsText: string
}

export interface ServiceSettings {
  people: Person[]
  slotGroups: SlotGroup[]
  roles: { role: PersonRole; label: string; jobTypes: JobType[]; people: string[] }[]
  stages: string[]
}

export interface BoardJob {
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
}

export interface BoardWaiting {
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
  people: (Person & { jobTypes: JobType[]; jobs: BoardJob[] })[]
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
