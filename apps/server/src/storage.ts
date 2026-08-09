import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileStore } from './domain/file-store.js'
import { getEnv } from './env.js'

/**
 * The one `FileStore` the running server uses. It is built here rather than
 * inside `domain/` so the domain functions stay free of the environment and a
 * test can hand them a store over a temporary directory instead.
 */

/** Two levels above this file is `apps/server`, three is the repository root —
 *  the same reasoning as in `env.ts`, and true from `src/` and `dist/` alike. */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

let cached: FileStore | undefined

export function dataDir(): string {
  const configured = getEnv().DATA_DIR
  return isAbsolute(configured) ? configured : resolve(repoRoot, configured)
}

export function fileStore(): FileStore {
  cached ??= new FileStore(dataDir())
  return cached
}
