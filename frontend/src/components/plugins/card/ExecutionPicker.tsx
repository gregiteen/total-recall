import { useRef, useState } from 'react'
import { apiFetch, API_BASE } from '../../../api/_base'
import { useRunner } from './runner-context'
import type { PluginExecution } from '../../../api/plugins'

type Agent = { id: string; name: string; installed: boolean; authenticated: boolean | 'unknown'; version?: string; versionVerified?: boolean }
type Node = { id: string; name: string; online: boolean; self: boolean; accessConfigured: boolean }
const DEFAULT: PluginExecution = { agent: 'direct', node: 'local', permissions: { read: true, write: false, send: false, destructive: false } }
const labels = { read: 'Read commands', write: 'Write commands', send: 'Send commands', destructive: 'Delete commands' }
let targetCache: { at: number; data: { nodes: Node[] } } | undefined

export function ExecutionPicker() {
  const { execution, setExecution, busy } = useRunner()
  const selected = execution || DEFAULT
  const [open, setOpen] = useState(false)
  const [nodes, setNodes] = useState<Node[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inspection = useRef(0)
  const loadAgents = async (node: string) => {
    const revision = ++inspection.current
    setLoading(true); setAgents([]); setError('')
    try {
      const response = await apiFetch(`${API_BASE}/api/plugins/execution-targets?node=${encodeURIComponent(node)}`)
      const value = await response.json()
      if (!response.ok || !value.success) throw new Error(value.error || 'Could not inspect this node')
      if (revision === inspection.current) setAgents(value.agents || [])
    } catch (err) { if (revision === inspection.current) setError(err instanceof Error ? err.message : 'Could not inspect this node') }
    finally { if (revision === inspection.current) setLoading(false) }
  }
  const show = async () => {
    setOpen(!open)
    if (open) return
    setLoading(true); setError('')
    try {
      if (!targetCache || Date.now() - targetCache.at > 60000) {
        const response = await apiFetch(`${API_BASE}/api/plugins/execution-targets`)
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'CLI agents is unavailable')
        targetCache = { at: Date.now(), data }
      }
      setNodes(targetCache.data.nodes || [])
      await loadAgents(selected.node)
    } catch (err) { setError(err instanceof Error ? err.message : 'CLI agents is unavailable'); setLoading(false) }
  }
  return <div className="card-execution">
    <button type="button" className="card-link" onClick={() => void show()} aria-expanded={open}>Agent, node & permissions</button>
    {open && <fieldset className="card-form" disabled={loading || busy.size > 0}>
      <legend>Command execution</legend>
      <label>Mesh node<select value={selected.node} onChange={event => { const node = event.target.value; setExecution({ ...selected, node, agent: 'direct', cwd: undefined }); void loadAgents(node) }}>
        <option value="local">This node</option>{nodes.filter(node => !node.self).map(node => <option key={node.id} value={node.id} disabled={!node.online || !node.accessConfigured}>{node.name}{!node.online ? ' · offline' : !node.accessConfigured ? ' · access needed' : ''}</option>)}
      </select></label>
      <label>CLI agent<select value={selected.agent} onChange={event => setExecution({ ...selected, agent: event.target.value, allowUnknownAuth: event.target.value !== 'direct' })}>
        <option value="direct">Direct CLI</option>{agents.map(agent => <option key={agent.id} value={agent.id} disabled={!agent.installed || !agent.versionVerified || agent.authenticated === false}>{agent.name}{!agent.installed ? ' · not installed' : agent.authenticated === false ? ' · sign in needed' : agent.authenticated === 'unknown' ? ' · account unchecked' : ''}</option>)}
      </select></label>
      {selected.node !== 'local' && <label>Workspace on selected node<input value={selected.cwd || ''} placeholder="/absolute/workspace" onChange={event => setExecution({ ...selected, cwd: event.target.value })} /></label>}
      <div className="card-permissions">{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <label key={key}><input type="checkbox" role="switch" checked={selected.permissions[key]} onChange={event => setExecution({ ...selected, permissions: { ...selected.permissions, [key]: event.target.checked } })} />{labels[key]}</label>)}</div>
      <button type="button" className="card-link" onClick={() => void loadAgents(selected.node)}>Refresh installed agents</button>
    </fieldset>}
    {loading && <p role="status" className="card-muted">Inspecting installed agents…</p>}
    {error && <p role="alert" className="card-error">{error}</p>}
  </div>
}
