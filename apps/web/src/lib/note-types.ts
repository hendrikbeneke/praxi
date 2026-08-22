import type { NoteType, NoteTypeInput } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

/**
 * The catalogue behind a note's type (L1, migration 0038).
 *
 * No `active` flag and no code, so there is nothing to key the cache on beyond
 * the list itself — the same shape as `roleTypeListQueryOptions` and the value
 * lists.
 */

export const noteTypeListQueryOptions = queryOptions({
  queryKey: ['note-types'],
  queryFn: async (): Promise<NoteType[]> => {
    const res = await api.api['note-types'].$get()
    if (!res.ok) throw await apiError(res)
    return res.json()
  },
})

export async function createNoteType(input: NoteTypeInput): Promise<NoteType> {
  const res = await api.api['note-types'].$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateNoteType(typeId: string, input: NoteTypeInput): Promise<NoteType> {
  const res = await api.api['note-types'][':typeId'].$put({ param: { typeId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteNoteType(typeId: string): Promise<void> {
  const res = await api.api['note-types'][':typeId'].$delete({ param: { typeId } })
  if (!res.ok) throw await apiError(res)
}

export async function moveNoteType(typeId: string, delta: 1 | -1): Promise<void> {
  const res = await api.api['note-types'][':typeId'].move.$post({
    param: { typeId },
    json: { delta },
  })
  if (!res.ok) throw await apiError(res)
}
