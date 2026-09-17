import { afterEach, describe, expect, it, vi } from 'vitest'
import { databaseTlsProblem } from './env.js'

/**
 * The startup refusal that keeps patient data off an unprotected connection.
 *
 * Nothing here talks to a database or to a network: the rule is a function of
 * two strings, and that is the whole reason it can be tested exhaustively.
 */

const LOCAL = 'postgres://praxi:pw@localhost:55432/praxi'
const REMOTE = 'postgres://praxi:pw@db.praxi.invalid:5432/praxi'

describe('databaseTlsProblem', () => {
  describe('what counts as this machine', () => {
    /** Loopback in every spelling it legitimately has locally. */
    it.each([
      'postgres://praxi:pw@localhost:55432/praxi',
      'postgres://praxi:pw@LOCALHOST:55432/praxi',
      'postgres://praxi:pw@db.localhost:55432/praxi',
      'postgres://praxi:pw@127.0.0.1:55432/praxi',
      'postgres://praxi:pw@127.1.2.3:55432/praxi',
      'postgres://praxi:pw@[::1]:55432/praxi',
      'postgres:///praxi',
    ])('accepts %s without any TLS parameter', (url) => {
      expect(databaseTlsProblem('DATABASE_URL', url)).toBeNull()
    })

    /**
     * Deliberately stricter than "not reachable from outside": a private
     * address and a Docker service name would both be legitimate without TLS,
     * and both are refused. A wrong refusal costs a minute and names what to
     * add; one waved through costs professional confidentiality and says
     * nothing.
     */
    it.each([
      'postgres://praxi:pw@postgres:5432/praxi',
      'postgres://praxi:pw@db:5432/praxi',
      'postgres://praxi:pw@10.0.0.5:5432/praxi',
      'postgres://praxi:pw@192.168.1.10:5432/praxi',
      'postgres://praxi:pw@172.17.0.2:5432/praxi',
      'postgres://praxi:pw@127.0.0.1.praxi.invalid:5432/praxi',
    ])('refuses %s, which is not loopback', (url) => {
      expect(databaseTlsProblem('DATABASE_URL', url)).not.toBeNull()
    })
  })

  describe('what counts as protected', () => {
    it('accepts verify-full', () => {
      expect(databaseTlsProblem('DATABASE_URL', `${REMOTE}?sslmode=verify-full`)).toBeNull()
      expect(
        databaseTlsProblem('DATABASE_URL', `${REMOTE}?sslmode=verify-full&sslrootcert=system`),
      ).toBeNull()
    })

    /**
     * Measured against the installed postgres.js: `require` sets
     * `rejectUnauthorized: false`, so it encrypts against whatever certificate
     * answers. The refusal says that in as many words, because "but it says
     * require" is exactly the objection somebody will have.
     */
    it('refuses require, and says why it is not enough', () => {
      const problem = databaseTlsProblem('APP_DATABASE_URL', `${REMOTE}?sslmode=require`)
      expect(problem).toContain('does not verify the certificate')
      expect(problem).toContain('redirected')
    })

    it.each(['prefer', 'allow', 'verify-ca', 'disable'])('refuses sslmode=%s', (mode) => {
      expect(databaseTlsProblem('DATABASE_URL', `${REMOTE}?sslmode=${mode}`)).not.toBeNull()
    })

    /** `sslrootcert=system` alone does produce a verified connection in this
     *  driver, and is still refused: the rule is one spelling, not a set of
     *  equivalent ones somebody has to know. */
    it('refuses sslrootcert=system on its own', () => {
      expect(databaseTlsProblem('DATABASE_URL', `${REMOTE}?sslrootcert=system`)).not.toBeNull()
    })
  })

  describe('the message', () => {
    it('names the variable, the host and what to add', () => {
      const problem = databaseTlsProblem('APP_DATABASE_URL', REMOTE)

      expect(problem).toContain('APP_DATABASE_URL')
      expect(problem).toContain('db.praxi.invalid')
      expect(problem).toContain('sslmode=verify-full&sslrootcert=system')
      expect(problem).toContain('plain text')
    })

    /** Rule 12. The URL carries the password, so it is never quoted back — the
     *  host is, because it is what makes the message actionable. */
    it('never quotes the URL or the password back', () => {
      const problem = databaseTlsProblem('DATABASE_URL', REMOTE) ?? ''

      expect(problem).not.toContain('pw')
      expect(problem).not.toContain(REMOTE)
      expect(problem).not.toContain('postgres://')
    })

    /** Shape is the Zod schema's business; two errors about one value would
     *  contradict each other. */
    it('says nothing about a value that is not a URL at all', () => {
      expect(databaseTlsProblem('DATABASE_URL', 'not a url')).toBeNull()
      expect(databaseTlsProblem('DATABASE_URL', '')).toBeNull()
    })
  })
})

/**
 * **The counter-proof.** The tests above pass whether or not anything calls
 * `databaseTlsProblem`; these fail the moment the call is taken out of
 * `getEnv()`, which is the half that actually stops a server.
 *
 * The module is re-imported per case because `getEnv` caches, and
 * `process.env` is restored afterwards so the rest of the suite keeps the
 * worker database `test/setup.ts` pointed it at.
 */
describe('getEnv', () => {
  const saved = { ...process.env }

  afterEach(() => {
    process.env = { ...saved }
    vi.resetModules()
  })

  async function freshGetEnv() {
    vi.resetModules()
    const module = await import('./env.js')
    return module.getEnv
  }

  const required = {
    BETTER_AUTH_SECRET: 'x'.repeat(64),
    NODE_ENV: 'production',
  }

  it('refuses to start when a remote database carries no sslmode', async () => {
    const getEnv = await freshGetEnv()
    process.env = { ...saved, ...required, DATABASE_URL: REMOTE, APP_DATABASE_URL: REMOTE }

    expect(() => getEnv()).toThrow(/not this machine/)
  })

  /** Both at once: fixing one and being told about the other on the next
   *  deployment is two deployments for one mistake. */
  it('names both connection strings in one refusal', async () => {
    const getEnv = await freshGetEnv()
    process.env = { ...saved, ...required, DATABASE_URL: REMOTE, APP_DATABASE_URL: REMOTE }

    const message = (() => {
      try {
        getEnv()
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : ''
      }
    })()

    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('APP_DATABASE_URL')
  })

  it('refuses when only one of the two is unprotected', async () => {
    const getEnv = await freshGetEnv()
    process.env = {
      ...saved,
      ...required,
      DATABASE_URL: `${REMOTE}?sslmode=verify-full`,
      APP_DATABASE_URL: REMOTE,
    }

    expect(() => getEnv()).toThrow(/APP_DATABASE_URL/)
  })

  it('starts with a verified remote connection', async () => {
    const getEnv = await freshGetEnv()
    const url = `${REMOTE}?sslmode=verify-full&sslrootcert=system`
    process.env = { ...saved, ...required, DATABASE_URL: url, APP_DATABASE_URL: url }

    expect(getEnv().APP_DATABASE_URL).toBe(url)
  })

  /** What local development and the whole of this suite do. */
  it('starts with a loopback connection and no TLS parameters', async () => {
    const getEnv = await freshGetEnv()
    process.env = { ...saved, ...required, DATABASE_URL: LOCAL, APP_DATABASE_URL: LOCAL }

    expect(getEnv().DATABASE_URL).toBe(LOCAL)
  })
})
