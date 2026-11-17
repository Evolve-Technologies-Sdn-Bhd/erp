/** Service module types (phase 5, F3). Money and quantities arrive as strings. */

export type JobType = 'INSTALLATION' | 'SERVICE' | 'WARRANTY' | 'REPAIR'
export type JobStage = 'NOT_BOOKED' | 'BOOKED' | 'ACCEPTED' | 'DONE' | 'CHECKED' | 'CLOSED' | 'CANCELLED'
export type JobAction = 'edit' | 'cancel'

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
  personName: string | null
  /** "Asks for Thu, 1 Oct", "After stock arrives" or "—" until booked. */
  whenText: string
  stage: JobStage
  stageLabel: string
  createdAt: string
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
  today: string
  notBooked: { count: number; oldestDays: number | null }
  stages: Record<string, number>
  waiting: JobRow[]
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
