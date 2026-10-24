import { useState, useEffect, useRef } from "react"
import {
  type PluginInfo,
  runPluginCommand
} from "../../api/plugins"
import { apiFetch, API_BASE } from "../../api/_base"
import { pluginElements } from "./PluginPanel"
import { pluginFrameDocument, allowedFrameCommand, pluginCommandTimeouts } from "./plugin-frame"

export interface PluginCardFaceProps {
  plugin: PluginInfo
  onOpenPreview?: () => void
  onOpenSettings?: () => void
  onRunCli?: (subcommand: string) => void
  onUpdate?: () => void
}

/**
 * Generic Host Envelope for Plugin Card Faces.
 *
 * Total Recall core contains zero hardcoded plugin code or card interfaces.
 * The card face is authored by the plugin itself in its own repository (`ui/card.js`).
 * This component hosts the sandboxed Web Component full-bleed with touch-first utility controls.
 */
export function PluginCardFace({
  plugin,
  onOpenPreview,
  onOpenSettings,
  onRunCli: _onRunCli,
  onUpdate,
}: PluginCardFaceProps) {
  const declaredSecrets = plugin.secrets || (plugin.manifest?.secrets as Array<{ key: string; description?: string; required?: boolean }> | undefined) || []

  // Dynamic theme colors from plugin manifest
  const primaryColor = plugin.branding?.color || "#38bdf8"
  const accentColor = plugin.branding?.accent || primaryColor

  // Secret intake drawer state
  const [keyDrawerOpen, setKeyDrawerOpen] = useState(false)
  const [secretKeyInput, setSecretKeyInput] = useState(declaredSecrets[0]?.key || `${plugin.id.toUpperCase().replace(/-/g, "_")}_API_KEY`)
  const [secretValInput, setSecretValInput] = useState("")
  const [secretSaving, setSecretSaving] = useState(false)
  const [secretSavedMsg, setSecretSavedMsg] = useState<string | null>(null)

  // Web Component Sandbox Iframe State
  const elements = pluginElements(plugin).filter(e => e.kind !== "settings")
  const cardElement = elements.find(e => e.kind === "card" || e.kind === "card-face" || e.id === "card") ||
                      elements.find(e => e.kind === "panel" || e.id === "panel" || e.id === "console" || e.id === "main") ||
                      elements[0]

  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameDoc, setFrameDoc] = useState<string>("")
  const [frameHeight, setFrameHeight] = useState<number>(200)
  const [frameLoaded, setFrameLoaded] = useState<boolean>(false)
  const [frameError, setFrameError] = useState<string | null>(null)

  // Load real plugin Web Component into sandboxed iframe
  useEffect(() => {
    let disposed = false
    setFrameError(null)
    setFrameDoc("")
    setFrameLoaded(false)

    if (!cardElement) {
      setFrameLoaded(true)
      return
    }

    const channel = crypto.randomUUID()
    const allowed = new Set(plugin.cli?.subcommands.map(cmd => cmd.name) || [])
    let activeRequests = 0

    const handleMessage = async (event: MessageEvent) => {
      if (disposed || event.source !== frameRef.current?.contentWindow || event.origin !== "null" || event.data?.channel !== channel) return
      const data = event.data

      if (data.type === "height" && Number.isFinite(data.height)) {
        setFrameHeight(Math.max(160, Math.min(320, data.height)))
      }
      if (data.type === "ready") {
        setFrameLoaded(true)
      }
      if (data.type === "error") {
        setFrameError("Interface initialization failed")
        setFrameLoaded(true)
      }
      if (data.type !== "run") return

      const target = event.source as Window
      const reply = (result?: unknown, error?: string) => {
        if (!disposed) target.postMessage({ channel, type: "result", requestId: data.requestId, result, error }, "*")
      }

      if (!allowedFrameCommand(data, allowed) || activeRequests >= 8) {
        reply(undefined, "Operation unavailable")
        return
      }

      activeRequests++
      try {
        const cmdArgs = Array.isArray(data.args) ? [...data.args] : []
        const result = await runPluginCommand(plugin.id, data.subcommand, cmdArgs)
        if (!result.success) {
          reply(undefined, result.output || result.error || "Command failed")
          return
        }
        let parsed: unknown = { output: result.output || "" }
        if (result.output) {
          try {
            parsed = JSON.parse(result.output)
          } catch {
            parsed = { output: result.output, raw: result.output, exitCode: result.exitCode }
          }
        }
        reply(parsed)
      } catch (err: any) {
        reply(undefined, err?.message || "Operation failed")
      } finally {
        activeRequests--
      }
    }

    window.addEventListener("message", handleMessage)

    const fetchModule = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/ui/${encodeURIComponent(cardElement.id)}`)
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const source = await res.text()
        if (disposed) return

        const styles = getComputedStyle(window.document.documentElement)
        const theme: Record<string, string> = {
          "--color-accent": accentColor,
          "--accent": accentColor,
          "--brand-primary": primaryColor,
          "--brand-text": "#f8fafc"
        }
        for (const name of [
          "--text-primary", "--text-secondary", "--text-tertiary",
          "--bg-primary", "--bg-secondary", "--border",
          "--font-sans", "--font-mono"
        ]) {
          theme[name] = styles.getPropertyValue(name)
        }

        setFrameDoc(pluginFrameDocument(source, cardElement.tag, channel, theme, plugin.id, pluginCommandTimeouts(plugin.manifest)))
      } catch (err: any) {
        if (!disposed) {
          setFrameError(err.message || "Failed to load module")
          setFrameLoaded(true)
        }
      }
    }

    fetchModule()

    return () => {
      disposed = true
      window.removeEventListener("message", handleMessage)
    }
  }, [plugin.id, cardElement?.id, plugin.sha256, primaryColor, accentColor])

  // Save secret directly into Total Recall encrypted secrets store
  const handleSaveSecret = async () => {
    if (!secretValInput.trim()) return
    setSecretSaving(true)
    setSecretSavedMsg(null)
    try {
      const res = await apiFetch(plugin.manifest?.runtime && (plugin.manifest.runtime as any).modules?.credentials ? `${API_BASE}/api/plugins/${encodeURIComponent(plugin.id)}/credentials` : `${API_BASE}/api/plugins/auth/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: secretKeyInput.trim(),
          value: secretValInput.trim(),
          description: `Vault credential for ${plugin.name}`
        })
      })
      if (res.ok) {
        setSecretSavedMsg("Saved to encrypted vault")
        setSecretValInput("")
        if (onUpdate) onUpdate()
      } else {
        const errData = await res.json().catch(() => ({}))
        setSecretSavedMsg(errData.error || "Failed to store secret")
      }
    } catch (err: any) {
      setSecretSavedMsg(`Error: ${err.message}`)
    } finally {
      setSecretSaving(false)
    }
  }

  return (
    <div
      style={{
        position: "relative",
        background: "rgba(15, 23, 42, 0.75)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.2s ease, box-shadow 0.2s ease"
      }}
    >
      {/* Secret Vault Slide-Down Drawer */}
      {keyDrawerOpen && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(0, 0, 0, 0.85)",
            borderBottom: `1px solid ${accentColor}44`,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: 10
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: accentColor, fontFamily: "var(--font-mono, monospace)" }}>
              TOTAL RECALL SECRETS VAULT
            </span>
            <button
              type="button"
              onClick={() => setKeyDrawerOpen(false)}
              style={{ minHeight: "44px", minWidth: "44px", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}
            >
              CLOSE
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={secretKeyInput}
              onChange={(e) => setSecretKeyInput(e.target.value)}
              placeholder="SECRET_KEY_NAME"
              style={{
                minHeight: "44px",
                width: "160px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "#ffffff",
                fontSize: "12px",
                fontFamily: "var(--font-mono, monospace)",
                boxSizing: "border-box"
              }}
            />
            <input
              type="password"
              value={secretValInput}
              onChange={(e) => setSecretValInput(e.target.value)}
              placeholder="Paste secret token..."
              style={{
                minHeight: "44px",
                flex: 1,
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "#ffffff",
                fontSize: "12px",
                fontFamily: "var(--font-mono, monospace)",
                boxSizing: "border-box"
              }}
            />
            <button
              type="button"
              disabled={secretSaving || !secretValInput}
              onClick={handleSaveSecret}
              style={{
                minHeight: "44px",
                minWidth: "60px",
                background: accentColor,
                border: "none",
                borderRadius: "8px",
                color: "#020617",
                fontWeight: 800,
                fontSize: "12px",
                padding: "8px 16px",
                cursor: "pointer",
                touchAction: "manipulation"
              }}
            >
              {secretSaving ? "..." : "SAVE"}
            </button>
          </div>
          {secretSavedMsg && (
            <div style={{ fontSize: "11px", color: secretSavedMsg.startsWith("Saved") ? "#34d399" : "#f87171", fontFamily: "var(--font-mono, monospace)" }}>
              {secretSavedMsg}
            </div>
          )}
        </div>
      )}

      {/* Live Bespoke Animated Card Face from Plugin Repo */}
      <div style={{ height: `${frameHeight}px`, position: "relative", overflow: "hidden" }}>
        {!frameLoaded && !frameError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              color: "#94a3b8",
              fontSize: "12px",
              fontFamily: "var(--font-mono, monospace)",
              background: "rgba(0, 0, 0, 0.4)",
              zIndex: 1
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                border: `2px solid ${accentColor}`,
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite"
              }}
            />
            Loading interface...
          </div>
        )}

        {frameDoc ? (
          <iframe
            ref={frameRef}
            title={`${plugin.name} interface`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
            srcDoc={frameDoc}
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
              background: "transparent"
            }}
          />
        ) : frameError ? (
          <div
            style={{
              padding: "24px",
              color: "#f87171",
              fontSize: "12px",
              fontFamily: "var(--font-mono, monospace)",
              textAlign: "center"
            }}
          >
            Interface initialization unavailable: {frameError}
          </div>
        ) : null}
      </div>

      {/* Touch-First Host Utility Bar (>= 44px tap targets) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          background: "rgba(0, 0, 0, 0.35)",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)"
        }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            onClick={() => setKeyDrawerOpen(!keyDrawerOpen)}
            style={{
              minHeight: "44px",
              minWidth: "44px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: keyDrawerOpen ? `${accentColor}33` : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${keyDrawerOpen ? accentColor : "rgba(255, 255, 255, 0.1)"}`,
              borderRadius: "8px",
              color: keyDrawerOpen ? accentColor : "#94a3b8",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              padding: "0 10px",
              touchAction: "manipulation"
            }}
            title="Secrets Vault"
          >
            KEYS
          </button>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              style={{
                minHeight: "44px",
                minWidth: "44px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "#cbd5e1",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                padding: "0 10px",
                touchAction: "manipulation"
              }}
              title="Settings"
            >
              CFG
            </button>
          )}

          {onOpenPreview && (
            <button
              type="button"
              onClick={onOpenPreview}
              style={{
                minHeight: "44px",
                minWidth: "44px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: accentColor,
                border: `1px solid ${accentColor}`,
                borderRadius: "8px",
                color: "#0f172a",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
                padding: "0 12px",
                touchAction: "manipulation"
              }}
              title="Open Details Panel"
            >
              OPEN
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
