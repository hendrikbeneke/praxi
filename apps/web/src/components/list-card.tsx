import type * as React from 'react'
import { TableHead, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * The list shell every catalogue and record list in the redesign shares —
 * built once here so D3–D9 wire it in rather than each inventing its own
 * border radius and header shade (design handoff, "Durchgehende Muster" 3).
 *
 * `ListCard` is deliberately thin: it does not replace `Table`/`TableBody`/
 * `TableRow`/`TableCell` from `components/ui/table.tsx`, it only supplies the
 * card chrome around them and the header row styling via
 * `ListCardHeaderRow`/`ListCardHeaderCell`.
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
 * The header row: `bg-muted/40`, uppercase, tracked-out label text. Sticky to
 * the top of its scroll container — which today is the page itself, since no
 * screen scrolls its list independently yet. `top-0` is correct for that; the
 * day a sticky topbar exists (D3), whichever screen sits below it needs to
 * override the offset, not this component guess at a topbar height it cannot
 * know yet.
 */
export function ListCardHeaderRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableRow className={cn('sticky top-0 z-10 bg-muted/40 hover:bg-muted/40', className)}>
      {children}
    </TableRow>
  )
}

/**
 * The type of a list's column labels — 11px, tracked 0.22px, muted, uppercase
 * (measured in the prototype; it was 12px/0.3px and one step too loud).
 *
 * Exported as a constant rather than living inside `ListCardHeaderCell`, because
 * three lists build their header row by hand out of a CSS grid instead of a
 * `<Table>` — `service-list`, `service-group-list`, `invoice-list`. Each carried
 * its own copy of the class chain, so correcting the component alone would never
 * have reached them, which is exactly how the two drifted apart (K1).
 */
export const listHeaderClass = 'text-[11px] text-muted-foreground uppercase tracking-[0.22px]'

export function ListCardHeaderCell({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return <TableHead className={cn('h-9 px-4', listHeaderClass, className)}>{children}</TableHead>
}

/** Missing values are always this character, never an empty cell — the
 *  reading "there is a value but it did not load" must never happen by
 *  accident (design handoff, "Durchgehende Muster" 3). */
export const DASH = '—'

/**
 * The title bar above a `ListCard`'s table — title, an optional one-line
 * hint, and a right-aligned action (usually "Neuer …"). Reused across every
 * settings catalogue (D4: Rollen, Beziehungen, Vorgangsarten, Textbausteine,
 * Mailvorlagen) rather than five copies of the same flex row; not the same
 * thing as `ListCardHeaderRow`, which is the table's own column-label row
 * underneath this.
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
