import type { CardArg, CardCommand } from './contract'

export type ArgValues = Record<string, string | number | boolean | undefined>

/** Secret arguments are never put on the command line; they are managed in the drawer's Credentials. */
export const visibleArgs = (command: CardCommand) => command.args.filter(arg => !arg.secret)

export function missingRequired(command: CardCommand, values: ArgValues): string[] {
  return visibleArgs(command).filter(arg => arg.required && (values[arg.name] === undefined || values[arg.name] === '')).map(arg => arg.label)
}

/** Positionals first, in declared order, then flags. Returns argv for `--json` runs. */
export function buildArgs(command: CardCommand, values: ArgValues, extra: string[] = []): string[] {
  const argv: string[] = []
  const flagged: string[] = []
  for (const arg of visibleArgs(command)) {
    const value = values[arg.name]
    if (value === undefined || value === '' || value === false) continue
    if (arg.positional) { argv.push(String(value)); continue }
    if (!arg.flag) continue
    if (arg.type === 'boolean') flagged.push(arg.flag)
    else flagged.push(arg.flag, String(value))
  }
  return [...argv, ...flagged, ...extra, ...(command.output === 'json' ? ['--json'] : [])]
}

export const needsConfirmation = (command: CardCommand) => command.effect === 'destructive' || command.effect === 'send'
export const defaultValue = (arg: CardArg) => arg.type === 'boolean' ? false : arg.type === 'choice' && arg.options?.length && arg.required ? arg.options[0] : ''
