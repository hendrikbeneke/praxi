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
 * already puts that footer next to `ReadModeFieldset` as a sibling, not
 * inside a component that would have to know about it. `InlineDetailRow`
 * follows the same shape: the caller puts `ReadModeFieldset` and both
 * footers inside `children`.
 */

export function useInlineDetail() {
  const [openId, setOpenId] = useState<string | null>(null)
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
    close: () => {
      setEditing(false)
      setOpenId(null)
    },
    startEditing: () => setEditing(true),
    stopEditing: () => setEditing(false),
  }
}

/** The detail row itself — a `TableRow` with one cell spanning every column
 *  of the list above it. Hover styling is switched off: this row is not
 *  another list entry to click. */
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
      <TableCell colSpan={colSpan} className={cn('bg-muted/30 p-4', className)}>
        {children}
      </TableCell>
    </TableRow>
  )
}
