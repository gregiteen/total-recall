import { useEffect, useState } from 'react'
import { readPluginDesignChoice, savePluginDesignChoice, type PluginDesignChoice as Choice } from '../../api/workspace-drawers'
import { refreshPluginDesign } from './usePluginDesign'

export function PluginDesignChoice({ pluginId, brainId }: { pluginId: string; brainId?: string }) {
  const [open, setOpen] = useState(false)
  if (!brainId) return null
  return <section aria-label="Plugin design choice">
    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>Choose design</button>
    {open && <DesignEditor key={`${pluginId}:${brainId}`} pluginId={pluginId} brainId={brainId} onClose={() => setOpen(false)} />}
  </section>
}

function DesignEditor({ pluginId, brainId, onClose }: { pluginId: string; brainId: string; onClose: () => void }) {
  const [choice, setChoice] = useState<Choice>()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void readPluginDesignChoice(pluginId, brainId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setChoice(result); setDraft(result.markdown ?? ''); setError('') }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [pluginId, brainId, refresh])

  const save = async (markdown: string | null) => {
    if (!choice) return
    setBusy(true); setError('')
    try {
      const next = await savePluginDesignChoice(pluginId, brainId, { markdown, version: choice.version })
      setChoice(next); setDraft(next.markdown ?? '')
      refreshPluginDesign(pluginId, brainId)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the design choice.') }
    finally { setBusy(false) }
  }
  return <form className="drawer-stack" onSubmit={event => { event.preventDefault(); void save(draft) }}>
    <p>{choice?.markdown === null ? 'Using the installed owner design.' : 'Design choice for the selected brain.'}</p>
    <label>DESIGN.md content
      <textarea className="input drawer-code" rows={8} maxLength={65536} value={draft} disabled={busy || !choice}
        onChange={event => setDraft(event.target.value)} />
    </label>
    <label>Choose DESIGN.md
      <input type="file" accept=".md,text/markdown" disabled={busy || !choice} onChange={async event => {
        const file = event.target.files?.[0]
        if (!file) return
        if (file.size > 65536) { setError('DESIGN.md must be at most 64 KiB.'); return }
        try { setDraft(await file.text()); setError('') }
        catch { setError('Could not read DESIGN.md.'); }
      }} />
    </label>
    {error && <p role="alert">{error}</p>}
    <div className="drawer-actions">
      <button className="btn btn-primary" disabled={busy || !choice || !draft.trim()}>Save design</button>
      <button type="button" className="btn btn-ghost" disabled={busy || !choice || choice.markdown === null}
        onClick={() => void save(null)}>Use owner design</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setRefresh(key => key + 1)}>Reload design</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
  </form>
}
