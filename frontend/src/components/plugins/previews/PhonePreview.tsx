import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628 0%, #1a1a2e 100%)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)",
    color: "#e0e0e0",
    maxWidth: "480px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  label: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  statusBadge: {
    background: "#1a3a1a",
    color: "#4caf50",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  dialpad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
    marginBottom: "16px",
  },
  key: {
    background: "#1e1e3a",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "14px 0",
    textAlign: "center" as const,
    fontSize: "18px",
    fontWeight: 600,
    color: "#d0d0ff",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  keyRow: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
    marginBottom: "8px",
  },
  callButton: {
    background: "linear-gradient(135deg, #2e7d32, #1b5e20)",
    border: "none",
    borderRadius: "24px",
    padding: "12px 32px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
}

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]

export function PhonePreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Phone Dialer</span>
        <span style={styles.statusBadge}>Visual preview</span>
      </div>
      <div style={styles.dialpad}>
        {keys.map((k) => (
          <div key={k} style={styles.key}>{k}</div>
        ))}
      </div>
      <button style={{ ...styles.callButton, cursor: "default", opacity: 0.5 }} disabled>Calling unavailable in this preview</button>
    </div>
  )
}
