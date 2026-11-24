import { api } from '@/api/http'
import type { ListQuery, ListResponse } from '@/api/list'
import type {
  Board, ClaimDetail, ClaimInput, ClaimPeriod, ClaimRow, EligibleJob, JobDetail, JobInput, JobPhoto, JobRow, PersonRole, ReminderRow, ServiceCustomerOption, ServiceHome,
  Assessment, ReturnedPart, ServiceSettings, StockDay, VisitInput, Warranty,
} from '../types'

/** The Service module's API (phase 5, F3) — /api/v1/service. */
export const serviceApi = {
  home: () => api<ServiceHome>('/service/home'),
  customers: (q: string) => api<{ items: ServiceCustomerOption[] }>('/service/lookups/customers', { query: { q } }),
  items: (q: string) => api<{ items: { code: string; name: string; uomCode: string }[] }>('/service/lookups/items', { query: { q } }),
  board: (date?: string) => api<Board>('/service/board', { query: { date } }),
  settings: () => api<ServiceSettings>('/service/settings'),
  saveGeneral: (body: ServiceSettings['general']) => api<ServiceSettings>('/service/settings/general', { method: 'PUT', body }),
  addPerson: (body: PersonInput) => api<ServiceSettings>('/service/settings/people', { method: 'POST', body }),
  updatePerson: (id: string, body: PersonInput & { isActive: boolean; version: number }) => api<ServiceSettings>(`/service/settings/people/${id}`, { method: 'PATCH', body }),
  addSlotGroup: (body: SlotGroupInput) => api<ServiceSettings>('/service/settings/slot-groups', { method: 'POST', body }),
  updateSlotGroup: (id: string, body: SlotGroupInput & { version: number }) => api<ServiceSettings>(`/service/settings/slot-groups/${id}`, { method: 'PATCH', body }),
}

export interface PersonInput {
  name: string
  role: PersonRole
  phone?: string
  jobTypes: string[]
  siteTypes: string[]
  claimsFees?: boolean
}

export interface SlotGroupInput {
  name: string
  slotMinutes: number
  firstStart: number
  lastEnd: number
  jobTypes: string[]
  defaultFor: string[]
  siteTypes?: string[]
  /** The installer's reference fee (F5); empty clears it. */
  feeAmount?: string | null
  isActive: boolean
}

export const serviceJobsApi = {
  list: (query: ListQuery) => api<ListResponse<JobRow>>('/service/jobs', { query }),
  get: (id: string) => api<JobDetail>(`/service/jobs/${id}`),
  create: (body: JobInput) => api<JobDetail>('/service/jobs', { method: 'POST', body }),
  update: (id: string, body: JobInput & { version: number }) => api<JobDetail>(`/service/jobs/${id}`, { method: 'PATCH', body }),
  cancel: (id: string, version: number, reason: string) => api<JobDetail>(`/service/jobs/${id}/cancel`, { method: 'POST', body: { version, reason } }),
  book: (id: string, body: { version: number; personId: string; date: string; slotGroupCode: string; start: number }) =>
    api<JobDetail>(`/service/jobs/${id}/book`, { method: 'POST', body }),
  unbook: (id: string, version: number) => api<JobDetail>(`/service/jobs/${id}/unbook`, { method: 'POST', body: { version } }),
  /** Give a booked job longer: a later expected completion that day ("16:30"), with the reason. */
  extend: (id: string, body: { version: number; until: string; reason: string }) => api<JobDetail>(`/service/jobs/${id}/extend`, { method: 'POST', body }),
  record: (id: string, body: VisitInput & { version: number }) => api<JobDetail>(`/service/jobs/${id}/record`, { method: 'POST', body }),
  followUp: (id: string) => api<JobDetail>(`/service/jobs/${id}/follow-up`, { method: 'POST' }),
  /** A photo of the work, attached to the job straight away. */
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'JOB_PHOTO')
    form.append('entityType', 'SVC_JOB')
    form.append('entityId', id)
    return api<JobPhoto>('/attachments', { method: 'POST', body: form })
  },
  assess: (id: string, body: { version: number; result: Assessment; note?: string }) => api<JobDetail>(`/service/jobs/${id}/assess`, { method: 'POST', body }),
  close: (id: string, version: number) => api<JobDetail>(`/service/jobs/${id}/close`, { method: 'POST', body: { version } }),
}

/** Stock for Jobs (phase 5) — /api/v1/service/stock. */
export const serviceStockApi = {
  day: (date?: string) => api<StockDay>('/service/stock', { query: { date } }),
  confirm: (id: string, version: number) => api<StockDay>(`/service/stock/${id}/confirm`, { method: 'POST', body: { version } }),
  undo: (id: string, version: number) => api<StockDay>(`/service/stock/${id}/undo`, { method: 'POST', body: { version } }),
}

/** Returned Parts (phase 5) — /api/v1/service/returns. */
export const serviceReturnsApi = {
  list: (query: ListQuery) => api<ListResponse<ReturnedPart>>('/service/returns', { query }),
  receive: (id: string, body: { version: number; goodQty: string; damagedQty: string; note?: string }) => api<ReturnedPart>(`/service/returns/${id}/receive`, { method: 'POST', body }),
}

/** Warranties (phase 5) — /api/v1/service/warranties. */
export const serviceWarrantiesApi = {
  list: (query: ListQuery) => api<ListResponse<Warranty>>('/service/warranties', { query }),
  update: (id: string, version: number, serialNo: string) => api<Warranty>(`/service/warranties/${id}`, { method: 'PATCH', body: { version, serialNo } }),
  makeVoid: (id: string, version: number, reason: string) => api<Warranty>(`/service/warranties/${id}/void`, { method: 'POST', body: { version, reason } }),
  claim: (id: string, body: { problem: string; preferredDate?: string }) => api<JobDetail>(`/service/warranties/${id}/job`, { method: 'POST', body }),
}

/** Service reminders (F6) — /api/v1/service/reminders. */
export const serviceRemindersApi = {
  list: (query: ListQuery) => api<ListResponse<ReminderRow> & { leadDays: number; makesUntil: string }>('/service/reminders', { query }),
  run: () => api<{ made: { jobId: string; jobNo: string; customerName: string; itemCode: string; dueOn: string }[] }>('/service/reminders/run', { method: 'POST' }),
  dismiss: (id: string, version: number, reason: string) => api<{ dismissed: boolean }>(`/service/reminders/${id}/dismiss`, { method: 'POST', body: { version, reason } }),
}

/** Installer claims (F5) — /api/v1/service/claims. */
export const serviceClaimsApi = {
  list: (query: ListQuery) => api<ListResponse<ClaimRow> & { sumTotal: string }>('/service/claims', { query }),
  get: (id: string) => api<ClaimDetail>(`/service/claims/${id}`),
  eligible: (personId: string, day: string, claimId?: string) =>
    api<{ person: { id: string; name: string }; period: ClaimPeriod; jobs: EligibleJob[] }>('/service/claims/eligible', { query: { personId, day, claimId } }),
  create: (body: ClaimInput & { personId: string; day: string }) => api<ClaimDetail>('/service/claims', { method: 'POST', body }),
  update: (id: string, body: ClaimInput & { version: number }) => api<ClaimDetail>(`/service/claims/${id}`, { method: 'PATCH', body }),
  submit: (id: string, version: number) => api<ClaimDetail>(`/service/claims/${id}/submit`, { method: 'POST', body: { version } }),
  cancel: (id: string, version: number) => api<ClaimDetail>(`/service/claims/${id}/cancel`, { method: 'POST', body: { version } }),
  approve: (id: string, version: number) => api<ClaimDetail>(`/service/claims/${id}/approve`, { method: 'POST', body: { version } }),
  sendBack: (id: string, version: number, reason: string) => api<ClaimDetail>(`/service/claims/${id}/send-back`, { method: 'POST', body: { version, reason } }),
  pay: (id: string, version: number, paymentRef: string, paidOn: string) => api<ClaimDetail>(`/service/claims/${id}/pay`, { method: 'POST', body: { version, paymentRef, paidOn } }),
  /** The installer's invoice, uploaded first and kept with the claim when it is saved. */
  uploadInvoice: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'CLAIM_INVOICE')
    return api<JobPhoto>('/attachments', { method: 'POST', body: form })
  },
}
