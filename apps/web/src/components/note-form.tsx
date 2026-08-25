import {
  type Activity,
  activityLabel,
  activityTypeLabel,
  formatBerlinDate,
  formatBerlinDateTime,
  formatBerlinTime,
  formatRelativeDayBerlin,
  type Note,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
import { NoteEditor } from '@/components/note-editor'
import { NoteFiles } from '@/components/note-files'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNoteDraft } from '@/hooks/use-note-draft'
import { ACTIVITY_CHOICES, activityChoicesQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { noteTypeListQueryOptions } from '@/lib/note-types'
import { createNote, noteListQueryOptions, updateNote } from '@/lib/notes'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

const NO_ACTIVITY = 'none'

/** What this form is for. The three ways in are the three the screen offers,
 *  and each brings everything it needs with it — there is no combination of
 *  optional props that means one of them. */
export type NoteFormTarget =
  | { kind: 'create'; activityId?: string | undefined }
  | { kind: 'edit'; note: Note }
  | { kind: 'addendum'; correctsNote: Note }

/** When the draft was last written, in the shortest German that still places
 *  it: "heute 14:32", "gestern 09:12", "11.08.2026, 11:04" once relative days
 *  stop being an answer anybody can picture. */
function draftAge(iso: string, now: Date): string {
  const day = formatRelativeDayBerlin(iso, now)
  return day === 'heute' || day === 'gestern'
    ? `${day} ${formatBerlinTime(iso)}`
    : formatBerlinDateTime(iso)
}

/**
 * Writing a note (L6b) — the form itself, wherever it is put.
 *
 * It lived in a dialog until L6b and stands in the reading pane now, which is
 * why it takes no `open` and no `onOpenChange`: **it exists exactly while it
 * is being used**, and the caller mounts and unmounts it. Everything that was
 * an effect keyed on `open` is a state initialiser here; give it a `key` that
 * changes with the target and a different note starts a different form.
 *
 * **Reusable from the start, because L7 needs it twice over.** The Vorgang
 * detail shows the same form with the Vorgang already named by the record it
 * sits in, so the picker is a prop rather than something to work around: with
 * `activityPicker` false the field is not rendered and the value comes from
 * `target`. That is the whole of the difference.
 *
 * There is no read mode. Every way in means "write" — new, edit, supplement —
 * and reading happens in the pane beside it, which is the shape K7 arrived at
 * for the dialog and this inherits.
 */
export function NoteForm({
  contactId,
  target,
  activityPicker = true,
  onSaved,
  onCancel,
  onMeta,
  className,
}: {
  contactId: string
  target: NoteFormTarget
  /** False where the surrounding record already names the Vorgang (L7). */
  activityPicker?: boolean
  onSaved: (note: Note) => void
  onCancel: () => void
  /** What the list needs to draw the provisional row while this is open — the
   *  date and type under the cursor, not what was stored. */
  onMeta?: (meta: { noteDate: string; typeLabel: string }) => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const activities = useQuery({
    ...activityChoicesQueryOptions(contactId),
    enabled: activityPicker,
  })
  const types = useQuery({ ...activityTypeListQueryOptions(true), enabled: activityPicker })
  const noteTypes = useQuery(noteTypeListQueryOptions)
  /** Only to name the note a restored addendum belongs to — the list is
   *  already in the cache, the screen around this form loaded it. */
  const notes = useQuery(noteListQueryOptions({ contactId }))

  const existing = target.kind === 'edit' ? target.note : undefined

  const [noteDate, setNoteDate] = useState(() =>
    existing ? existing.noteDate : toBerlinDate(new Date().toISOString()),
  )
  /* An addendum starts on the type of the note it supplements — a Nachtrag to
     a session note is itself session documentation — and stays free to change.
     A new note starts empty and is filled below, because the catalogue may not
     have arrived yet. */
  const [noteTypeId, setNoteTypeId] = useState(() =>
    existing
      ? existing.noteTypeId
      : target.kind === 'addendum'
        ? target.correctsNote.noteTypeId
        : '',
  )
  const [text, setText] = useState(() => existing?.text ?? '')
  const [selectedActivity, setSelectedActivity] = useState<string>(() => {
    if (existing) return existing.activityId ?? NO_ACTIVITY
    if (target.kind === 'addendum') return target.correctsNote.activityId ?? NO_ACTIVITY
    return target.kind === 'create' ? (target.activityId ?? NO_ACTIVITY) : NO_ACTIVITY
  })
  /** Which note this one supplements. State rather than the target alone,
   *  because a draft carries it too: a restored addendum has to stay one. */
  const [correctsId, setCorrectsId] = useState<string | null>(() =>
    target.kind === 'addendum' ? target.correctsNote.id : null,
  )

  /** The catalogue is empty: a note cannot be written at all, and saying so
   *  beats a dropdown with nothing in it. The button that opens this form is
   *  disabled for the same reason — this is what a stale screen falls back
   *  on. */
  const noTypes = noteTypes.data?.length === 0

  /**
   * Bumped whenever the text is replaced from outside — which here is only
   * taking over a draft. The editor reads its value once, at mount (see
   * `note-editor.tsx`), so a new generation is how it is told to start again.
   */
  const [generation, setGeneration] = useState(0)

  /** The first entry of the catalogue is what a new note starts on — the order
   *  the practitioner set carries that decision, so there is no default flag.
   *  In an effect because the list arrives after the form is on screen. */
  useEffect(() => {
    if (noteTypeId !== '') return
    const first = noteTypes.data?.[0]
    if (first) setNoteTypeId(first.id)
  }, [noteTypeId, noteTypes.data])

  const typeLabel = noteTypes.data?.find((entry) => entry.id === noteTypeId)?.label ?? ''

  useEffect(() => {
    onMeta?.({ noteDate, typeLabel })
  }, [onMeta, noteDate, typeLabel])

  /**
   * The draft (L2). Fed the form state rather than the container that happens
   * to hold it — which is what let it move out of the dialog unchanged.
   */
  const draft = useNoteDraft({
    open: true,
    contactId,
    noteId: existing?.id,
    form: {
      correctsNoteId: correctsId,
      activityId: selectedActivity === NO_ACTIVITY ? null : selectedActivity,
      noteTypeId: noteTypeId === '' ? null : noteTypeId,
      noteDate: noteDate === '' ? null : noteDate,
      text,
    },
  })

  /** The note a pending draft supplements — resolved from the list so the
   *  question can name it, rather than offering "a draft" for something the
   *  practitioner would only recognise after accepting it. */
  const offered = draft.offer
  const offeredCorrects =
    offered?.correctsNoteId != null
      ? notes.data?.find((entry) => entry.id === offered.correctsNoteId)
      : undefined

  function acceptDraft() {
    if (!offered) return
    setGeneration((current) => current + 1)
    setNoteDate(offered.noteDate ?? '')
    setNoteTypeId(offered.noteTypeId ?? '')
    setText(offered.text)
    setSelectedActivity(offered.activityId ?? NO_ACTIVITY)
    setCorrectsId(offered.correctsNoteId)
    draft.accept()
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<Note> => {
      const activity = selectedActivity === NO_ACTIVITY ? null : selectedActivity

      if (existing) {
        return updateNote(existing.id, { activityId: activity, noteDate, noteTypeId, text })
      }
      return createNote({
        contactId,
        activityId: activity,
        noteDate,
        noteTypeId,
        text,
        correctsNoteId: correctsId,
      })
    },
    onSuccess: async (saved) => {
      // The draft became a note; what it was is gone with it.
      await draft.clear()
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success(existing ? strings.note.saved : strings.note.created)
      onSaved(saved)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.note.saveFailed)
    },
  })

  /** The note being supplemented, from the target or from an accepted draft. */
  const corrected =
    (target.kind === 'addendum' ? target.correctsNote : undefined) ??
    notes.data?.find((entry) => entry.id === correctsId)

  const choices = activities.data?.items ?? []
  const moreChoices = activities.data?.nextCursor != null

  return (
    <form
      className={cn('flex h-full min-h-0 flex-col', className)}
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div className="shrink-0 border-b px-[26px] pt-[18px] pb-4">
        {corrected && (
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            {strings.note.addendumTo} {formatBerlinDate(`${corrected.noteDate}T12:00:00Z`)}
          </p>
        )}

        {/* The offer, not a restore that happens by itself: what is on screen
            has to be what the practitioner chose. Naming the addendum's target
            matters — a draft taken over blind would otherwise turn twenty
            minutes of Nachtrag into an ordinary note. */}
        {offered && (
          <div className="mb-4 rounded-[10px] border bg-muted/45 px-4 py-3.5">
            <p className="text-sm">
              {strings.note.draftFound(draftAge(offered.updatedAt, new Date()))}
              {offeredCorrects && (
                <>
                  {' '}
                  {strings.note.draftIsAddendum}{' '}
                  {formatBerlinDate(`${offeredCorrects.noteDate}T12:00:00Z`)}.
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={acceptDraft}>
                {strings.note.draftAccept}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>
                {strings.note.draftDiscard}
              </Button>
            </div>
          </div>
        )}

        <div
          className={cn(
            'grid gap-4',
            activityPicker
              ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]'
              : 'sm:grid-cols-2',
          )}
        >
          <div>
            <Label htmlFor={`${formId}-date`}>{strings.note.noteDate}</Label>
            <DateField
              id={`${formId}-date`}
              className="mt-2"
              value={noteDate}
              onChange={setNoteDate}
            />
          </div>

          <div>
            <Label htmlFor={noTypes ? undefined : `${formId}-type`}>{strings.note.type}</Label>
            {/* An addendum picks its type like any other note: it is a note
                with a `correctsNoteId`, and the type stopped saying anything
                about that in migration 0038. */}
            {noTypes ? (
              <p className="mt-2 text-muted-foreground text-sm">{strings.note.typesEmpty}</p>
            ) : (
              <Select value={noteTypeId} onValueChange={setNoteTypeId}>
                <SelectTrigger id={`${formId}-type`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(noteTypes.data ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {activityPicker && (
            <div>
              <Label htmlFor={`${formId}-activity`}>{strings.note.activity}</Label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger id={`${formId}-activity`} className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACTIVITY}>{strings.note.activityNone}</SelectItem>
                  {choices.map((entry: Activity) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {formatBerlinDate(entry.occurredAt)} ·{' '}
                      {activityLabel(entry, activityTypeLabel(types.data, entry.activityTypeId))}
                    </SelectItem>
                  ))}
                  {/* Said only where it is true. A cap that is never reached
                      would otherwise read as a warning about nothing. */}
                  {moreChoices && (
                    <p className="border-t px-2 py-2 text-[12px] text-muted-foreground">
                      {strings.note.activityCapped(ACTIVITY_CHOICES)}
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* The editor fills what is left and scrolls on its own; the scrolling
          box is out here rather than inside `NoteEditor`, because the floating
          menus are positioned inside its wrapper and have to travel with the
          text rather than against it. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <NoteEditor
          key={generation}
          id={`${formId}-text`}
          value={text}
          onChange={setText}
          className="min-h-full"
        />
      </div>

      {existing ? (
        <div className="shrink-0 border-t px-[26px] py-4">
          <NoteFiles note={existing} />
        </div>
      ) : (
        <p className="shrink-0 border-t px-[26px] py-3 text-[12.5px] text-muted-foreground">
          {strings.note.filesAfterSave}
        </p>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 border-t px-[26px] py-3">
        {/* Cancelling means cancelling — and leaves the draft lying, down to
            the last keystrokes, which is what the flush is for. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void draft.flush()
            onCancel()
          }}
        >
          {strings.note.cancel}
        </Button>
        <Button
          type="submit"
          disabled={
            mutation.isPending || noteDate === '' || noteTypeId === '' || text.trim() === ''
          }
        >
          {mutation.isPending ? strings.note.saving : strings.note.save}
        </Button>
      </div>
    </form>
  )
}
