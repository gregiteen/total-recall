import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import './App.css'
import { getApiBase, setApiBase, checkSession, logout, registerUnauthedCallback, fetchHealth } from './api'
import type { HealthData } from './types'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import MemoryPage from './pages/MemoryPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import ApiKeysPage from './pages/ApiKeysPage'
import IntegrationsPage from './pages/IntegrationsPage'
import BrainSelector from './components/BrainSelector'
import SkillsPage from './pages/SkillsPage'
import HelpPage from './pages/HelpPage'
import GraphPage from './pages/GraphPage'
import OpenWikiPage from './pages/OpenWikiPage'
import OnboardingPage from './pages/OnboardingPage'
import { isOnboardingComplete } from './utils/onboarding'
import BrandMark from './components/brand/BrandMark'

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
        <div className="sidebar-brand-lockup" title="Total Recall">
          <BrandMark variant="lockup" height={48} alt="Total Recall" />
        </div>
        <span style={{ paddingLeft: 2 }}>Portable memory · any IDE</span>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Memory</div>
        {!isOnboardingComplete() && (
          <NavLink to="/onboarding" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-onboarding">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            Setup
          </NavLink>
        )}
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
          Vault
        </NavLink>
        <NavLink to="/graph" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-graph">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" />
            <path d="M7 7l4 9M17 7l-4 9" />
          </svg>
          Graph
        </NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-tasks">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          Tasks
        </NavLink>

        <div className="nav-section-label">Connect</div>
        <NavLink to="/integrations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-integrations">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          IDEs
        </NavLink>
        <NavLink to="/skills" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-skills">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Skills
        </NavLink>
        <NavLink to="/openwiki" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-openwiki">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
          </svg>
          OpenWiki
        </NavLink>

        <div className="nav-section-label">Account</div>
        <NavLink to="/keys" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-keys">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
          Keys & Usage
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Settings
        </NavLink>
        <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-help">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Help
        </NavLink>
        {isOnboardingComplete() && (
          <NavLink to="/onboarding" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} id="nav-onboarding-replay" style={{ opacity: 0.75 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            Setup guide
          </NavLink>
        )}
      </nav>
      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BrainSelector activeBrainId={activeBrainId} onBrainChange={onBrainChange} />
        <select
          value={getApiBase()}
          onChange={e => setApiBase(e.target.value)}
          title="API host"
          style={{
            width: '100%',
            background: 'rgba(148, 163, 184, 0.06)',
            color: 'var(--text-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '5px 8px',
            fontSize: 10,
            outline: 'none',
          }}
        >
          <option value="">Local API</option>
          {import.meta.env.VITE_BRAIN_URL && (
            <option value={import.meta.env.VITE_BRAIN_URL}>{new URL(import.meta.env.VITE_BRAIN_URL).host}</option>
          )}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
            {(() => {
              const daemonOk = health?.daemon === 'running'
              const serverOk = health && health.status !== 'unreachable'
              const allGood = daemonOk && serverOk

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
                      <StatusDot ok={!!serverOk} label={serverOk ? 'Server online' : 'Server offline'} />
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

function OnboardingRedirect() {
  const location = useLocation()
  // First visit: force guided onboarding until complete (local flag or vault profile)
  if (!isOnboardingComplete() && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return null
}

function MainContent({ activeBrainId, onBrainChange }: { activeBrainId: string; onBrainChange: (id: string) => void }) {
  const location = useLocation();
  const isChat = location.pathname === '/' || location.pathname === '/chat';
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
      <OnboardingRedirect />
      <div style={chatStyle}>
        {floatingChat && (
          <div style={{ padding: '8px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/brand/total-recall-icon.svg" alt="" width={18} height={18} style={{ borderRadius: 4 }} />
              Total Recall
            </span>
            <button onClick={() => setFloatingChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✖</button>
          </div>
        )}
        <ChatPage activeBrainId={activeBrainId} onBrainChange={onBrainChange} />
      </div>
      {(!isChat || floatingChat) && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to={isOnboardingComplete() ? '/openwiki' : '/onboarding'} replace />} />
            <Route path="/chat" element={<ChatPage activeBrainId={activeBrainId} />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/memory" element={<MemoryPage activeBrainId={activeBrainId} />} />
            <Route path="/graph" element={<GraphPage activeBrainId={activeBrainId} />} />
            <Route path="/tasks" element={<TasksPage activeBrainId={activeBrainId} />} />
            <Route path="/skills" element={<SkillsPage activeBrainId={activeBrainId} />} />
            <Route path="/openwiki" element={<OpenWikiPage activeBrainId={activeBrainId} />} />
            <Route path="/integrations" element={<IntegrationsPage activeBrainId={activeBrainId} />} />
            <Route path="/keys" element={<ApiKeysPage />} />
            <Route path="/settings" element={<SettingsPage activeBrainId={activeBrainId} />} />
            <Route path="/help" element={<HelpPage activeBrainId={activeBrainId} />} />
            {/* Legacy OS-control-plane routes → core product */}
            <Route path="/vault" element={<Navigate to="/memory" replace />} />
            <Route path="/inbox" element={<Navigate to="/tasks" replace />} />
            <Route path="/automations" element={<Navigate to="/tasks" replace />} />
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
      )}
    </main>
  );
}


// ─── Root App with auth gate ──────────────────────────────────────────────────

const BRAIN_STORAGE_KEY = 'total-recall-active-brain'

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [activeBrainId, setActiveBrainId] = useState(
    () => localStorage.getItem(BRAIN_STORAGE_KEY) || 'global'
  )

  // Persist activeBrainId to localStorage on change
  useEffect(() => {
    localStorage.setItem(BRAIN_STORAGE_KEY, activeBrainId)
  }, [activeBrainId])

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

  // Authed — render full dashboard
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar onLogout={handleLogout} health={health} activeBrainId={activeBrainId} onBrainChange={setActiveBrainId} />
        <MainContent activeBrainId={activeBrainId} onBrainChange={setActiveBrainId} />
      </div>
    </BrowserRouter>
  )
}

export default App
