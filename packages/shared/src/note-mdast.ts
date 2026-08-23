import type { Nodes, Root } from 'mdast'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * **This file is the definition of what a note may contain** (L6a).
 *
 * Not a description of it, and not a safety net around one: `NOTE_MDAST_TYPES`
 * below is the list, and everything else — the editor's plugin list, the
 * renderer's element registry, the future PDF renderer — is measured against
 * it. `apps/web/src/components/note-editor-plugins.ts` derives the Milkdown
 * plugins from this list and asserts the two agree, so a construct cannot be
 * editable without being renderable, or the other way round.
 *
 * ## Why a normalizer has to exist at all
 *
 * Milkdown does not ignore a construct its schema has no plugin for — **it
 * throws, at editor creation, and there is no editor afterwards.** Measured in
 * Chrome 151 against this very plugin list, with a note containing
 * `![x](data:image/png;base64,…)`:
 *
 * ```
 * MilkdownError: Cannot match target parser for node: {"type":"image", …}
 * document.querySelector('.ProseMirror')  →  null
 * ```
 *
 * So one image pasted from a mail, once, and that note can never be opened
 * again. Markdown arrives from outside constantly — a paste from Word, a mail,
 * a web page — and it arrives as constructs nobody chose.
 *
 * It runs as a remark *transformer*, which is why it is reached at all:
 * `@milkdown/transformer` parses with `remark.runSync(remark.parse(md), md)`,
 * so a `$remark` plugin sees the tree before the ProseMirror parser walks it.
 *
 * ## The rule is generic, not a list of special cases
 *
 * Three sets and one fallback:
 *
 * - **kept** — `NOTE_MDAST_TYPES`, recursed into;
 * - **dropped** — the ones that must not survive even as their text: an image
 *   (see below) and raw `html`, which is the one node whose `value` *is*
 *   markup and would otherwise be turned into a text node reading `<script>`;
 * - **everything else** — replaced by its children, or by its `value` as text
 *   if it has none, or dropped if it has neither.
 *
 * The fallback is the point. It carries a construct that does not exist yet:
 * when `==highlight==` arrives one day as a remark plugin with its own node
 * type, a note written with it and read by an older build degrades to its text
 * instead of taking the editor down. Special cases would have to be written in
 * advance, and nobody can write them in advance.
 *
 * ## Images are the one deliberate inequality
 *
 * See `IMAGE_IS_DEFERRED`.
 */

/**
 * **The closed set.** A construct is in this list exactly when the editor can
 * edit it and the renderer can draw it.
 *
 * `root`, `text` and `break` are structure rather than a choice; the rest is
 * the language: paragraph, headings to level three, both kinds of list plus
 * task items, bold, italic, strikethrough, inline code, a code block, a quote,
 * a link, a table and a horizontal rule.
 */
export const NOTE_MDAST_TYPES = [
  'root',
  'paragraph',
  'text',
  'break',
  'heading',
  'list',
  'listItem',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'link',
  'code',
  'blockquote',
  'table',
  'tableRow',
  'tableCell',
  'thematicBreak',
] as const

export type NoteMdastType = (typeof NOTE_MDAST_TYPES)[number]

const KEPT: ReadonlySet<string> = new Set(NOTE_MDAST_TYPES)

/**
 * **The one construct the editor could carry and this list deliberately does
 * not** — and it is named rather than merely absent, so the image package
 * lifts it on purpose instead of discovering it as a bug.
 *
 * Milkdown's `imageSchema` works. What does not work is where the bytes go: a
 * screenshot pasted into the editor arrives as `data:image/png;base64,…` and
 * would land in `note.text` — megabytes in a `text` column, and part of
 * `content_hash` the moment the note is locked. Rule 7 says a file belongs to
 * a note through `note_file`, where it inherits the locking; an image will
 * come back as an upload plus a reference in the markdown, and on that day
 * `image` joins `NOTE_MDAST_TYPES` and the drop below goes.
 */
export const IMAGE_IS_DEFERRED = ['image', 'imageReference'] as const

/**
 * Removed outright rather than flattened to their text.
 *
 * `html` is the one that matters: it is the only node whose `value` is markup,
 * so the generic fallback would faithfully turn `<script>x</script>` into a
 * text node reading `<script>x</script>` — harmless to render (nothing here
 * produces HTML) but wrong to keep, because it would round-trip back out of
 * the editor and stand in the record as something nobody typed.
 *
 * The rest carry references into a document that no longer exists once their
 * definition is gone, and a dangling `[^1]` says less than nothing.
 */
const DROPPED: ReadonlySet<string> = new Set([
  ...IMAGE_IS_DEFERRED,
  'html',
  'definition',
  'footnoteDefinition',
  'footnoteReference',
  'yaml',
  'toml',
])

/** Headings deeper than this are lifted rather than dropped: the practitioner
 *  meant a heading, and three levels are as many as a note has use for. */
const MAX_HEADING_DEPTH = 3

type WithChildren = { children: unknown[] }

function hasChildren(node: unknown): node is WithChildren {
  return Array.isArray((node as { children?: unknown }).children)
}

function typeOf(node: unknown): string {
  return String((node as { type?: unknown }).type ?? '')
}

/**
 * Flatten the tree to what a note may contain — in place, and total: it never
 * throws, whatever it is handed.
 */
export function normalizeNoteMdast(tree: Root): Root {
  visit(tree)
  return tree
}

function visit(node: unknown): void {
  if (typeOf(node) === 'heading') {
    const heading = node as { depth: number }
    if (heading.depth > MAX_HEADING_DEPTH) heading.depth = MAX_HEADING_DEPTH
  }

  if (!hasChildren(node)) return

  const kept: unknown[] = []
  for (const child of node.children) {
    // Depth first: a child is cleaned before it is judged, so an allowed
    // construct nested inside a discarded one still survives — a link inside a
    // footnote definition does not, because that whole node is dropped, but a
    // link inside a `linkReference` does.
    visit(child)

    const type = typeOf(child)
    if (DROPPED.has(type)) continue
    if (KEPT.has(type)) {
      kept.push(child)
      continue
    }

    if (hasChildren(child) && child.children.length > 0) {
      kept.push(...child.children)
      continue
    }
    const value = (child as { value?: unknown }).value
    if (typeof value === 'string' && value !== '') kept.push({ type: 'text', value })
  }

  node.children = kept as Nodes[]
}

/**
 * The one pipeline, shared by the editor and the renderer.
 *
 * `remark-gfm` for the table, the task item and the strikethrough; then
 * `remark-breaks`, so a single newline is a line break rather than a space —
 * somebody typing three names under each other means three lines, and the
 * editor serializes them back the same way through
 * `handlers: { break: () => '\n' }`. The normalizer runs last, after every
 * extension has had its say, so nothing it does not know about can reach the
 * tree behind its back.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(() => normalizeNoteMdast)

/** A note's text as the closed tree above. Never throws. */
export function noteMdast(text: string): Root {
  return processor.runSync(processor.parse(text))
}

/**
 * The note without its markup, for the two-line excerpt on an activity.
 *
 * Derived from the parsed tree rather than by stripping characters, so there
 * is one definition of what the syntax means. A block boundary becomes a
 * newline; everything else runs together.
 */
export function plainNoteText(text: string): string {
  const lines: string[] = []
  collect(noteMdast(text), lines)
  return lines.join('\n').trim()
}

/** What starts a line. Deliberately *not* `listItem`: an item holds a
 *  paragraph and possibly a nested list, and treating the item as the block
 *  would run the nested items into the line above them. */
const BLOCK_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'tableCell', 'code'])

function collect(node: unknown, lines: string[]): void {
  const type = typeOf(node)

  if (BLOCK_TYPES.has(type)) {
    const parts: string[] = []
    gather(node, parts)
    const line = parts.join('').trim()
    if (line !== '') lines.push(line)
    return
  }

  if (type === 'break') return
  if (hasChildren(node)) for (const child of node.children) collect(child, lines)
}

/** The text under one block, marks and all — a nested list inside a list item
 *  is a block of its own and is left to `collect`. */
function gather(node: unknown, parts: string[]): void {
  const type = typeOf(node)
  if (type === 'break') {
    parts.push(' ')
    return
  }
  if (type === 'text' || type === 'inlineCode' || type === 'code') {
    parts.push(String((node as { value?: unknown }).value ?? ''))
    return
  }
  if (hasChildren(node)) for (const child of node.children) gather(child, parts)
}
