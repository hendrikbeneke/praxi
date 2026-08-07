import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'
import { getEnv } from '../env.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'

export type ErrorBody = {
  error: {
    message: string
    /** Correlates the response with the log entry. Safe to show to the user. */
    errorId: string
  }
}

const messageForStatus: Record<number, string> = {
  400: messages.error.badRequest,
  401: messages.error.unauthorized,
  403: messages.error.forbidden,
  404: messages.error.notFound,
  409: messages.error.conflict,
  422: messages.error.validation,
}

/**
 * Translates thrown errors into a German JSON body.
 *
 * What is *not* logged is the point: `err.message` can carry row values —
 * a Postgres unique violation quotes the conflicting key, and that key may be
 * a contact's email address. So the message and the stack only reach the log
 * outside production; everywhere the error id is the link between the user's
 * screen and the log line. See CLAUDE.md rule 12.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const errorId = crypto.randomUUID()
  const isDevelopment = getEnv().NODE_ENV !== 'production'

  if (err instanceof HTTPException) {
    const status = err.status
    logger().warn({ errorId, status, path: c.req.path, method: c.req.method }, 'request rejected')
    const body: ErrorBody = {
      error: {
        message: err.message || messageForStatus[status] || messages.error.badRequest,
        errorId,
      },
    }
    return c.json(body, status)
  }

  if (err instanceof ZodError) {
    logger().warn({ errorId, path: c.req.path, method: c.req.method }, 'validation failed')
    const body: ErrorBody = {
      error: { message: messages.error.validation, errorId },
    }
    return c.json(body, 422 satisfies ContentfulStatusCode)
  }

  logger().error(
    {
      errorId,
      path: c.req.path,
      method: c.req.method,
      name: err.name,
      ...(isDevelopment ? { message: err.message, stack: err.stack } : {}),
    },
    'unhandled error',
  )

  const body: ErrorBody = {
    error: { message: messages.error.internal, errorId },
  }
  return c.json(body, 500 satisfies ContentfulStatusCode)
}

export const notFoundHandler: NotFoundHandler = (c) => {
  const body: ErrorBody = {
    error: { message: messages.error.notFound, errorId: crypto.randomUUID() },
  }
  return c.json(body, 404)
}
