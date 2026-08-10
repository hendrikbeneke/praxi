import {
  type Activity,
  formatBerlinDate,
  type Note,
  type NoteType,
  noteTypes,
  toBerlinDate,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { NoteFiles } from '@/components/note-files'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { activityListQueryOptions } from '@/lib/activities'
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

  const [noteDate, setNoteDate] = useState('')
  const [type, setType] = useState<NoteType>('session')
  const [text, setText] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<string>(NO_ACTIVITY)

  const isAddendum = correctsNote !== undefined || note?.correctsNoteId != null
  /** A new note or an addendum has nothing to read yet, so it starts
   *  editable; an existing note opens in read mode (CLAUDE.md, read mode
   *  first). Attachments sit inside the same fieldset — uploading or removing
   *  one changes the note, and downloading a file is a link, which a disabled
   *  fieldset leaves alone. */
  const [editing, setEditing] = useState(true)

  useEffect(() => {
    if (!open) return
    setEditing(note === undefined)

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
  }, [open, note, correctsNote, activityId])

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

        <fieldset disabled={!editing} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${formId}-date`}>{strings.note.noteDate}</Label>
              <Input
                id={`${formId}-date`}
                type="date"
                className="mt-2"
                value={noteDate}
                onChange={(event) => setNoteDate(event.target.value)}
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
                    {formatBerlinDate(entry.occurredAt)} — {strings.activity.types[entry.type]}
                    {entry.title ? ` · ${entry.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor={`${formId}-text`}>{strings.note.text}</Label>
            <Textarea
              id={`${formId}-text`}
              rows={10}
              className="mt-2"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>

          {note ? (
            <NoteFiles note={note} />
          ) : (
            <p className="text-muted-foreground text-sm">{strings.note.filesAfterSave}</p>
          )}
        </fieldset>

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
