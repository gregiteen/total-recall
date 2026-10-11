import type { Card, CardCommand } from './contract'

/** The exact line an agent runs; shown on the card so config and CLI never drift apart. */
export function cliLine(card: Card, command: CardCommand, cliName: string): string {
  const parts = [`total-recall`, cliName || card.id, command.name]
  for (const arg of command.args) {
    if (arg.secret) continue // secrets go on stdin, never in the line an agent logs
    const token = arg.positional ? `<${arg.name}>` : `${arg.flag}${arg.type === 'boolean' ? '' : ` <${arg.name}>`}`
    parts.push(arg.required ? token : `[${token}]`)
  }
  if (command.output === 'json') parts.push('--json')
  return parts.join(' ')
}
