import type { Payment, PaymentInput, Receivable, ReceivableFilter } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * Payments and the receivables view (CLAUDE.md rule 9).
 *
 * Nothing here computes a status: `invoicePaymentState()` in
 * `packages/shared` does that, from the invoice and the sum of its payments,
 * and the receivables endpoint has already applied it to its rows.
 */

export const paymentListQueryOptions = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', 'payments', invoiceId],
    queryFn: async (): Promise<Payment[]> => {
      const res = await api.api.invoices[':invoiceId'].payments.$get({ param: { invoiceId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function addPayment(invoiceId: string, input: PaymentInput): Promise<Payment> {
  const res = await api.api.invoices[':invoiceId'].payments.$post({
    param: { invoiceId },
    json: input,
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deletePayment(invoiceId: string, paymentId: string): Promise<void> {
  const res = await api.api.invoices[':invoiceId'].payments[':paymentId'].$delete({
    param: { invoiceId, paymentId },
  })
  if (!res.ok) throw await apiError(res)
}

export const receivableListQueryOptions = (filter?: ReceivableFilter) =>
  queryOptions({
    queryKey: ['receivables', { filter: filter ?? null }],
    queryFn: async (): Promise<Receivable[]> => {
      const res = await api.api.receivables.$get({ query: filter ? { filter } : {} })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })
