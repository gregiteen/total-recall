import { useState, useRef, useEffect } from 'react'
import { login, changePassword } from '../api'

interface Props {
  onAuthenticated: () => void
}

export default function LoginPage({ onAuthenticated }: Props) {
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsReset, setNeedsReset] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [needsReset])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      if (needsReset) {
        if (newPassword.length < 8) {
          setError('New password must be at least 8 characters')
          setLoading(false)
          return
        }
        const res = await changePassword(newPassword)
        if (res.ok) {
          onAuthenticated()
        } else {
          setError(res.error || 'Failed to change password')
        }
      } else {
        const res = await login(password)
        if (res.ok) {
          if (res.requiresPasswordReset) {
            setNeedsReset(true)
            setPassword('') // Clear for security
          } else {
            onAuthenticated()
          }
        } else {
          setError(res.error || 'Invalid password')
        }
      }
    } catch {
      setError('Network error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div style={{
        width: 360,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '40px 36px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: needsReset ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, var(--accent), #7c3aed)',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {needsReset ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
                <path d="M12 2a10 10 0 0 1 10 10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {needsReset ? 'Action Required' : 'Total Recall'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            {needsReset ? 'You must change your temporary password to continue.' : 'Sovereign Brain v3.0'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {needsReset ? 'New Password' : 'Password'}
            </label>
            <input
              id="login-password"
              ref={inputRef}
              type="password"
              value={needsReset ? newPassword : password}
              onChange={e => {
                if (needsReset) setNewPassword(e.target.value)
                else setPassword(e.target.value)
                setError('')
              }}
              placeholder={needsReset ? 'Minimum 8 characters' : 'Enter admin password'}
              autoComplete={needsReset ? 'new-password' : 'current-password'}
              disabled={loading}
              style={{
                background: 'var(--bg-primary)',
                border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            disabled={loading || (needsReset ? !newPassword : !password)}
            style={{
              background: (loading || (needsReset ? !newPassword : !password)) ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: (loading || (needsReset ? !newPassword : !password)) ? 'var(--text-tertiary)' : 'white',
              border: 'none',
              borderRadius: 8,
              padding: '11px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: (loading || (needsReset ? !newPassword : !password)) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {needsReset ? 'Saving…' : 'Authenticating…'}
              </>
            ) : (needsReset ? 'Save & Continue' : 'Sign In')}
          </button>
        </form>

        {!needsReset && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
            Set password in <code style={{ color: 'var(--accent)', fontSize: 11 }}>~/.agent/config/security.yml</code>
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
