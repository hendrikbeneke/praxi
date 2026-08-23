import type { Ctx } from '@milkdown/kit/ctx'
import { useEffect, useRef, useState } from 'react'
import type { NoteAction } from '@/components/note-editor-commands'
import { blockActions } from '@/components/note-editor-commands'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The block menu — one component, two ways in: `/` while writing, and the plus
 * in the gutter (L6a).
 *
 * They open the same list because they mean the same thing; a menu that offers
 * different blocks depending on how it was opened is two menus wearing one
 * name.
 *
 * The keyboard is the point of the slash route: one types `/`, keeps typing to
 * narrow, and presses Enter. Arrow keys move, Escape closes. The mouse route
 * gets the same list without the filter, because there is nothing typed to
 * filter by.
 */
export function BlockMenu({
  ctx,
  query,
  onPick,
  onClose,
}: {
  ctx: Ctx | null
  /** What was typed after the `/`, or null when the menu was opened by the
   *  plus and there is nothing to narrow by. */
  query: string | null
  onPick: (action: NoteAction) => void
  onClose: () => void
}) {
  const items = filter(blockActions, query)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  // A narrowing query can leave the highlight past the end of the list.
  const index = items.length === 0 ? -1 : Math.min(active, items.length - 1)

  useEffect(() => {
    setActive(0)
  }, [])

  /**
   * The keys are caught on the document rather than on this element, because
   * the caret stays in the editor the whole time — the menu never takes focus.
   * Taking it would close the selection and leave the writer somewhere else
   * when they press Escape.
   */
  useEffect(() => {
    if (!ctx) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((current) => Math.min(current + 1, items.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key === 'Enter' && index >= 0) {
        event.preventDefault()
        const chosen = items[index]
        if (chosen) onPick(chosen)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [ctx, items, index, onPick, onClose])

  useEffect(() => {
    list.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div
      ref={list}
      role="listbox"
      aria-label={strings.note.blockMenu}
      className="max-h-72 w-60 overflow-y-auto rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.length === 0 && (
        <p className="px-2.5 py-2 text-muted-foreground text-sm">{strings.note.blockMenuEmpty}</p>
      )}
      {items.map((action, position) => (
        <button
          key={action.id}
          type="button"
          role="option"
          aria-selected={position === index}
          data-active={position === index ? '' : undefined}
          // `mousedown` and not `click`: a click would first blur the editor,
          // and the selection the action works on would be gone.
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(action)
          }}
          onMouseEnter={() => setActive(position)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm',
            position === index && 'bg-accent text-accent-foreground',
          )}
        >
          <action.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {action.label}
        </button>
      ))}
    </div>
  )
}

/** Matches on the label, so "auf" finds Aufzählung and Aufgabenliste. Null
 *  means the menu was not opened by typing and shows everything. */
function filter(actions: NoteAction[], query: string | null): NoteAction[] {
  const term = query?.trim().toLowerCase() ?? ''
  if (term === '') return actions
  return actions.filter((action) => action.label.toLowerCase().includes(term))
}
