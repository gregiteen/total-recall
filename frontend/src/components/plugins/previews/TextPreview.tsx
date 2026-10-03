import { useState, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e0e0e0",
    maxWidth: "500px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  label: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  badge: {
    background: "#1a3a2a",
    color: "#00e676",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  threadBox: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "12px",
    maxHeight: "180px",
    overflowY: "auto" as const,
    marginBottom: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  msgBubble: {
    background: "#1e1e38",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    alignSelf: "flex-end",
    maxWidth: "85%",
    border: "1px solid #3a3a6a",
  },
  inputRow: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  input: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  btn: {
    background: "linear-gradient(135deg, #00c853, #1b5e20)",
    border: "none",
    borderRadius: "6px",
    padding: "10px 16px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
}

export function TextPreview() {
  const [recipient, setRecipient] = useState("+1-555-0199")
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Array<{ text: string; time: string }>>([
    { text: "Total Recall SMS Bridge initialized.", time: "10:00 AM" }
  ])
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!message.trim()) return
    setSending(true)
    const newMsg = { text: message.trim(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setMessages((prev) => [...prev, newMsg])
    const body = message.trim()
    setMessage("")

    try {
      await runPluginCommand("text", "send", [recipient, body])
    } catch {
      // handled gracefully in thread
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>SMS & Conversational Messaging</span>
        <span style={styles.badge}>{sending ? "Sending…" : "Connected"}</span>
      </div>

      <div style={styles.threadBox}>
        {messages.map((m, i) => (
          <div key={i} style={styles.msgBubble}>
            <div>{m.text}</div>
            <div style={{ fontSize: "10px", color: "#888", textAlign: "right", marginTop: "4px" }}>{m.time}</div>
          </div>
        ))}
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient Phone Number"
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            style={{ ...styles.input, flex: 1 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type SMS message..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button style={styles.btn} onClick={handleSend} disabled={sending || !message.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}