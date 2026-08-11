import type {
  EmailTemplate,
  EmailTemplateInput,
  InvoiceSend,
  InvoiceSendDraft,
  InvoiceSendInput,
  SmtpSettings,
  SmtpSettingsInput,
  SmtpTestResult,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/** The mail account, the covering-note templates, and sending an invoice. */

export const smtpSettingsQueryOptions = queryOptions({
  queryKey: ['smtp'],
  queryFn: async (): Promise<SmtpSettings | null> => {
    const res = await api.api.settings.smtp.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export async function saveSmtpSettings(input: SmtpSettingsInput): Promise<SmtpSettings> {
  const res = await api.api.settings.smtp.$put({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteSmtpSettings(): Promise<void> {
  const res = await api.api.settings.smtp.$delete()
  if (!res.ok) throw await apiError(res)
}

/** Takes nothing: the recipient is the configured sender and cannot be passed
 *  in (CLAUDE.md rule 14). */
export async function sendTestMail(): Promise<SmtpTestResult> {
  const res = await api.api.settings.smtp.test.$post()
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export const emailTemplateListQueryOptions = queryOptions({
  queryKey: ['email-templates'],
  queryFn: async (): Promise<EmailTemplate[]> => {
    const res = await api.api['email-templates'].$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export async function createEmailTemplate(input: EmailTemplateInput): Promise<EmailTemplate> {
  const res = await api.api['email-templates'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateEmailTemplate(
  templateId: string,
  input: EmailTemplateInput,
): Promise<EmailTemplate> {
  const res = await api.api['email-templates'][':templateId'].$put({
    param: { templateId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteEmailTemplate(templateId: string): Promise<void> {
  const res = await api.api['email-templates'][':templateId'].$delete({ param: { templateId } })
  if (!res.ok) throw await apiError(res)
}

/** What the dialog opens with — placeholders already resolved on the server,
 *  so the screen shows exactly what will go out. */
/** `templateId` prepares the draft again for another covering note. The
 *  placeholders are resolved on the server either way — never in the browser
 *  and never at send time (CLAUDE.md rule 14). */
export const invoiceSendDraftQueryOptions = (invoiceId: string, templateId?: string) =>
  queryOptions({
    queryKey: ['invoices', invoiceId, 'send-draft', templateId ?? 'default'],
    queryFn: async (): Promise<InvoiceSendDraft> => {
      const res = await api.api.invoices[':invoiceId']['send-draft'].$get({
        param: { invoiceId },
        query: templateId ? { templateId } : {},
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
    // Always fresh: the contact's address or the template may have changed
    // since the dialog was last opened.
    staleTime: 0,
  })

export const invoiceSendsQueryOptions = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', invoiceId, 'sends'],
    queryFn: async (): Promise<InvoiceSend[]> => {
      const res = await api.api.invoices[':invoiceId'].sends.$get({ param: { invoiceId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function sendInvoice(
  invoiceId: string,
  input: InvoiceSendInput,
): Promise<InvoiceSend> {
  const res = await api.api.invoices[':invoiceId'].send.$post({
    param: { invoiceId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}
