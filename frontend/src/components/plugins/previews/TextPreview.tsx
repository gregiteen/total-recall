import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e0e0e0",
    maxWidth: "480px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  label: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  badge: {
    background: "#1a2a1a",
    color: "#4caf50",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
  },
  contactBar: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 0",
    marginBottom: "12px",
    borderBottom: "1px solid #2a2a4a",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#2a2a5a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: 700,
    color: "#c0c0ff",
  },
  contactName: {
    fontSize: "14px",
    fontWeight: 600,
  },
  thread: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    marginBottom: "12px",
  },
  bubbleIn: {
    background: "#1e1e3a",
    border: "1px solid #2a2a4a",
    borderRadius: "12px 12px 12px 4px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#ccc",
    maxWidth: "80%",
    alignSelf: "flex-start" as const,
  },
  bubbleOut: {
    background: "#2a2a5a",
    border: "1px solid #3a3a7a",
    borderRadius: "12px 12px 4px 12px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#d0d0ff",
    maxWidth: "80%",
    alignSelf: "flex-end" as const,
  },
  inputBar: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#e0e0e0",
    fontSize: "13px",
    outline: "none",
  },
  sendBtn: {
    background: "#7c4dff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 18px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  timeLabel: {
    fontSize: "10px",
    color: "#555",
    padding: "4px 0",
  },
}

export function TextPreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>SMS Messaging</span>
        <span style={styles.badge}>Telnyx</span>
      </div>
      <div style={styles.contactBar}>
        <div style={styles.avatar}>JD</div>
        <div>
          <div style={styles.contactName}>Jane Doe</div>
          <div style={{ fontSize: "11px", color: "#4caf50" }}>Online</div>
        </div>
      </div>
      <div style={styles.thread}>
        <div style={styles.bubbleIn}>
          The deployment completed. Can you verify the DNS propagation?
        </div>
        <div style={styles.timeLabel}>10:32 AM</div>
        <div style={styles.bubbleOut}>
          Checking now — the A record shows the new origin IP.
        </div>
        <div style={styles.timeLabel}>10:34 AM</div>
        <div style={styles.bubbleIn}>
          Confirmed. SSL certificate is valid too.
        </div>
      </div>
      <div style={styles.inputBar}>
        <input style={styles.input} placeholder="Type a message..." />
        <button style={styles.sendBtn}>Send</button>
      </div>
    </div>
  )
}