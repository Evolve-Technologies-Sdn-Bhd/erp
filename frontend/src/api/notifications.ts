import { api } from './http'

/** One alert for the person signed in (phase 5): the bell in the top bar. */
export interface Alert {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  createdAt: string
  read: boolean
}
export interface Alerts {
  unread: number
  items: Alert[]
}

/** GET /me/notifications, and marking them read. Silent: the bell polls and never toasts. */
export const notificationsApi = {
  list: () => api<Alerts>('/me/notifications', { silent: true }),
  read: (id: string) => api<Alerts>(`/me/notifications/${id}/read`, { method: 'POST', silent: true }),
  readAll: () => api<Alerts>('/me/notifications/read-all', { method: 'POST', silent: true }),
}
