import type { Theme } from '@praxi/shared'

/**
 * Puts the theme on the document.
 *
 * The **one** place that does it, and it is called from two: `_app.beforeLoad`
 * when the stored preferences arrive, and the picker when they change. The
 * cache the inline script in `index.html` reads before first paint is a cookie
 * the *server* writes (`cookies.ts`) — this side only paints.
 *
 * `slate` is the default and is expressed as the absence of an attribute,
 * the same convention on every side of this.
 */
export function applyTheme(theme: Theme | undefined): void {
  if (theme && theme !== 'slate') {
    document.documentElement.dataset.theme = theme
  } else {
    delete document.documentElement.dataset.theme
  }
}
