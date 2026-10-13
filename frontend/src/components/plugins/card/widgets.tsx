import { useState } from 'react'
import type { PluginInfo } from '../../../api/plugins'
import { PluginSettings } from '../PluginSettings'
import { defaultValue, missingRequired, visibleArgs, type ArgValues } from './args'
import { cliLine } from './cli-line'
import type { CardColumn, CardCommand, CardRegion } from './contract'
import { formatCell, rowsOf, scalarsOf, toneOf } from './format'
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
  const { run } = useRunner()
  const args = visibleArgs(command)
  const [values, setValues] = useState<ArgValues>(() => Object.fromEntries(args.map(a => [a.name, defaultValue(a)])))
  const [result, setResult] = useState<RunResult | null>(null)
  const missing = missingRequired(command, values)
  return <form className="card-form" onSubmit={async event => { event.preventDefault(); setResult(await run(command.name, values)) }}>
    {args.map(arg => <label key={arg.name}>{arg.label}{arg.required ? ' *' : ''}
      {arg.type === 'choice' ? <select value={String(values[arg.name] ?? '')} onChange={e => setValues({ ...values, [arg.name]: e.target.value })}>{!arg.required && <option value="">Any</option>}{arg.options?.map(o => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>
        : arg.type === 'boolean' ? <input type="checkbox" checked={!!values[arg.name]} onChange={e => setValues({ ...values, [arg.name]: e.target.checked })} />
        : <input type={arg.type === 'number' ? 'number' : 'text'} value={String(values[arg.name] ?? '')} onChange={e => setValues({ ...values, [arg.name]: arg.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />}
    </label>)}
    <button className="card-button" disabled={missing.length > 0}>Look up</button>
    {result && (result.ok ? <pre className="card-pre">{result.data ? JSON.stringify(result.data, null, 2) : result.text}</pre> : <Failure result={result} />)}
  </form>
}

/** What the plugin can do, with the exact CLI line an agent runs. Only read commands can be tried here. */
export function CommandsWidget({ region }: { region: CardRegion }) {
  const { card } = useRunner()
  const cliName = card.id
  const names = region.commands || [...card.commands.keys()]
  const [open, setOpen] = useState('')
  const [copied, setCopied] = useState('')
  return <ul className="card-commands">
    {names.map(name => card.commands.get(name)).filter((c): c is CardCommand => !!c).map(command => {
      const line = cliLine(card, command, cliName)
      return <li key={command.name}>
        <div className="card-row">
          <strong>{command.name}</strong>
          <Pill tone={command.effect === 'read' ? 'ok' : command.effect === 'write' ? 'neutral' : 'warn'}>{command.effect}</Pill>
          {command.effect === 'read' && <button type="button" className="card-link" onClick={() => setOpen(open === command.name ? '' : command.name)}>{open === command.name ? 'Close' : 'Try'}</button>}
        </div>
        {command.description && <p className="card-muted">{command.description}</p>}
        <div className="card-row"><code className="card-code">{line}</code>
          <button type="button" className="card-link" onClick={async () => { try { await navigator.clipboard.writeText(line); setCopied(command.name) } catch { setCopied('') } }}>{copied === command.name ? 'Copied' : 'Copy'}</button></div>
        {open === command.name && command.effect === 'read' && <ReadForm command={command} />}
      </li>
    })}
    {names.length === 0 && <li className="card-muted">No commands declared.</li>}
  </ul>
}

function Cell({ value, column }: { value: unknown; column: CardColumn }) {
  return column.format === 'status' ? <Pill tone={toneOf(value)}>{formatCell(value)}</Pill> : <>{formatCell(value, column.format)}</>
}

/** table, list, detail, gauge and log all read one declared command and show it. */
export function DataWidget({ region }: { region: CardRegion }) {
  const { result, loading } = useSource(region.source?.command, region.source?.args)
  if (!result) return <p className="card-muted">{loading ? 'Loading…' : ''}</p>
  if (!result.ok) return <Failure result={result} />
  const { widget } = region
  if (widget === 'log') return <pre className="card-pre">{result.text || JSON.stringify(result.data, null, 2)}</pre>
  if (widget === 'gauge') {
    const d = result.data || {}
    const observedValue = d.value ?? d.used ?? d.percent
    const observedMax = d.max ?? d.total ?? (d.percent !== undefined ? 100 : undefined)
    const value = Number(observedValue), max = Number(observedMax)
    if (observedValue == null || observedMax == null || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0 || value > max) {
      return <p role="status" className="card-muted">No valid usage measurement is available.</p>
    }
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
    return <div><div className="card-gauge" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><span style={{ width: `${pct}%` }} /></div><p className="card-muted">{formatCell(value, 'number')} of {formatCell(max, 'number')}</p></div>
  }
  if (widget === 'detail') return <dl className="card-kv">{scalarsOf(result.data).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div>)}</dl>
  const rows = rowsOf(result.data)
  if (rows.length === 0) return <p className="card-muted">Nothing to show yet.</p>
  if (widget === 'list') return <ul className="card-list">{rows.map((row, i) => <li key={i}>{typeof row === 'object' && row ? String(row.title ?? row.name ?? row.id ?? JSON.stringify(row)) : String(row)}</li>)}</ul>
  const columns = region.columns || Object.keys(rows[0] || {}).slice(0, 5).map(key => ({ key, label: key }))
  return <div className="card-scroll"><table className="card-table"><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{columns.map(c => <td key={c.key}><Cell value={row?.[c.key]} column={c} /></td>)}</tr>)}</tbody></table></div>
}

export function SettingsWidget({ plugin }: { plugin: PluginInfo }) {
  return <PluginSettings plugin={plugin} />
}

export function ActivityWidget() {
  const { activity } = useRunner()
  if (activity.length === 0) return <p className="card-muted">No commands have run from this card in this session.</p>
  return <ul className="card-list">{activity.slice(0, 20).map((a, i) => <li key={i}><Pill tone={a.ok ? 'ok' : 'error'}>{a.ok ? 'ok' : 'failed'}</Pill> {a.command} · {a.ms} ms · {new Date(a.at).toLocaleTimeString()}</li>)}</ul>
}
