import { api } from './http'

/** A person's guided tours (Help), saved per person: GET, PUT, DELETE /me/tutorial. Silent: Help never toasts. */
export const tutorialApi = {
  get: () => api<unknown>('/me/tutorial', { silent: true }),
  guideValues: () => api<{ values: Record<string, Record<string, string>> }>('/me/tutorial/guide-values', { silent: true }),
  save: (state: unknown) => api<unknown>('/me/tutorial', { method: 'PUT', body: state, silent: true }),
  reset: () => api<unknown>('/me/tutorial', { method: 'DELETE', silent: true }),
}
