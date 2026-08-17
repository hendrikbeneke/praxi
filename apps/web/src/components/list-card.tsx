import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The list shell every catalogue and record list in the redesign shares —
 * built once here so D3–D9 wire it in rather than each inventing its own
 * border radius and header shade (design handoff, "Durchgehende Muster" 3).
 *
 * `ListCard` is deliberately thin: it does not replace `Table`/`TableBody`/
 * `TableRow`/`TableCell` from `components/ui/table.tsx`, it only supplies the
 * card chrome around them; a list that has column labels styles its own header
 * row with `listHeaderClass` below.
 */
export function ListCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('overflow-hidden rounded-[10px] border', className)}>{children}</div>
}

/**
 * The type of a list's column labels — 11px, tracked 0.22px, muted, uppercase
 * (measured in the prototype; it was 12px/0.3px and one step too loud).
 *
 * A constant and not a component, because the three lists that have column
 * labels build their header row differently — two out of a CSS grid, one out of
 * `<Table>` — and each carried its own copy of the class chain, which is how
 * they drifted apart in the first place (K1). There were wrapper components for
 * the `<Table>` case; K3 removed the five settings cards that used them, which
 * left none, so they went the way of any other unused code.
 */
export const listHeaderClass = 'text-[11px] text-muted-foreground uppercase tracking-[0.22px]'

/** Missing values are always this character, never an empty cell — the
 *  reading "there is a value but it did not load" must never happen by
 *  accident (design handoff, "Durchgehende Muster" 3). */
export const DASH = '—'

/**
 * The title bar above a `ListCard`'s table — title, an optional one-line
 * hint, and a right-aligned action (usually "Neuer …"). Reused across every
 * settings catalogue (D4: Rollen, Beziehungen, Vorgangsarten, Textbausteine,
 * Mailvorlagen) rather than five copies of the same flex row. Those five cards
 * have no column-label row under it — the design goes straight from this bar
 * into the rows (K3).
 */
export function ListCardTitleBar({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 border-b bg-muted/40 px-4 py-3">
      <span className="font-semibold">{title}</span>
      {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}
