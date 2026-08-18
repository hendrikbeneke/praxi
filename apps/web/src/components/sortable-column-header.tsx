import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A clickable column heading that sorts, with an arrow showing the direction
 * — extracted from `routes/_app/contacts.index.tsx`, which had this inline
 * already (design handoff D2, "Spaltensortierung").
 *
 * Deliberately not a state container: which field is active and which
 * direction it sorts in lives in each route's own URL search params, because
 * the field names differ per list and TanStack Router types a route's search
 * schema for itself. This component only renders the button and reports a
 * click — the route decides what that click means.
 */
export function SortableColumnHeader({
  label,
  active,
  direction,
  align,
  onClick,
}: {
  label: string
  /** A right-aligned column wants its heading over the digits, not beside the
   *  column before it — the contact list's "Nr." is the one (K6). */
  align?: 'end'
  /** Whether this column is the one currently sorted by. */
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
}) {
  const Arrow = direction === 'desc' ? ArrowDown : ArrowUp

  // `aria-sort` belongs on the enclosing `<th>`, not this button — this
  // component only renders what goes inside one; the caller's `TableHead`
  // carries it if the caller wants it announced.
  return (
    <button
      type="button"
      className={cn(
        '-mx-2 flex items-center gap-1 rounded px-2 py-1 hover:bg-muted',
        // The negative margin has to be paid back in the width, or the label
        // ends 16px short of the digits it is supposed to sit over.
        align === 'end' && 'w-[calc(100%+1rem)] justify-end',
      )}
      onClick={onClick}
    >
      {label}
      {active && <Arrow className="size-3" aria-hidden />}
    </button>
  )
}
