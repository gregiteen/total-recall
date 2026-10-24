import { useState } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { PluginSettings } from '../PluginSettings'
import { defaultValue, missingRequired, visibleArgs, type ArgValues } from './args'
import { cliLine } from './cli-line'
import type { CardCommand } from './contract'
import { scalarsOf, toneOf } from './format'
import { useRunner, type RunResult } from './runner-context'
import { useSource } from './use-source'

const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`card-pill card-pill-${tone}`}>{children}</span>

function Failure({ result }: { result: RunResult }) {
  return <p role="alert" className="card-error">{result.error || 'No data'}</p>
}

export function StatusWidget() {
  const { card } = useRunner()
  const { result, loading, reload } = useSource(card.status?.command, [], card.status?.refreshSeconds)
  if (!card.status) return <p className="card-muted">This plugin declares no status command.</p>
  const data = result?.data
  const scalars = scalarsOf(data)
  const state = data?.state ?? (data?.ok === false ? 'error' : data?.ok === true ? 'ok' : undefined)
  return <div>
    <div className="card-row">
      {!result ? <Pill tone="neutral">Checking…</Pill> : !result.ok ? <Pill tone="error">Unreachable</Pill> : <Pill tone={toneOf(state ?? 'ok')}>{String(state ?? 'Responding')}</Pill>}
      <button type="button" className="card-link" onClick={() => void reload()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {result && !result.ok && <Failure result={result} />}
    {scalars.length > 0 && <dl className="card-kv">{scalars.filter(([k]) => k !== 'state').map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div>)}</dl>}
    {result?.ok && !data && result.text && <pre className="card-pre">{result.text}</pre>}
  </div>
}

function ReadForm({ command }: { command: CardCommand }) {
  const { run, busy } = useRunner()
  const args = visibleArgs(command)
  const [values, setValues] = useState<ArgValues>(() => Object.fromEntries(args.map(a => [a.name, defaultValue(a)])))
  const [result, setResult] = useState<RunResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [credential, setCredential] = useState('')
  const secretArgs = command.args.filter(arg => arg.secret)
  const stdinSupported = secretArgs.length === 1 && secretArgs[0].type === 'string' && !secretArgs[0].flag
  const requiresConfirmation = command.effect !== 'read'
  const missing = missingRequired(command, values)
  return <form className="card-form" onSubmit={async event => { event.preventDefault(); if (requiresConfirmation && !confirmed) return; const input = stdinSupported ? credential : undefined; setCredential(''); setResult(await run(command.name, values, [], input)); setConfirmed(false) }}>
    {args.map(arg => <label key={arg.name}>{arg.label}{arg.required ? ' *' : ''}
      {arg.type === 'choice' ? <select value={String(values[arg.name] ?? '')} onChange={e => setValues({ ...values, [arg.name]: e.target.value })}>{!arg.required && <option value="">Any</option>}{arg.options?.map(o => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>
        : arg.type === 'boolean' ? <input type="checkbox" checked={!!values[arg.name]} onChange={e => setValues({ ...values, [arg.name]: e.target.checked })} />
        : <input type={arg.type === 'number' ? 'number' : 'text'} value={String(values[arg.name] ?? '')} onChange={e => setValues({ ...values, [arg.name]: arg.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />}
    </label>)}
    {stdinSupported && <label>{secretArgs[0].label}<input type="password" autoComplete="new-password" value={credential} maxLength={65536} onChange={event => setCredential(event.target.value)} /></label>}
    {secretArgs.length > 0 && !stdinSupported && <p className="card-muted">Use connection settings for this credential operation.</p>}
    {requiresConfirmation && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirm {command.name}</label>}
    <button className="card-button" disabled={missing.length > 0 || busy.has(command.name) || (requiresConfirmation && !confirmed) || (secretArgs.length > 0 && (!stdinSupported || !credential))}>{busy.has(command.name) ? 'Running…' : command.effect === 'read' ? 'Look up' : 'Run command'}</button>
    {result && (result.ok ? <pre className="card-pre">{result.data ? JSON.stringify(result.data, null, 2) : result.text}</pre> : <Failure result={result} />)}
  </form>
}

/** Every declared operation, with arguments, explicit mutation confirmation and secure stdin. */
export function CommandsWidget() {
  const { card } = useRunner()
  const cliName = card.id
  const names = [...card.commands.keys()]
  const [open, setOpen] = useState('')
  const [copied, setCopied] = useState('')
  return <ul className="card-commands">
    {names.map(name => card.commands.get(name)).filter((c): c is CardCommand => !!c).map(command => {
      const line = cliLine(card, command, cliName)
      return <li key={command.name}>
        <div className="card-row">
          <strong>{command.name}</strong>
          <Pill tone={command.effect === 'read' ? 'ok' : command.effect === 'write' ? 'neutral' : 'warn'}>{command.effect}</Pill>
          <button type="button" className="card-link" onClick={() => setOpen(open === command.name ? '' : command.name)}>{open === command.name ? 'Close' : 'Try'}</button>
        </div>
        {command.description && <p className="card-muted">{command.description}</p>}
        <div className="card-row"><code className="card-code">{line}</code>
          <button type="button" className="card-link" onClick={async () => { try { await navigator.clipboard.writeText(line); setCopied(command.name) } catch { setCopied('') } }}>{copied === command.name ? 'Copied' : 'Copy'}</button></div>
        {open === command.name && <ReadForm command={command} />}
      </li>
    })}
    {names.length === 0 && <li className="card-muted">No commands declared.</li>}
  </ul>
}

export function SettingsWidget({ plugin }: { plugin: PluginInfo }) {
  return <PluginSettings plugin={plugin} />
}

export function ActivityWidget() {
  const { activity } = useRunner()
  if (activity.length === 0) return <p className="card-muted">No commands have run from this card in this session.</p>
  return <ul className="card-list">{activity.slice(0, 20).map((a, i) => <li key={i}><Pill tone={a.ok ? 'ok' : 'error'}>{a.ok ? 'ok' : 'failed'}</Pill> {a.command} · {a.ms} ms · {new Date(a.at).toLocaleTimeString()}</li>)}</ul>
}
