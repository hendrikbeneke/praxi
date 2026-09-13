import { type Command, commandName, flagUsage } from './command.js'
import type { Output } from './output.js'
import { COMMANDS, commandsInGroup, groups } from './registry.js'

/**
 * The help, built from the registry and from each command's own option
 * declaration — so it cannot describe a flag that is not accepted, nor miss one
 * that is.
 */

/** Accepted by every command, so no command declares them. */
export const GLOBAL_OPTIONS = {
  'no-input': {
    type: 'boolean' as const,
    describe: 'Never ask; abort naming the missing flag instead',
  },
  help: { type: 'boolean' as const, describe: 'Show this help' },
}

const PROGRAM = 'praxi'

function widestName(names: readonly string[]): number {
  return names.reduce((widest, name) => Math.max(widest, name.length), 0)
}

export function printOverview(out: Output): void {
  out.line(`${PROGRAM} — administration for this practice management server`)
  out.line()
  out.line(`Usage:  ${PROGRAM} <group> <command> [options]`)
  out.line()

  const width = widestName(COMMANDS.map(commandName)) + 2

  for (const group of groups()) {
    for (const command of commandsInGroup(group)) {
      const marks = [
        command.devOnly ? ' [local development only]' : '',
        command.scope === 'owner' ? ` [runs as the database owner: ${command.ownerReason}]` : '',
      ].join('')
      out.line(`  ${commandName(command).padEnd(width)}${command.summary}${marks}`)
    }
    out.line()
  }

  out.line(`Run \`${PROGRAM} <group> <command> --help\` for a command's options.`)
  out.line()
}

export function printGroup(out: Output, group: string): void {
  const commands = commandsInGroup(group)
  const width = widestName(commands.map(commandName)) + 2

  out.line(`Usage:  ${PROGRAM} ${group} <command> [options]`)
  out.line()
  for (const command of commands) {
    out.line(`  ${commandName(command).padEnd(width)}${command.summary}`)
  }
  out.line()
}

export function printCommand(out: Output, command: Command): void {
  out.line(`Usage:  ${PROGRAM} ${commandName(command)} [options]`)
  out.line()
  out.line(`  ${command.summary}`)

  if (command.devOnly) {
    out.line('  Local development only — refused when NODE_ENV is "production".')
  }
  if (command.scope === 'owner') {
    out.line(`  Runs as the database owner: ${command.ownerReason}`)
  }

  for (const note of command.notes ?? []) out.line(`  ${note}`)
  out.line()

  const entries = [
    ...Object.entries(command.options),
    ...Object.entries(GLOBAL_OPTIONS),
  ] as ReadonlyArray<
    [string, { type: 'string' | 'boolean'; describe: string; placeholder?: string }]
  >

  const width = widestName(entries.map(([name, spec]) => flagUsage(name, spec))) + 2

  out.line('Options:')
  for (const [name, spec] of entries) {
    out.line(`  ${flagUsage(name, spec).padEnd(width)}${spec.describe}`)
  }
  out.line()
}
