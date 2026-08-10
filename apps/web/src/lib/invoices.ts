import type {
  BillableItem,
  Invoice,
  InvoiceCreate,
  InvoiceStatus,
  InvoiceUpdate,
  NumberRange,
  NumberRangeCode,
  NumberRangeInput,
  TextTemplate,
  TextTemplateInput,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

type ListParams = { contactId?: string; status?: InvoiceStatus }

export const invoiceListQueryOptions = (params: ListParams) =>
  queryOptions({
    queryKey: ['invoices', 'list', params],
    queryFn: async (): Promise<Invoice[]> => {
      const res = await api.api.invoices.$get({
        query: {
          ...(params.contactId ? { contactId: params.contactId } : {}),
          ...(params.status ? { status: params.status } : {}),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export const invoiceQueryOptions = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: async (): Promise<Invoice> => {
      const res = await api.api.invoices[':invoiceId'].$get({ param: { invoiceId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export const billableQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['invoices', 'billable', contactId],
    queryFn: async (): Promise<BillableItem[]> => {
      const res = await api.api.invoices.billable.$get({ query: { contactId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createInvoice(input: InvoiceCreate): Promise<Invoice> {
  const res = await api.api.invoices.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateInvoice(invoiceId: string, input: InvoiceUpdate): Promise<Invoice> {
  const res = await api.api.invoices[':invoiceId'].$put({ param: { invoiceId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  const res = await api.api.invoices[':invoiceId'].$delete({ param: { invoiceId } })
  if (!res.ok) throw await apiError(res)
}

export async function finalizeInvoice(invoiceId: string): Promise<Invoice> {
  const res = await api.api.invoices[':invoiceId'].finalize.$post({ param: { invoiceId } })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

/** Rendered on demand and never stored — the draft's document does not exist
 *  until it is finalized. */
/** Issues the second document; the original keeps everything but its status
 *  and gains the reference. What comes back is the cancellation. */
export async function cancelInvoice(invoiceId: string): Promise<Invoice> {
  const res = await api.api.invoices[':invoiceId'].cancel.$post({ param: { invoiceId } })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export function previewUrl(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/preview`
}

/** The stored document, served from disk. */
export function pdfUrl(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/pdf`
}

export const textTemplateListQueryOptions = queryOptions({
  queryKey: ['text-templates'],
  queryFn: async (): Promise<TextTemplate[]> => {
    const res = await api.api['text-templates'].$get({ query: { includeInactive: 'true' } })
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export async function createTextTemplate(input: TextTemplateInput): Promise<TextTemplate> {
  const res = await api.api['text-templates'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateTextTemplate(
  templateId: string,
  input: TextTemplateInput,
): Promise<TextTemplate> {
  const res = await api.api['text-templates'][':templateId'].$put({
    param: { templateId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteTextTemplate(templateId: string): Promise<void> {
  const res = await api.api['text-templates'][':templateId'].$delete({ param: { templateId } })
  if (!res.ok) throw await apiError(res)
}

export const numberRangeListQueryOptions = queryOptions({
  queryKey: ['number-ranges'],
  queryFn: async (): Promise<NumberRange[]> => {
    const res = await api.api['number-ranges'].$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export async function saveNumberRange(
  code: NumberRangeCode,
  input: NumberRangeInput,
): Promise<NumberRange> {
  const res = await api.api['number-ranges'][':code'].$put({ param: { code }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

/** Multipart, so it goes through `fetch` rather than the typed client — same
 *  reasoning as the note attachments. */
export async function uploadInvoiceTemplate(file: File): Promise<{ pages: number }> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/settings/invoice-template', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export const invoiceTemplateUrl = '/api/settings/invoice-template'
