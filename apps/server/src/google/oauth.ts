import { createHash, randomBytes } from 'node:crypto'
import { getEnv } from '../env.js'
import { type Fetcher, GoogleApiError } from './client.js'

/**
 * The OAuth2 loopback flow, with PKCE.
 *
 * The callback is reachable without a session and authenticates itself through
 * the `state` value alone. That is not convenience: `127.0.0.1:3000` and
 * `localhost:3000` are different origins, so the session cookie is not sent to
 * the redirect at all. The state is single-use, short-lived, and carries the
 * tenant it was issued for.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/**
 * ─────────────────────────────────────────────────────────────────────────
 * DO NOT WIDEN THIS LIST.
 *
 * `calendar.freebusy` instead of `calendar.readonly` is the most important
 * line in this slice: it means the promise that Google learns nothing about
 * the private calendars beyond *when* they are busy does not hang on our code
 * being right. It hangs on the token, which cannot answer with anything else.
 *
 * The temptation will be concrete — "we need calendar.readonly, otherwise we
 * cannot show the names of the private calendars". We can: the calendar list
 * comes from `calendar.calendarlist.readonly`, which returns names and nothing
 * of their content. Anything beyond that is a request to be able to read
 * appointment titles, and there is no feature in this software that needs one.
 *
 * `calendar.events` is scoped to events and is what writes the practice
 * calendar and reads the return channel.
 *
 * There is deliberately no `openid` and no `email` either. They were here so
 * the settings could say which account is connected — but the primary entry of
 * the calendar list *is* that address, so asking for an identity scope bought
 * a second consent line for something we already have. Three scopes, all three
 * about calendars, nothing about who the practitioner is.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const

/** True when client id, secret and the encryption key are all present. Without
 *  them the Google area says so instead of offering a button that cannot
 *  work. */
export function oauthConfigured(): boolean {
  const env = getEnv()
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ENCRYPTION_KEY)
}

/**
 * The loopback redirect. Everything else in this software is relative, so on a
 * server deployment this variable is the only thing that changes — the client
 * calls `/api`, the cookie already knows about TLS, and nothing else names a
 * host.
 */
export function redirectUri(): string {
  const env = getEnv()
  return env.GOOGLE_REDIRECT_URI ?? `http://127.0.0.1:${env.PORT}/api/google/oauth/callback`
}

type PendingFlow = { tenantId: string; verifier: string; expiresAt: number }

/** In memory, single process, and gone on restart — which is correct: an
 *  authorization that was not finished within ten minutes was abandoned. */
const pending = new Map<string, PendingFlow>()
const FLOW_TTL_MS = 10 * 60_000

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/** The URL the practitioner is sent to, plus the state that will identify the
 *  answer. `prompt=consent` because only a fresh consent yields a refresh
 *  token when one was granted before. */
export function beginAuthorization(tenantId: string, now: Date): string {
  const state = base64url(randomBytes(24))
  const verifier = base64url(randomBytes(32))

  for (const [key, flow] of pending) {
    if (flow.expiresAt <= now.getTime()) pending.delete(key)
  }
  pending.set(state, { tenantId, verifier, expiresAt: now.getTime() + FLOW_TTL_MS })

  const params = new URLSearchParams({
    client_id: getEnv().GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  })

  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/** Single use: taken out of the map on the way. */
export function takeFlow(state: string, now: Date): PendingFlow | null {
  const flow = pending.get(state)
  if (!flow) return null
  pending.delete(state)
  return flow.expiresAt > now.getTime() ? flow : null
}

/**
 * Exported for the tests alone — they share this module-level map and must not
 * depend on state another one left behind. That is a use, not a leftover: the
 * application never calls it, and deleting it would break test isolation
 * rather than remove anything dead.
 */
export function clearFlows(): void {
  pending.clear()
}

type TokenResponse = {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  error?: unknown
  error_description?: unknown
}

async function postForm(
  endpoint: string,
  body: URLSearchParams,
  doFetch: Fetcher,
): Promise<TokenResponse> {
  let response: Response
  try {
    response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    throw new GoogleApiError(0, 'network', 'Google ist nicht erreichbar.')
  }

  const parsed = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok) {
    const reason = typeof parsed.error === 'string' ? parsed.error : ''
    const message =
      typeof parsed.error_description === 'string'
        ? parsed.error_description
        : `Google antwortete mit ${response.status}.`
    throw new GoogleApiError(response.status, reason, message)
  }
  return parsed
}

export type ExchangeResult = { refreshToken: string; accessToken: string; expiresInSec: number }

export async function exchangeCode(
  code: string,
  verifier: string,
  doFetch: Fetcher = fetch,
): Promise<ExchangeResult> {
  const env = getEnv()
  const parsed = await postForm(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    doFetch,
  )

  if (typeof parsed.refresh_token !== 'string' || typeof parsed.access_token !== 'string') {
    // Without a refresh token the connection would die within the hour.
    throw new GoogleApiError(400, 'no_refresh_token', 'Google hat kein dauerhaftes Token vergeben.')
  }

  return {
    refreshToken: parsed.refresh_token,
    accessToken: parsed.access_token,
    expiresInSec: typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  doFetch: Fetcher = fetch,
): Promise<{ accessToken: string; expiresInSec: number }> {
  const env = getEnv()
  const parsed = await postForm(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
    doFetch,
  )

  if (typeof parsed.access_token !== 'string') {
    throw new GoogleApiError(401, 'authError', 'Google hat kein Zugriffstoken ausgestellt.')
  }

  return {
    accessToken: parsed.access_token,
    expiresInSec: typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600,
  }
}

/** Hands the grant back on disconnect. Best effort: without a line the local
 *  side is still cleaned up, and a token nobody holds any longer is harmless
 *  until it expires. */
export async function revokeToken(refreshToken: string, doFetch: Fetcher = fetch): Promise<void> {
  try {
    await doFetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    })
  } catch {
    // Offline. The local cleanup runs regardless.
  }
}
