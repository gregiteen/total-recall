import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { runPluginCommand, type PluginInfo } from '../../api/plugins'
import { parsePluginOutput } from '../plugins/PluginPanel'

interface Harness { id: string; name: string }
interface ChatTarget {
  ok: boolean
  configured: boolean
  harness?: Harness
  href?: string
  context?: string
  choices?: Harness[]
}

function launchHref(value?: string) {
  try {
    if (!value) return undefined
    const url = new URL(value)
    if (url.username || url.password) return undefined
    if (url.protocol === 'https:') return url.href
    if (url.protocol === 'codex:' && url.hostname === 'threads' && /^\/(?:new|[0-9a-f-]{36})$/i.test(url.pathname)) return url.href
  } catch { /* An invalid configuration is shown without a launch link. */ }
  return undefined
}

export function DrawerChat({ plugin, activeBrainId }: { plugin?: PluginInfo; activeBrainId: string }) {
  const [target, setTarget] = useState<ChatTarget | null>(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(false)
  const [harness, setHarness] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasTarget = !!plugin?.valid && plugin.activation?.enabled === true &&
    !!plugin.cli?.subcommands?.some(command => command.name === 'chat-target')
  const getTarget = useCallback(async () => {
    const result = await runPluginCommand('meta-harness', 'chat-target', ['--brains', activeBrainId, '--json'])
    const data = parsePluginOutput(result.output) as Partial<ChatTarget> | undefined
    if (!result.success || data?.ok !== true || typeof data.configured !== 'boolean') {
      throw new Error('Could not read the default harness from Metaharness.')
    }
    return data as ChatTarget
  }, [activeBrainId])
  useEffect(() => {
    if (!hasTarget) return
    let current = true
    void getTarget().then(data => { if (current) { setTarget(data); setError(''); setCopied(false) } },
      error => { if (current) { setTarget(null); setError(error.message) } })
    return () => { current = false }
  }, [getTarget, hasTarget])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await runPluginCommand('meta-harness', 'chat-default', [
        harness, ...(url.trim() ? ['--url', url.trim()] : []), '--json',
      ])
      const data = parsePluginOutput(response.output) as { ok?: boolean; error?: string } | undefined
      if (!response.success || data?.ok !== true) throw new Error(data?.error || response.error || 'Could not save the default harness.')
      setTarget(await getTarget())
      setEdit(false)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the default harness.') }
    finally { setSaving(false) }
  }

  if (!hasTarget) return <p className="drawer-note">
    {!plugin ? 'Install Metaharness to open Chat.' : plugin.activation?.enabled !== true
      ? 'Enable Metaharness to open Chat.' : 'This Metaharness version does not provide a default Chat harness yet.'}
  </p>

  const href = launchHref(target?.href)
  const selectedCount = activeBrainId.split(',').filter(Boolean).length
  return <section className="drawer-stack">
    <div className="drawer-row">
      <div>
        <h3>{target?.harness?.name || 'Default harness'}</h3>
        <p className="drawer-note">{selectedCount === 1 ? '1 brain selected' : `${selectedCount} brains selected`}</p>
      </div>
      {target && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
        setHarness(target.harness?.id || ''); setUrl(''); setEdit(!edit)
      }}>{edit ? 'Cancel' : 'Configure default'}</button>}
    </div>
    {error && <p role="alert" className="drawer-error">{error}</p>}
    {!target && !error && <p role="status">Loading the default harness…</p>}
    {edit && <form className="drawer-stack" onSubmit={save}>
      <label>Harness
        <select className="select" value={harness} onChange={event => setHarness(event.target.value)} required>
          <option value="">Choose a harness…</option>
          {target?.choices?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>Custom launch URL (optional)<input className="input" type="text" value={url}
        placeholder="Use the harness default" onChange={event => setUrl(event.target.value)} /></label>
      <div><button className="btn btn-primary" disabled={saving || !harness}>{saving ? 'Saving…' : 'Save default'}</button></div>
    </form>}
    {!edit && target && (target.configured ? <>
      <div className="drawer-actions">
        {href && <a className="btn btn-primary" href={href} rel="noreferrer" target={href.startsWith('https:') ? '_blank' : undefined}>Open Chat</a>}
        {target.context && <button type="button" className="btn btn-ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(target.context!); setCopied(true) }
          catch { setError('Copy the selected brain context below.') }
        }}>{copied ? 'Copied' : 'Copy brain context'}</button>}
      </div>
      {!href && <p className="drawer-note">This harness has no launch URL. Open it directly and paste the selected brain context.</p>}
      {target.context && <details><summary>Selected brain context</summary><pre className="drawer-context">{target.context}</pre></details>}
    </> : <p className="drawer-note">Choose the harness Chat should open for your selected brains.</p>)}
  </section>
}
