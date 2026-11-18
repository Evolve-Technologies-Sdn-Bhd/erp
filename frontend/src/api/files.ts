import { api } from './http'

/** Stores a picture for an item or a package (phase 5). The record's own save links it to the record. */
export function uploadPicture(file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', 'PICTURE')
  return api<{ id: string; fileName: string; mimeType: string; downloadUrl: string }>('/attachments', { method: 'POST', body: form })
}
