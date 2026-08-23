import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { BlockProvider, block, blockSpec } from '@milkdown/kit/plugin/block'
import { listenerCtx } from '@milkdown/kit/plugin/listener'
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash'
import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip'
import { type EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { GripVertical, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NoteAction } from '@/components/note-editor-commands'
import { BlockMenu } from '@/components/note-editor-menu'
import { NOTE_STRINGIFY_OPTIONS, noteEditorPlugins } from '@/components/note-editor-plugins'
import { SelectionToolbar } from '@/components/note-editor-toolbar'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/**
 * The note field — Milkdown over ProseMirror, written as Markdown and stored
 * as Markdown (L6a).
 *
 * ## What replaced the textarea, and why the old warning no longer holds
 *
 * Until L6a this was a `<textarea>` whose contents *were* the stored string,
 * on the argument that a document model would rewrite a note on the way out of
 * storage — list markers, blank lines — and that for a note about to be locked
 * the hashed text would then not be the text that was typed.
 *
 * **The premise was right and the conclusion was wrong**, and the reason is
 * the order of events: `content_hash` is formed **when the note is locked**,
 * and a locked note is never opened in an editor again — `protect_locked_note`
 * makes it immutable and every screen refuses first. So the only note this
 * editor can re-serialize is an open one, where a rewritten bullet marker is
 * a rewritten bullet marker and nothing more. What is hashed stays what was
 * hashed.
 *
 * Two of those rewrites were measured and are configured away rather than
 * lived with, because they would touch every existing note on its first save:
 * `bullet: '-'` (or every `-` becomes `*`) and `rule: '-'` (or every `---`
 * becomes `***`). See `NOTE_STRINGIFY_OPTIONS`.
 *
 * ## contentEditable, and why the ban does not apply
 *
 * CLAUDE.md forbids a `contentEditable` editor for note text. That rule is
 * about *raw* contentEditable, where the browser invents markup as one types —
 * different markup per browser — in a field that gets hashed and locked.
 * ProseMirror is the opposite construction: it holds a schema, and a node that
 * is not in the schema cannot come into being, however it was pasted. The
 * schema here is assembled construct by construct in
 * `note-editor-plugins.ts`, and `normalizeNoteMdast` in `packages/shared` says
 * the same thing on the way in. The rule is met, not bypassed.
 *
 * ## The initial value goes in through `defaultValueCtx`
 *
 * Not through a `replaceAll` after creation. A transaction after the editor
 * exists becomes an undo step, so the first Cmd+Z would step *behind* the load
 * and empty the field — twenty minutes of writing, one keystroke. The value is
 * therefore read once, at mount; a caller that replaces the text from outside
 * (accepting a draft) remounts this component with a new `key`.
 */
/**
 * The `/query` under the caret, or null.
 *
 * A slash starts the menu and everything up to the caret narrows it; a space
 * or a second slash ends it, because a slash in a sentence is a slash. One
 * definition, read by the provider's `shouldShow` and by the reader that fills
 * the menu — otherwise the menu could stand open over a query that no longer
 * exists, or close over one that does.
 */
function slashQuery(state: EditorState): { from: number; query: string } | null {
  const { $from, empty } = state.selection
  if (!empty) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC')
  const match = /\/([^/\s]*)$/.exec(before)
  if (!match) return null
  return { from: $from.pos - match[0].length, query: match[1] ?? '' }
}

export function NoteEditor({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  /** Read **once**, at mount — see above. */
  value: string
  onChange: (next: string) => void
  /** On the *wrapper*, which is what the floating menus are positioned
   *  inside — so a caller that wants the editor to fill a pane says so here
   *  and puts its own scrolling box around the whole thing (L6b). */
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  /** The live editor state, mirrored into React so the toolbar can show what
   *  is active. Held as state rather than read on render, because a
   *  ProseMirror transaction is not something React knows happened. */
  const [state, setState] = useState<EditorState | null>(null)

  /**
   * The block menu, and **which way it was opened**, because the two are not
   * interchangeable. A menu opened by `/` closes when the slash is gone; a
   * menu opened by the plus in the gutter must not, or the very transaction
   * that made room for it would close it again — which is exactly what
   * happened while this was one flat piece of state.
   */
  const [menu, setMenu] = useState<
    | { from: 'slash'; query: string; at: number }
    | { from: 'handle'; top: number; left: number }
    | null
  >(null)

  /** The three floating layers. Each is a detached element the provider
   *  positions and shows, and React renders into it through a portal — so the
   *  menus are ordinary components with our tokens, in our tree, without a
   *  second React root and without `@milkdown/react` (which would drag Crepe
   *  in behind it). */
  const [slots] = useState(() => {
    const make = () => {
      const element = document.createElement('div')
      element.className = 'note-float'
      element.dataset.show = 'false'
      return element
    }
    return { toolbar: make(), slash: make(), handle: make() }
  })

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(value)

  const blockProvider = useRef<BlockProvider | null>(null)

  useEffect(() => {
    const root = host.current
    if (!root) return

    let editor: Editor | undefined
    let cancelled = false

    const toolbar = tooltipFactory('NOTE_TOOLBAR')
    const slash = slashFactory('NOTE_SLASH')

    void Editor.make()
      .config((editorCtx) => {
        editorCtx.set(rootCtx, root)
        editorCtx.set(defaultValueCtx, valueRef.current)
        editorCtx.set(remarkStringifyOptionsCtx, NOTE_STRINGIFY_OPTIONS)
        editorCtx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { class: 'note-prose note-editor-surface', id },
          handleDOMEvents: {
            ...prev.handleDOMEvents,
            /**
             * Ticking a task off.
             *
             * Milkdown's task item is an ordinary `list_item` with a `checked`
             * attribute and no widget of its own; the box is the `::before` in
             * `styles.css`. A click that lands on the `li` **itself** rather
             * than on the paragraph inside it is a click on that box — the
             * text is a child, so it never reports the item as its target.
             */
            mousedown: (currentView, event) => {
              const target = event.target
              if (!(target instanceof HTMLElement)) return false
              if (target.tagName !== 'LI' || target.dataset.itemType !== 'task') return false

              const $at = currentView.state.doc.resolve(currentView.posAtDOM(target, 0))
              for (let depth = $at.depth; depth > 0; depth--) {
                const item = $at.node(depth)
                if (item.type.name !== 'list_item') continue

                event.preventDefault()
                currentView.dispatch(
                  currentView.state.tr.setNodeMarkup($at.before(depth), undefined, {
                    ...item.attrs,
                    checked: item.attrs.checked !== true,
                  }),
                )
                return true
              }
              return false
            },
          },
        }))

        editorCtx.get(listenerCtx).markdownUpdated((_c, markdown) => {
          onChangeRef.current(markdown)
        })

        editorCtx.set(toolbar.key, {
          view: (editorView) => {
            const provider = new TooltipProvider({
              content: slots.toolbar,
              debounce: 20,
              /* Only over a stretch of text that was actually selected.
                 Milkdown's default also fires on a `NodeSelection`, and the
                 block handle makes one on every mousedown — so pressing the
                 plus in the gutter opened the formatting toolbar over a block
                 nobody had selected. */
              shouldShow: (currentView) => {
                const { selection } = currentView.state
                return (
                  currentView.hasFocus() &&
                  selection instanceof TextSelection &&
                  !selection.empty &&
                  currentView.state.doc.textBetween(selection.from, selection.to).trim() !== ''
                )
              },
            })
            provider.update(editorView)
            return {
              update: (updated, prev) => provider.update(updated, prev),
              destroy: () => provider.destroy(),
            }
          },
        })

        editorCtx.set(slash.key, {
          view: (editorView) => {
            const provider = new SlashProvider({
              content: slots.slash,
              debounce: 0,
              /* Milkdown's default only shows the menu on the keystroke that
                 *is* the trigger, so the first letter typed to narrow the list
                 closes it again. The menu has to stay up for as long as there
                 is a `/query` under the caret, which is exactly what
                 `slashQuery` answers — one test, used here and by the reader
                 below, so the menu cannot be open with nothing to filter by. */
              shouldShow: (currentView) => slashQuery(currentView.state) !== null,
            })
            provider.onHide = () =>
              setMenu((current) => (current?.from === 'slash' ? null : current))
            provider.update(editorView)
            return {
              update: (updated, prev) => {
                provider.update(updated, prev)
                readSlashQuery(updated.state)
              },
              destroy: () => provider.destroy(),
            }
          },
        })

        editorCtx.set(blockSpec.key, {
          view: () => {
            const provider = new BlockProvider({ ctx: editorCtx, content: slots.handle })
            blockProvider.current = provider
            return {
              update: () => provider.update(),
              destroy: () => {
                provider.destroy()
                /* Only if it is still ours. React runs the mount effect twice
                   in development, and the first editor's `destroy` lands
                   *after* the second one has already published its provider —
                   nulling it there left the plus in the gutter doing nothing
                   at all, with no error to show for it. */
                if (blockProvider.current === provider) blockProvider.current = null
              },
            }
          },
        })

        /* `blockConfig` is left at its default on purpose: it already excludes
           nodes inside a table, so the handle points at the whole table rather
           than at each cell. */
      })
      .use(noteEditorPlugins)
      .use(block)
      .use(toolbar)
      .use(slash)
      .create()
      .then((created) => {
        if (cancelled) {
          void created.destroy()
          return
        }
        editor = created
        setCtx(created.ctx)
        const editorView = created.ctx.get(editorViewCtx)
        setState(editorView.state)

        /* One place that keeps the mirrored state fresh — every transaction,
           typed or programmatic. `updateState` and deliberately not
           `view.dispatch`: dispatch is what *calls* this handler, so calling it
           back from inside would be an unbounded recursion, and the editor
           would silently accept no input at all. */
        editorView.setProps({
          dispatchTransaction: (transaction) => {
            const next = editorView.state.apply(transaction)
            editorView.updateState(next)
            setState(next)
          },
        })
      })

    function readSlashQuery(editorState: EditorState) {
      const found = slashQuery(editorState)
      if (!found) {
        setMenu((current) => (current?.from === 'slash' ? null : current))
        return
      }
      setMenu({ from: 'slash', query: found.query, at: found.from })
    }

    return () => {
      cancelled = true
      void editor?.destroy()
      setCtx(null)
      setState(null)
    }
  }, [id, slots])

  /**
   * Running a block action from the menu.
   *
   * The typed `/query` goes first, in its own transaction — otherwise the
   * action would wrap the slash into whatever block was chosen and the writer
   * would have to delete it out of a heading.
   */
  const pick = useCallback(
    (action: NoteAction) => {
      if (!ctx) return
      const editorView = ctx.get(editorViewCtx)
      if (menu?.from === 'slash') {
        editorView.dispatch(editorView.state.tr.delete(menu.at, editorView.state.selection.from))
      }
      setMenu(null)
      action.run(ctx)
    },
    [ctx, menu],
  )

  /** The plus in the gutter: a fresh empty paragraph under the block it points
   *  at, the caret in it, and the same menu open over it — so the hovered
   *  block is never the thing that gets transformed by accident. */
  const openFromHandle = useCallback(() => {
    if (!ctx) return
    const active = blockProvider.current?.active
    const editorView = ctx.get(editorViewCtx)
    const paragraph = editorView.state.schema.nodes.paragraph
    if (!active || !paragraph) return

    const end = active.$pos.pos + active.node.nodeSize
    const tr = editorView.state.tr.insert(end, paragraph.create())
    // +1 to land inside the new paragraph rather than in front of it.
    tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)))
    editorView.dispatch(tr)
    editorView.focus()

    /* Where the handle stands, in the wrapper's coordinates — the menu opens
       under the plus that was pressed rather than at a fixed corner. Read now
       and not on render: the handle hides the moment the pointer leaves it. */
    const wrapper = host.current?.parentElement?.getBoundingClientRect()
    const gutter = slots.handle.getBoundingClientRect()
    setMenu({
      from: 'handle',
      top: gutter.bottom - (wrapper?.top ?? 0) + 4,
      left: gutter.left - (wrapper?.left ?? 0),
    })
  }, [ctx, slots])

  return (
    <div className={cn('relative', className)}>
      <div ref={host} className="note-editor-host min-h-full bg-transparent" />

      {createPortal(<SelectionToolbar ctx={ctx} state={state} />, slots.toolbar)}

      {createPortal(
        menu?.from === 'slash' ? (
          <BlockMenu ctx={ctx} query={menu.query} onPick={pick} onClose={() => setMenu(null)} />
        ) : null,
        slots.slash,
      )}

      {createPortal(
        <div className="flex items-center">
          <button
            type="button"
            draggable={false}
            aria-label={strings.note.blockMenu}
            title={strings.note.blockMenu}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onMouseDown={(event) => {
              event.preventDefault()
              openFromHandle()
            }}
          >
            <Plus className="size-4" aria-hidden />
          </button>
          {/* The grip itself is not interactive markup: the drag is bound by
              `BlockProvider`, which makes the whole layer draggable — so this
              is a picture of where to grab, and the plus above it opts out
              with `draggable={false}`. */}
          <span
            title={strings.note.blockHandle}
            className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <GripVertical className="size-4" aria-hidden />
            <span className="sr-only">{strings.note.blockHandle}</span>
          </span>
        </div>,
        slots.handle,
      )}

      {/* Opened by the plus rather than by typing: it has no slash to sit
          under, so it is placed beside the handle. */}
      {menu?.from === 'handle' && (
        <div className="absolute z-20" style={{ top: menu.top, left: menu.left }}>
          <BlockMenu ctx={ctx} query={null} onPick={pick} onClose={() => setMenu(null)} />
        </div>
      )}
    </div>
  )
}
