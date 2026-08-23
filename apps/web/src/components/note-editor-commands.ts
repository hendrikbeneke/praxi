import { type CmdKey, commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import * as CM from '@milkdown/kit/preset/commonmark'
import * as GFM from '@milkdown/kit/preset/gfm'
import { lift, setBlockType } from '@milkdown/kit/prose/commands'
import type { NodeType } from '@milkdown/kit/prose/model'
import { liftListItem } from '@milkdown/kit/prose/schema-list'
import type { EditorState } from '@milkdown/kit/prose/state'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  Pilcrow,
  Quote,
  Strikethrough,
  Table,
} from 'lucide-react'
import { strings } from '@/lib/strings'

/**
 * What the toolbar and the block menu can do, and how they know what is
 * already on (L6a).
 *
 * **Every action that can be turned on can be turned off.** That is the whole
 * reason this file exists rather than the toolbar calling Milkdown's commands
 * directly: the mark commands *are* toggles, but the block ones are not —
 * `wrapInHeadingCommand` makes a heading and there is no "unmake" in the same
 * call, so a heading set by mistake would be permanent. Each block action
 * therefore carries its own `isActive` and falls back to a paragraph when it
 * is pressed while active.
 *
 * The three ways in — the selection toolbar, the slash menu, the plus in the
 * gutter — are three pieces of UI over this one list, so they cannot offer
 * different things or disagree about what is on.
 */

export type NoteAction = {
  id: string
  label: string
  icon: LucideIcon
  /** True when the selection already carries it, so the button can show it
   *  and a second press take it back. */
  isActive: (state: EditorState) => boolean
  run: (ctx: Ctx) => void
}

/* -------------------------------------------------------------------------- */

function view(ctx: Ctx) {
  return ctx.get(editorViewCtx)
}

/** A Milkdown command by key, then focus — the editor must never lose the
 *  caret to a toolbar button. */
function call<T>(ctx: Ctx, key: CmdKey<T>, payload?: T): void {
  ctx.get(commandsCtx).call(key, payload)
  view(ctx).focus()
}

function node(ctx: Ctx, name: string): NodeType | undefined {
  return view(ctx).state.schema.nodes[name]
}

/** Whether a mark is on the selection — for a caret, whether it would apply to
 *  what is typed next, which is what `storedMarks` answers. */
function markActive(state: EditorState, name: string): boolean {
  const type = state.schema.marks[name]
  if (!type) return false
  const { from, $from, to, empty } = state.selection
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()))
  return state.doc.rangeHasMark(from, to, type)
}

/** The innermost ancestor of the caret with this node name, if any. */
function inNode(
  state: EditorState,
  name: string,
  match?: (attrs: Record<string, unknown>) => boolean,
): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const parent = $from.node(depth)
    if (parent.type.name === name && (!match || match(parent.attrs))) return true
  }
  return false
}

/**
 * Back to an ordinary paragraph — the way out of every block construct.
 *
 * Lists first and one level at a time, because a nested item has to be lifted
 * out of each list it sits in; then the remaining wrappers (a blockquote);
 * then the block type itself. `lift` returns false once there is nothing left
 * to lift, which is the loop's end and not an error.
 */
function toParagraph(ctx: Ctx): void {
  const editor = view(ctx)
  const item = node(ctx, 'list_item')
  const paragraph = node(ctx, 'paragraph')

  if (item) {
    const liftItem = liftListItem(item)
    // Bounded: the document has finite depth, and each success removes one
    // level. The cap is a stop against a command that reports success without
    // changing anything.
    for (let i = 0; i < 12; i++) if (!liftItem(editor.state, editor.dispatch)) break
  }
  for (let i = 0; i < 12; i++) if (!lift(editor.state, editor.dispatch)) break
  if (paragraph) setBlockType(paragraph)(editor.state, editor.dispatch)
  editor.focus()
}

/* -------------------------------------------------------------------------- */

/** What a selection can be marked with. Milkdown's commands are already
 *  toggles here, so `run` is the same call in both directions. */
export const inlineActions: NoteAction[] = [
  {
    id: 'strong',
    label: strings.note.formatBold,
    icon: Bold,
    isActive: (state) => markActive(state, 'strong'),
    run: (ctx) => call(ctx, CM.toggleStrongCommand.key),
  },
  {
    id: 'emphasis',
    label: strings.note.formatItalic,
    icon: Italic,
    isActive: (state) => markActive(state, 'emphasis'),
    run: (ctx) => call(ctx, CM.toggleEmphasisCommand.key),
  },
  {
    id: 'strikethrough',
    label: strings.note.formatStrike,
    icon: Strikethrough,
    isActive: (state) => markActive(state, 'strike_through'),
    run: (ctx) => call(ctx, GFM.toggleStrikethroughCommand.key),
  },
  {
    id: 'inlineCode',
    label: strings.note.formatCode,
    icon: Code,
    isActive: (state) => markActive(state, 'inlineCode'),
    run: (ctx) => call(ctx, CM.toggleInlineCodeCommand.key),
  },
]

/** Every block a note may be made of, in the order the menu offers them. */
export const blockActions: NoteAction[] = [
  {
    id: 'paragraph',
    label: strings.note.blockParagraph,
    icon: Pilcrow,
    isActive: (state) =>
      state.selection.$from.parent.type.name === 'paragraph' &&
      !inNode(state, 'list_item') &&
      !inNode(state, 'blockquote'),
    run: toParagraph,
  },
  ...([1, 2, 3] as const).map((level) => ({
    id: `heading-${level}`,
    label: strings.note.blockHeading(level),
    icon: [Heading1, Heading2, Heading3][level - 1] ?? Heading3,
    isActive: (state: EditorState) => inNode(state, 'heading', (attrs) => attrs.level === level),
    run: (ctx: Ctx) => {
      const { state } = view(ctx)
      if (inNode(state, 'heading', (attrs) => attrs.level === level)) {
        toParagraph(ctx)
        return
      }
      call(ctx, CM.wrapInHeadingCommand.key, level)
    },
  })),
  {
    id: 'bulletList',
    label: strings.note.blockBullets,
    icon: List,
    isActive: (state) => inNode(state, 'bullet_list') && !taskItem(state),
    run: (ctx) => {
      if (inNode(view(ctx).state, 'bullet_list')) toParagraph(ctx)
      else call(ctx, CM.wrapInBulletListCommand.key)
    },
  },
  {
    id: 'orderedList',
    label: strings.note.blockNumbered,
    icon: ListOrdered,
    isActive: (state) => inNode(state, 'ordered_list'),
    run: (ctx) => {
      if (inNode(view(ctx).state, 'ordered_list')) toParagraph(ctx)
      else call(ctx, CM.wrapInOrderedListCommand.key)
    },
  },
  {
    /* GFM ships an input rule for `- [ ] ` but no command: in mdast a task is
       a `listItem` with `checked`, not a construct of its own. So this wraps
       in a bullet list and then sets the flag on the items the selection
       touches — which is exactly what the input rule does, one step later. */
    id: 'taskList',
    label: strings.note.blockTasks,
    icon: ListChecks,
    isActive: taskItem,
    run: (ctx) => {
      if (taskItem(view(ctx).state)) {
        setChecked(ctx, null)
        return
      }
      if (!inNode(view(ctx).state, 'bullet_list')) call(ctx, CM.wrapInBulletListCommand.key)
      setChecked(ctx, false)
    },
  },
  {
    id: 'blockquote',
    label: strings.note.blockQuote,
    icon: Quote,
    isActive: (state) => inNode(state, 'blockquote'),
    run: (ctx) => {
      if (inNode(view(ctx).state, 'blockquote')) toParagraph(ctx)
      else call(ctx, CM.wrapInBlockquoteCommand.key)
    },
  },
  {
    id: 'codeBlock',
    label: strings.note.blockCode,
    icon: Code,
    isActive: (state) => state.selection.$from.parent.type.name === 'code_block',
    run: (ctx) => {
      if (view(ctx).state.selection.$from.parent.type.name === 'code_block') toParagraph(ctx)
      else call(ctx, CM.createCodeBlockCommand.key)
    },
  },
  {
    id: 'table',
    label: strings.note.blockTable,
    icon: Table,
    isActive: (state) => inNode(state, 'table'),
    // Inserting, not toggling: a table is removed by deleting it, the same as
    // any other content. A second press would have to decide what happens to
    // the cells, and there is no answer that is not a guess.
    run: (ctx) => call(ctx, GFM.insertTableCommand.key),
  },
  {
    id: 'thematicBreak',
    label: strings.note.blockRule,
    icon: Minus,
    isActive: () => false,
    run: (ctx) => call(ctx, CM.insertHrCommand.key),
  },
]

/** The link action lives apart from the four above: it needs an address, so
 *  the toolbar opens a field instead of calling straight through. */
export const linkAction = {
  id: 'link',
  label: strings.note.formatLink,
  icon: Link2,
  isActive: (state: EditorState) => markActive(state, 'link'),
  /** The address under the caret, so editing a link starts on what it says. */
  href: (state: EditorState): string => {
    const { $from } = state.selection
    const mark = state.schema.marks.link
    if (!mark) return ''
    const found = mark.isInSet($from.marks()) ?? mark.isInSet(state.storedMarks ?? [])
    return typeof found?.attrs.href === 'string' ? found.attrs.href : ''
  },
  /** An empty address removes the link; on a selection that already is one the
   *  address is updated, otherwise a new link is made. `toggleLinkCommand`
   *  covers the first and the third, `updateLinkCommand` the second. */
  set: (ctx: Ctx, href: string): void => {
    if (href === '') call(ctx, CM.toggleLinkCommand.key, {})
    else if (linkAction.isActive(view(ctx).state)) call(ctx, CM.updateLinkCommand.key, { href })
    else call(ctx, CM.toggleLinkCommand.key, { href })
  },
}

/* -------------------------------------------------------------------------- */

function taskItem(state: EditorState): boolean {
  return inNode(
    state,
    'list_item',
    (attrs) => attrs.checked !== null && attrs.checked !== undefined,
  )
}

/** `false` makes the items the selection touches into open tasks, `null` makes
 *  them ordinary bullets again. */
function setChecked(ctx: Ctx, checked: false | null): void {
  const editor = view(ctx)
  const { state } = editor
  const tr = state.tr
  state.doc.nodesBetween(state.selection.from, state.selection.to, (child, pos) => {
    if (child.type.name !== 'list_item') return
    tr.setNodeMarkup(pos, undefined, { ...child.attrs, checked })
  })
  if (tr.docChanged) editor.dispatch(tr)
  editor.focus()
}
