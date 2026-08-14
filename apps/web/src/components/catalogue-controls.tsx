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
import { cn } from '@/lib/utils'

/**
 * The controls every catalogue list uses — roles, relation types, activity
 * types today; services, service groups and the settings' text and mail
 * templates from D4/D5 on (CLAUDE.md D2).
 *
 * `OrderButtons` and `CheckboxField` were written for the first catalogue and
 * copied to the second within the same file; the third would have been the
 * point at which three copies drift apart. What stays per catalogue is the
 * wording that names *what* is being deleted or activated — the delete
 * dialog's title and body stay props — everything genuinely generic
 * (Aktiv/Inaktiv, Nach oben/unten) reads from `strings.catalogue` instead of
 * being repeated under each entity's own key.
 */

/**
 * Order is moved one step at a time, never dragged (design handoff rule 6).
 * This component is presentation only: what `onMove` does — swap two rows'
 * `sort_order` and renumber the list gaplessly, in one transaction — lives in
 * `domain/reorder.ts` on the server, behind each catalogue's `/move` route.
 */
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
        aria-label={strings.catalogue.moveUp}
        disabled={index === 0 || pending}
        onClick={() => onMove(index, -1)}
      >
        <ChevronUp className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.catalogue.moveDown}
        disabled={index === count - 1 || pending}
        onClick={() => onMove(index, 1)}
      >
        <ChevronDown className="size-4" aria-hidden />
      </Button>
    </span>
  )
}

/**
 * Status as a dot plus a word, not a badge (design handoff, "Durchgehende
 * Muster" 4) — every catalogue list uses this instead of a `Badge` for its
 * `active` column. Switched only in edit mode; the dot itself never takes a
 * click, the caller's checkbox does.
 */
export function ActiveStatus({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn('size-[7px] rounded-full', active ? 'bg-primary' : 'bg-muted-foreground')}
        aria-hidden
      />
      <span className="text-[12.5px] text-muted-foreground">
        {active ? strings.catalogue.active : strings.catalogue.inactive}
      </span>
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
