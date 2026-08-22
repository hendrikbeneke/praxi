import type { NoteDraft, NoteDraftInput } from '@praxi/shared'
import { api, apiError } from './api'

/**
 * The unsaved state of a note being written (L2).
 *
 * Deliberately no `queryOptions`: a draft is read exactly once, when the form
 * opens, and answering from a cache would offer text that has since been taken
 * over or discarded elsewhere.
 */

export async function loadNoteDraft(query: {
  contactId: string
  noteId?: string
}): Promise<NoteDraft | null> {
  const res = await api.api['note-drafts'].$get({
    query: { contactId: query.contactId, ...(query.noteId ? { noteId: query.noteId } : {}) },
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function saveNoteDraft(input: NoteDraftInput): Promise<NoteDraft> {
  const res = await api.api['note-drafts'].$put({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteNoteDraft(draftId: string): Promise<void> {
  const res = await api.api['note-drafts'][':draftId'].$delete({ param: { draftId } })
  if (!res.ok) throw await apiError(res)
}
