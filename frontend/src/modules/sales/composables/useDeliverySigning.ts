import { computed, reactive, ref, type Ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { ApiError } from '@/api/http'
import { salesDeliveriesApi, salesFilesApi } from '../api/sales'
import type { DeliveryDetail } from '../types'

/** The steps of a signed delivery order (phase 5), as the API names them. */
export type SignStep = 'collect' | 'check-in' | 'sign' | 'refuse' | 'accept-unsigned' | 'return-refusal'

const TEXT: Record<SignStep, { title: string; text: string; action: string; done: string }> = {
  collect: { title: 'Mark collected', text: 'The installer takes the goods. The quantities can no longer be changed; the delivery order waits for the customer’s signature.', action: 'Mark collected', done: 'collected' },
  'check-in': { title: 'Check the goods back in', text: 'The goods are back at the store, such as when the job is postponed. The same delivery order is collected again later.', action: 'Check in', done: 'checked back in' },
  sign: { title: 'Record the signature', text: 'The delivery order becomes delivered. Add the signed delivery order as a photo or PDF.', action: 'Record signature', done: 'delivered' },
  refuse: { title: 'The customer did not sign', text: 'Management decides: accept it without a signature, or send it back to be signed.', action: 'Send to Management', done: 'sent to Management' },
  'accept-unsigned': { title: 'Accept without a signature', text: 'The delivery order becomes delivered without the customer’s signature. It is recorded with your name.', action: 'Accept unsigned', done: 'accepted without a signature' },
  'return-refusal': { title: 'Send it back', text: 'The customer’s signature is asked for again.', action: 'Send back', done: 'sent back' },
}

/** One dialog for every step: what it asks, the files uploaded first, and the call. */
export function useDeliverySigning(delivery: Ref<DeliveryDetail | null>, show: (d: DeliveryDetail) => void) {
  const toast = useToast()
  const step = ref<SignStep | null>(null)
  const busy = ref(false)
  const errors = ref<Record<string, string>>({})
  const form = reactive({ signerName: '', reason: '', note: '' })
  const files = ref<{ id: string; fileName: string; mimeType: string; downloadUrl: string }[]>([])

  function open(next: SignStep) {
    Object.assign(form, { signerName: next === 'sign' ? (delivery.value?.receiver ?? '') : '', reason: '', note: '' })
    const kind = next === 'sign' ? 'SIGNED_DO' : 'REFUSED_DO'
    files.value = next === 'sign' || next === 'refuse' ? (delivery.value?.attachments ?? []).filter((f) => f.kind === kind) : []
    errors.value = {}
    step.value = next
  }
  const close = () => (step.value = null)

  async function upload(file: File) {
    const d = delivery.value!
    const kind = step.value === 'sign' ? 'SIGNED_DO' : 'REFUSED_DO'
    const f = await salesFilesApi.upload(file, kind, 'SAL_DELIVERY', d.id)
    files.value = [...files.value, f]
    d.attachments = [...d.attachments, { id: f.id, fileName: f.fileName, mimeType: f.mimeType, kind, downloadUrl: f.downloadUrl }]
  }

  async function send() {
    const d = delivery.value!
    const s = step.value!
    busy.value = true
    try {
      const result = await salesDeliveriesApi.signStep(d.id, s, {
        version: d.version,
        ...(s === 'sign' && { signerName: form.signerName.trim(), fileIds: files.value.map((f) => f.id) }),
        ...(s === 'refuse' && { reason: form.reason.trim(), fileIds: files.value.map((f) => f.id) }),
        ...((s === 'check-in' || s === 'accept-unsigned' || s === 'return-refusal') && form.note.trim() && { note: form.note.trim() }),
      })
      show(result)
      close()
      toast.add({ severity: 'success', summary: `${result.docNo} ${TEXT[s].done}`, life: 3500 })
    } catch (error) {
      if (error instanceof ApiError) errors.value = error.fieldErrors
    } finally {
      busy.value = false
    }
  }

  return {
    step, busy, errors, form, files, open, close, upload, send,
    title: computed(() => (step.value ? `${TEXT[step.value].title} · ${delivery.value?.docNo}` : '')),
    text: computed(() => (step.value ? TEXT[step.value].text : '')),
    action: computed(() => (step.value ? TEXT[step.value].action : '')),
  }
}
