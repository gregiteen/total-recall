import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import './App.css'
import { getApiBase, setApiBase, checkSession, logout, registerUnauthedCallback, fetchHealth } from './api'
import type { HealthData } from './types'
import LoginPage from './pages/LoginPage'
import MemoryPage from './pages/MemoryPage'
import SettingsPage from './pages/SettingsPage'
import NetworkPage from './pages/NetworkPage'
import { WebhooksPage } from './pages/WebhooksPage'
import BrainSelector from './components/BrainSelector'
import RulesPage from './pages/RulesPage'
import GraphPage from './pages/GraphPage'
import PluginWorkspace from './components/plugins/PluginWorkspace'
import OnboardingPage from './pages/OnboardingPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { isOnboardingComplete } from './utils/onboarding'
import BrandMark from './components/brand/BrandMark'
import { WorkspaceDrawers, type WorkspaceEdge } from './components/workspace/WorkspaceDrawers'
import { SavedPages, WorkspacePage } from './components/workspace/WorkspacePage'

// ─── Auth state type ──────────────────────────────────────────────────────────
type AuthState = 'loading' | 'authed' | 'unauthed'

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface DotProps {
  ok: boolean
  label: string
}

function StatusDot({ ok, label }: DotProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: ok ? '#22c55e' : '#ef4444',
        boxShadow: ok ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
        display: 'inline-block',
        animation: ok ? undefined : 'blink 1s ease-in-out infinite',
      }} />
      {label}
    </div>
  )
}

/** Green / amber / red gate health for Network top-bar indicator. */
function networkGateTone(gate: HealthData['fetch_gate'] | undefined): {
  color: string
  label: string
  title: string
} {
  if (!gate) {
    return { color: '#94a3b8', label: 'Gate n/a', title: 'Fetch gate stats not available' }
  }
  const errors = gate.total_errors || 0
  const blocked = gate.total_blocked || 0
  const queue = gate.current_queue_depth || 0
  const inFlight = gate.current_in_flight || 0
  const title = `dispatched ${gate.total_dispatched ?? 0} · errors ${errors} · blocked ${blocked} · in-flight ${inFlight} · queue ${queue}`
  if (errors > 0 && (gate.total_completed || 0) === 0 && (gate.total_dispatched || 0) > 0) {
    return { color: '#ef4444', label: 'Gate errors', title }
  }
  if (errors > 5 || queue > 10 || blocked > 20) {
    return { color: '#ef4444', label: 'Gate hot', title }
  }
  if (errors > 0 || queue > 0 || blocked > 0 || inFlight > (gate.max_global_concurrency || 6) * 0.75) {
    return { color: '#f59e0b', label: 'Gate busy', title }
  }
  return { color: '#22c55e', label: 'Gate ok', title }
}

interface SidebarProps {
  activeBrainId: string
  onBrainChange: (id: string) => void
  open: boolean
  onClose: () => void
  onActivity: () => void
  pluginFolder: ReactNode
  savedPagesFolder: ReactNode
}

const getNavLinkClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`

function Sidebar({ activeBrainId, onBrainChange, open, onClose, onActivity, pluginFolder, savedPagesFolder }: SidebarProps) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} id="workspace-sidebar" inert={!open}
      onPointerMove={onActivity} onPointerDown={onActivity} onFocus={onActivity} onKeyDown={event => {
        if (event.key === 'Escape') onClose()
        else onActivity()
      }}>
      <div className="sidebar-brains">
        <div className="nav-section-label">Brains</div>
        <BrainSelector activeBrainId={activeBrainId} onBrainChange={onBrainChange} onSelectionComplete={onClose} />
      </div>
      <nav className="sidebar-nav" aria-label="Workspace">
        {pluginFolder}
        {savedPagesFolder}
        <details className="sidebar-memory">
          <summary className="nav-link">Memory</summary>
          {!isOnboardingComplete() && <NavLink to="/onboarding" className={getNavLinkClass} id="nav-onboarding" onClick={onClose}>Setup</NavLink>}
          <NavLink to="/memory" className={getNavLinkClass} id="nav-memory" onClick={onClose}>Vault</NavLink>
          <NavLink to="/rules" className={getNavLinkClass} id="nav-rules" onClick={onClose}>Rules</NavLink>
          <NavLink to="/graph" className={getNavLinkClass} id="nav-graph" onClick={onClose}>Graph</NavLink>
        </details>
      </nav>
    </aside>
  )
}

const ACCOUNT_LINKS = [
  ['network', 'Network'],
  ['mesh', 'Mesh'],
  ['webhooks', 'Webhooks'],
  ['secrets', 'Secrets & Keys'],
  ['notifications', 'Notifications'],
  ['settings', 'Settings'],
] as const

function AccountMenu({ health, onLogout }: { health: HealthData | null; onLogout: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const gate = networkGateTone(health?.fetch_gate)
  const serverOk = health?.status !== 'unreachable'
  const daemonOk = health?.daemon === 'running'

  function close() {
    if (menu.current) menu.current.open = false
  }

  return <details className="account-menu" ref={menu} onKeyDown={event => {
    if (event.key === 'Escape') { close(); trigger.current?.focus() }
  }}>
    <summary className="btn btn-ghost btn-sm" ref={trigger}>Account</summary>
    <nav className="account-menu-body" aria-label="Account">
      {ACCOUNT_LINKS.map(([path, label]) => <NavLink key={path} to={`/${path}`} className={getNavLinkClass}
        id={`nav-${path}`} onClick={close}>{label}</NavLink>)}
      <NavLink to="/onboarding" className={getNavLinkClass} id="nav-onboarding-replay" onClick={close}>Setup guide</NavLink>
      <label className="account-menu-host">API host
        <select className="select" value={getApiBase()} onChange={event => setApiBase(event.target.value)}>
          <option value="">Local API</option>
          {import.meta.env.VITE_BRAIN_URL && <option value={import.meta.env.VITE_BRAIN_URL}>
            {new URL(import.meta.env.VITE_BRAIN_URL).host}
          </option>}
        </select>
      </label>
      <div className="account-menu-health">
        {health ? <>
          {health.version && <span>v{health.version}</span>}
          <StatusDot ok={serverOk} label={serverOk ? 'Server online' : 'Server offline'} />
          <StatusDot ok={daemonOk} label={daemonOk ? 'Daemon running' : `Daemon ${health.daemon ?? 'unknown'}`} />
          <NavLink to="/network" title={gate.title} data-testid="network-gate-indicator" onClick={close}>
            <span aria-hidden="true" style={{ color: gate.color }}>● </span>{gate.label}
          </NavLink>
        </> : <span>Checking status…</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" id="btn-logout" onClick={onLogout}>Sign out</button>
    </nav>
  </details>
}

// ─── Main content (routes) ────────────────────────────────────────────────────

function OnboardingRedirect() {
  const location = useLocation()
  // First visit: force guided onboarding until complete (local flag or vault profile)
  if (!isOnboardingComplete() && !['/onboarding', '/plugins', '/help'].includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />
  }

  return null
}

function LegacyPluginsRoute() {
  const [params] = useSearchParams()
  const id = params.get('id') || params.get('plugin')
  const selection = new URLSearchParams(id ? { plugin: id } : { plugins: 'open' })
  return <Navigate to={{ pathname: isOnboardingComplete() ? '/memory' : '/onboarding', search: `?${selection}` }} replace />
}

function MainContent({ activeBrainId }: { activeBrainId: string }) {
  return (
    <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <OnboardingRedirect />
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Routes>
          <Route path="/" element={<Navigate to={isOnboardingComplete() ? '/memory' : '/onboarding'} replace />} />
          <Route path="/chat" element={<Navigate to="/memory" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/memory" element={<MemoryPage activeBrainId={activeBrainId} />} />
          <Route path="/rules" element={<RulesPage activeBrainId={activeBrainId} />} />
          <Route path="/graph" element={<GraphPage activeBrainId={activeBrainId} />} />
          <Route path="/tasks" element={<Navigate to="/plugins?id=automations" replace />} />
          <Route path="/skills" element={<Navigate to="/plugins?id=skill-manager" replace />} />
          <Route path="/openwiki" element={<Navigate to="/plugins?id=openwiki" replace />} />
          <Route path="/plugins" element={<LegacyPluginsRoute />} />
          <Route path="/integrations" element={<Navigate to="/plugins?id=meta-harness" replace />} />
          <Route path="/keys" element={<Navigate to="/secrets" replace />} />
          <Route path="/settings" element={<SettingsPage activeBrainId={activeBrainId} />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/mesh" element={<Navigate to="/plugins?id=mesh" replace />} />
          <Route path="/webhooks" element={<WebhooksPage />} />
          <Route path="/secrets" element={<Navigate to="/memory?brain=global&plugin=auth" replace />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<Navigate to={isOnboardingComplete() ? '/memory?drawer=help' : '/onboarding?drawer=help'} replace />} />
          {/* Legacy OS-control-plane routes → core product */}
          <Route path="/vault" element={<Navigate to="/memory" replace />} />
          <Route path="/inbox" element={<Navigate to="/tasks" replace />} />
          <Route path="/automations" element={<Navigate to="/plugins?id=automations" replace />} />
          <Route path="/files" element={<Navigate to="/memory" replace />} />
          <Route path="/sandbox" element={<Navigate to="/memory" replace />} />
          <Route path="/models" element={<Navigate to="/settings" replace />} />
          <Route path="/health" element={<Navigate to="/settings" replace />} />
          <Route path="/usage" element={<Navigate to="/settings" replace />} />
          <Route path="/collab" element={<Navigate to="/memory" replace />} />
          <Route path="/instructions" element={<Navigate to="/memory" replace />} />
          <Route path="/design" element={<Navigate to="/memory" replace />} />
          <Route path="/okf" element={<Navigate to="/memory" replace />} />
          <Route path="*" element={<Navigate to="/memory" replace />} />
        </Routes>
      </div>
    </main>
  );
}


// ─── Root App with auth gate ──────────────────────────────────────────────────

const BRAIN_STORAGE_KEY = 'total-recall-active-brain'
const SIDEBAR_IDLE_MS = 5000

function Dashboard() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const requestedEdge = new URLSearchParams(location.search).get('drawer') === 'help' ? 'right' : null
  const [drawerEntry, setDrawerEntry] = useState<{ key: string; edge: WorkspaceEdge | null }>(
    () => ({ key: location.key, edge: requestedEdge })
  )
  if (drawerEntry.key !== location.key) setDrawerEntry({ key: location.key, edge: requestedEdge })
  const edge = drawerEntry.key === location.key ? drawerEntry.edge : requestedEdge
  const setEdge = useCallback((edge: WorkspaceEdge | null) => {
    setDrawerEntry({ key: location.key, edge })
  }, [location.key])
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [health, setHealth] = useState<HealthData | null>(null)
  const sidebarOpen = edge === 'left'
  const sidebarToggle = useRef<HTMLButtonElement>(null)
  const sidebarTimer = useRef<number | undefined>(undefined)
  const [storedBrainId, setStoredBrainId] = useState(
    () => localStorage.getItem(BRAIN_STORAGE_KEY) || 'global'
  )
  const pageId = location.pathname === '/memory' ? params.get('page') : null
  const linkedBrainId = (pageId || params.has('plugin')) ? params.get('brain') : null
  const activeBrainId = linkedBrainId || storedBrainId
  const pageBrainId = activeBrainId.includes(',') ? undefined : activeBrainId
  function setActiveBrainId(id: string) {
    setStoredBrainId(id)
    if (pageId && id !== activeBrainId) {
      const next = new URLSearchParams(params)
      next.delete('page')
      next.delete('brain')
      next.delete('plugin')
      setParams(next, { replace: true })
    } else if (!pageId && linkedBrainId) {
      const next = new URLSearchParams(params)
      next.delete('brain')
      setParams(next, { replace: true })
    }
  }

  // Persist activeBrainId to localStorage on change
  useEffect(() => {
    localStorage.setItem(BRAIN_STORAGE_KEY, storedBrainId)
  }, [storedBrainId])

  // Register 401 interceptor so any API call that gets a 401 flips us to unauthed
  useEffect(() => {
    registerUnauthedCallback(() => setAuthState('unauthed'))
    return () => {}
  }, [])

  // Session check on mount — probe /auth/me before rendering anything
  useEffect(() => {
    checkSession().then(ok => setAuthState(ok ? 'authed' : 'unauthed'))
  }, [])

  // Health polling — shared by EmergencyAlertBanner and Sidebar
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const data = await fetchHealth()
        if (active) setHealth(data)
      } catch {
        if (active) setHealth({ status: 'unreachable', version: '', uptime_seconds: 0, timestamp: '' })
      }
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  async function handleLogout() {
    await logout()
    setEdge(null)
    setAuthState('unauthed')
  }

  function handleAuthenticated() {
    setAuthState('authed')
  }

  const closeSidebar = useCallback(() => {
    setEdge(null)
    if (document.activeElement?.closest('#workspace-sidebar')) sidebarToggle.current?.focus()
  }, [setEdge])

  const closeDrawer = useCallback(() => {
    if (edge === 'left') closeSidebar()
    else setEdge(null)
  }, [edge, closeSidebar, setEdge])

  const queueSidebarClose = useCallback(() => {
    window.clearTimeout(sidebarTimer.current)
    sidebarTimer.current = window.setTimeout(closeSidebar, SIDEBAR_IDLE_MS)
  }, [closeSidebar])

  useEffect(() => {
    if (!sidebarOpen) return
    queueSidebarClose()
    return () => window.clearTimeout(sidebarTimer.current)
  }, [sidebarOpen, queueSidebarClose])

  // Loading state — blank dark screen, no flash of unprotected content
  if (authState === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Unauthed — show login screen only
  if (authState === 'unauthed') {
    return <LoginPage onAuthenticated={handleAuthenticated} />
  }

  // Authed — render full dashboard
  return (
      <PluginWorkspace activeBrainId={activeBrainId} onOpenPlugin={closeSidebar}
        renderShell={(pluginFolder, pluginPage, plugins) => {
          const page = pageId ? <WorkspacePage id={pageId} brainId={pageBrainId} plugins={plugins} /> : pluginPage
          return <div className="app-layout">
              <Sidebar activeBrainId={activeBrainId} onBrainChange={setActiveBrainId}
                open={sidebarOpen} onClose={closeSidebar} onActivity={queueSidebarClose} pluginFolder={pluginFolder}
                savedPagesFolder={<SavedPages brainId={pageBrainId} drawerOpen={sidebarOpen}
                  activePageId={pageId} onOpenPage={closeSidebar} />} />
              {edge && <div className="sidebar-scrim" aria-hidden="true" onClick={closeDrawer} />}
              <button type="button" className="sidebar-handle" ref={sidebarToggle} aria-label="Workspace navigation"
                aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} onClick={() => setEdge(sidebarOpen ? null : 'left')}
                onKeyDown={event => { if (event.key === 'Escape' && sidebarOpen) closeSidebar() }}>
                <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d={sidebarOpen ? 'M9 4 4 9l5 5' : 'm5 4 5 5-5 5'} />
                </svg>
              </button>
              <div className="workspace-main" inert={edge !== null}>
                <header className="workspace-toolbar" aria-label="Dashboard">
                  <BrandMark height={64} className="workspace-logo" />
                  <AccountMenu health={health} onLogout={handleLogout} />
                </header>
                <div className="workspace-body" hidden={!!page}>
                  <MainContent activeBrainId={activeBrainId} />
                </div>
                {page}
              </div>
              <WorkspaceDrawers edge={edge} onChange={setEdge} plugins={plugins} activeBrainId={activeBrainId} />
            </div>
        }}
      />
  )
}

export default function App() {
  return <BrowserRouter><Dashboard /></BrowserRouter>
}
