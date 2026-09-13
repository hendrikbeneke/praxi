import type { Command } from './command.js'
import { devDemo } from './commands/dev-demo.js'
import { devSeed } from './commands/dev-seed.js'
import { tenantCreate } from './commands/tenant-create.js'
import { userAdd } from './commands/user-add.js'

/**
 * The list. A command more is a file and a line here, and nothing else changes
 * — which is the whole point of the shape: two commands today, twenty in a
 * year.
 *
 * The ones that are not built yet and are known to be coming — `tenant delete`,
 * `user remove`, `user password`, `tenant list`, and the maintenance scripts
 * that still live under `src/scripts/` — need nothing from the runner that is
 * not already here. The one thing a destructive command will want is a
 * confirmation, and `resolveConfirm` already exists with the rule it has to
 * follow: a question that cannot be asked is never answered with yes.
 */
export const COMMANDS: readonly Command[] = [tenantCreate, userAdd, devSeed, devDemo]

export function findCommand(argv: readonly string[]): Command | undefined {
  return COMMANDS.find((command) => command.path[0] === argv[0] && command.path[1] === argv[1])
}

/** `praxi tenant` on its own lists what is under it. */
export function commandsInGroup(group: string): readonly Command[] {
  return COMMANDS.filter((command) => command.path[0] === group)
}

export function groups(): readonly string[] {
  return [...new Set(COMMANDS.map((command) => command.path[0]))]
}
