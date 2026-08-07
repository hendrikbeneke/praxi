import { pino } from 'pino'
import { getEnv } from './env.js'

/**
 * Logs carry identifiers, never content.
 *
 * Health data falls under Art. 9 GDPR and § 203 StGB. Contact names, note
 * text, file names, search terms and query strings must not reach the log —
 * see CLAUDE.md rule 12. `redact` is the last line of defence; the first one
 * is not passing that data to the logger in the first place.
 */
const redactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'query',
  '*.query',
]

export function createLogger() {
  const env = getEnv()
  const pretty = env.NODE_ENV === 'development'

  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: '[redacted]' },
    base: undefined,
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
  })
}

export type Logger = ReturnType<typeof createLogger>

let cached: Logger | undefined

export function logger(): Logger {
  if (!cached) cached = createLogger()
  return cached
}
