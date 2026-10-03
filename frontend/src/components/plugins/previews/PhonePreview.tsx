import { useState, useEffect, useRef, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

// Festech ringtone sound synthesis parameters
const RINGTONE_PRESETS: Record<string, { freqs: [number, number]; pulseMs: number; gapMs: number }> = {
  backstage: { freqs: [440, 554], pulseMs: 400, gapMs: 200 },
  warehouse: { freqs: [330, 392], pulseMs: 600, gapMs: 300 },
  festival: { freqs: [523, 659], pulseMs: 250, gapMs: 120 },
}

const padKeys = [
  { num: "1", letters: "" },
  { num: "2", letters: "ABC" },
  { num: "3", letters: "DEF" },
  { num: "4", letters: "GHI" },
  { num: "5", letters: "JKL" },
  { num: "6", letters: "MNO" },
  { num: "7", letters: "PQRS" },
  { num: "8", letters: "TUV" },
  { num: "9", letters: "WXYZ" },
  { num: "*", letters: "" },
  { num: "0", letters: "+" },
  { num: "#", letters: "" },
]

export function PhonePreview() {
  const [activeTab, setActiveTab] = useState<"keypad" | "recents" | "settings">("keypad")
  const [dialedNumber, setDialedNumber] = useState("")
  const [callState, setCallState] = useState<"idle" | "ringing" | "connected">("idle")
  const [callConnectedAt, setCallConnectedAt] = useState<number | null>(null)
  const [duration, setDuration] = useState("00:00")
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [isHeld, setIsHeld] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedRingtone, setSelectedRingtone] = useState("backstage")
  const [recentCalls, setRecentCalls] = useState<Array<{ number: string; time: string; type: "outbound" | "inbound" }>>([])
  const [logs, setLogs] = useState<string[]>([])

  const ringAudioCtxRef = useRef<AudioContext | null>(null)
  const ringIntervalRef = useRef<any>(null)

  const isCalling = callState !== "idle"

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  // Timer effect for connected call
  useEffect(() => {
    if (callState !== "connected" || !callConnectedAt) {
      setDuration("00:00")
      return
    }
    const update = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - callConnectedAt) / 1000))
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0")
      const s = String(elapsed % 60).padStart(2, "0")
      setDuration(`${m}:${s}`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [callState, callConnectedAt])

  // Ringtone synthesizer (Festech WebAudio fallback)
  useEffect(() => {
    if (callState !== "ringing") {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current)
        ringIntervalRef.current = null
      }
      if (ringAudioCtxRef.current) {
        ringAudioCtxRef.current.close().catch(() => {})
        ringAudioCtxRef.current = null
      }
      return
    }

    const preset = RINGTONE_PRESETS[selectedRingtone] || RINGTONE_PRESETS.backstage
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      ringAudioCtxRef.current = ctx

      const playPulse = () => {
        if (ctx.state === "closed") return
        preset.freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = "sine"
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.001, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + preset.pulseMs / 1000)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(ctx.currentTime + i * 0.05)
          osc.stop(ctx.currentTime + preset.pulseMs / 1000 + 0.05)
        })
      }

      playPulse()
      ringIntervalRef.current = setInterval(playPulse, preset.pulseMs + preset.gapMs + 500)
    } catch {
      // AudioContext unavailable
    }

    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current)
      if (ringAudioCtxRef.current) ringAudioCtxRef.current.close().catch(() => {})
    }
  }, [callState, selectedRingtone])

  const handleKeyPress = (num: string) => {
    if (isCalling) return
    setDialedNumber((prev) => (prev.length < 20 ? prev + num : prev))
  }

  const handleBackspace = () => {
    if (isCalling) return
    setDialedNumber((prev) => prev.slice(0, -1))
  }

  const handleCallToggle = async () => {
    if (isCalling) {
      // Hang up
      setCallState("idle")
      setCallConnectedAt(null)
      setIsMuted(false)
      setIsHeld(false)
      setIsRecording(false)
      appendLog("Call terminated.")
      try {
        await runPluginCommand("phone", "run", ["job", "telecom-cleanup"])
      } catch {}
      return
    }

    if (!dialedNumber.trim()) return

    setCallState("ringing")
    appendLog(`Originating Call Control session to ${dialedNumber} via Telnyx...`)

    setRecentCalls((prev) => [
      { number: dialedNumber, time: new Date().toLocaleTimeString(), type: "outbound" },
      ...prev.slice(0, 9),
    ])

    // Transition from ringing to connected after signaling completes
    setTimeout(() => {
      setCallState("connected")
      setCallConnectedAt(Date.now())
      appendLog(`Call connected to ${dialedNumber}. Audio stream active.`)
    }, 1800)
  }

  const handleTransfer = () => {
    const ext = prompt("Enter 3-digit extension or phone number to transfer call:")
    if (ext && ext.trim()) {
      appendLog(`Call transferred to ${ext.trim()}. Hanging up.`)
      setCallState("idle")
      setCallConnectedAt(null)
    }
  }

  return (
    <div style={containerStyle}>
      {/* Top Header & Festech Tabs */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={dotStyle(callState === "connected" ? "#10b981" : callState === "ringing" ? "#f59e0b" : "#64748b")} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#f8fafc", letterSpacing: "0.5px" }}>
            {callState === "connected" ? "ACTIVE CALL" : callState === "ringing" ? "RINGING" : "TELNYX WEBRTC"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["keypad", "recents", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={tabButtonStyle(activeTab === tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "keypad" && (
        <>
          {/* Dialed Number Display */}
          <div style={displayBoxStyle}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", letterSpacing: "1px", minHeight: "36px" }}>
              {dialedNumber || <span style={{ color: "#475569" }}>Enter number...</span>}
            </div>
            {dialedNumber && !isCalling && (
              <button onClick={handleBackspace} style={backspaceStyle} title="Backspace">
                ⌫
              </button>
            )}
            {isCalling && (
              <div style={{ fontSize: "12px", color: callState === "connected" ? "#34d399" : "#fbbf24", fontWeight: 600, marginTop: "4px" }}>
                {callState === "ringing" ? "Ringing..." : `Connected • ${duration}`}
              </div>
            )}
          </div>

          {/* Keypad or In-Call Controls */}
          {!isCalling ? (
            <div style={keypadGridStyle}>
              {padKeys.map((k) => (
                <button
                  key={k.num}
                  onClick={() => handleKeyPress(k.num)}
                  style={keyStyle}
                >
                  <div style={{ fontSize: "20px", fontWeight: 600, color: "#f1f5f9" }}>{k.num}</div>
                  {k.letters && <div style={{ fontSize: "9px", color: "#64748b", fontWeight: 700, letterSpacing: "1px" }}>{k.letters}</div>}
                </button>
              ))}
            </div>
          ) : (
            <div style={inCallGridStyle}>
              <button
                onClick={() => setIsMuted(!isMuted)}
                style={inCallControlStyle(isMuted)}
              >
                <span>{isMuted ? "🔇" : "🎤"}</span>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>{isMuted ? "MUTED" : "MUTE"}</span>
              </button>
              <button
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                style={inCallControlStyle(isSpeakerOn)}
              >
                <span>🔊</span>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>SPEAKER</span>
              </button>
              <button
                onClick={() => setIsHeld(!isHeld)}
                style={inCallControlStyle(isHeld)}
              >
                <span>⏸️</span>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>{isHeld ? "RESUME" : "HOLD"}</span>
              </button>
              <button
                onClick={() => setIsRecording(!isRecording)}
                style={inCallControlStyle(isRecording)}
              >
                <span>⏺️</span>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>{isRecording ? "REC ON" : "RECORD"}</span>
              </button>
              <button
                onClick={handleTransfer}
                style={inCallControlStyle(false)}
              >
                <span>📲</span>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>TRANSFER</span>
              </button>
            </div>
          )}

          {/* Call / Hangup Button */}
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleCallToggle}
              disabled={!isCalling && !dialedNumber.trim()}
              style={callToggleButtonStyle(isCalling, !isCalling && !dialedNumber.trim())}
            >
              {isCalling ? "END CALL" : "DIAL"}
            </button>
          </div>
        </>
      )}

      {activeTab === "recents" && (
        <div style={{ minHeight: "240px", maxHeight: "280px", overflowY: "auto" }}>
          {recentCalls.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>No recent calls</div>
          ) : (
            recentCalls.map((c, i) => (
              <div
                key={i}
                onClick={() => { setDialedNumber(c.number); setActiveTab("keypad"); }}
                style={recentItemStyle}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>{c.number}</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>{c.type} • {c.time}</div>
                </div>
                <button style={{ padding: "4px 8px", background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                  DIAL
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div style={{ minHeight: "240px", display: "flex", flexDirection: "column", gap: "12px", color: "#e2e8f0", fontSize: "13px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, color: "#94a3b8" }}>Ringtone Preset (Festech Audio Engine)</label>
            <select
              value={selectedRingtone}
              onChange={(e) => setSelectedRingtone(e.target.value)}
              style={selectStyle}
            >
              <option value="backstage">Backstage (440Hz / 554Hz Classic)</option>
              <option value="warehouse">Warehouse (330Hz / 392Hz Modern)</option>
              <option value="festival">Festival (523Hz / 659Hz Urgent)</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, color: "#94a3b8" }}>Call Control Provider</label>
            <input type="text" readOnly value="Telnyx Call Control v2 (E.164 / NANP)" style={inputReadOnlyStyle} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, color: "#94a3b8" }}>Carrier Compliance</label>
            <div style={{ fontSize: "12px", color: "#34d399", fontWeight: 500 }}>✓ 10DLC & Toll-Free Verification Active</div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div style={logContainerStyle}>
        <div style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "4px" }}>ACTIVITY LOG</div>
        {logs.length === 0 ? (
          <div style={{ color: "#475569" }}>Dialer ready.</div>
        ) : (
          logs.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────
const containerStyle: CSSProperties = {
  background: "#090d16",
  border: "1px solid #1e293b",
  borderRadius: "16px",
  padding: "20px",
  fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
  color: "#f8fafc",
  maxWidth: "420px",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
}

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
  paddingBottom: "12px",
  borderBottom: "1px solid #1e293b",
}

const dotStyle = (color: string): CSSProperties => ({
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: color,
  display: "inline-block",
})

const tabButtonStyle = (active: boolean): CSSProperties => ({
  background: active ? "#1e293b" : "transparent",
  border: "none",
  borderRadius: "6px",
  color: active ? "#38bdf8" : "#64748b",
  fontSize: "11px",
  fontWeight: 700,
  padding: "4px 8px",
  cursor: "pointer",
  transition: "all 0.15s ease",
})

const displayBoxStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "12px",
  padding: "16px",
  textAlign: "center",
  position: "relative",
  marginBottom: "16px",
}

const backspaceStyle: CSSProperties = {
  position: "absolute",
  right: "12px",
  top: "16px",
  background: "none",
  border: "none",
  color: "#94a3b8",
  fontSize: "18px",
  cursor: "pointer",
}

const keypadGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "10px",
}

const keyStyle: CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "12px 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 0.15s",
}

const inCallGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "10px",
  minHeight: "180px",
}

const inCallControlStyle = (active: boolean): CSSProperties => ({
  background: active ? "rgba(14, 165, 233, 0.2)" : "#1e293b",
  border: `1px solid ${active ? "#0284c7" : "#334155"}`,
  borderRadius: "12px",
  padding: "16px 8px",
  color: active ? "#38bdf8" : "#94a3b8",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  cursor: "pointer",
})

const callToggleButtonStyle = (calling: boolean, disabled: boolean): CSSProperties => ({
  background: calling
    ? "linear-gradient(135deg, #ef4444, #b91c1c)"
    : "linear-gradient(135deg, #10b981, #059669)",
  border: "none",
  borderRadius: "9999px",
  padding: "12px 48px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1,
  boxShadow: calling
    ? "0 10px 15px -3px rgba(239, 68, 68, 0.4)"
    : "0 10px 15px -3px rgba(16, 185, 129, 0.4)",
  transition: "all 0.2s ease",
})

const recentItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid #1e293b",
  cursor: "pointer",
}

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "8px",
  color: "#f8fafc",
  fontSize: "13px",
}

const inputReadOnlyStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "8px",
  color: "#94a3b8",
  fontSize: "13px",
}

const logContainerStyle: CSSProperties = {
  marginTop: "16px",
  padding: "10px",
  background: "#020617",
  border: "1px solid #0f172a",
  borderRadius: "8px",
  fontSize: "11px",
  color: "#94a3b8",
  maxHeight: "80px",
  overflowY: "auto",
  lineHeight: "1.4",
}
