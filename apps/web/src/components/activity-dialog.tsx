import type { Activity } from '@praxi/shared'
import { useState } from 'react'
import { ActivityDetail } from '@/components/activity-detail'
import { ActivityForm } from '@/components/activity-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { strings } from '@/lib/strings'

/**
 * The activity in a dialog — **the calendar's container, and nothing else**
 * (D8).
 *
 * Everywhere else an activity opens inline, inside the list row it belongs to.
 * The calendar is the one place that cannot: expanding a card would push the
 * week grid apart, and navigating away would take it off screen entirely, at
 * exactly the moment the grid is what is being worked with.
 *
 * So this is a *container*, not a second editor: it holds `ActivityDetail` and
 * `ActivityForm`, the same two components the two lists hold. Nothing about an
 * activity is decided here.
 *
 * D9 redesigns the calendar and may replace this with a day rail; until then
 * the dialog is the smallest thing that keeps the grid visible.
 */
export function ActivityDialog({
  activity,
  contactId,
  startsAtLocal,
  open,
  onOpenChange,
}: {
  activity?: Activity | undefined
  contactId?: string | undefined
  /** Pre-filled when a slot in the calendar was clicked. */
  startsAtLocal?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  /** A new activity has nothing to read, so it starts in the form; an existing
   *  one opens in read mode (CLAUDE.md, read mode first). */
  const [editing, setEditing] = useState(false)
  const close = () => {
    setEditing(false)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(false)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        {/* The heading follows the mode. It said "Vorgang bearbeiten" over a
            read-only view before, and the description repeated the copy hint
            the form carries anyway — both were left over from the time this
            dialog was the editor rather than a container for it. */}
        <DialogHeader>
          <DialogTitle>
            {activity
              ? editing
                ? strings.activity.editTitle
                : strings.activity.detailTitle
              : strings.activity.createTitle}
          </DialogTitle>
          <DialogDescription>
            {activity ? strings.activity.detailHint : strings.activity.createHint}
          </DialogDescription>
        </DialogHeader>

        {activity ? (
          <ActivityDetail
            // Remounted per record, so the form below it reads its initial
            // state from props once and needs no reset effect.
            key={activity.id}
            activity={activity}
            editing={editing}
            onStartEditing={() => setEditing(true)}
            onStopEditing={() => setEditing(false)}
            onSaved={close}
          />
        ) : (
          <ActivityForm
            {...(contactId ? { contactId } : {})}
            {...(startsAtLocal ? { startsAtLocal } : {})}
            onSaved={close}
            onCancel={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
