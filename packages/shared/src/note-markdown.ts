/**
 * The small Markdown a note may carry (D10).
 *
 * **Five constructs, and that is the whole language**: a heading, a bullet
 * list, a numbered list, bold, and everything else as a paragraph. The set is
 * deliberately closed, because every construct that is possible also has to be
 * rendered, hashed, and one day printed — the day documentation is handed out
 * under Art. 15 GDPR there will be a second renderer for `@react-pdf/renderer`,
 * and four block kinds are an afternoon where thirty would not be.
 *
 * Left out on purpose: *italic*, because two levels of emphasis mean deciding
 * between them every time and neither has an agreed meaning in a case file;
 * links, because a note is not hypertext and auto-linking is what makes an
 * HTML renderer tempting; tables, quotes, code, images — an image belongs to
 * the note as a `note_file`, where it inherits the locking.
 *
 * **This produces a tree, never an HTML string.** There is nothing to
 * sanitize, because nothing is ever handed to a parser that could be talked
 * into markup: `note-text.tsx` maps these blocks onto React elements. The
 * whole class of injection bugs does not exist here rather than being
 * defended against.
 *
 * It lives in `packages/shared` rather than in the web app because the PDF
 * renderer that will read the same `Block[]` runs on the server.
 *
 * ## One deliberate deviation from CommonMark
 *
 * **A single newline stays a line break.** CommonMark folds it into a space
 * and only breaks on a blank line or two trailing spaces. That is right for
 * prose meant to reflow and wrong here: notes were rendered with
 * `whitespace-pre-wrap` before this existed, so every line the practitioner
 * put on its own line stayed there — and somebody typing three names under
 * each other without prefixing them with `- ` means three lines, not one
 * sentence. A blank line separates paragraphs, a newline breaks a line.
 *
 * ## Two properties the tests hold in place
 *
 * - **Total.** Every input produces blocks and nothing throws — 20 000
 *   characters, `\r\n`, a line of nothing but asterisks, the empty string.
 * - **Unknown syntax stays literal.** `> quote`, `# level one`, `*italic*`,
 *   an unclosed `**` all appear exactly as they were typed. A silent gap would
 *   read as if it had been meant.
 *
 * There is no escape mechanism. Writing a literal `**` would need a sixth
 * construct (`\**`), and the case is rare enough not to buy one.
 */

export type Inline = { kind: 'text' | 'bold'; text: string }

export type Block =
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'heading'; content: Inline[] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'numbered'; items: Inline[][] }

const HEADING = '## '
const BULLET = '- '
/** Any digits then a dot and a space. The number itself is not read — an
 *  `<ol>` counts, so a list typed `1. 1. 1.` still comes out 1, 2, 3 and
 *  nothing has to be renumbered by hand. */
const NUMBERED = /^\d+\.\s/

/** The marker each toolbar button writes, so the editor and the parser cannot
 *  drift apart on what a bullet looks like. */
export const NOTE_MARKERS = { heading: HEADING, bullet: BULLET, numbered: '1. ', bold: '**' }

export function parseNoteText(text: string): Block[] {
  // `\r\n` only ever arrives from somewhere other than our own textarea, but
  // it costs one call to not depend on that.
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  const blocks: Block[] = []
  let paragraph: Inline[][] = []
  let bullets: Inline[][] = []
  let numbered: Inline[][] = []

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph })
    if (bullets.length > 0) blocks.push({ kind: 'bullets', items: bullets })
    if (numbered.length > 0) blocks.push({ kind: 'numbered', items: numbered })
    paragraph = []
    bullets = []
    numbered = []
  }

  for (const line of lines) {
    if (line.trim() === '') {
      flush()
      continue
    }
    if (line.startsWith(HEADING)) {
      flush()
      blocks.push({ kind: 'heading', content: parseInline(line.slice(HEADING.length)) })
      continue
    }
    if (line.startsWith(BULLET)) {
      if (paragraph.length > 0 || numbered.length > 0) flush()
      bullets.push(parseInline(line.slice(BULLET.length)))
      continue
    }
    const numberedMatch = NUMBERED.exec(line)
    if (numberedMatch) {
      if (paragraph.length > 0 || bullets.length > 0) flush()
      numbered.push(parseInline(line.slice(numberedMatch[0].length)))
      continue
    }
    if (bullets.length > 0 || numbered.length > 0) flush()
    paragraph.push(parseInline(line))
  }

  flush()
  return blocks
}

/**
 * `**bold**`, and everything around it as text.
 *
 * An opening `**` with no closing partner is text, and so is `****` — an empty
 * bold span would render as nothing and lose what was typed.
 */
function parseInline(line: string): Inline[] {
  const parts: Inline[] = []
  let plain = ''
  let index = 0

  while (index < line.length) {
    if (line.startsWith('**', index)) {
      const close = line.indexOf('**', index + 2)
      if (close > index + 2) {
        if (plain !== '') parts.push({ kind: 'text', text: plain })
        plain = ''
        parts.push({ kind: 'bold', text: line.slice(index + 2, close) })
        index = close + 2
        continue
      }
    }
    plain += line[index]
    index += 1
  }

  if (plain !== '') parts.push({ kind: 'text', text: plain })
  return parts
}

/**
 * The note without its markup, for the two-line excerpt on an activity.
 *
 * Rendering blocks into a `line-clamp-2` would be wrong, and showing the raw
 * text would put `**Befund**` in front of the practitioner. Derived from the
 * parsed tree rather than by stripping characters, so there is one definition
 * of what the syntax means.
 */
export function plainNoteText(text: string): string {
  return parseNoteText(text)
    .flatMap((block) => {
      if (block.kind === 'heading') return [flatten(block.content)]
      if (block.kind === 'paragraph') return block.lines.map(flatten)
      return block.items.map(flatten)
    })
    .join('\n')
}

function flatten(inlines: readonly Inline[]): string {
  return inlines.map((part) => part.text).join('')
}
