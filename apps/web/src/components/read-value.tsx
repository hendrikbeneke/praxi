import type * as React from 'react'
import { DASH } from '@/components/list-card'
import { cn } from '@/lib/utils'

/**
 * A stored value in read mode — the text that stands where the input would be
 * in edit mode (K2).
 *
 * Read mode used to render the fields themselves, disabled. That looked like a
 * form and was not one: a border and a grey box promise an entry that cannot be
 * made, and a contact with few details filled in became a wall of empty boxes.
 * The handoff says it plainly for the role checkboxes — "keine deaktivierten
 * Checkboxen im Lesemodus, die waren unlesbar" — and a disabled text field is
 * the same mistake with a longer label. CLAUDE.md's rule asks that reading
 * cannot change the record; it does not ask that a value look like a field.
 *
 * The label above it stays the same `Label` in both modes, so switching to edit
 * moves no line — only the box appears.
 *
 * `min-h-9` matches the height of the `Input` it replaces, which keeps a
 * two-column grid from reflowing when one side has a value and the other does
 * not. Missing values are `DASH`, the same character every list uses.
 */
export function ReadValue({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  const empty = children === null || children === undefined || children === '' || children === false
  return (
    <p
      className={cn(
        'mt-2 flex min-h-9 items-center text-sm',
        empty && 'text-muted-foreground',
        className,
      )}
    >
      {empty ? DASH : children}
    </p>
  )
}
