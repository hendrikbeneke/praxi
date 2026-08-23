import { IMAGE_IS_DEFERRED, NOTE_MDAST_TYPES } from '@praxi/shared'
import { describe, expect, it } from 'vitest'
import { NOTE_SCHEMA_PLUGINS } from '@/components/note-editor-plugins'

/**
 * **The two halves of one decision, checked against each other** (L6a).
 *
 * What a note may contain is written down once, in
 * `packages/shared/src/note-mdast.ts`. The editor's schema is written down
 * again here, because Milkdown needs plugins rather than a list of names. Two
 * places, one truth — so they can drift, and both directions of drift are bad
 * in a way nobody would notice for months:
 *
 * - **a type the normalizer allows and the editor has no plugin for** takes
 *   the editor down on load. Milkdown throws rather than skipping; measured,
 *   see the file above.
 * - **a plugin the editor loads and the normalizer strips** deletes what was
 *   written the next time the note is opened — silently, because the note
 *   still opens.
 *
 * The map is what closes the second direction by construction: `noteEditorPlugins`
 * is *derived* from it, so a schema plugin outside the map cannot be loaded.
 * This file closes the first.
 */
describe('the editor and the normalizer allow the same constructs', () => {
  it('has one entry per allowed mdast type, and no more', () => {
    expect(Object.keys(NOTE_SCHEMA_PLUGINS).sort()).toEqual([...NOTE_MDAST_TYPES].sort())
  })

  it('loads at least one plugin for every construct that needs one', () => {
    /* A row and a cell are the table's schema and carry nothing of their own;
       they are keys so that "every allowed type is accounted for" can be read
       off the map rather than remembered. */
    const partOfAnother = ['tableRow', 'tableCell']

    for (const [type, plugins] of Object.entries(NOTE_SCHEMA_PLUGINS)) {
      if (partOfAnother.includes(type)) {
        expect(plugins, `${type} is part of another construct`).toHaveLength(0)
      } else {
        expect(plugins.length, `${type} has no plugin`).toBeGreaterThan(0)
      }
    }
  })

  /**
   * The one deliberate inequality, asserted so it stays deliberate: the editor
   * could carry an image, and the normalizer drops it, because the bytes would
   * land in `note.text` instead of in `note_file` (rule 7). The image package
   * lifts this on purpose — and this test is what it will have to change.
   */
  it('leaves images out of both, deliberately', () => {
    for (const type of IMAGE_IS_DEFERRED) {
      expect(NOTE_MDAST_TYPES).not.toContain(type)
      expect(Object.keys(NOTE_SCHEMA_PLUGINS)).not.toContain(type)
    }
  })
})
