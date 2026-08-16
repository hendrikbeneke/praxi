import {
  type Activity,
  activityLabel,
  activityTypeLabel,
  formatBerlinDate,
  type Note,
  type NoteType,
  noteTypes,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
import { NoteEditor } from '@/components/note-editor'
import { NoteFiles } from '@/components/note-files'
import { ReadModeFieldset } from '@/components/read-mode-fieldset'
import { ReadModeFooter } from '@/components/read-mode-footer'
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
import { createNote, updateNote } from '@/lib/notes'
import { strings } from '@/lib/strings'

const NO_ACTIVITY = 'none'

/** Types that can be picked in the form. `addendum` is not among them: whether
 *  a note is an addendum is decided by how it was started and never changes. */
const SELECTABLE_TYPES = noteTypes.filter((type) => type !== 'addendum')

export function NoteDialog({
  contactId,
  note,
  correctsNote,
  activityId,
  startEditing = false,
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
  /**
   * Set by a control that already means "edit" — the pencil on a note. Every
   * other way into a record opens it in read mode (CLAUDE.md, read mode
   * first), which is what the default gives.
   */
  startEditing?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()

  const activities = useQuery({ ...activityListQueryOptions({ contactId }), enabled: open })
  const types = useQuery({ ...activityTypeListQueryOptions(true), enabled: open })

  const [noteDate, setNoteDate] = useState('')
  const [type, setType] = useState<NoteType>('session')
  const [text, setText] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<string>(NO_ACTIVITY)

  const isAddendum = correctsNote !== undefined || note?.correctsNoteId != null
  /** A new note or an addendum has nothing to read yet, so it starts
   *  editable; an existing one follows the way in. Attachments sit inside the
   *  same fieldset — uploading or removing one changes the note, and
   *  downloading a file is a link, which a disabled fieldset leaves alone. */
  const [editing, setEditing] = useState(true)
  /** Read mode already shows the rendered note, so the preview is only ever
   *  interesting while writing — and it starts off, because one opens the
   *  dialog to write, not to look. */
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    if (!open) return
    setEditing(note === undefined || startEditing)
    setPreviewing(false)

    if (note) {
      setNoteDate(note.noteDate)
      setType(note.type)
      setText(note.text)
      setSelectedActivity(note.activityId ?? NO_ACTIVITY)
      return
    }

    setNoteDate(toBerlinDate(new Date().toISOString()))
    setType(correctsNote ? 'addendum' : 'session')
    setText('')
    setSelectedActivity(activityId ?? correctsNote?.activityId ?? NO_ACTIVITY)
  }, [open, note, correctsNote, activityId, startEditing])

  const mutation = useMutation({
    mutationFn: async (): Promise<Note> => {
      const activity = selectedActivity === NO_ACTIVITY ? null : selectedActivity

      if (note) {
        return updateNote(note.id, { activityId: activity, noteDate, type, text })
      }
      return createNote({
        contactId,
        activityId: activity,
        noteDate,
        type,
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

        <ReadModeFieldset disabled={!editing} className="space-y-4">
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
              <Label htmlFor={`${formId}-type`}>{strings.note.type}</Label>
              {isAddendum ? (
                <p className="mt-2 flex h-9 items-center text-sm">{strings.note.types.addendum}</p>
              ) : (
                <Select value={type} onValueChange={(value) => setType(value as NoteType)}>
                  <SelectTrigger id={`${formId}-type`} className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SELECTABLE_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {strings.note.types[value]}
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
                disabled={!editing}
              />
            </div>
          </div>

          {note ? (
            <NoteFiles note={note} />
          ) : (
            <p className="text-muted-foreground text-sm">{strings.note.filesAfterSave}</p>
          )}
        </ReadModeFieldset>

        {editing ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {strings.note.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || noteDate === '' || text.trim() === ''}
            >
              {mutation.isPending ? strings.note.saving : strings.note.save}
            </Button>
          </DialogFooter>
        ) : (
          <ReadModeFooter onClose={() => onOpenChange(false)} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
