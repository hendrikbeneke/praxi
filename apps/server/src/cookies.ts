import type { Theme } from '@praxi/shared'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

/**
 * The signed-in user's colour theme, so the page can be painted in it **before
 * anything is fetched**.
 *
 * A cookie rather than `localStorage`, and the difference is the one that
 * matters here: the server can write it. The theme is stored on the user, so
 * a browser that has never run this application cannot know it — and reading
 * it from the API means at least one request, which means the first paint is
 * in the wrong scheme. This cookie is set in the same response as the session
 * cookie, so from the very first load after signing in, the inline script in
 * `index.html` has the answer before the first byte is rendered.
 *
 * Deliberately **not** `httpOnly`: that script has to read it. It carries the
 * name of a colour scheme and nothing else — no identity, no session — and it
 * never leaves the origin. It is a cache and never a source of truth: what is
 * stored on `app_user.preferences` decides, and every load reconciles the
 * document with that (`_app.beforeLoad`).
 *
 * Cleared on logout, so the login screen of the next person is not painted in
 * the previous one's colours.
 */
export const THEME_COOKIE = 'praxi_theme'

/**
 * `secure` is decided per request rather than from NODE_ENV: the application is
 * built to run on localhost over plain HTTP today and behind TLS on a server
 * later, and a `Secure` cookie is simply dropped by the browser on http://.
 * Reading it off the request URL means neither deployment needs a flag.
 */
function isSecureRequest(c: Context): boolean {
  if (new URL(c.req.url).protocol === 'https:') return true
  // Behind a reverse proxy the origin request is plain HTTP.
  return c.req.header('x-forwarded-proto') === 'https'
}

/** A year: it is a cache, and the value it caches changes when the user
 *  changes it, not when it expires. Exported because `src/auth.ts` writes this
 *  cookie too — in the same response as the session cookie, which is what
 *  keeps the first paint after signing in from flashing. */
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/**
 * Writes the theme, or clears it where there is none to write — `schiefer` is
 * the default and is stored as the *absence* of a value on both sides, the
 * same convention `theme-picker.tsx` and the inline script keep.
 */
export function setThemeCookie(c: Context, theme: Theme | undefined): void {
  if (!theme || theme === 'schiefer') {
    clearThemeCookie(c)
    return
  }

  setCookie(c, THEME_COOKIE, theme, {
    httpOnly: false,
    sameSite: 'Lax',
    path: '/',
    secure: isSecureRequest(c),
    maxAge: THEME_COOKIE_MAX_AGE,
  })
}

/** Private since S-B: signing out clears this cookie through Better Auth's
 *  after-hook now, so `setThemeCookie` is the only caller left. */
function clearThemeCookie(c: Context): void {
  deleteCookie(c, THEME_COOKIE, {
    httpOnly: false,
    sameSite: 'Lax',
    path: '/',
    secure: isSecureRequest(c),
  })
}
