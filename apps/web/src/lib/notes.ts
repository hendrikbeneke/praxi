import type { Note, NoteChainReport, NoteFile, NoteInput, NoteUpdate } from '@praxi/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, apiError } from './api'

type ListParams = { contactId?: string; activityId?: string }

export const noteListQueryOptions = (params: ListParams) =>
  queryOptions({
    queryKey: ['notes', 'list', params],
    queryFn: async (): Promise<Note[]> => {
      const res = await api.api.notes.$get({
        query: {
          ...(params.contactId ? { contactId: params.contactId } : {}),
          ...(params.activityId ? { activityId: params.activityId } : {}),
        },
      })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

/** Never cached: the point of the check is what is true right now. */
export const chainQueryOptions = (contactId: string) =>
  queryOptions({
    queryKey: ['notes', 'chain', contactId],
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<NoteChainReport> => {
      const res = await api.api.notes.chain.$get({ query: { contactId } })
      if (!res.ok) throw await apiError(res)
      return res.json()
    },
  })

export async function createNote(input: NoteInput): Promise<Note> {
  const res = await api.api.notes.$post({ json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function updateNote(noteId: string, input: NoteUpdate): Promise<Note> {
  const res = await api.api.notes[':noteId'].$put({ param: { noteId }, json: input })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteNote(noteId: string): Promise<void> {
  const res = await api.api.notes[':noteId'].$delete({ param: { noteId } })
  if (!res.ok) throw await apiError(res)
}

export async function lockNote(noteId: string): Promise<Note> {
  const res = await api.api.notes[':noteId'].lock.$post({ param: { noteId } })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

/**
 * Uploads go through `fetch` rather than the typed client: `hc` serializes
 * JSON, and this is multipart. Same origin, same cookie, so nothing else
 * changes.
 */
export async function uploadNoteFile(noteId: string, file: File): Promise<NoteFile> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch(`/api/notes/${noteId}/files`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  if (!res.ok) throw await apiError(res)
  return res.json()
}

export async function deleteNoteFile(noteId: string, fileId: string): Promise<void> {
  const res = await api.api.notes[':noteId'].files[':fileId'].$delete({
    param: { noteId, fileId },
  })
  if (!res.ok) throw await apiError(res)
}

/** The download link. Authenticated like every other route — the bytes are
 *  never served statically. */
export function noteFileUrl(noteId: string, fileId: string, inline: boolean): string {
  return `/api/notes/${noteId}/files/${fileId}${inline ? '?disposition=inline' : ''}`
}
