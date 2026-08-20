import type {
  CountryEntry,
  CountryEntryInput,
  ValueListEntry,
  ValueListEntryInput,
} from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * The three value lists behind a contact's own fields (D-R3).
 *
 * None of them has an `active` flag or a code, so there is nothing to key a
 * cache on beyond the list itself — see `roleTypeListQueryOptions`, which is
 * built the same way since migration 0035.
 */

export const salutationListQueryOptions = queryOptions({
  queryKey: ['salutations'],
  queryFn: async (): Promise<ValueListEntry[]> => {
    const res = await api.api.salutations.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export const genderListQueryOptions = queryOptions({
  queryKey: ['genders'],
  queryFn: async (): Promise<ValueListEntry[]> => {
    const res = await api.api.genders.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export const countryListQueryOptions = queryOptions({
  queryKey: ['countries'],
  queryFn: async (): Promise<CountryEntry[]> => {
    const res = await api.api.countries.$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

/** Which list a call is about. The three endpoints are the same shape, so the
 *  settings card is written once and told which one it is looking at. */
export type ValueListKind = 'salutations' | 'genders'

export async function createValueEntry(
  kind: ValueListKind,
  input: ValueListEntryInput,
): Promise<ValueListEntry> {
  const res = await api.api[kind].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateValueEntry(
  kind: ValueListKind,
  entryId: string,
  input: ValueListEntryInput,
): Promise<ValueListEntry> {
  const res = await api.api[kind][':entryId'].$put({ param: { entryId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteValueEntry(kind: ValueListKind, entryId: string): Promise<void> {
  const res = await api.api[kind][':entryId'].$delete({ param: { entryId } })
  if (!res.ok) throw await apiError(res)
}

export async function moveValueEntry(
  kind: ValueListKind,
  entryId: string,
  delta: 1 | -1,
): Promise<void> {
  const res = await api.api[kind][':entryId'].move.$post({ param: { entryId }, json: { delta } })
  if (!res.ok) throw await apiError(res)
}

/** Countries have no update: adding one is choosing from the ISO list, and
 *  there is nothing about the chosen entry to edit afterwards. */
export async function createCountryEntry(input: CountryEntryInput): Promise<CountryEntry> {
  const res = await api.api.countries.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteCountryEntry(entryId: string): Promise<void> {
  const res = await api.api.countries[':entryId'].$delete({ param: { entryId } })
  if (!res.ok) throw await apiError(res)
}

export async function moveCountryEntry(entryId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api.countries[':entryId'].move.$post({
    param: { entryId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}
