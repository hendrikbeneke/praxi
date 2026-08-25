import { useState } from 'react'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Inline instead of a dialog (design handoff, "Durchgehende Muster" 2): a
 * list row's detail opens *in the row underneath it*, in read mode, rather
 * than in a modal. Clicking the row again collapses it; clicking a different
 * row moves the detail there instead. Dialogs stay for the documented
 * exceptions — placeholder overview, bulk confirmation, a note.
 *
 * This is deliberately two small pieces rather than one component that also
 * owns the read/edit footer: which footer belongs in edit mode is form
 *-specific (a save button's disabled state depends on the mutation and the
 * validation of whatever is being edited), and every dialog in this app
 * already puts that footer beside the fields as a sibling, not inside a
 * component that would have to know about it. `InlineDetailRow` follows the
 * same shape: the caller puts the read or edit body and both footers inside
 * `children`.
 */

/**
 * `initialOpenId` opens one row on the first render and never again — a
 * *starting* state, not a controlled one. The contact's overview links into
 * the Vorgänge tab with a Vorgang named (L5), and from that moment on clicking
 * another row has to behave exactly as it does everywhere else. Feeding the
 * value back in on every render would fight the toggle instead.
 */
export function useInlineDetail(initialOpenId?: string | undefined) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null)
  const [editing, setEditing] = useState(false)

  return {
    openId,
    isOpen: (id: string) => openId === id,
    editing,
    /** Toggles the given row; switching to a different row (or closing this
     *  one) always lands back in read mode — an edit in progress on a row
     *  that is no longer open would be a state nothing can see or discard. */
    toggle: (id: string) => {
      setEditing(false)
      setOpenId((current) => (current === id ? null : id))
    },
    /** Opens a row outright rather than toggling — for a record that was just
     *  created, where "toggle" would close it if the same id were open. */
    open: (id: string) => {
      setEditing(false)
      setOpenId(id)
    },
    close: () => {
      setEditing(false)
      setOpenId(null)
    },
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
  }
}

/**
 * The detail row itself — a `TableRow` with one cell spanning every column
 * of the list above it. Hover styling is switched off: this row is not
 * another list entry to click.
 *
 * **`whitespace-normal` and `w-0 min-w-full` are load-bearing, not tidying**
 * (B1, C3/D1/H2). Three reported bugs, one cause each, in the same cell:
 * "Bezeichnung" and "Dauer" half outside the card in the Vorgangsarten, the
 * explanatory sentence cut off in the Beziehungsarten, and a Name field in the
 * Mailvorlagen that looked like it had lost its right-hand padding when it was
 * in fact cut at a scroll edge.
 *
 * `whitespace-normal` is the one that actually did it. `TableCell` carries
 * `whitespace-nowrap` — right for a list row, where a wrapped cell would make
 * the rows different heights — and every paragraph and form inside the detail
 * inherited it. Sentences ran on in one line until the card clipped them, and
 * *that* is what pushed the table wide enough to scroll.
 *
 * `w-0 min-w-full` settles the width the other way round, and is worth keeping
 * beside it: a table sizes its columns from what its cells contain, so a form
 * whose min-content is wider than the list would still drive the table. `width:
 * 0` makes this cell ask for nothing, and `min-width: 100%` then fills whatever
 * the list's own rows settled on — the `sm:grid` inside collapses to one column
 * instead of the card overflowing.
 */
export function InlineDetailRow({
  colSpan,
  className,
  children,
}: {
  colSpan: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className={cn('whitespace-normal bg-muted/30 p-4', className)}>
        <div className="w-0 min-w-full">{children}</div>
      </TableCell>
    </TableRow>
  )
}
