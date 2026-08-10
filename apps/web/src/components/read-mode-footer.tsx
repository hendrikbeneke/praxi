import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { strings } from '@/lib/strings'

/**
 * The footer of a dialog showing an existing record, before anyone asked to
 * change it — see the read-mode convention in CLAUDE.md.
 *
 * It is one component rather than a copy per dialog so that every record looks
 * and behaves the same once open: closing on the left, "Bearbeiten" on the
 * right where "Speichern" will be. Which button opened the dialog makes no
 * difference to what it looks like.
 */
export function ReadModeFooter({
  onClose,
  onEdit,
  /** A locked note, an archived contact: there is nothing to switch into. */
  canEdit = true,
}: {
  onClose: () => void
  onEdit: () => void
  canEdit?: boolean
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        {strings.actions.close}
      </Button>
      {canEdit && (
        <Button type="button" variant="outline" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
          {strings.actions.edit}
        </Button>
      )}
    </DialogFooter>
  )
}
