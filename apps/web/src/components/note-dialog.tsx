import {
  type Activity,
  activityLabel,
  activityTypeLabel,
  formatBerlinDate,
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
import { activityListQueryOptions } from '@/lib/activities'
import { activityTypeListQueryOptions } from '@/lib/activity-types'
import { ApiError } from '@/lib/api'
import { noteTypeListQueryOptions } from '@/lib/note-types'
import { createNote, updateNote } from '@/lib/notes'
import { strings } from '@/lib/strings'

const NO_ACTIVITY = 'none'

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

  const [noteDate, setNoteDate] = useState('')
  const [noteTypeId, setNoteTypeId] = useState('')
  const [text, setText] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<string>(NO_ACTIVITY)

  /** The catalogue is empty: a note cannot be written at all, and saying so
   *  beats a dropdown with nothing in it. The button that opens this dialog is
   *  disabled for the same reason — this is what a stale screen falls back
   *  on. */
  const noTypes = noteTypes.data?.length === 0

  /** One opens this dialog to write, not to look — reading happens in the
   *  panel behind it (K7) — so the preview starts off. */
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    if (!open) return
    setPreviewing(false)

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
  }, [open, note, correctsNote, activityId])

  /** The first entry of the catalogue is what a new note starts on — the order
   *  the practitioner set carries that decision, so there is no default flag.
   *  In its own effect because the list arrives after the dialog opens. */
  useEffect(() => {
    if (!open || noteTypeId !== '') return
    const first = noteTypes.data?.[0]
    if (first) setNoteTypeId(first.id)
  }, [open, noteTypeId, noteTypes.data])

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
        correctsNoteId: correctsNote?.id ?? null,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success(note ? strings.note.saved : strings.note.created)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : strings.note.saveFailed)
    },
  })

  const title = correctsNote
    ? strings.note.addendumTitle
    : note
      ? strings.note.editTitle
      : strings.note.createTitle

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {correctsNote && (
            <DialogDescription>
              {strings.note.addendumTo} {formatBerlinDate(`${correctsNote.noteDate}T12:00:00Z`)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
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
              <NoteEditor
                id={`${formId}-text`}
                value={text}
                onChange={setText}
                previewing={previewing}
                onTogglePreview={() => setPreviewing((current) => !current)}
              />
            </div>
          </div>

          {note ? (
            <NoteFiles note={note} />
          ) : (
            <p className="text-muted-foreground text-sm">{strings.note.filesAfterSave}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
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
