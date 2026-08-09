import type { Note } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { deleteNoteFile, noteFileUrl, uploadNoteFile } from '@/lib/notes'
import { strings } from '@/lib/strings'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Only the formats the browser renders in its own viewer are offered inline;
 *  everything else downloads. The server enforces the same list. */
const INLINE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/tiff',
])

export function NoteFiles({ note }: { note: Note }) {
  const queryClient = useQueryClient()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const locked = note.lockedAt !== null

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notes'] })

  const upload = useMutation({
    mutationFn: (file: File) => uploadNoteFile(note.id, file),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.note.fileAdded)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.note.fileFailed)
    },
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  const remove = useMutation({
    mutationFn: (fileId: string) => deleteNoteFile(note.id, fileId),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.note.fileRemoved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <div>
      <p className="font-medium text-sm">{strings.note.files}</p>

      {note.files.length === 0 ? (
        <p className="mt-1 text-muted-foreground text-sm">{strings.note.filesEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {note.files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a
                className="truncate underline underline-offset-2"
                href={noteFileUrl(note.id, file.id, INLINE.has(file.mimeType))}
                target="_blank"
                rel="noreferrer"
              >
                {file.fileName}
              </a>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatSize(file.sizeBytes)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label={strings.note.fileDownload} asChild>
                  <a href={noteFileUrl(note.id, file.id, false)} download>
                    <Download className="size-4" aria-hidden />
                  </a>
                </Button>
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={strings.note.fileRemove}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(file.id)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <div className="mt-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/tiff"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload.mutate(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="size-4" aria-hidden />
            {upload.isPending ? strings.note.fileUploading : strings.note.fileAdd}
          </Button>
          <p className="mt-1 text-muted-foreground text-xs">{strings.note.fileHint}</p>
        </div>
      )}
    </div>
  )
}
