import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { z } from 'zod'
import { CliError } from './errors.js'

/**
 * Reading `seeds/default/*.json` and `seeds/demo/*.json`.
 *
 * **Read at runtime, never imported.** A static import would need
 * `resolveJsonModule`, would put the contents into the module graph, and would
 * carry them into `dist` wherever they belong or not — and `seeds/demo` must
 * not reach the container image at all. As files they can also be edited
 * without a rebuild, which is the point of their being JSON.
 *
 * The path is resolved relative to this module, so it works from `src/` under
 * tsx and from `dist/` under node alike — the same shape `env.ts` and the
 * migrations use. The Dockerfile copies `src/cli/seeds/default` to
 * `dist/cli/seeds/default` and nothing else, exactly as it copies the
 * migrations next to the compiled migrator.
 */

export type SeedScope = 'default' | 'demo'

function seedPath(scope: SeedScope, fileName: string): string {
  return fileURLToPath(new URL(`./seeds/${scope}/${fileName}`, import.meta.url))
}

/**
 * Every file is validated against the **same Zod schema the API validates that
 * form with**, so a hand-edited colour of `#xyz` or a label over 60 characters
 * is refused here exactly as it would be on screen. The lists were `as const`
 * in TypeScript until this slice and were checked by nothing at all.
 *
 * A missing file is an error and never "nothing to apply": applying nothing
 * silently is how a tenant ends up without the catalogue somebody believes it
 * has. For `seeds/demo` the message says outright that the directory is absent
 * from the image on purpose, because that is where the question will be asked.
 */
export async function readSeedFile<T>(
  scope: SeedScope,
  fileName: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const path = seedPath(scope, fileName)

  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    throw new CliError(
      scope === 'demo'
        ? `Cannot read ${path}.\n` +
            'The demo seed data is deliberately not part of the container image — ' +
            'this command is for local development only.'
        : `Cannot read ${path}.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new CliError(`${path} is not valid JSON: ${(error as Error).message}`)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new CliError(`${path} does not match its schema:\n${issues}`)
  }

  return result.data
}
