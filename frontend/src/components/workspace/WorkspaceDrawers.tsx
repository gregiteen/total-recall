import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PluginInfo } from '../../api/plugins'
import type { DrawerSide } from '../../api/workspace-drawers'
import HelpPage from '../../pages/HelpPage'
import { DrawerChat } from './DrawerChat'
import { DrawerLayout, DrawerPanel } from './DrawerLayout'

export type WorkspaceEdge = 'left' | DrawerSide
const tools = ['Phone', 'Text', 'Shortcuts', 'Chat', 'Custom'] as const
type Tool = (typeof tools)[number]

function EdgeDrawer({ side, title, open, onChange, children }: {
  side: DrawerSide; title: string; open: boolean; onChange: (edge: WorkspaceEdge | null) => void; children: ReactNode
}) {
  const toggle = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLElement>(null)
  const panelId = `workspace-drawer-${side}`

  useEffect(() => {
    if (open) closeButton.current?.focus()
    return () => {
      if (open && content.current?.contains(document.activeElement)) toggle.current?.focus()
    }
  }, [open])
  const close = () => {
    toggle.current?.focus()
    onChange(null)
  }
  return <>
    <button type="button" className={`workspace-edge-handle workspace-edge-handle--${side}`}
      ref={toggle} aria-label={side === 'right' ? 'Help drawer' : 'Bottom drawer'}
      aria-controls={panelId} aria-expanded={open} onClick={() => open ? close() : onChange(side)}
      onKeyDown={event => { if (event.key === 'Escape' && open) close() }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d={side === 'right' ? (open ? 'm6 3 5 5-5 5' : 'm10 3-5 5 5 5') : (open ? 'm3 6 5 5 5-5' : 'm3 10 5-5 5 5')} />
      </svg>
      {title}
    </button>
    <aside ref={content} id={panelId} aria-label={title} inert={!open}
      className={`workspace-edge-panel workspace-edge-panel--${side}${open ? ' open' : ''}`}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <header className="workspace-edge-header">
        <h2>{title}</h2>
        <button type="button" ref={closeButton} className="btn btn-ghost btn-sm" onClick={close}>Close</button>
      </header>
      {open && <div className="workspace-edge-body">{children}</div>}
    </aside>
  </>
}

function HelpDrawer({ plugins }: { plugins: PluginInfo[] | null }) {
  const [custom, setCustom] = useState(false)
  return <>
    <div className="drawer-section-tabs" role="group" aria-label="Help sections">
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={!custom} onClick={() => setCustom(false)}>Reference</button>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
    </div>
    {custom ? <DrawerLayout side="right" view="custom" plugins={plugins} /> : <HelpPage embedded />}
  </>
}

function ToolsDrawer({ plugins, activeBrainId }: { plugins: PluginInfo[] | null; activeBrainId: string }) {
  const [section, setSection] = useState<Tool>('Shortcuts')
  return <>
    <div className="drawer-section-tabs" role="group" aria-label="Bottom drawer tools">
      {tools.map(tool => <button key={tool} type="button" className="btn btn-ghost btn-sm"
        aria-pressed={tool === section} onClick={() => setSection(tool)}>{tool}</button>)}
    </div>
    {section === 'Phone' && <DrawerPanel plugins={plugins} reference={{ plugin: 'phone', element: 'phone' }} />}
    {section === 'Text' && <DrawerPanel plugins={plugins} reference={{ plugin: 'text', element: 'text' }} />}
    {section === 'Chat' && (plugins ? <DrawerChat plugin={plugins.find(plugin => plugin.id === 'meta-harness')}
      activeBrainId={activeBrainId} /> : <p role="status">Loading Metaharness…</p>)}
    {(section === 'Shortcuts' || section === 'Custom') &&
      <DrawerLayout side="bottom" view={section === 'Shortcuts' ? 'shortcuts' : 'custom'} plugins={plugins} />}
  </>
}

export function WorkspaceDrawers({ edge, onChange, plugins, activeBrainId }: {
  edge: WorkspaceEdge | null
  onChange: (edge: WorkspaceEdge | null) => void
  plugins: PluginInfo[] | null
  activeBrainId: string
}) {
  return <>
    <EdgeDrawer side="right" title="Help" open={edge === 'right'} onChange={onChange}><HelpDrawer plugins={plugins} /></EdgeDrawer>
    <EdgeDrawer side="bottom" title="Tools" open={edge === 'bottom'} onChange={onChange}>
      <ToolsDrawer plugins={plugins} activeBrainId={activeBrainId} />
    </EdgeDrawer>
  </>
}
