import { type HealthResponse, healthResponseSchema } from '@praxi/shared'
import { Hono } from 'hono'

/**
 * No caller in this repository, and it must stay anyway: the `HEALTHCHECK` in
 * the Dockerfile fetches it every 30 seconds, and Coolify decides from the
 * same route whether the container came up. Deleting it would make the
 * container report unhealthy forever while the application runs fine.
 */
export const healthRoute = new Hono().get('/', (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    status: 'ok',
    time: new Date().toISOString(),
  })

  return c.json(body)
})
