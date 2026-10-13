import { useState, useRef, useEffect } from "react"
import {
  login,
  changePassword,
  getAuthStatus,
  setupPassword,
  getAuthProviders,
  passkeyLoginOptions,
  passkeyLoginVerify,
  type AuthProvidersResponse,
} from "../api"
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser"
import BrandMark from "../components/brand/BrandMark"

interface Props {
  onAuthenticated: () => void
}

export default function LoginPage({ onAuthenticated }: Props) {
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null)
  const [needsReset, setNeedsReset] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function checkConfig() {
      try {
        const res = await getAuthStatus()
        if (res && !res.configured) {
          setIsFirstTime(true)
        }
      } catch {
        // ignore network error
      }

      try {
        if (typeof getAuthProviders === "function") {
          const prov = await getAuthProviders()
          if (prov) {
            setProviders(prov)
          }
        }
      } catch {
        // ignore provider check error
      } finally {
        setStatusLoading(false)
      }
    }
    checkConfig()
  }, [])

  async function handlePasskeyLogin() {
    if (loading || passkeyLoading) return
    if (providers?.passkey && !providers.passkey.has_passkeys) {
      setError("No passkeys enrolled yet. Log in with password and configure biometric passkeys in the Auth Plugin.")
      return
    }
    setPasskeyLoading(true)
    setError("")
    try {
      if (!browserSupportsWebAuthn()) {
        setError("Your browser does not support WebAuthn passkeys.")
        setPasskeyLoading(false)
        return
      }
      const options = await passkeyLoginOptions()
      const authResp = await startAuthentication(options)
      const verifyRes = await passkeyLoginVerify(authResp)
      if (verifyRes.ok) {
        onAuthenticated()
      } else {
        setError(verifyRes.error || "Passkey verification failed")
      }
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("Passkey request was dismissed.")
      } else {
        setError(err.message || "Failed to authenticate with passkey.")
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  function handleGoogleLogin() {
    if (providers?.google && !providers.google.configured) {
      setError("Google OAuth2 is not configured. Provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Auth Plugin.")
      return
    }
    window.location.href = "/auth/google"
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [needsReset, isFirstTime])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError("")
    try {
      if (isFirstTime) {
        if (newPassword.length < 8) {
          setError("New password must be at least 8 characters")
          setLoading(false)
          return
        }
        const res = await setupPassword(newPassword)
        if (res.ok) {
          const loginRes = await login(newPassword)
          if (loginRes.ok) {
            onAuthenticated()
          } else {
            setError(loginRes.error || "Password was set, but automatic sign in failed.")
            setIsFirstTime(false)
          }
        } else {
          setError(res.error || "Failed to setup password")
        }
      } else if (needsReset) {
        if (newPassword.length < 8) {
          setError("New password must be at least 8 characters")
          setLoading(false)
          return
        }
        const res = await changePassword(newPassword)
        if (res.ok) {
          onAuthenticated()
        } else {
          setError(res.error || "Failed to change password")
        }
      } else {
        const res = await login(password)
        if (res.ok) {
          if (res.requiresPasswordReset) {
            setNeedsReset(true)
            setPassword("")
          } else {
            onAuthenticated()
          }
        } else {
          setError(res.error || "Invalid password")
        }
      }
    } catch {
      setError("Network error — is the server running?")
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || ((isFirstTime || needsReset) ? !newPassword : !password)

  if (statusLoading) {
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

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {(needsReset || isFirstTime) ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 32px rgba(245, 158, 11, 0.35)",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          ) : (
            <div
              style={{
                width: "100%",
                maxWidth: 280,
                borderRadius: 16,
                padding: "14px 18px",
                background: "linear-gradient(180deg, #f8fafc 0%, #e8eef9 100%)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.75) inset, 0 16px 40px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(148,163,184,0.25)",
              }}
            >
              <BrandMark variant="lockup" height={56} alt="Total Recall" />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>
              {needsReset ? "Action Required" : isFirstTime ? "Setup Admin Password" : "Welcome back"}
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
              {needsReset
                ? "You must change your temporary password to continue."
                : isFirstTime
                  ? "Choose a strong password to secure your local memory dashboard."
                  : "Portable personal memory · any IDE"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="text" name="username" autoComplete="username" style={{ display: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              htmlFor="login-password"
              style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              {(needsReset || isFirstTime) ? "New Password" : "Password"}
            </label>
            <input
              id="login-password"
              ref={inputRef}
              type="password"
              value={(isFirstTime || needsReset) ? newPassword : password}
              onChange={e => {
                if (isFirstTime || needsReset) setNewPassword(e.target.value)
                else setPassword(e.target.value)
                setError("")
              }}
              placeholder={(isFirstTime || needsReset) ? "Minimum 8 characters" : "Enter admin password"}
              autoComplete={(isFirstTime || needsReset) ? "new-password" : "current-password"}
              disabled={loading}
              style={{
                background: "rgba(7, 11, 20, 0.65)",
                border: `1px solid ${error ? "rgba(248,113,113,0.55)" : "var(--border)"}`,
                borderRadius: 12,
                padding: "12px 16px",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: error ? "0 0 0 3px rgba(248,113,113,0.12)" : "inset 0 1px 2px rgba(0,0,0,0.25)",
              }}
              onFocus={e => {
                if (!error) {
                  e.currentTarget.style.borderColor = "var(--border-accent)"
                  e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow)"
                }
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = error ? "rgba(248,113,113,0.55)" : "var(--border)"
                e.currentTarget.style.boxShadow = error ? "0 0 0 3px rgba(248,113,113,0.12)" : "inset 0 1px 2px rgba(0,0,0,0.25)"
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: "rgba(248,113,113,0.1)",
                border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 12,
                padding: "11px 14px",
                fontSize: 13,
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            disabled={disabled}
            className={disabled ? undefined : "btn btn-primary"}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px 0",
              fontSize: 14,
              borderRadius: 12,
              border: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              background: disabled ? "var(--bg-tertiary)" : undefined,
              color: disabled ? "var(--text-tertiary)" : undefined,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {(isFirstTime || needsReset) ? "Saving…" : "Authenticating…"}
              </>
            ) : isFirstTime ? "Create Password & Continue" : needsReset ? "Save & Continue" : "Sign In"}
          </button>
        </form>

        {(!needsReset && !isFirstTime && (providers?.passkey?.has_passkeys || providers?.google?.configured)) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                OR
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {providers?.passkey?.has_passkeys && (
              <button
                type="button"
                id="btn-passkey-login"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading || loading}
                className="btn btn-secondary"
                style={{
                  width: "100%",
                  minHeight: 44,
                  justifyContent: "center",
                  fontSize: 13.5,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(99, 102, 241, 0.12)",
                  borderColor: "rgba(99, 102, 241, 0.35)",
                  color: "#c7d2fe",
                  cursor: passkeyLoading || loading ? "not-allowed" : "pointer",
                }}
              >
                {passkeyLoading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Verifying Passkey…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M7 12a5 5 0 0 1 9.9-1" />
                      <path d="M8.5 16.5a8 8 0 0 1 10.5-3.5" />
                      <path d="M5 12a7 7 0 0 1 14 0" />
                    </svg>
                    Sign in with Passkey
                  </>
                )}
              </button>
            )}

            {providers?.google?.configured && (
              <button
                type="button"
                id="btn-google-login"
                onClick={handleGoogleLogin}
                disabled={loading || passkeyLoading}
                className="btn btn-secondary"
                style={{
                  width: "100%",
                  minHeight: 44,
                  justifyContent: "center",
                  fontSize: 13.5,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255, 255, 255, 0.05)",
                  borderColor: "rgba(255, 255, 255, 0.15)",
                  color: "var(--text-primary)",
                  cursor: loading || passkeyLoading ? "not-allowed" : "pointer",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                Sign in with Google
              </button>
            )}
          </div>
        )}

        {(!needsReset && !isFirstTime) && (
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
            Local-first vault · credentials in{" "}
            <code style={{ color: "#93c5fd", fontSize: 11 }}>~/.agent/config/security.yml</code>
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
