import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { strings } from '@/lib/strings'

/**
 * The three controls every catalogue list in the settings uses: roles,
 * relation types and activity types.
 *
 * They were written for the first of those and copied to the second within the
 * same file; the third would have been the point at which three copies drift
 * apart. What stays per catalogue is the wording — the delete dialog says what
 * happens to *that* kind of entry — so the texts are props.
 */

/** Order is moved one step at a time rather than dragged: two rows swap their
 *  `sort_order`, which is two ordinary saves and needs no new endpoint. */
export function OrderButtons({
  index,
  count,
  pending,
  onMove,
}: {
  index: number
  count: number
  pending: boolean
  onMove: (index: number, delta: number) => void
}) {
  return (
    <span className="flex">
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.contactType.moveUp}
        disabled={index === 0 || pending}
        onClick={() => onMove(index, -1)}
      >
        <ChevronUp className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.contactType.moveDown}
        disabled={index === count - 1 || pending}
        onClick={() => onMove(index, 1)}
      >
        <ChevronDown className="size-4" aria-hidden />
      </Button>
    </span>
  )
}

export function DeleteButton({
  disabled,
  hint,
  title,
  body,
  onConfirm,
}: {
  disabled: boolean
  hint?: string | undefined
  title: string
  body: string
  onConfirm: () => void
}) {
  if (disabled) {
    return (
      <Button variant="ghost" size="icon" disabled title={hint} aria-label={strings.actions.delete}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={strings.actions.delete}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.actions.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{strings.actions.delete}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function CheckboxField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
      {hint && <p className="mt-1 ml-7 text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
