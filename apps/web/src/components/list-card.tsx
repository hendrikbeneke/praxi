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

export function ListCardHeaderCell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableHead className={cn('text-muted-foreground text-xs uppercase tracking-wide', className)}>
      {children}
    </TableHead>
  )
}

/** Missing values are always this character, never an empty cell — the
 *  reading "there is a value but it did not load" must never happen by
 *  accident (design handoff, "Durchgehende Muster" 3). */
export const DASH = '—'
