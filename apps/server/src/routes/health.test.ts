import { healthResponseSchema } from '@praxi/shared'
import { beforeAll, describe, expect, it } from 'vitest'

// The app must be imported after the environment is in place, because the
// logger reads it on first use.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgres://praxi:praxi@localhost:55432/praxi'
process.env.LOG_LEVEL = 'fatal'

let app: typeof import('../app.js')['app']

beforeAll(async () => {
  app = (await import('../app.js')).app
})

describe('GET /api/health', () => {
  it('answers with a valid health response', async () => {
    const res = await app.request('/api/health')

    expect(res.status).toBe(200)
    expect(healthResponseSchema.safeParse(await res.json()).success).toBe(true)
  })

  it('answers unknown API paths with a German 404 body', async () => {
    const res = await app.request('/api/does-not-exist')

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { message: string; errorId: string } }
    expect(body.error.message).toBe('Nicht gefunden.')
    expect(body.error.errorId).toHaveLength(36)
  })
})
