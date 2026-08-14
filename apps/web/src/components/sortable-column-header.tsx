import { ArrowDown, ArrowUp } from 'lucide-react'

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
  onClick,
}: {
  label: string
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
      className="-mx-2 flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
      onClick={onClick}
    >
      {label}
      {active && <Arrow className="size-3" aria-hidden />}
    </button>
  )
}
