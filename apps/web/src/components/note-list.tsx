import { formatBerlinDate, formatBerlinDateTime, type Note } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CornerDownRight, Lock, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { NoteText } from '@/components/note-text'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { deleteNote, lockNote } from '@/lib/notes'
import { strings } from '@/lib/strings'

/** A note's own date is a plain date; rendering it through the Berlin
 *  formatter needs an instant, and midday can never fall on the wrong side of
 *  a timezone boundary. */
function formatNoteDate(noteDate: string): string {
  return formatBerlinDate(`${noteDate}T12:00:00Z`)
}

export function NoteList({
  notes,
  emptyText,
  onEdit,
  onAddendum,
}: {
  notes: readonly Note[]
  emptyText: string
  onEdit: (note: Note) => void
  onAddendum: (note: Note) => void
}) {
  // Addenda render beneath the note they correct, not in the flat list.
  const addenda = new Map<string, Note[]>()
  for (const note of notes) {
    if (note.correctsNoteId === null) continue
    const list = addenda.get(note.correctsNoteId)
    if (list) list.push(note)
    else addenda.set(note.correctsNoteId, [note])
  }

  const top = notes.filter((note) => note.correctsNoteId === null)

  if (top.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>

  return (
    <ul className="space-y-4">
      {top.map((note) => (
        <li key={note.id}>
          <NoteCard note={note} onEdit={onEdit} onAddendum={onAddendum} />

          {(addenda.get(note.id) ?? []).map((addendum) => (
            <div key={addendum.id} className="mt-2 flex gap-2 pl-6">
              <CornerDownRight className="mt-4 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex-1">
                <NoteCard note={addendum} onEdit={onEdit} onAddendum={onAddendum} />
              </div>
            </div>
          ))}
        </li>
      ))}
    </ul>
  )
}

function NoteCard({
  note,
  onEdit,
  onAddendum,
}: {
  note: Note
  onEdit: (note: Note) => void
  onAddendum: (note: Note) => void
}) {
  const queryClient = useQueryClient()
  const locked = note.lockedAt !== null
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notes'] })

  const lock = useMutation({
    mutationFn: () => lockNote(note.id),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.note.locked)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.note.lockFailed)
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteNote(note.id),
    onSuccess: async () => {
      await invalidate()
      toast.success(strings.note.removed)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.error.generic)
    },
  })

  return (
    <article className="rounded-md border px-4 py-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{formatNoteDate(note.noteDate)}</span>
        <Badge variant="outline">{strings.note.types[note.type]}</Badge>

        {locked ? (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" aria-hidden />
            {strings.note.lockedBadge}
          </Badge>
        ) : (
          <Badge variant="outline">{strings.note.openBadge}</Badge>
        )}

        {note.files.length > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <Paperclip className="size-3" aria-hidden />
            {note.files.length}
          </span>
        )}

        <span className="ml-auto text-muted-foreground text-xs">
          {note.createdByName}
          {note.lockedAt && ` · ${strings.note.lockedAt} ${formatBerlinDateTime(note.lockedAt)}`}
        </span>
      </header>

      <NoteText className="mt-2" text={note.text} />

      {note.files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {note.files.map((file) => (
            <li key={file.id} className="text-sm">
              <a
                className="underline underline-offset-2"
                href={`/api/notes/${note.id}/files/${file.id}?disposition=inline`}
                target="_blank"
                rel="noreferrer"
              >
                {file.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {locked ? (
          // A locked note is corrected only by supplementing it.
          note.type !== 'addendum' && (
            <Button variant="outline" size="sm" onClick={() => onAddendum(note)}>
              <Plus className="size-4" aria-hidden />
              {strings.note.writeAddendum}
            </Button>
          )
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => onEdit(note)}>
              <Pencil className="size-4" aria-hidden />
              {strings.note.edit}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={lock.isPending}>
                  <Lock className="size-4" aria-hidden />
                  {strings.note.lock}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.note.lockTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{strings.note.lockBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{strings.note.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => lock.mutate()}>
                    {strings.note.lockConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-auto" disabled={remove.isPending}>
                  <Trash2 className="size-4" aria-hidden />
                  {strings.note.remove}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{strings.note.removeTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{strings.note.removeBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{strings.note.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>
                    {strings.note.remove}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </footer>
    </article>
  )
}
