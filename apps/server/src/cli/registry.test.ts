import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { commandName, parseArgsOptions } from './command.js'
import { GLOBAL_OPTIONS } from './help.js'
import { COMMANDS, findCommand } from './registry.js'

/**
 * What the shape promises, asserted rather than remembered.
 *
 * The valuable one is the last: it reads the sources instead of a list, the
 * same way the route test walks Hono's own `app.routes`. A list somebody keeps
 * by hand is exactly what it is meant to replace.
 */

const cliRoot = fileURLToPath(new URL('.', import.meta.url))

async function sourceFiles(): Promise<string[]> {
  const found: string[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'seeds') await walk(path)
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        found.push(path)
      }
    }
  }

  await walk(cliRoot)
  return found
}

describe('the registry', () => {
  it('has a unique two-word path for every command', () => {
    const names = COMMANDS.map(commandName)
    expect(new Set(names).size).toBe(names.length)

    for (const command of COMMANDS) {
      expect(command.path).toHaveLength(2)
      expect(findCommand(command.path)).toBe(command)
    }
  })

  /**
   * A frozen list, and worth it here where it would be noise at twenty
   * commands: what is on it creates invented data, and the price of a fourth
   * one slipping on unnoticed is a practice database with made-up patients in
   * it. Adding one has to be a line in a diff.
   */
  it('marks exactly the two development commands as devOnly', () => {
    const devOnly = COMMANDS.filter((command) => command.devOnly).map(commandName)
    expect(devOnly).toEqual(['dev seed', 'dev demo'])
  })

  /** Declared and unused on purpose — see `cli/owner.ts`. The day one appears,
   *  it has to carry a sentence saying why. */
  it('has no owner-scoped command, and any it grows must say why', () => {
    const owners = COMMANDS.filter((command) => command.scope === 'owner')
    expect(owners).toEqual([])

    for (const command of owners) {
      expect(command.scope === 'owner' && command.ownerReason.trim().length).toBeGreaterThan(0)
    }
  })

  /** One declaration, two readers: what `parseArgs` accepts and what the help
   *  prints cannot drift, because they are the same object. */
  it('declares no option that collides with a global one', () => {
    for (const command of COMMANDS) {
      for (const name of Object.keys(parseArgsOptions(command))) {
        expect(Object.keys(GLOBAL_OPTIONS)).not.toContain(name)
      }
    }
  })
})

describe('the owner connection', () => {
  /**
   * Everything a command writes goes through `asTenant` — one transaction, one
   * tenant, under the policies. Stepping past them happens in `owner.ts` and
   * nowhere else, and this reads the files rather than trusting that.
   */
  it('is imported by exactly one file in the CLI', async () => {
    const reaching: string[] = []

    for (const path of await sourceFiles()) {
      const source = await readFile(path, 'utf8')
      if (/\bownerDb\b/.test(source)) reaching.push(path.slice(cliRoot.length))
    }

    expect(reaching).toEqual(['owner.ts'])
  })

  /** The other half: a command must not reach for the pool directly either,
   *  which under row-level security would answer with no rows at all. */
  it('leaves the bare pool alone in every command', async () => {
    const reaching: string[] = []

    for (const path of await sourceFiles()) {
      if (!path.includes('/commands/')) continue
      const source = await readFile(path, 'utf8')
      if (/\bdb\(\)/.test(source)) reaching.push(path.slice(cliRoot.length))
    }

    expect(reaching).toEqual([])
  })
})
