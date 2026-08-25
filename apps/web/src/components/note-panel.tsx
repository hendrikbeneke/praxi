import { formatBerlinDate, formatBerlinDateTime, type Note, plainNoteText } from '@praxi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Lock, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
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
 * **What a row is headed with.** An addendum says "Nachtrag" where every other
 * note says its type (L6b) — in the list and in the reading pane's header
 * alike, which is why it is one function. The type is not lost, it is
 * displaced: what one needs to know about this row is that it supplements the
 * one above it, and the type it inherited from that note says nothing new.
 */
export function noteRowLabel(note: Note): string {
  return note.correctsNoteId === null ? note.noteTypeLabel : strings.note.addendumLabel
}

/**
 * **The reading order: newest first, and an addendum under the note it
 * corrects.** Two rules rather than one sort, because they answer different
 * questions — which note comes next, and where a supplement belongs.
 *
 * Sorting addenda in with everything else by date would scatter them: a
 * Nachtrag written six weeks later would stand six weeks up the list, with
 * nothing beside it to say what it corrects. So parents carry the order and
 * their addenda follow them, oldest first, because supplements read forwards.
 *
 * The rows arrive newest first from the server; a parent's position is
 * therefore the position of its own row, and an addendum whose parent is not
 * in the list — which the tab’s filter cannot produce, see `shownFor` — keeps its
 * place rather than disappearing.
 */
export function orderNotes(notes: readonly Note[]): Note[] {
  const children = new Map<string, Note[]>()
  for (const note of notes) {
    if (note.correctsNoteId === null) continue
    const list = children.get(note.correctsNoteId)
    if (list) list.push(note)
    else children.set(note.correctsNoteId, [note])
  }
  for (const list of children.values()) list.reverse()

  const placed = new Set<string>()
  const rows: Note[] = []
  for (const note of notes) {
    if (placed.has(note.id)) continue
    if (note.correctsNoteId !== null && notes.some((other) => other.id === note.correctsNoteId)) {
      continue
    }
    rows.push(note)
    placed.add(note.id)
    for (const child of children.get(note.id) ?? []) {
      if (placed.has(child.id)) continue
      rows.push(child)
      placed.add(child.id)
    }
  }
  return rows
}

/** The row the list shows while a note is being written and does not exist
 *  yet. It carries what the form holds, so date and type follow the cursor. */
export type ProvisionalRow = {
  noteDate: string
  typeLabel: string
  /** Set while an addendum is being written: the row is indented under the
   *  note it will supplement, which is where it lands once saved. */
  correctsNoteId: string | null
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
 * The Notizen tab: a narrow list on the left, and on the right the chosen note
 * — read, or written (K7, L6b). It replaced a flat stack in which every note
 * stood fully expanded, so a year of documentation was one endless column.
 *
 * **Both halves of the right column live here.** Reading was all it did until
 * L6b; writing happened in a dialog, on the grounds that a field whose content
 * is hashed and locked must not be edited in a `contentEditable`. L6a settled
 * that differently and for good — what a note may contain is a ProseMirror
 * schema now, not a hope about markup — so the dialog had no argument left,
 * and the design puts the form exactly where the note it replaces stood.
 *
 * The panel does not decide which of the two it is showing: it renders
 * `children`, and the tab above knows whether something is being written. What
 * the panel does own is the list, and that is why the provisional row is a
 * prop rather than a note with a fake id — a row that is not a note must not
 * be able to reach anything that takes a note.
 */
export function NotePanel({
  notes,
  provisional,
  selectedId,
  onSelect,
  emptyText,
  children,
}: {
  /** Already filtered by the chips above, newest first. */
  notes: readonly Note[]
  /** Set while a note is being written; the row is drawn and always
   *  selected. */
  provisional?: ProvisionalRow | undefined
  selectedId: string | undefined
  onSelect: (noteId: string) => void
  emptyText: string
  /** The reading pane, or the form standing in its place. */
  children: ReactNode
}) {
  const rows = orderNotes(notes)

  if (rows.length === 0 && !provisional) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>
  }

  /* A new note goes to the top whatever date it carries — it is the thing in
     hand, not a row in a chronology yet. An addendum goes under its parent,
     which is where it will be once it exists. */
  const parentIndex =
    provisional?.correctsNoteId != null
      ? rows.findIndex((note) => note.id === provisional.correctsNoteId)
      : -1

  const provisionalAt = provisional ? (parentIndex >= 0 ? parentIndex + 1 : 0) : -1

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(220px,300px)_minmax(320px,1fr)] overflow-hidden rounded-[10px] border bg-card',
        PANEL_HEIGHT,
      )}
    >
      <div className="overflow-auto border-r bg-muted/45">
        {rows.map((note, index) => (
          <div key={note.id}>
            {index === provisionalAt && provisional && <ProvisionalNoteRow row={provisional} />}
            <NoteRow
              note={note}
              selected={provisional === undefined && note.id === selectedId}
              onSelect={() => onSelect(note.id)}
            />
          </div>
        ))}
        {provisional && provisionalAt >= rows.length && <ProvisionalNoteRow row={provisional} />}
      </div>

      <div className="flex min-w-0 flex-col overflow-hidden">{children}</div>
    </div>
  )
}

const ROW_BASE = 'block w-full border-b border-l-[3px] pt-[11px] pr-[14px] pb-3 text-left'

function ProvisionalNoteRow({ row }: { row: ProvisionalRow }) {
  return (
    <div
      className={cn(
        ROW_BASE,
        row.correctsNoteId === null ? 'pl-[14px]' : 'pl-[26px]',
        'border-l-primary bg-card',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-[13.5px] tabular-nums">
          {row.noteDate === '' ? '—' : formatNoteDate(row.noteDate)}
        </span>
        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {row.correctsNoteId === null ? row.typeLabel : strings.note.addendumLabel}
        </span>
      </span>
      <span className="mt-1 block truncate text-[12.5px] text-muted-foreground italic">
        {strings.note.provisional}
      </span>
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
        ROW_BASE,
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
        <span className="ml-auto text-[11.5px] text-muted-foreground">{noteRowLabel(note)}</span>
      </span>
      <span className="mt-1 block truncate text-[12.5px] text-muted-foreground">{excerpt}</span>
    </button>
  )
}

export function NoteReader({
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
    <div className="flex min-h-0 flex-col overflow-auto">
      <div className="sticky top-0 z-2 flex flex-wrap items-center gap-3 border-b bg-card px-[22px] py-4">
        <span className="font-semibold text-[15px] tabular-nums">
          {formatNoteDate(note.noteDate)}
        </span>
        <Badge variant="outline">{noteRowLabel(note)}</Badge>
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
            // `correctsNoteId` is what says it; the type stopped saying
            // anything about it in migration 0038.
            note.correctsNoteId === null && (
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
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                    <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
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
    </div>
  )
}
