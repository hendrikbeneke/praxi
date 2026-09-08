import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { themeOptions } from '@praxi/shared'
import { describe, expect, it } from 'vitest'

/**
 * The inline script in `index.html` paints the theme before the first byte is
 * rendered, so it cannot import anything — it repeats the value set by hand,
 * and a comment there asks whoever changes one to change the other. This is
 * that comment as an assertion.
 *
 * It matters more than a duplicated list usually would, because getting it
 * wrong is **silent in the safe direction**: a value the script does not know
 * simply leaves the attribute off, and the page paints in the default. Nothing
 * fails, nothing is logged, and a user who chose `night` gets a bright screen
 * until the preferences arrive and the document is repainted. That is exactly
 * what the rename in the squash could have produced — and what would have made
 * a stale `praxi_theme=nacht` cookie inert rather than harmful.
 *
 * The default is deliberately absent from the script's list: it *is* the
 * absence of the attribute, the same convention `theme.ts`, `cookies.ts` and
 * `theme-picker.tsx` keep.
 */
const DEFAULT_THEME = 'slate'

describe('the inline theme script', () => {
  it('knows every theme but the default', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

    const match = html.match(/var THEME_OPTIONS = \[([^\]]*)\]/)
    expect(match, 'THEME_OPTIONS not found in index.html').not.toBeNull()

    const inScript = (match?.[1] ?? '')
      .split(',')
      .map((entry) => entry.trim().replace(/^'|'$/g, ''))
      .filter((entry) => entry !== '')

    expect(inScript).toEqual(themeOptions.filter((theme) => theme !== DEFAULT_THEME))
  })

  it('agrees with the rest of the application on which theme is the default', () => {
    expect(themeOptions).toContain(DEFAULT_THEME)
  })
})
