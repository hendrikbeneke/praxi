import type { AppType } from '@praxi/server'
import { hc } from 'hono/client'
import { strings } from './strings'

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
  /**
   * True when the request never reached the API. Worth telling apart from a
   * server error: "the server is not running" and "the server refused this"
   * need different reactions, and one message for both sends you looking in
   * the wrong place.
   */
  readonly unreachable: boolean

  constructor(
    status: number,
    message: string,
    options: { errorId?: string | undefined; unreachable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = status
    this.errorId = options.errorId
    this.unreachable = options.unreachable ?? false
  }
}

/** Status 0 where no answer arrived at all — there is no HTTP status to report. */
function unreachable(status: number, cause?: unknown): ApiError {
  return new ApiError(status, strings.error.serverUnreachable, { unreachable: true, cause })
}

/**
 * `fetch` rejects only when the request never reached a server: the process is
 * down, or the machine is offline. In production the SPA and the API are one
 * process, so this is exactly what a stopped server looks like there.
 */
const apiFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (cause) {
    throw unreachable(0, cause)
  }
}

/**
 * Typed client over the Hono app. The base URL is relative on purpose: in
 * development Vite proxies /api to the server on port 3000, in production the
 * same process serves both. No environment switch in the code.
 */
export const api = hc<AppType>('/', { fetch: apiFetch })

/**
 * Turns a failed response into an `ApiError`.
 *
 * Every error the API itself produces goes through `middleware/error.ts` and
 * carries the envelope above. A reply that is not JSON therefore did not come
 * from the API but from something in between — in development that is Vite's
 * proxy, which answers with a plain-text 500 when the API process is not
 * listening. Reporting that as "an unexpected error occurred" sends you
 * hunting through server logs that do not contain anything.
 */
export async function apiError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    return unreachable(response.status, cause)
  }

  const envelope = (body as ErrorBody | null)?.error
  if (envelope?.message) {
    return new ApiError(response.status, envelope.message, { errorId: envelope.errorId })
  }

  // JSON, but not our shape — it did come from somewhere that speaks JSON, so
  // this is not the unreachable case.
  return new ApiError(response.status, strings.error.generic)
}
