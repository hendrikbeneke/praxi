import { beforeAll, describe, expect, it } from 'vitest'

// The app must be imported after the environment is in place, because the
// logger reads it on first use.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'

let app: typeof import('../app.js')['app']
let PUBLIC_API_ROUTES: typeof import('../middleware/api-guard.js')['PUBLIC_API_ROUTES']

beforeAll(async () => {
  app = (await import('../app.js')).app
  PUBLIC_API_ROUTES = (await import('../middleware/api-guard.js')).PUBLIC_API_ROUTES
})

/**
 * Any syntactically valid id. It never resolves to a row — it does not have
 * to: `apiGuard` runs before the parameter validation, so a route that is
 * guarded answers 401 and one that is not answers 400 or 404. The two cannot
 * be confused, which is what makes an unguarded route visible here.
 */
const ID = '00000000-0000-7000-8000-000000000000'

type Endpoint = { method: string; path: string }

/**
 * Every endpoint the application actually serves under `/api`.
 *
 * `app.routes` is Hono's own table, and `route()` flattens the mounted routers
 * into it with their full paths — so this list cannot fall behind the code the
 * way a hand-maintained one would. Middleware registers as `ALL` and is
 * filtered out; what is left is the handlers.
 */
function apiEndpoints(): Endpoint[] {
  return app.routes
    .filter((route) => route.method !== 'ALL' && route.path.startsWith('/api'))
    .map((route) => ({ method: route.method, path: route.path }))
}

function isPublic(endpoint: Endpoint): boolean {
  return PUBLIC_API_ROUTES.some(
    (route) => route.method === endpoint.method && route.path === endpoint.path,
  )
}

describe('the /api guard', () => {
  it('finds the routes to check at all', () => {
    // A filter that quietly matched nothing would make every assertion below
    // pass without testing anything.
    expect(apiEndpoints().length).toBeGreaterThan(50)
  })

  it('answers every route without a session with 401', async () => {
    const open: string[] = []

    for (const endpoint of apiEndpoints()) {
      if (isPublic(endpoint)) continue

      const res = await app.request(endpoint.path.replaceAll(/:[^/]+/g, ID), {
        method: endpoint.method,
      })
      if (res.status !== 401) open.push(`${endpoint.method} ${endpoint.path} → ${res.status}`)
    }

    expect(open).toEqual([])
  })

  it('answers an unknown path under /api with 401 rather than 404', async () => {
    // The guard runs before the router finds out that nothing matches. That is
    // deliberate: someone without a session learns nothing about the route
    // table, not even which paths exist.
    const res = await app.request('/api/does-not-exist')

    expect(res.status).toBe(401)
  })

  it('lets every public route through without a session', async () => {
    for (const route of PUBLIC_API_ROUTES) {
      const res = await app.request(route.path, { method: route.method })

      expect(`${route.method} ${route.path} → ${res.status}`).not.toContain('→ 401')
    }
  })

  it('has no exception for a route that no longer exists', () => {
    // An orphan is worse than a missing entry: nobody notices it while
    // cleaning up, and the day a route of that name and method is created
    // again it is silently open.
    const endpoints = apiEndpoints()
    const orphans = PUBLIC_API_ROUTES.filter(
      (route) =>
        !endpoints.some(
          (endpoint) => endpoint.method === route.method && endpoint.path === route.path,
        ),
    ).map((route) => `${route.method} ${route.path}`)

    expect(orphans).toEqual([])
  })

  it('states a reason for every exception', () => {
    for (const route of PUBLIC_API_ROUTES) {
      expect(route.why.length, `${route.method} ${route.path}`).toBeGreaterThan(20)
    }
  })

  it('names no path twice', () => {
    const keys = PUBLIC_API_ROUTES.map((route) => `${route.method} ${route.path}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no exception that is a pattern rather than a path', () => {
    // Exact matches, never prefixes: `/api/auth/*` would wave `GET
    // /api/auth/me` through, and that is the shortcut that would turn this
    // whole file into a formality.
    for (const route of PUBLIC_API_ROUTES) {
      expect(route.path, route.why).not.toMatch(/[*:]/)
    }
  })
})
