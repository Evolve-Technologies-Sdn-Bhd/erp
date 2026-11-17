import { api } from '@/api/http'
import type { ListQuery, ListResponse } from '@/api/list'
import type { JobDetail, JobInput, JobRow, ServiceCustomerOption, ServiceHome } from '../types'

/** The Service module's API (phase 5, F3) — /api/v1/service. */
export const serviceApi = {
  home: () => api<ServiceHome>('/service/home'),
  customers: (q: string) => api<{ items: ServiceCustomerOption[] }>('/service/lookups/customers', { query: { q } }),
}

export const serviceJobsApi = {
  list: (query: ListQuery) => api<ListResponse<JobRow>>('/service/jobs', { query }),
  get: (id: string) => api<JobDetail>(`/service/jobs/${id}`),
  create: (body: JobInput) => api<JobDetail>('/service/jobs', { method: 'POST', body }),
  update: (id: string, body: JobInput & { version: number }) => api<JobDetail>(`/service/jobs/${id}`, { method: 'PATCH', body }),
  cancel: (id: string, version: number, reason: string) => api<JobDetail>(`/service/jobs/${id}/cancel`, { method: 'POST', body: { version, reason } }),
}
