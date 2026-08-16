import { describe, expect, it } from 'vitest'
import { type Block, parseNoteText, plainNoteText } from './note-markdown.js'

/** Shorthand: the plain text of every inline in a block, so the assertions
 *  read like the note rather than like a tree. */
const shape = (blocks: Block[]) =>
  blocks.map((block) => {
    if (block.kind === 'heading') return `heading: ${text(block.content)}`
    if (block.kind === 'paragraph') return `paragraph: ${block.lines.map(text).join(' ⏎ ')}`
    return `${block.kind}: ${block.items.map(text).join(' | ')}`
  })

const text = (inlines: { text: string }[]) => inlines.map((part) => part.text).join('')

describe('the five constructs', () => {
  it('reads a heading', () => {
    expect(shape(parseNoteText('## Befund'))).toEqual(['heading: Befund'])
  })

  it('reads a bullet list as one block', () => {
    expect(shape(parseNoteText('- eins\n- zwei\n- drei'))).toEqual(['bullets: eins | zwei | drei'])
  })

  it('reads a numbered list as one block', () => {
    expect(shape(parseNoteText('1. Anamnese\n2. Befund\n3. Plan'))).toEqual([
      'numbered: Anamnese | Befund | Plan',
    ])
  })

  /** The digits are not read, only the position — so a list typed `1. 1. 1.`
   *  still comes out 1, 2, 3 and nothing has to be renumbered by hand. */
  it('does not care which numbers were typed', () => {
    expect(shape(parseNoteText('1. eins\n1. zwei'))).toEqual(['numbered: eins | zwei'])
    expect(shape(parseNoteText('7. eins\n9. zwei'))).toEqual(['numbered: eins | zwei'])
  })

  it('reads bold inside a line', () => {
    const [block] = parseNoteText('Der **Befund** ist eindeutig')

    expect(block).toEqual({
      kind: 'paragraph',
      lines: [
        [
          { kind: 'text', text: 'Der ' },
          { kind: 'bold', text: 'Befund' },
          { kind: 'text', text: ' ist eindeutig' },
        ],
      ],
    })
  })

  it('reads two bold spans in one line', () => {
    const [block] = parseNoteText('**A** und **B**')

    expect(block?.kind === 'paragraph' && block.lines[0]?.map((part) => part.kind)).toEqual([
      'bold',
      'text',
      'bold',
    ])
  })

  it('treats everything else as a paragraph', () => {
    expect(shape(parseNoteText('Patientin berichtet von Schlafstörungen.'))).toEqual([
      'paragraph: Patientin berichtet von Schlafstörungen.',
    ])
  })
})

describe('blocks are separated the way they are typed', () => {
  /**
   * **The deliberate deviation from CommonMark.** A single newline stays a
   * line break — three names under each other are three lines, not one
   * sentence. CommonMark would fold them into a space.
   */
  it('keeps a single newline as a line break inside one paragraph', () => {
    expect(shape(parseNoteText('Frau A\nHerr B\nFrau C'))).toEqual([
      'paragraph: Frau A ⏎ Herr B ⏎ Frau C',
    ])
  })

  it('separates paragraphs on a blank line', () => {
    expect(shape(parseNoteText('Erster.\n\nZweiter.'))).toEqual([
      'paragraph: Erster.',
      'paragraph: Zweiter.',
    ])
  })

  it('makes two lists out of two, separated by a blank line', () => {
    expect(shape(parseNoteText('- a\n- b\n\n- c'))).toEqual(['bullets: a | b', 'bullets: c'])
  })

  it('ends a list where another kind begins', () => {
    expect(shape(parseNoteText('- a\n1. b\nText\n## H'))).toEqual([
      'bullets: a',
      'numbered: b',
      'paragraph: Text',
      'heading: H',
    ])
  })

  it('ignores a line of only whitespace the way it ignores an empty one', () => {
    expect(shape(parseNoteText('A\n   \nB'))).toEqual(['paragraph: A', 'paragraph: B'])
  })

  it('reads \\r\\n like \\n', () => {
    expect(shape(parseNoteText('- a\r\n- b'))).toEqual(['bullets: a | b'])
  })
})

/**
 * The second of the two properties: what the format does not know stays
 * exactly as it was typed. A silent gap would read as if it had been meant.
 */
describe('unknown syntax stays literal', () => {
  it.each([
    ['> Zitat', 'paragraph: > Zitat'],
    ['# Ebene eins', 'paragraph: # Ebene eins'],
    ['### Ebene drei', 'paragraph: ### Ebene drei'],
    ['*kursiv*', 'paragraph: *kursiv*'],
    ['_kursiv_', 'paragraph: _kursiv_'],
    ['`code`', 'paragraph: `code`'],
    ['| a | b |', 'paragraph: | a | b |'],
    ['![Bild](x.png)', 'paragraph: ![Bild](x.png)'],
    ['* kein Punkt', 'paragraph: * kein Punkt'],
    ['1.kein Punkt', 'paragraph: 1.kein Punkt'],
    ['##keine Überschrift', 'paragraph: ##keine Überschrift'],
  ])('%s', (input, expected) => {
    expect(shape(parseNoteText(input))).toEqual([expected])
  })

  it('leaves an unclosed bold marker standing', () => {
    expect(shape(parseNoteText('Der **Befund ist offen'))).toEqual([
      'paragraph: Der **Befund ist offen',
    ])
  })

  /** An empty bold span would render as nothing and lose what was typed. */
  it('leaves an empty bold marker standing', () => {
    expect(shape(parseNoteText('****'))).toEqual(['paragraph: ****'])
  })

  it('leaves a lone asterisk pair in arithmetic alone', () => {
    expect(shape(parseNoteText('5**10 Einheiten'))).toEqual(['paragraph: 5**10 Einheiten'])
  })
})

/**
 * The first property. Nothing here asserts a shape — it asserts that the
 * parser answers at all, for the inputs most likely to make a hand-written
 * one fall over.
 */
describe('total', () => {
  it.each([
    ['empty', ''],
    ['only newlines', '\n\n\n'],
    ['only spaces', '     '],
    ['a wall of asterisks', '*'.repeat(5000)],
    ['unbalanced markers', '**'.repeat(2000)],
    ['the maximum length', 'x'.repeat(20_000)],
    ['a very long single line of bold', `**${'a'.repeat(19_000)}**`],
    ['combining marks and emoji', 'á 😀 — ﬀ'],
    ['a lone carriage return', 'a\rb'],
  ])('answers for %s', (_label, input) => {
    expect(() => parseNoteText(input)).not.toThrow()
    expect(Array.isArray(parseNoteText(input))).toBe(true)
  })

  it('answers with no blocks for an empty note', () => {
    expect(parseNoteText('')).toEqual([])
  })
})

describe('the excerpt', () => {
  it('drops the syntax and keeps the words', () => {
    expect(plainNoteText('## Befund\n\nDer **Befund** ist eindeutig.\n\n- eins\n- zwei')).toBe(
      'Befund\nDer Befund ist eindeutig.\neins\nzwei',
    )
  })

  it('keeps text the format does not know', () => {
    expect(plainNoteText('> Zitat')).toBe('> Zitat')
  })

  it('is empty for an empty note', () => {
    expect(plainNoteText('')).toBe('')
  })
})
