import type {
  CalendarEntry,
  Contact,
  ContactInput,
  ContactListItem,
  ContactRoleInput,
  ContactSortField,
  ContactUpdate,
  Page,
  SortDirection,
} from '@praxi/shared'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

export type ContactListParams = {
  q?: string | undefined
  roleTypeId?: string | undefined
  sort?: ContactSortField
  dir?: SortDirection
  includeArchived?: boolean
  /** Held back until the role catalogue has arrived: it decides which tab is
   *  the default, so asking earlier would show the wrong list and then correct
   *  itself on screen. */
  enabled?: boolean
}

/**
 * The contact list, one page at a time (L3).
 *
 * `q` is part of the query key but never of the router's search params — see
 * the note on `contactListQuerySchema`. React Query caches per term all the
 * same, so going back to a term already scrolled costs nothing.
 *
 * The cursor is opaque: whatever the last page answered with goes back
 * unread.
 */
export const contactListQueryOptions = ({ enabled = true, ...params }: ContactListParams) =>
  infiniteQueryOptions({
    // `enabled` is destructured out first: it says when to ask, not what is
    // asked for, and in the key it would file one answer under two names.
    queryKey: ['contacts', 'list', params],
    queryFn: async ({ pageParam }): Promise<Page<ContactListItem>> => {
      const res = await api.api.contacts.$get({
        query: {
          ...(params.q ? { q: params.q } : {}),
          ...(params.roleTypeId ? { roleTypeId: params.roleTypeId } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.dir ? { dir: params.dir } : {}),
          includeArchived: params.includeArchived ? 'true' : 'false',
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    placeholderData: (previous) => previous,
  })

/**
 * The first handful of matches for a *picker*, unpaged.
 *
 * Its own option rather than the first page of the list above: a picker does
 * not scroll, it narrows — one types more of the name instead of loading more
 * rows — and an infinite query in a dropdown would carry paging machinery
 * nothing there uses.
 */
export const contactSuggestionsQueryOptions = (params: { q?: string | undefined; limit: number }) =>
  queryOptions({
    queryKey: ['contacts', 'suggestions', params],
    queryFn: async (): Promise<ContactListItem[]> => {
      const res = await api.api.contacts.$get({
        query: {
          ...(params.q ? { q: params.q } : {}),
          // An archived contact is one you are done with; a new activity for
          // them starts by unarchiving.
          includeArchived: 'false',
          limit: String(params.limit),
        },
      })
      if (!res.ok) throw await apiError(res)
      return (await res.json()).items
    },
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

/**
 * The contact's calendar entries — **all** of them, including the ones that
 * belong to no Vorgang (L5). The Termine tab used to derive its rows from the
 * activity list and therefore could not see a free-standing appointment; this
 * asks `appointment` directly.
 */
export const contactAppointmentsQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['contacts', 'appointments', contactId],
    queryFn: async (): Promise<CalendarEntry[]> => {
      const res = await api.api.contacts[':contactId'].appointments.$get({ param: { contactId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

/** Just the next one, for the overview — its own request rather than the first
 *  row of the list above, which would pull a treatment history to name a date. */
export const nextAppointmentQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['contacts', 'appointments', contactId, 'next'],
    queryFn: async (): Promise<CalendarEntry | null> => {
      const res = await api.api.contacts[':contactId'].appointments.next.$get({
        param: { contactId },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })
