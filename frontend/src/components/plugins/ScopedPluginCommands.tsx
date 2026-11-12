import { useRef, useState } from 'react'
import { runPluginCommand, type PluginInfo } from '../../api/plugins'
import { scopedPluginOperations, type Argument, type Command } from './scoped-plugin-operations'

type InputValues = Record<string, string | boolean>
type Run = { command: string; args: string[] }

function browserArguments(command: Command) {
  return (command.args || []).filter(arg => !command.terminal_only_args?.includes(arg.flag || ''))
}

function buildArguments(command: Command, values: InputValues, extra: string): string[] {
  const args: string[] = []
  let omittedPosition: Argument | undefined
  for (const arg of browserArguments(command)) {
    const input = values[arg.name]
    const value = arg.type === 'boolean' ? (input === true ? 'true' : '') : typeof input === 'string' ? input : ''
    if (!value.trim()) {
      if (arg.required) throw new Error(`Enter ${arg.label}.`)
      if (!arg.flag) omittedPosition ??= arg
      continue
    }
    if (arg.flag) args.push(arg.flag)
    else if (omittedPosition) throw new Error(`Enter ${omittedPosition.label} before ${arg.label}.`)
    if (arg.type !== 'boolean' || !arg.flag) args.push(value)
  }
  if (extra.trim()) {
    let parsed: unknown
    try { parsed = JSON.parse(extra) }
    catch { throw new Error('Arguments must be a JSON array of strings.') }
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string')) {
      throw new Error('Arguments must be a JSON array of strings.')
    }
    args.push(...parsed)
  }
  if (args.some(arg => arg.includes('\0'))) throw new Error('An argument contains an invalid character.')
  if (args.some(arg => command.terminal_only_args?.includes(arg.split('=', 1)[0]))) {
    throw new Error('Use the owning CLI for terminal-only arguments.')
  }
  return args
}

export function ScopedPluginCommands({ plugin, brainId, enabled = true, operationIds, initialCommand, label }: {
  plugin: PluginInfo
  brainId: string
  enabled?: boolean
  operationIds?: readonly string[]
  initialCommand?: string
  label?: string
}) {
  const commands = scopedPluginOperations(plugin, operationIds)
  const [selected, setSelected] = useState(initialCommand)
  const command = commands.find(item => item.name === selected) ?? commands[0]
  const [values, setValues] = useState<InputValues>({})
  const [extra, setExtra] = useState('')
  const [pending, setPending] = useState<Run>()
  const [output, setOutput] = useState<{ text: string; error: boolean }>()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const canRun = enabled && plugin.valid && plugin.activation?.enabled === true &&
    plugin.activation.state !== 'error' && Boolean(brainId) && !brainId.includes(',')
  if (!command) return null
  const fields = browserArguments(command)

  function clearResult() {
    setPending(undefined)
    setOutput(undefined)
  }

  function changeValue(name: string, value: string | boolean) {
    setValues(current => ({ ...current, [name]: value }))
    clearResult()
  }

  async function run(request: Run) {
    if (!canRun || running.current || !commands.some(item => item.name === request.command)) return
    running.current = true
    setBusy(true)
    clearResult()
    try {
      const result = await runPluginCommand(plugin.id, request.command, request.args, { brainId })
      setOutput({
        text: result.output || result.error || (result.success ? 'Command completed.' : 'Command failed.'),
        error: !result.success,
      })
    } catch (error) {
      setOutput({ text: error instanceof Error ? error.message : 'Command failed.', error: true })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const argumentInput = <label>Arguments (JSON array)
    <textarea className="input" rows={2} value={extra} placeholder='["--name", "Value with spaces"]'
      onChange={event => { setExtra(event.target.value); clearResult() }} />
  </label>

  return <form className="plugin-drawer-form" aria-label={label || `${plugin.name} commands`}
    onSubmit={event => {
      event.preventDefault()
      if (!canRun || running.current || pending) return
      try {
        const request = { command: command.name, args: buildArguments(command, values, extra) }
        if (command.effect === 'read') void run(request)
        else { setOutput(undefined); setPending(request) }
      } catch (error) {
        setOutput({ text: error instanceof Error ? error.message : 'Invalid arguments.', error: true })
      }
    }}>
    <fieldset className="plugin-drawer-form" disabled={!canRun || busy} style={{ border: 0, margin: 0, padding: 0 }}>
      <label>Command
        <select className="select" value={command.name} onChange={event => {
          setSelected(event.target.value); setValues({}); setExtra(''); clearResult()
        }}>
          {commands.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </label>
      {command.description && <p className="plugin-muted">{command.description}</p>}
      {fields.map(arg => <label key={arg.name}>{arg.label}
        {arg.type === 'choice' ? <select className="select" required={arg.required} value={String(values[arg.name] ?? '')}
          onChange={event => changeValue(arg.name, event.target.value)}>
          <option value="">Choose…</option>
          {arg.options?.map(option => <option key={option} value={option}>{option}</option>)}
        </select> : arg.type === 'boolean' ? <input type="checkbox" required={arg.required} checked={values[arg.name] === true}
          onChange={event => changeValue(arg.name, event.target.checked)} /> :
          <input className="input" type={arg.type === 'number' ? 'number' : 'text'} step={arg.type === 'number' ? 'any' : undefined}
            required={arg.required} value={String(values[arg.name] ?? '')} onChange={event => changeValue(arg.name, event.target.value)} />}
      </label>)}
      {fields.length ? <details><summary>Additional arguments</summary>{argumentInput}</details> : argumentInput}
      {pending ? <div className="drawer-stack" role="group" aria-label="Confirm command">
        <p>Confirm <strong>{pending.command}</strong> in the selected brain.</p>
        {pending.args.length > 0 && <pre className="plugin-command-output">{JSON.stringify(pending.args, null, 2)}</pre>}
        <div className="drawer-actions">
          <button type="button" className="btn btn-primary" onClick={() => void run(pending)}>Confirm and run</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPending(undefined)}>Cancel</button>
        </div>
      </div> : <button type="submit" className="btn btn-primary">{busy ? 'Running…' : 'Run command'}</button>}
    </fieldset>
    {output && <pre className="plugin-command-output" role={output.error ? 'alert' : 'status'}>{output.text}</pre>}
  </form>
}
