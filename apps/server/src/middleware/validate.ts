import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ZodType } from 'zod'
import { logger } from '../logger.js'
import { messages } from '../messages.js'

/**
 * `zValidator` with our error contract.
 *
 * Left to itself the validator writes its own 400 body — `{ success: false,
 * error: { name: 'ZodError', message: '…' } }` — which bypasses
 * `middleware/error.ts` entirely: English, a different shape than every other
 * error the client handles, and it echoes the rejected input back. That input
 * can be a contact's name or a note, so it must not appear in a response body
 * or in the log (CLAUDE.md rule 12).
 *
 * Throwing instead routes the failure through the normal error handler, and
 * the log line carries the offending field *names* only.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (result.success) return

    logger().warn(
      {
        path: c.req.path,
        method: c.req.method,
        fields: result.error.issues.map((issue) => issue.path.join('.')),
      },
      'validation failed',
    )

    throw new HTTPException(422, { message: messages.error.validation })
  })
}
