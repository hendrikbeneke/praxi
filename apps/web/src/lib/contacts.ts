import type { Contact, ContactInput } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export type ContactListParams = {
  q?: string | undefined
  roleCode?: string | undefined
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export type ContactListResult = { items: Contact[]; total: number }

/**
 * `q` is part of the query key but never of the router's search params — see
 * the note on `contactListQuerySchema`. React Query caches per term all the
 * same, so paging back and forth costs nothing.
 */
export const contactListQueryOptions = (params: ContactListParams) =>
  queryOptions({
    queryKey: ['contacts', 'list', params],
    queryFn: async (): Promise<ContactListResult> => {
      const res = await api.api.contacts.$get({
        query: {
          ...(params.q ? { q: params.q } : {}),
          ...(params.roleCode ? { roleCode: params.roleCode } : {}),
          includeArchived: params.includeArchived ? 'true' : 'false',
          ...(params.limit === undefined ? {} : { limit: String(params.limit) }),
          ...(params.offset === undefined ? {} : { offset: String(params.offset) }),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
    placeholderData: (previous) => previous,
  })

export const contactQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['contacts', 'detail', contactId],
    queryFn: async (): Promise<Contact> => {
      const res = await api.api.contacts[':contactId'].$get({ param: { contactId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createContact(input: ContactInput): Promise<Contact> {
  const res = await api.api.contacts.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateContact(contactId: string, input: ContactInput): Promise<Contact> {
  const res = await api.api.contacts[':contactId'].$put({ param: { contactId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function setContactArchived(contactId: string, archived: boolean): Promise<Contact> {
  const res = archived
    ? await api.api.contacts[':contactId'].archive.$post({ param: { contactId } })
    : await api.api.contacts[':contactId'].unarchive.$post({ param: { contactId } })

  if (!res.ok) throw await apiError(res)
  return res.json()
}
