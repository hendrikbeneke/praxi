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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNoteDraft } from '@/hooks/use-note-draft'
import { activityListQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { noteTypeListQueryOptions } from '@/lib/note-types'
import { createNote, noteListQueryOptions, updateNote } from '@/lib/notes'
import { strings } from '@/lib/strings'

const NO_ACTIVITY = 'none'

/** When the draft was last written, in the shortest German that still places
 *  it: "heute 14:32", "gestern 09:12", "11.08.2026, 11:04" once relative days
 *  stop being an answer anybody can picture. */
function draftAge(iso: string, now: Date): string {
  const day = formatRelativeDayBerlin(iso, now)
  return day === 'heute' || day === 'gestern'
    ? `${day} ${formatBerlinTime(iso)}`
    : formatBerlinDateTime(iso)
}

export function NoteDialog({
  contactId,
  note,
  correctsNote,
  activityId,
  open,
  onOpenChange,
}: {
  contactId: string
  /** Editing an existing, unlocked note. */
  note?: Note | undefined
  /** Writing an addendum to this locked note. */
  correctsNote?: Note | undefined
  /** Pre-selected when the dialog is opened from an activity. */
  activityId?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const activities = useQuery({ ...activityListQueryOptions({ contactId }), enabled: open })
  const types = useQuery({ ...activityTypeListQueryOptions(true), enabled: open })
  const noteTypes = useQuery({ ...noteTypeListQueryOptions, enabled: open })
  /** Only to name the note a restored addendum belongs to — the list is
   *  already in the cache, the screen behind this dialog loaded it. */
  const notes = useQuery({ ...noteListQueryOptions({ contactId }), enabled: open })

  const [noteDate, setNoteDate] = useState('')
  const [noteTypeId, setNoteTypeId] = useState('')
  const [text, setText] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<string>(NO_ACTIVITY)
  /** Which note this one supplements. State rather than the prop alone,
   *  because a draft carries it too: a restored addendum has to stay one. */
  const [correctsId, setCorrectsId] = useState<string | null>(null)

  /** The catalogue is empty: a note cannot be written at all, and saying so
   *  beats a dropdown with nothing in it. The button that opens this dialog is
   *  disabled for the same reason — this is what a stale screen falls back
   *  on. */
  const noTypes = noteTypes.data?.length === 0

  /**
   * Bumped whenever the text is replaced from outside — opening the dialog, or
   * taking over a draft. The editor reads its value once, at mount (see
   * `note-editor.tsx`), so a new generation is how it is told to start again.
   */
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!open) return
    setGeneration((current) => current + 1)

    if (note) {
      setNoteDate(note.noteDate)
      setNoteTypeId(note.noteTypeId)
      setText(note.text)
      setSelectedActivity(note.activityId ?? NO_ACTIVITY)
      return
    }

    setNoteDate(toBerlinDate(new Date().toISOString()))
    /* An addendum starts on the type of the note it supplements — a Nachtrag to
       a session note is itself session documentation — and stays free to
       change. Everything else starts empty and is filled below, because the
       catalogue may not have arrived yet. */
    setNoteTypeId(correctsNote?.noteTypeId ?? '')
    setText('')
    setSelectedActivity(activityId ?? correctsNote?.activityId ?? NO_ACTIVITY)
    setCorrectsId(correctsNote?.id ?? null)
  }, [open, note, correctsNote, activityId])

  /** The first entry of the catalogue is what a new note starts on — the order
   *  the practitioner set carries that decision, so there is no default flag.
   *  In its own effect because the list arrives after the dialog opens. */
  useEffect(() => {
    if (!open || noteTypeId !== '') return
    const first = noteTypes.data?.[0]
    if (first) setNoteTypeId(first.id)
  }, [open, noteTypeId, noteTypes.data])

  /**
   * The draft (L2). Fed the form state rather than the dialog, so it moves to
   * the reading pane in L6 unchanged.
   */
  const draft = useNoteDraft({
    open,
    contactId,
    noteId: note?.id,
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

      if (note) {
        return updateNote(note.id, { activityId: activity, noteDate, noteTypeId, text })
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
    onSuccess: async () => {
      // The draft became a note; what it was is gone with it.
      await draft.clear()
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success(note ? strings.note.saved : strings.note.created)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.note.saveFailed)
    },
  })

  /** The note being supplemented, from the prop or from an accepted draft. */
  const corrected =
    correctsNote ?? notes.data?.find((entry) => entry.id === correctsId) ?? undefined

  const title = correctsId
    ? strings.note.addendumTitle
    : note
      ? strings.note.editTitle
      : strings.note.createTitle

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {corrected && (
            <DialogDescription>
              {strings.note.addendumTo} {formatBerlinDate(`${corrected.noteDate}T12:00:00Z`)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* The offer, not a restore that happens by itself: what is on
              screen has to be what the practitioner chose. Naming the
              addendum's target matters — a draft taken over blind would
              otherwise turn twenty minutes of Nachtrag into an ordinary
              note. */}
          {offered && (
            <div className="rounded-[10px] border bg-muted/45 px-4 py-3.5">
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
                <Button size="sm" onClick={acceptDraft}>
                  {strings.note.draftAccept}
                </Button>
                <Button size="sm" variant="ghost" onClick={draft.discard}>
                  {strings.note.draftDiscard}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div>
            <Label htmlFor={`${formId}-activity`}>{strings.note.activity}</Label>
            <Select value={selectedActivity} onValueChange={setSelectedActivity}>
              <SelectTrigger id={`${formId}-activity`} className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACTIVITY}>{strings.note.activityNone}</SelectItem>
                {(activities.data ?? []).map((entry: Activity) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {formatBerlinDate(entry.occurredAt)} —{' '}
                    {activityLabel(entry, activityTypeLabel(types.data, entry.type))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor={`${formId}-text`}>{strings.note.text}</Label>
            <div className="mt-2">
              <NoteEditor key={generation} id={`${formId}-text`} value={text} onChange={setText} />
            </div>
          </div>

          {note ? (
            <NoteFiles note={note} />
          ) : (
            <p className="text-muted-foreground text-sm">{strings.note.filesAfterSave}</p>
          )}
        </div>

        <DialogFooter>
          {/* Cancelling means cancelling — and leaves the draft lying, down to
              the last keystrokes, which is what the flush is for. */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void draft.flush()
              onOpenChange(false)
            }}
          >
            {strings.note.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending || noteDate === '' || noteTypeId === '' || text.trim() === ''
            }
          >
            {mutation.isPending ? strings.note.saving : strings.note.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
