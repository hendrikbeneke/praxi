import { describe, expect, it } from 'vitest'
import {
  IMAGE_IS_DEFERRED,
  NOTE_MDAST_TYPES,
  normalizeNoteMdast,
  noteMdast,
  plainNoteText,
} from './note-mdast.js'

/** Every node type in the tree, so a test can say "this construct is gone"
 *  without naming where it would have sat. */
function types(text: string): string[] {
  const found: string[] = []
  walk(noteMdast(text))
  return found

  function walk(node: unknown): void {
    const type = String((node as { type?: unknown }).type ?? '')
    if (type !== '' && type !== 'root') found.push(type)
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) for (const child of children) walk(child)
  }
}

/** The plain text of the whole tree, for asserting that a flattened construct
 *  kept its content. */
function text(input: string): string {
  return plainNoteText(input)
}

describe('what a note may contain', () => {
  it.each(NOTE_MDAST_TYPES.filter((type) => type !== 'root'))('keeps %s', (type) => {
    const sample: Record<string, string> = {
      paragraph: 'Ein Absatz.',
      text: 'Ein Absatz.',
      break: 'Erste Zeile\nZweite Zeile',
      heading: '## Überschrift',
      list: '- Punkt',
      listItem: '- Punkt',
      strong: 'Ein **fetter** Teil.',
      emphasis: 'Ein *kursiver* Teil.',
      delete: 'Ein ~~gestrichener~~ Teil.',
      inlineCode: 'Ein `Wert` im Satz.',
      link: 'Ein [Verweis](https://praxi.invalid).',
      code: '```\nBlock\n```',
      blockquote: '> Zitiert',
      table: '| A | B |\n| - | - |\n| 1 | 2 |',
      tableRow: '| A | B |\n| - | - |\n| 1 | 2 |',
      tableCell: '| A | B |\n| - | - |\n| 1 | 2 |',
      thematicBreak: '---',
    }
    const input = sample[type]
    if (input === undefined) throw new Error(`no sample for ${type}`)
    expect(types(input)).toContain(type)
  })

  it('carries a task item, which is a list item with a checkbox', () => {
    const [item] = noteMdast('- [x] Erledigt').children
    const list = item as { children?: { checked?: boolean | null }[] }
    expect(list.children?.[0]?.checked).toBe(true)
  })

  it('carries a nested list', () => {
    expect(types('- Oben\n  - Darunter').filter((type) => type === 'list')).toHaveLength(2)
  })
})

/**
 * One test per discarded construct. Each says two things: the construct is
 * gone, and — where it carried words — the words are not.
 */
describe('what a note may not contain', () => {
  it('drops an image, deliberately and for now', () => {
    expect(IMAGE_IS_DEFERRED).toContain('image')
    expect(types('Vorher ![Bild](data:image/png;base64,iVBOR) nachher.')).not.toContain('image')
    expect(text('Vorher ![Bild](data:image/png;base64,iVBOR) nachher.')).toBe('Vorher  nachher.')
  })

  it('drops an image reference', () => {
    expect(types('![Bild][ref]\n\n[ref]: data:image/png;base64,iVBOR')).not.toContain(
      'imageReference',
    )
  })

  /** The only node whose `value` is markup — so it is dropped rather than
   *  flattened, or the text would keep it verbatim. */
  it('drops raw HTML rather than keeping it as text', () => {
    const input = 'Vorher <div class="x">drin</div> nachher.\n\n<script>alert(1)</script>'
    expect(types(input)).not.toContain('html')
    expect(text(input)).not.toContain('<div')
    expect(text(input)).not.toContain('<script')
  })

  it('drops a footnote and its definition', () => {
    const input = 'Ein Satz[^1].\n\n[^1]: Die Anmerkung.'
    expect(types(input)).not.toContain('footnoteReference')
    expect(types(input)).not.toContain('footnoteDefinition')
  })

  it('drops a link definition and keeps the words that referenced it', () => {
    const input = 'Ein [Verweis][ziel].\n\n[ziel]: https://praxi.invalid'
    expect(types(input)).not.toContain('definition')
    expect(types(input)).not.toContain('linkReference')
    expect(text(input)).toBe('Ein Verweis.')
  })

  it('lifts a heading below level three to level three', () => {
    const tree = noteMdast('###### Sechs')
    const [heading] = tree.children
    expect((heading as { type: string; depth: number }).type).toBe('heading')
    expect((heading as { depth: number }).depth).toBe(3)
  })

  /**
   * The fallback, and the reason it is a fallback rather than a list: a node
   * type nobody anticipated is replaced by its children. `==highlight==` will
   * one day be exactly this — a remark plugin with its own type — and a note
   * written with it must degrade in an older build rather than take the editor
   * down.
   */
  it('replaces an unknown construct with its children', () => {
    // A tree as a future remark plugin would hand it over: a node type this
    // build has never heard of, holding words that must survive it.
    const tree = noteMdast('Ein Satz.')
    const [paragraph] = tree.children as { children: unknown[] }[]
    if (!paragraph) throw new Error('no paragraph')
    paragraph.children = [
      { type: 'highlight', children: [{ type: 'text', value: 'hervorgehoben' }] },
    ]

    normalizeNoteMdast(tree)

    expect(JSON.stringify(tree)).toContain('hervorgehoben')
    expect(JSON.stringify(tree)).not.toContain('highlight')
  })

  it('drops an unknown construct that carries neither children nor text', () => {
    const tree = noteMdast('Ein Satz.')
    const [paragraph] = tree.children as { children: unknown[] }[]
    if (!paragraph) throw new Error('no paragraph')
    paragraph.children = [{ type: 'mystery' }]

    normalizeNoteMdast(tree)

    expect(paragraph.children).toEqual([])
  })
})

describe('the pipeline', () => {
  it('makes a single newline a line break', () => {
    expect(types('Erste\nZweite')).toContain('break')
  })

  it('never throws, whatever it is handed', () => {
    const inputs = [
      '',
      '\r\n\r\n',
      '*'.repeat(500),
      '['.repeat(200),
      '#'.repeat(80),
      '> '.repeat(300),
      'a'.repeat(20_000),
      '| a |\n| - |\n'.repeat(100),
    ]
    for (const input of inputs) expect(() => noteMdast(input)).not.toThrow()
  })

  it('normalizes what is already normalized to the same tree', () => {
    const input = [
      '# Eins',
      '',
      'Absatz mit **fett**, *kursiv*, ~~weg~~ und `code`.',
      'Zweite Zeile.',
      '',
      '- Punkt',
      '  - Tiefer',
      '',
      '1. Erstens',
      '',
      '- [ ] Offen',
      '',
      '> Zitat',
      '',
      '```',
      'Block',
      '```',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '---',
      '',
      'Ein [Verweis](https://praxi.invalid).',
    ].join('\n')

    expect(JSON.stringify(noteMdast(input))).toBe(JSON.stringify(noteMdast(input)))
  })
})

describe('the excerpt', () => {
  it('reads the words without their markup', () => {
    expect(text('## Befund\n\nEin **wichtiger** Punkt.')).toBe('Befund\nEin wichtiger Punkt.')
  })

  it('gives a nested item its own line', () => {
    expect(text('- Oben\n  - Darunter')).toBe('Oben\nDarunter')
  })

  it('is empty for an empty note', () => {
    expect(text('')).toBe('')
  })
})
