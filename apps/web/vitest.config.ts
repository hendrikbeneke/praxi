import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The web package has one kind of test and only one: the assertions that two
 * lists which must agree do agree — the editor's plugin map against the
 * normalizer's `NOTE_MDAST_TYPES` (L6a). Screens are still checked in a
 * browser, as CLAUDE.md says; this is a schema question, not a UI one.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
