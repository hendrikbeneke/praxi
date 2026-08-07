import type { AppType } from '@praxi/server'
import { hc } from 'hono/client'
import { strings } from './strings'

/**
 * Typed client over the Hono app. The base URL is relative on purpose: in
 * development Vite proxies /api to the server on port 3000, in production the
 * same process serves both. No environment switch in the code.
 */
export const api = hc<AppType>('/')

/** The shape `middleware/error.ts` answers with. */
type ErrorBody = { error: { message: string; errorId: string } }

/**
 * Carries the German message the server produced, so components display the
 * server's wording instead of inventing their own. `errorId` is the link to
 * the log line and is shown only where it helps support.
 */
export class ApiError extends Error {
  readonly status: number
  readonly errorId: string | undefined

  constructor(status: number, message: string, errorId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorId = errorId
  }
}

/** Turns a failed response into an `ApiError`, falling back to a generic
 *  German message when the body is not the expected envelope. */
export async function apiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorBody
    if (body?.error?.message) {
      return new ApiError(response.status, body.error.message, body.error.errorId)
    }
  } catch {
    // not JSON — fall through to the generic message
  }
  return new ApiError(response.status, strings.error.generic)
}
