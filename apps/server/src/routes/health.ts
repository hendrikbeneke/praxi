import { type HealthResponse, healthResponseSchema } from '@praxi/shared'
import { Hono } from 'hono'

export const healthRoute = new Hono().get('/', (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    status: 'ok',
    time: new Date().toISOString(),
  })

  return c.json(body)
})
