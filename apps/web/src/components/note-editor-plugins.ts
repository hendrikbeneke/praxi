import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { history } from '@milkdown/kit/plugin/history'
import { listener } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import * as CM from '@milkdown/kit/preset/commonmark'
import * as GFM from '@milkdown/kit/preset/gfm'
import { $remark } from '@milkdown/kit/utils'
import { type NoteMdastType, normalizeNoteMdast } from '@praxi/shared'
import remarkBreaks from 'remark-breaks'

/**
 * The editor's language, assembled construct by construct (L6a).
 *
 * **Not `commonmark` and not `gfm`.** Both presets are themselves nothing but
 * such a list — `commonmark = [schema, inputRules, markInputRules, commands,
 * keymap, plugins].flat()` — so composing one here is the same building method
 * with a shorter result, not a trick. What it buys is that a construct is in
 * the editor because somebody put it there.
 *
 * ## The map is the point, not the list
 *
 * `NOTE_SCHEMA_PLUGINS` is keyed by mdast node type — the same names
 * `NOTE_MDAST_TYPES` in `packages/shared` uses — and the plugin array below is
 * *derived* from it. So a schema plugin that is not accounted for cannot be
 * loaded at all, and `note-editor-plugins.test.ts` asserts the other
 * direction: every type the normalizer lets through has an entry here.
 *
 * That matters because the two halves fail in opposite ways. A construct the
 * normalizer allows and the editor has no plugin for **takes the editor down
 * on load** — Milkdown throws rather than skipping. A construct the editor can
 * produce and the normalizer strips would be **silently deleted the next time
 * the note is opened**. Neither is something to find in a case file.
 *
 * ## Deliberately not loaded
 *
 * - `imageSchema` — see `IMAGE_IS_DEFERRED` in `packages/shared`.
 * - `htmlSchema` and `remarkHtmlTransformer` — raw HTML in a field that gets
 *   hashed and locked has no business being editable, or storable.
 * - `remarkPreserveEmptyLinePlugin` — it carries a blank line as a literal
 *   `<br />` in the markdown, permanently, because the round trip is
 *   idempotent. A note is not allowed to contain markup nobody wrote.
 * - `remarkLineBreak` — it does what `remark-breaks` does, and marks its
 *   breaks `isInline`, which serializes them as a raw `\n` inside a text node
 *   instead of through the `break` handler below. One spelling of one
 *   behaviour.
 * - `remarkInlineLinkPlugin`, `footnote*` — nothing here reads them.
 */

/** The stringifier's settings, and both of them were measured rather than
 *  guessed (see `note-editor.tsx`): without `bullet` every `-` becomes `*`,
 *  and without `rule` every `---` becomes `***` — on the first save, in every
 *  note that already had one. */
export const NOTE_STRINGIFY_OPTIONS = {
  bullet: '-',
  rule: '-',
  handlers: { break: () => '\n' },
} as const

/** The normalizer, in the editor's own remark pipeline. It is what stands
 *  between a pasted mail and a note that can never be opened again. */
const remarkNormalizeNote = $remark('remarkNormalizeNote', () => () => normalizeNoteMdast)

const remarkBreaksPlugin = $remark('remarkBreaks', () => remarkBreaks)

/**
 * A composite like `$NodeSchema` is a *tuple* of Milkdown plugins with extra
 * properties hung off it, so an entry below is either one plugin or several.
 * They are flattened once, at the bottom.
 */
type PluginEntry = MilkdownPlugin | MilkdownPlugin[]

/**
 * One entry per construct a note may contain — schema, input rule, command and
 * keymap together, because they are one decision.
 *
 * `root`, `text` and `break` are structure: a document, its characters, and
 * the line break that `remark-breaks` produces from a single newline.
 */
export const NOTE_SCHEMA_PLUGINS: Record<NoteMdastType, PluginEntry[]> = {
  root: [CM.docSchema],
  text: [CM.textSchema],
  break: [CM.hardbreakAttr, CM.hardbreakSchema, CM.insertHardbreakCommand, CM.hardbreakKeymap],

  paragraph: [CM.paragraphAttr, CM.paragraphSchema, CM.turnIntoTextCommand, CM.paragraphKeymap],
  heading: [
    CM.headingIdGenerator,
    CM.headingAttr,
    CM.headingSchema,
    CM.wrapInHeadingInputRule,
    CM.wrapInHeadingCommand,
    CM.downgradeHeadingCommand,
    CM.headingKeymap,
  ],
  list: [
    CM.bulletListAttr,
    CM.bulletListSchema,
    CM.wrapInBulletListInputRule,
    CM.wrapInBulletListCommand,
    CM.bulletListKeymap,
    CM.orderedListAttr,
    CM.orderedListSchema,
    CM.wrapInOrderedListInputRule,
    CM.wrapInOrderedListCommand,
    CM.orderedListKeymap,
  ],
  listItem: [
    CM.listItemAttr,
    CM.listItemSchema,
    // Nesting: Tab sinks, Shift-Tab lifts. `extendListItemSchemaForTask` adds
    // the checkbox, which is why a task item is not a construct of its own —
    // in mdast it is a `listItem` with `checked`.
    CM.sinkListItemCommand,
    CM.liftListItemCommand,
    CM.liftFirstListItemCommand,
    CM.splitListItemCommand,
    CM.listItemKeymap,
    GFM.extendListItemSchemaForTask,
    GFM.wrapInTaskListInputRule,
  ],
  code: [
    CM.codeBlockAttr,
    CM.codeBlockSchema,
    CM.createCodeBlockInputRule,
    CM.createCodeBlockCommand,
    CM.codeBlockKeymap,
  ],
  blockquote: [
    CM.blockquoteAttr,
    CM.blockquoteSchema,
    CM.wrapInBlockquoteInputRule,
    CM.wrapInBlockquoteCommand,
    CM.blockquoteKeymap,
  ],
  thematicBreak: [CM.hrAttr, CM.hrSchema, CM.insertHrInputRule, CM.insertHrCommand],

  strong: [
    CM.strongAttr,
    CM.strongSchema,
    CM.strongInputRule,
    CM.toggleStrongCommand,
    CM.strongKeymap,
  ],
  emphasis: [
    CM.emphasisAttr,
    CM.emphasisSchema,
    CM.emphasisStarInputRule,
    CM.emphasisUnderscoreInputRule,
    CM.toggleEmphasisCommand,
    CM.emphasisKeymap,
  ],
  delete: [
    GFM.strikethroughAttr,
    GFM.strikethroughSchema,
    GFM.strikethroughInputRule,
    GFM.toggleStrikethroughCommand,
    GFM.strikethroughKeymap,
  ],
  inlineCode: [
    CM.inlineCodeAttr,
    CM.inlineCodeSchema,
    CM.inlineCodeInputRule,
    CM.toggleInlineCodeCommand,
    CM.inlineCodeKeymap,
  ],
  link: [CM.linkAttr, CM.linkSchema, CM.toggleLinkCommand, CM.updateLinkCommand],

  table: [
    GFM.tableSchema,
    GFM.tableHeaderRowSchema,
    GFM.tableRowSchema,
    GFM.tableHeaderSchema,
    GFM.tableCellSchema,
    GFM.insertTableCommand,
    GFM.addRowBeforeCommand,
    GFM.addRowAfterCommand,
    GFM.addColBeforeCommand,
    GFM.addColAfterCommand,
    GFM.deleteSelectedCellsCommand,
    GFM.selectRowCommand,
    GFM.selectColCommand,
    GFM.setAlignCommand,
    GFM.goToNextTableCellCommand,
    GFM.goToPrevTableCellCommand,
    GFM.exitTable,
    GFM.tableKeymap,
    GFM.insertTableInputRule,
    GFM.tablePasteRule,
    GFM.tableEditingPlugin,
    GFM.keepTableAlignPlugin,
    GFM.autoInsertSpanPlugin,
  ],
  // The two live inside `table` and have no plugins of their own: a row and a
  // cell are the table's schema. They are keys all the same, so the parity
  // test can see every allowed type accounted for.
  tableRow: [],
  tableCell: [],
}

/**
 * The behaviour that belongs to no single construct.
 *
 * `remarkGFMPlugin` is the parser half of the three GFM constructs above and
 * would be wrong to file under one of them. The three `hardbreak*` plugins and
 * `inlineNodesCursorPlugin` are cursor and selection behaviour; `remarkMarker`
 * records which characters a mark was written with, so a note keeps its own
 * spelling; the two `sync*` plugins keep heading ids and list numbering in
 * step with the document.
 */
const NOTE_INFRASTRUCTURE: PluginEntry[] = [
  listener,
  history,
  clipboard,
  cursor,
  trailing,
  remarkNormalizeNote,
  remarkBreaksPlugin,
  GFM.remarkGFMPlugin,
  CM.remarkAddOrderInListPlugin,
  CM.remarkMarker,
  CM.hardbreakClearMarkPlugin,
  CM.hardbreakFilterNodes,
  CM.hardbreakFilterPlugin,
  CM.inlineNodesCursorPlugin,
  CM.syncHeadingIdPlugin,
  CM.syncListOrderPlugin,
]

/** Everything the editor loads — derived from the map, never written twice. */
export const noteEditorPlugins: MilkdownPlugin[] = [
  ...NOTE_INFRASTRUCTURE,
  ...Object.values(NOTE_SCHEMA_PLUGINS).flat(),
].flat()
