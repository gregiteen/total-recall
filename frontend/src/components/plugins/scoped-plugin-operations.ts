import type { PluginInfo } from '../../api/plugins'
import { browserPluginOperations } from './plugin-frame'

export type Argument = {
  name: string
  label: string
  flag?: string
  type: 'string' | 'number' | 'boolean' | 'choice'
  options?: string[]
  required?: boolean
  secret?: boolean
}

export type Command = ReturnType<typeof browserPluginOperations>[number] & {
  effect?: 'read' | 'write' | 'destructive' | 'send'
  args?: Argument[]
  terminal_only_args?: string[]
}

export function scopedPluginOperations(plugin: PluginInfo, operationIds?: readonly string[]): Command[] {
  const manifest = plugin.manifest?.cli as { subcommands?: Command[] } | undefined
  const declared = new Map(manifest?.subcommands?.map(operation => [operation.name, operation]))
  return browserPluginOperations(plugin)
    .map(operation => ({ ...operation, ...declared.get(operation.name) }))
    .filter(operation => operation.name !== 'on' && operation.name !== 'off' &&
      (!operationIds || operationIds.includes(operation.name)) &&
      !operation.args?.some(arg => arg.secret || (arg.required && operation.terminal_only_args?.includes(arg.flag || ''))))
}
