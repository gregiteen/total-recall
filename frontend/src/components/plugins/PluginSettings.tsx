import { useEffect, useState } from 'react'
import type { PluginInfo } from '../../api/plugins'
import { listSecrets, addSecret } from '../../api/secrets'
import { apiFetch, API_BASE } from '../../api/_base'

interface Setting { name: string; label: string; type: 'string' | 'number' | 'boolean'; options?: Array<string | number>; required?: boolean; default?: string | number | boolean }

/** Credential values are write-only. Existing values never enter browser state. */
export function PluginSettings({ plugin }: { plugin: PluginInfo }) {
  const [stored, setStored] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Setting[]>([])
  const [configuration, setConfiguration] = useState<Record<string, string | number | boolean>>({})
  useEffect(() => {
    let disposed = false
    setValues({}); setNotice(''); setError('')
    listSecrets().then(entries => { if (!disposed) setStored(new Set(entries.map(entry => entry.key))) })
      .catch(err => { if (!disposed) setError(err.message) })
    apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/configuration`).then(async response => {
      if (!response.ok) throw new Error('Could not load plugin settings')
      const data = await response.json()
      if (!disposed) {
        setFields(data.fields)
        setConfiguration(Object.fromEntries(data.fields.map((field: Setting) => [field.name, data.values[field.name] ?? field.default ?? (field.type === 'boolean' ? false : '')])))
      }
    }).catch(err => { if (!disposed) setError(err.message) })
    return () => { disposed = true }
  }, [plugin.id])
  async function save(key: string) {
    setSaving(key); setError(''); setNotice('')
    try {
      await addSecret(key, values[key], { tags: [`plugin:${plugin.id}`] })
      setValues(previous => ({ ...previous, [key]: '' }))
      setStored(previous => new Set([...previous, key]))
      setNotice('Credential saved. Open the plugin to verify the connection.')
    } catch (err: any) { setError(err.message) }
    finally { setSaving('') }
  }
  async function saveConfiguration() {
    setSaving('configuration'); setError(''); setNotice('')
    try {
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/configuration`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: configuration })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save settings')
      setConfiguration(data.values); setNotice('Settings saved.')
    } catch (err: any) { setError(err.message) }
    finally { setSaving('') }
  }
  return <section style={{ marginBottom: 24 }}>
    <h3>Configuration</h3>
    {fields.length > 0 ? <form onSubmit={event => { event.preventDefault(); void saveConfiguration() }}>
      {fields.map(field => <label key={field.name} style={{ display: 'block', marginBottom: 12 }}>{field.label}
        {field.options ? <select className="select" value={String(configuration[field.name] ?? '')} onChange={event => setConfiguration(previous => ({ ...previous, [field.name]: field.type === 'number' ? Number(event.target.value) : event.target.value }))}>
          <option value="">Choose…</option>{field.options.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
        </select> : <input className="input" type={field.type === 'boolean' ? 'checkbox' : field.type === 'number' ? 'number' : 'text'} required={field.required}
          checked={field.type === 'boolean' ? Boolean(configuration[field.name]) : undefined}
          value={field.type === 'boolean' ? undefined : String(configuration[field.name] ?? '')}
          onChange={event => setConfiguration(previous => ({ ...previous, [field.name]: field.type === 'boolean' ? event.target.checked : field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}
      </label>)}
      <button className="btn btn-sm btn-primary" disabled={!!saving}>{saving === 'configuration' ? 'Saving…' : 'Save settings'}</button>
    </form> : <p>No settings declared.</p>}
    <h3>Credentials</h3>
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    {(plugin.secrets || []).length === 0 && <p>No credentials required.</p>}
    {(plugin.secrets || []).map((secret, index) => {
      const label = `Credential ${index + 1}${secret.required ? ' (required)' : ' (optional)'}`
      return <form key={secret.key} onSubmit={event => { event.preventDefault(); void save(secret.key) }} style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>{label} · {stored.has(secret.key) ? 'Saved' : 'Not saved'}
          <input className="input" type="password" autoComplete="new-password" value={values[secret.key] || ''}
            placeholder={stored.has(secret.key) ? 'Paste a replacement' : 'Paste credential'}
            onChange={event => setValues(previous => ({ ...previous, [secret.key]: event.target.value }))} />
        </label>
        <button className="btn btn-sm btn-primary" disabled={!values[secret.key]?.trim() || !!saving}>{saving === secret.key ? 'Saving…' : 'Save credential'}</button>
      </form>
    })}
  </section>
}
