import type {
  Contact,
  ContactInput,
  ContactListItem,
  ContactListOrder,
  ContactRoleInput,
  ContactSortField,
  ContactUpdate,
  SortDirection,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export type ContactListParams = {
  q?: string | undefined
  roleTypeId?: string | undefined
  order?: ContactListOrder
  sort?: ContactSortField
  dir?: SortDirection
  includeArchived?: boolean
  limit?: number
  offset?: number
  /** Held back until the role catalogue has arrived: it decides which tab is
   *  the default, so asking earlier would show the wrong list and then correct
   *  itself on screen. */
  enabled?: boolean
}

export type ContactListResult = { items: ContactListItem[]; total: number }

/**
 * `q` is part of the query key but never of the router's search params — see
 * the note on `contactListQuerySchema`. React Query caches per term all the
 * same, so paging back and forth costs nothing.
 */
export const contactListQueryOptions = ({ enabled = true, ...params }: ContactListParams) =>
  queryOptions({
    // `enabled` is destructured out first: it says when to ask, not what is
    // asked for, and in the key it would file one answer under two names.
    queryKey: ['contacts', 'list', params],
    queryFn: async (): Promise<ContactListResult> => {
      const res = await api.api.contacts.$get({
        query: {
          ...(params.q ? { q: params.q } : {}),
          ...(params.roleTypeId ? { roleTypeId: params.roleTypeId } : {}),
          ...(params.order ? { order: params.order } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.dir ? { dir: params.dir } : {}),
          includeArchived: params.includeArchived ? 'true' : 'false',
          ...(params.limit === undefined ? {} : { limit: String(params.limit) }),
          ...(params.offset === undefined ? {} : { offset: String(params.offset) }),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
    enabled,
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

/** Master data only — roles go through `setContactRoles`, see the note on
 *  `contactUpdateSchema`. */
export async function updateContact(contactId: string, input: ContactUpdate): Promise<Contact> {
  const res = await api.api.contacts[':contactId'].$put({ param: { contactId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function setContactRoles(
  contactId: string,
  roles: ContactRoleInput[],
): Promise<Contact> {
  const res = await api.api.contacts[':contactId'].roles.$put({
    param: { contactId },
    json: { roles },
  })
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
