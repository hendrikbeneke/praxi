import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import * as GFM from '@milkdown/kit/preset/gfm'
import type { EditorState } from '@milkdown/kit/prose/state'
import { Check, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  blockActions,
  inlineActions,
  linkAction,
  type NoteAction,
} from '@/components/note-editor-commands'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** The blocks worth a button beside the marks — the ones reached often enough
 *  that going through the slash menu would be a detour. The rest stay in the
 *  menu. */
const QUICK_BLOCKS = ['heading-1', 'heading-2', 'bulletList', 'orderedList', 'blockquote']

/**
 * The toolbar that appears over a selection (L6a).
 *
 * **It shows what is on, and a second press takes it back.** That is the one
 * thing the ready-made editors get wrong: a heading set by mistake stays a
 * heading. Every button here reads its own state out of the live editor state
 * and calls an action that knows how to undo itself — see
 * `note-editor-commands.ts`.
 *
 * It never takes focus. Each button prevents the default on `mousedown`, so
 * the selection the action is about is still there when it runs.
 */
export function SelectionToolbar({ ctx, state }: { ctx: Ctx | null; state: EditorState | null }) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')

  const inTable = ctx !== null && state !== null && isInTable(state)

  // A new selection is a new question: an address typed for the last one must
  // not still be standing over this one.
  useEffect(() => {
    setLinking(false)
  }, [])

  if (!ctx || !state) return null

  if (linking) {
    return (
      <div className="flex items-center gap-1 rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-md">
        <Input
          autoFocus
          value={href}
          placeholder={strings.note.linkAddress}
          className="h-8 w-64 text-sm"
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              linkAction.set(ctx, href.trim())
              setLinking(false)
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setLinking(false)
            }
          }}
        />
        <ToolButton
          label={strings.note.linkApply}
          onRun={() => {
            linkAction.set(ctx, href.trim())
            setLinking(false)
          }}
        >
          <Check className="size-4" aria-hidden />
        </ToolButton>
        {linkAction.isActive(state) && (
          <ToolButton
            label={strings.note.linkRemove}
            onRun={() => {
              linkAction.set(ctx, '')
              setLinking(false)
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </ToolButton>
        )}
        <ToolButton label={strings.note.cancel} onRun={() => setLinking(false)}>
          <X className="size-4" aria-hidden />
        </ToolButton>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-md">
      {inlineActions.map((action) => (
        <ActionButton key={action.id} action={action} ctx={ctx} state={state} />
      ))}

      <ToolButton
        label={linkAction.label}
        active={linkAction.isActive(state)}
        onRun={() => {
          setHref(linkAction.href(state))
          setLinking(true)
        }}
      >
        <linkAction.icon className="size-4" aria-hidden />
      </ToolButton>

      <span className="mx-1 h-5 w-px bg-border" />

      {blockActions
        .filter((action) => QUICK_BLOCKS.includes(action.id))
        .map((action) => (
          <ActionButton key={action.id} action={action} ctx={ctx} state={state} />
        ))}

      {inTable && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <TableButton ctx={ctx} label={strings.note.tableRowAfter} command="addRowAfter" />
          <TableButton ctx={ctx} label={strings.note.tableColAfter} command="addColAfter" />
          <TableButton ctx={ctx} label={strings.note.tableDelete} command="delete" />
        </>
      )}
    </div>
  )
}

function ActionButton({
  action,
  ctx,
  state,
}: {
  action: NoteAction
  ctx: Ctx
  state: EditorState
}) {
  return (
    <ToolButton label={action.label} active={action.isActive(state)} onRun={() => action.run(ctx)}>
      <action.icon className="size-4" aria-hidden />
    </ToolButton>
  )
}

const TABLE_COMMANDS = {
  addRowAfter: GFM.addRowAfterCommand,
  addColAfter: GFM.addColAfterCommand,
  delete: GFM.deleteSelectedCellsCommand,
}

function TableButton({
  ctx,
  label,
  command,
}: {
  ctx: Ctx
  label: string
  command: keyof typeof TABLE_COMMANDS
}) {
  return (
    <ToolButton
      label={label}
      onRun={() => {
        ctx.get(commandsCtx).call(TABLE_COMMANDS[command].key)
        ctx.get(editorViewCtx).focus()
      }}
    >
      <span className="px-1 text-xs">{label}</span>
    </ToolButton>
  )
}

/** `mousedown` with the default prevented, always: a `click` would blur the
 *  editor first and the selection this is about would be gone. */
function ToolButton({
  label,
  active,
  onRun,
  children,
}: {
  label: string
  active?: boolean
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn('h-8 min-w-8 px-1.5', active && 'bg-accent text-accent-foreground')}
      onMouseDown={(event) => {
        event.preventDefault()
        onRun()
      }}
    >
      {children}
    </Button>
  )
}

function isInTable(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') return true
  }
  return false
}
