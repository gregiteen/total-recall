import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import './App.css'
import { getApiBase, setApiBase, checkSession, logout, registerUnauthedCallback, fetchHealth } from './api'
import type { HealthData } from './types'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import MemoryPage from './pages/MemoryPage'
import HealthPage from './pages/HealthPage'
import SandboxPage from './pages/SandboxPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import FilesPage from './pages/FilesPage'
import ApiKeysPage from './pages/ApiKeysPage'
import IntegrationsPage from './pages/IntegrationsPage'
import BrainSelector from './components/BrainSelector'
import AutomationsPage from './pages/AutomationsPage'
import DeploymentsPage from './pages/DeploymentsPage'
import SkillsPage from './pages/SkillsPage'
import UsagePage from './pages/UsagePage'

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

interface SidebarProps {
  onLogout: () => void
  health: HealthData | null
  activeBrainId: string
  onBrainChange: (id: string) => void
}

function Sidebar({ onLogout, health, activeBrainId, onBrainChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Total Recall</h1>
        <span>Sovereign Brain v3.0</span>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-chat">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Chat
        </NavLink>
        <NavLink to="/memory" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-memory">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
          Memory
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-tasks">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          Tasks
        </NavLink>
        <NavLink to="/automations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-automations">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Automations
        </NavLink>
        <NavLink to="/files" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-files">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Files
        </NavLink>
        <NavLink to="/sandbox" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-sandbox">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          Sandbox
        </NavLink>
        <NavLink to="/deployments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-deployments">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          Deployments
        </NavLink>
        <NavLink to="/health" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-health">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          Health
        </NavLink>
        <NavLink to="/usage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-usage">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          Usage & Costs
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Settings
        </NavLink>
        <NavLink to="/keys" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-keys">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
          API Keys
        </NavLink>
        <NavLink to="/integrations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-integrations">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          Integrations
        </NavLink>
        <NavLink to="/skills" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-skills">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Skills Manager
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          <BrainSelector activeBrainId={activeBrainId} onBrainChange={onBrainChange} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <select
            value={getApiBase()}
            onChange={e => setApiBase(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
              outline: 'none'
            }}
          >
            <option value="">Localhost (Proxy)</option>
            {import.meta.env.VITE_BRAIN_URL && (
              <option value={import.meta.env.VITE_BRAIN_URL}>{new URL(import.meta.env.VITE_BRAIN_URL).host}</option>
            )}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            {(() => {
              const ollamaOk = health?.ollama === 'online'
              const hasModel = ollamaOk && (health?.ollama_models?.length ?? 0) > 0
              const daemonOk = health?.daemon === 'running'
              const allGood = ollamaOk && hasModel && daemonOk

              if (!health) return <div style={{ color: 'var(--text-tertiary)' }}>Checking…</div>

              return (
                <>
                  <style>{`@keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.3;} }`}</style>
                  {allGood ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-tertiary)' }}>
                      <span className="pulse" /> All Systems Go
                    </div>
                  ) : (
                    <>
                      <StatusDot ok={ollamaOk} label={ollamaOk ? 'Ollama' : 'Ollama offline'} />
                      <StatusDot ok={hasModel} label={hasModel ? (health?.ollama_models?.[0] ?? 'Model') : 'No model'} />
                      <StatusDot ok={daemonOk} label={daemonOk ? 'Daemon' : 'Daemon ' + (health?.daemon ?? 'unknown')} />
                    </>
                  )}
                </>
              )
            })()}
          </div>
          {/* Logout button */}
          <button
            id="btn-logout"
            onClick={onLogout}
            title="Sign out"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              fontSize: 11,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.borderColor = '#ef4444' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

// ─── Main content (routes) ────────────────────────────────────────────────────

function MainContent() {
  const location = useLocation();
  const isChat = location.pathname === '/';
  const [floatingChat, setFloatingChat] = useState(false);

  useEffect(() => {
    const handleToggle = () => setFloatingChat(v => !v);
    window.addEventListener('toggle-floating-chat', handleToggle);
    return () => window.removeEventListener('toggle-floating-chat', handleToggle);
  }, []);

  const showChat = isChat || floatingChat;

  const chatStyle: React.CSSProperties = floatingChat ? {
    display: 'flex',
    position: 'fixed',
    bottom: 20,
    right: 20,
    width: 400,
    height: 600,
    zIndex: 9999,
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    flexDirection: 'column'
  } : {
    display: showChat ? 'flex' : 'none',
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  };

  return (
    <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div style={chatStyle}>
        {floatingChat && (
          <div style={{ padding: '8px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Total Recall Agent</span>
            <button onClick={() => setFloatingChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✖</button>
          </div>
        )}
        <ChatPage />
      </div>
      {(!isChat || floatingChat) && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<div/>} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/sandbox" element={<SandboxPage />} />
            <Route path="/deployments" element={<DeploymentsPage />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/keys" element={<ApiKeysPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
          </Routes>
        </div>
      )}
    </main>
  );
}

// ─── Emergency Alert Banner ───────────────────────────────────────────────────
// Polls /health every 10s and shows a loud, pulsing red banner when anything
// is critically wrong: daemon dead, Ollama offline, model missing, etc.

function EmergencyAlertBanner({ health }: { health: HealthData | null }) {

  if (!health) return null

  const issues: string[] = []

  if (health.status === 'unreachable') {
    issues.push('🔌 Brain server is unreachable — is it running?')
  }
  if (health.daemon === 'dead') {
    issues.push('💀 Active Intelligence Daemon is DEAD — no background research or inference is running. Restart: node bin/total-recall.mjs daemon start')
  }
  if (health.daemon === 'not_started') {
    issues.push('⏸️ Daemon has never been started — run: node bin/total-recall.mjs daemon start')
  }
  if (health.ollama === 'offline') {
    issues.push('🔴 Ollama is offline — the brain cannot think. Start Ollama.')
  }
  if (health.ollama === 'online' && health.ollama_models && health.ollama_models.length === 0) {
    issues.push('⚠️ No models pulled in Ollama — run: ollama pull gemma4:26b')
  }
  if (health.emergency_alerts) {
    issues.push(health.emergency_alerts.replace(/<!--[^>]*-->/g, '').trim())
  }

  if (issues.length === 0) return null

  return (
    <div id="emergency-alert-banner" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 50%, #dc2626 100%)',
      backgroundSize: '200% 200%',
      animation: 'alertPulse 2s ease-in-out infinite',
      color: '#fff',
      padding: '12px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 14,
      fontWeight: 600,
      boxShadow: '0 4px 20px rgba(220, 38, 38, 0.5)',
      borderBottom: '2px solid #fca5a5',
    }}>
      <style>{`
        @keyframes alertPulse {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 1200, margin: '0 auto' }}>
        <span style={{ fontSize: 22, lineHeight: '1' }}>🚨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Critical System Failure
          </div>
          {issues.map((issue, i) => (
            <div key={i} style={{ fontSize: 13, fontWeight: 400, opacity: 0.95, marginTop: 2, whiteSpace: 'pre-wrap' }}>
              {issue}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Root App with auth gate ──────────────────────────────────────────────────

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [activeBrainId, setActiveBrainId] = useState('global')

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
    setAuthState('unauthed')
  }

  function handleAuthenticated() {
    setAuthState('authed')
  }

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

  // Authed — render full dashboard with emergency alert banner
  return (
    <BrowserRouter>
      <EmergencyAlertBanner health={health} />
      <div className="app-layout">
        <Sidebar onLogout={handleLogout} health={health} activeBrainId={activeBrainId} onBrainChange={setActiveBrainId} />
        <MainContent />
      </div>
    </BrowserRouter>
  )
}

export default App
