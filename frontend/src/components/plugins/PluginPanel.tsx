import { useEffect, useRef, useState } from 'react'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { apiFetch, API_BASE } from '../../api/_base'
import { readSavedPluginCredentials, savePluginCredential } from '../../api/plugin-credentials'
import { changeAuthCredential, readAuthInventory } from '../../api/auth-inventory'
import { usePluginDesign } from '../workspace/usePluginDesign'
import { pluginFrameDocument, allowedFrameCommand, browserPluginOperations, pluginCommandTimeouts } from './plugin-frame'

export interface PluginElement {
  id: string
  kind: string
  tag: string
  module: string
  description?: string
  events?: string[]
  props?: { view?: unknown }
}

export function pluginElements(plugin: PluginInfo): PluginElement[] {
  const elements = (plugin.manifest?.ui as { elements?: PluginElement[] } | undefined)?.elements || plugin.ui?.elements || []
  return elements.filter(element => ['panel', 'form', 'list', 'detail', 'settings', 'widget'].includes(element.kind))
}

export function parsePluginOutput(rawOutput: string | undefined): unknown {
  const text = (rawOutput || '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    for (let start = 0; start < lines.length; start++) {
      for (let end = lines.length; end > start; end--) {
        const candidate = lines.slice(start, end).join('\n')
        try {
          const parsed = JSON.parse(candidate)
          if (parsed && typeof parsed === 'object' && 'subsystem' in parsed && 'level' in parsed && !('nodes' in parsed || 'data' in parsed || 'output' in parsed)) {
            continue
          }
          return parsed
        } catch {}
      }
    }
    return { output: text, raw: text }
  }
}

/** Loads owner code in an isolated document. Auth's inventory is a privileged bridge. */
export function PluginPanel({ plugin, elementId, readOnly = false, designCss, brainId }: {
  plugin: PluginInfo; elementId?: string; readOnly?: boolean; designCss?: string; brainId?: string
}) {
  const elements = pluginElements(plugin).filter(element => element.kind !== 'settings' && (!elementId || element.id === elementId))
  const home = (plugin.manifest?.ui as { home?: string } | undefined)?.home || plugin.ui?.home
  const [selected, setSelected] = useState(elementId || home || elements[0]?.id || '')
  const currentElement = elements.find(item => item.id === selected) || elements[0]
  const usesOwnerDesign = designCss === undefined && currentElement
  const ownerDesign = usePluginDesign(usesOwnerDesign ? plugin.id : undefined, brainId)
  const css = designCss ?? ownerDesign?.design?.css ?? ''
  const [error, setError] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const activeChannel = useRef('')
  const [document, setDocument] = useState('')
  const [height, setHeight] = useState(240)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    setError('')
    setDocument('')
    const channel = crypto.randomUUID()
    activeChannel.current = channel
    const commands = plugin.manifest?.cli as { subcommands?: Array<{ name: string; effect?: string; args?: Array<{ secret?: boolean; type?: string; flag?: string }> }> } | undefined
    const readCommands = new Set((commands?.subcommands || []).filter(command => command.effect === 'read').map(command => command.name))
    const allowed = new Set(browserPluginOperations(plugin).filter(command => !readOnly || readCommands.has(command.name)).map(command => command.name))
    const secretCommands = new Set((commands?.subcommands || []).filter(command => {
      const secrets = command.args?.filter(arg => arg.secret === true) || []
      return secrets.length === 1 && secrets[0].type === 'string' && secrets[0].flag === undefined
    }).map(command => command.name))
    const element = elements.find(item => item.id === selected) || elements[0]
    const credentials = plugin.secrets || []
    const credentialPanel = element?.events?.includes('save-token') === true && !!element.props?.view && credentials.length === 1
    const authInventory = plugin.id === 'auth' && element?.events?.includes('auth-inventory') === true
    const authChanges = authInventory && !readOnly && element?.events?.includes('auth-credential-mutate') === true
    let active = 0
    let changingCredential = false
    const message = async (event: MessageEvent) => {
      if (disposed || event.source !== frame.current?.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return
      const data = event.data
      if (data.type === 'height' && Number.isFinite(data.height)) setHeight(Math.max(128, Math.min(1000, data.height)))
      if (data.type === 'error') setError('Could not open the plugin interface')
      const target = event.source as Window
      const reply = (result?: unknown, error?: string) => { if (!disposed) target.postMessage({ channel, type: 'result', requestId: data.requestId, result, error }, '*') }
      if (data.type === 'auth-credential-mutate') {
        if (!authChanges || changingCredential) { reply(undefined, 'Credential changes are unavailable'); return }
        changingCredential = true
        try {
          reply(await changeAuthCredential(data.change, controller.signal))
        } catch (error) {
          reply(undefined, error instanceof Error ? error.message : 'Could not change the credential')
        } finally { changingCredential = false }
        return
      }
      if (data.type === 'auth-inventory') {
        if (!authInventory || active >= 12) { reply(undefined, 'Auth inventory is unavailable'); return }
        active++
        try {
          reply(await readAuthInventory(data.resource, controller.signal))
        } catch (error) {
          reply(undefined, error instanceof Error ? error.message : 'Could not load the inventory')
        } finally { active-- }
        return
      }
      if (data.type === 'credential-status' || data.type === 'credential-save') {
        if (!credentialPanel || active >= 12) { reply(undefined, 'Credential check is unavailable'); return }
        const { key } = credentials[0]
        active++
        try {
          if (data.type === 'credential-save') {
            if (readOnly || data.key !== key || typeof data.value !== 'string' || !data.value.trim() || data.value.length > 16384) {
              reply(undefined, 'Credential update is unavailable')
              return
            }
            await savePluginCredential(plugin, key, data.value, brainId)
            reply({ present: true, secretKey: key })
          } else {
            const saved = await readSavedPluginCredentials()
            reply({ present: saved.has(key), secretKey: key })
          }
        } catch {
          reply(undefined, data.type === 'credential-save' ? 'Could not verify and save the credential.' : 'Could not check saved credentials.')
        } finally { active-- }
        return
      }
      if (data.type !== 'run') return

      let subcommand = data.subcommand
      let args = Array.isArray(data.args) ? [...data.args] : []
      if ((subcommand === plugin.id || subcommand === plugin.cli?.command) && args.length > 0 && allowed.has(args[0])) {
        subcommand = args[0]
        args = args.slice(1)
      }

      if (!allowedFrameCommand({ ...data, subcommand, args }, allowed, secretCommands) || active >= 12) { reply(undefined, 'Operation is not available'); return }
      active++
      try {
        const finalArgs = args.includes('--json') ? args : [...args, '--json']
        const options = { ...(brainId ? { brainId } : {}), ...(data.stdin !== undefined ? { stdin: data.stdin } : {}) }
        const result = Object.keys(options).length
          ? await runPluginCommand(plugin.id, subcommand, finalArgs, options)
          : await runPluginCommand(plugin.id, subcommand, finalArgs)
        if (!result.success) { reply(undefined, data.stdin !== undefined ? 'Credential operation failed' : result.output || result.error || 'Operation failed'); return }
        if (data.stdin !== undefined) {
          reply({ ok: true })
          return
        }
        reply(parsePluginOutput(result.output))
      } catch { reply(undefined, 'Operation failed') }
      finally { active-- }
    }
    window.addEventListener('message', message)
    const dispose = () => {
      disposed = true
      controller.abort()
      window.removeEventListener('message', message)
    }
    if (!element) return dispose
    const load = async () => {
      const scope = brainId ? `?brain=${encodeURIComponent(brainId)}` : ''
      const response = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/ui/${encodeURIComponent(element.id)}${scope}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Could not open ${plugin.name} (${response.status})`)
      const source = await response.text()
      if (source.length > 1024 * 1024) throw new Error('The plugin interface is too large')
      if (disposed) return
      const styles = getComputedStyle(window.document.documentElement)
      const theme: Record<string, string> = {}
      for (const name of ['--text-primary', '--text-secondary', '--text-tertiary', '--bg-primary', '--bg-secondary', '--border', '--accent', '--font-sans', '--color-text', '--color-surface', '--color-border', '--spacing-md', '--radius-md']) theme[name] = styles.getPropertyValue(name)
      setDocument(pluginFrameDocument(source, element.tag, channel, theme, plugin.id, pluginCommandTimeouts(plugin.manifest), [...allowed], credentialPanel, authInventory, authChanges))
    }
    load().catch(err => { if (!disposed) setError(err.message) })
    return dispose
  }, [plugin.id, selected, plugin.sha256, elementId, readOnly, brainId])

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ channel: activeChannel.current, type: 'design', css }, '*')
  }, [css])

  const showNav = elements.length > 1

  return <section>
    {showNav && <nav style={{ display: 'flex', gap: 8 }}>
      {elements.map(element => <button key={element.id} className="btn btn-sm" onClick={() => setSelected(element.id)} aria-pressed={selected === element.id}>{element.description || element.id}</button>)}
    </nav>}
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {elements.length === 0 && <p>This plugin has not supplied its interface yet.</p>}
    {document && <iframe ref={frame} title={`${plugin.name} interface`} sandbox="allow-scripts" referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
      onLoad={() => frame.current?.contentWindow?.postMessage({ channel: activeChannel.current, type: 'design', css }, '*')}
      srcDoc={document} style={{ width: '100%', height, border: 0 }} />}
  </section>
}
