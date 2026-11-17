import { api } from '@/api/http'
import type { ListQuery, ListResponse } from '@/api/list'
import type { Board, JobDetail, JobInput, JobRow, PersonRole, ServiceCustomerOption, ServiceHome, ServiceSettings } from '../types'

/** The Service module's API (phase 5, F3) — /api/v1/service. */
export const serviceApi = {
  home: () => api<ServiceHome>('/service/home'),
  customers: (q: string) => api<{ items: ServiceCustomerOption[] }>('/service/lookups/customers', { query: { q } }),
  board: (date?: string) => api<Board>('/service/board', { query: { date } }),
  settings: () => api<ServiceSettings>('/service/settings'),
  addPerson: (body: { name: string; role: PersonRole; phone?: string }) => api<ServiceSettings>('/service/settings/people', { method: 'POST', body }),
  updatePerson: (id: string, body: { name: string; role: PersonRole; phone?: string; isActive: boolean; version: number }) =>
    api<ServiceSettings>(`/service/settings/people/${id}`, { method: 'PATCH', body }),
  addSlotGroup: (body: SlotGroupInput) => api<ServiceSettings>('/service/settings/slot-groups', { method: 'POST', body }),
  updateSlotGroup: (id: string, body: SlotGroupInput & { version: number }) => api<ServiceSettings>(`/service/settings/slot-groups/${id}`, { method: 'PATCH', body }),
}

export interface SlotGroupInput {
  name: string
  slotMinutes: number
  firstStart: number
  lastEnd: number
  jobTypes: string[]
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
  done: (id: string, version: number, note?: string) => api<JobDetail>(`/service/jobs/${id}/done`, { method: 'POST', body: { version, note } }),
  close: (id: string, version: number) => api<JobDetail>(`/service/jobs/${id}/close`, { method: 'POST', body: { version } }),
}
