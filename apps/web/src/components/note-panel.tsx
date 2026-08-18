import { formatBerlinDate, formatBerlinDateTime, type Note, plainNoteText } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Lock, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { deleteNote, lockNote, noteFileUrl } from '@/lib/notes'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** A note's own date is a plain date; rendering it through the Berlin
 *  formatter needs an instant, and midday can never fall on the wrong side of
 *  a timezone boundary. */
function formatNoteDate(noteDate: string): string {
  return formatBerlinDate(`${noteDate}T12:00:00Z`)
}

/**
 * **The panel's height is the design's own `calc(100vh − 300px)`, and this is
 * what the 300 is made of** — measured in the browser at 1440×950, in the
 * order they stack:
 *
 * | | |
 * |---|---|
 * | topbar (`AppTopbar`, `h-14`) | 56 |
 * | header strip of the record incl. the tab row (`ContactHeader`) | 137 |
 * | the `gap-2` the `Tabs` root puts under the tab row | 8 |
 * | top padding of the tab content (`pt-6` in `contacts.$contactId.tsx`) | 24 |
 * | the filter row above the panel (`h-9`) and its `mb-4` | 52 |
 * | what is left below the panel | 23 |
 * | | **300** |
 *
 * The last row is smaller than the page's own `pb-11`, so the page scrolls by
 * about twenty pixels. The prototype does the same; the number was chosen for
 * the panel, not for the padding under it.
 *
 * K6 found the calendar sitting 32px off because exactly such a sum had been
 * written by hand and something above it changed height afterwards. **A
 * hand-written viewport calculation goes wrong the moment anything above it
 * changes height** — so if one of those five rows ever moves, this is the
 * number to correct, and the table says where to look. It is kept because only
 * this one tab wants a fixed-height split: making the whole tab area
 * height-bounded would change how the other five scroll, and the Stammdaten
 * tab deliberately scrolls the page.
 */
const PANEL_HEIGHT = 'h-[calc(100svh-300px)] min-h-[520px]'

/**
 * The Notizen tab: a narrow list on the left, the chosen note read wide on the
 * right (K7). It replaced a flat stack in which every note stood fully
 * expanded, so a year of documentation was one endless column.
 *
 * **The reading pane only reads.** The prototype writes and edits in the right
 * column, in a `contentEditable` with a formatting toolbar; CLAUDE.md bans
 * that outright for note text, because a field whose content is hashed and
 * locked must not be able to contain markup nobody typed. The prototype
 * carries a dialog with the same fields beside it, and that is the half we
 * build: "Neue Notiz", "Bearbeiten" and "Nachtrag" open `NoteDialog`.
 * Recorded in `docs/design-korrektur/abweichungen.md`.
 *
 * Addenda are rows of their own, indented — they are separate notes with their
 * own date, and the design lists them that way rather than nesting them under
 * what they correct.
 */
export function NotePanel({
  notes,
  emptyText,
  onEdit,
  onAddendum,
}: {
  /** Already filtered by the chips above; the selection follows. */
  notes: readonly Note[]
  emptyText: string
  onEdit: (note: Note) => void
  onAddendum: (note: Note) => void
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>()

  // The first note unless the chosen one is still in the list — which is what
  // makes a filter usable: narrowing the list moves the reading pane with it
  // instead of leaving it on something no longer shown.
  const selected = notes.find((note) => note.id === selectedId) ?? notes[0]

  if (notes.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(220px,300px)_minmax(320px,1fr)] overflow-hidden rounded-[10px] border bg-card',
        PANEL_HEIGHT,
      )}
    >
      <div className="overflow-auto border-r bg-muted/45">
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            selected={note.id === selected?.id}
            onSelect={() => setSelectedId(note.id)}
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-col overflow-auto">
        {selected && <NoteReader note={selected} onEdit={onEdit} onAddendum={onAddendum} />}
      </div>
    </div>
  )
}

function NoteRow({
  note,
  selected,
  onSelect,
}: {
  note: Note
  selected: boolean
  onSelect: () => void
}) {
  const excerpt = plainNoteText(note.text)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'block w-full border-b border-l-[3px] pt-[11px] pr-[14px] pb-3 text-left',
        note.correctsNoteId === null ? 'pl-[14px]' : 'pl-[26px]',
        selected ? 'border-l-primary bg-card' : 'border-l-transparent',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-[13.5px] tabular-nums">
          {formatNoteDate(note.noteDate)}
        </span>
        {note.lockedAt && <Lock className="size-3 text-muted-foreground" aria-hidden />}
        {note.files.length > 0 && (
          <span className="inline-flex items-center gap-[3px] text-[11.5px] text-muted-foreground">
            <Paperclip className="size-[11px]" aria-hidden />
            {note.files.length}
          </span>
        )}
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {strings.note.types[note.type]}
        </span>
      </span>
      <span className="mt-1 block truncate text-[12.5px] text-muted-foreground">{excerpt}</span>
    </button>
  )
}

function NoteReader({
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

  /** Who wrote it and, once it is locked, when that happened — the line the
   *  design puts above the text. */
  const origin = note.lockedAt
    ? `${note.createdByName} · ${strings.note.lockedAt} ${formatBerlinDateTime(note.lockedAt)}`
    : note.createdByName

  return (
    <>
      <div className="sticky top-0 z-2 flex flex-wrap items-center gap-3 border-b bg-card px-[22px] py-4">
        <span className="font-semibold text-[15px] tabular-nums">
          {formatNoteDate(note.noteDate)}
        </span>
        <Badge variant="outline">{strings.note.types[note.type]}</Badge>
        {locked ? (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" aria-hidden />
            {strings.note.lockedBadge}
          </Badge>
        ) : (
          <Badge variant="outline">{strings.note.openBadge}</Badge>
        )}

        <span className="ml-auto inline-flex gap-2">
          {locked ? (
            // A locked note is corrected only by supplementing it — and an
            // addendum is not itself corrected, or the chain would fork.
            note.type !== 'addendum' && (
              <Button variant="outline" size="sm" onClick={() => onAddendum(note)}>
                <Plus className="size-3.5" aria-hidden />
                {strings.note.writeAddendum}
              </Button>
            )
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => onEdit(note)}>
                <Pencil className="size-3.5" aria-hidden />
                {strings.note.edit}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={lock.isPending}>
                    <Lock className="size-3.5" aria-hidden />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
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
        </span>
      </div>

      <div className="w-full max-w-[78ch] px-[26px] pt-[22px] pb-10">
        <p className="mb-[18px] text-[12.5px] text-muted-foreground">{origin}</p>

        <NoteText text={note.text} />

        {note.files.length > 0 && (
          <div className="mt-[22px] border-t pt-[14px]">
            <p className="mb-2 text-[12.5px] text-muted-foreground">{strings.note.files}</p>
            <div className="flex flex-wrap gap-2">
              {note.files.map((file) => (
                <a
                  key={file.id}
                  className="inline-flex items-center gap-[7px] rounded-lg border px-2.5 py-1.5 text-[13px] hover:bg-accent hover:text-accent-foreground"
                  href={noteFileUrl(note.id, file.id, true)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="size-3.5" aria-hidden />
                  {file.fileName}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
