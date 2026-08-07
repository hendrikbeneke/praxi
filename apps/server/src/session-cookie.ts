import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

export const SESSION_COOKIE = 'praxi_session'

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

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isSecureRequest(c),
    expires: expiresAt,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isSecureRequest(c),
  })
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE)
}
