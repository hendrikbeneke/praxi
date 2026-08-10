import { beforeAll, describe, expect, it } from 'vitest'
import { beginAuthorization, clearFlows, GOOGLE_SCOPES, takeFlow } from './oauth.js'

/**
 * What actually goes into the authorization URL.
 *
 * The scope list carries a promise — `calendar.freebusy` instead of
 * `calendar.readonly` is what makes "Google cannot read the content of the
 * private calendars" a property of the token rather than of our code — and a
 * promise that lives only in a comment is one refactor away from being gone.
 * So it is asserted here, exactly, and a widened list fails.
 *
 * No network: `beginAuthorization` only builds a string.
 */

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.invalid'
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/api/google/oauth/callback'
  clearFlows()
})

const NOW = new Date('2026-09-01T10:00:00.000Z')

describe('the requested scopes', () => {
  it('are exactly the three calendar scopes and nothing else', () => {
    expect([...GOOGLE_SCOPES]).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ])
  })

  it('never ask to read calendar content or who the practitioner is', () => {
    // The two mistakes worth naming: the broad read scope, and an identity
    // scope for an address the calendar list already carries.
    expect(GOOGLE_SCOPES).not.toContain('https://www.googleapis.com/auth/calendar.readonly')
    expect(GOOGLE_SCOPES).not.toContain('https://www.googleapis.com/auth/calendar')
    expect(GOOGLE_SCOPES).not.toContain('openid')
    expect(GOOGLE_SCOPES).not.toContain('email')
    expect(GOOGLE_SCOPES).not.toContain('profile')
  })

  it('all reach the authorization URL, space separated', () => {
    const url = new URL(beginAuthorization('tenant', NOW))

    // `URLSearchParams` writes spaces as `+`, which is what Google reads a
    // query string as. Decoded, the separator is a plain space.
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '))
    for (const scope of GOOGLE_SCOPES) {
      expect(url.searchParams.get('scope')).toContain(scope)
    }
  })
})

describe('the authorization URL', () => {
  it('goes to Google with PKCE and asks for a refresh token', () => {
    const url = new URL(beginAuthorization('tenant', NOW))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)
    // Without both of these Google issues no refresh token on a repeat
    // consent, and the connection would die within the hour.
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('carries a state that identifies the tenant exactly once', () => {
    const state = new URL(beginAuthorization('tenant-a', NOW)).searchParams.get('state')
    expect(state).not.toBeNull()

    const flow = takeFlow(state ?? '', NOW)
    expect(flow?.tenantId).toBe('tenant-a')
    // Single use: the callback authenticates through it, so a replay must not
    // work.
    expect(takeFlow(state ?? '', NOW)).toBeNull()
  })

  it('lets a state expire', () => {
    const state = new URL(beginAuthorization('tenant-a', NOW)).searchParams.get('state')
    const muchLater = new Date(NOW.getTime() + 11 * 60_000)
    expect(takeFlow(state ?? '', muchLater)).toBeNull()
  })
})
