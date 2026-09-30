import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-mono, 'SF Mono', monospace)",
    color: "#e0e0e0",
    maxWidth: "580px",
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
  summary: {
    display: "flex",
    gap: "16px",
    marginBottom: "16px",
  },
  statCard: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "12px 16px",
    flex: 1,
  },
  statValue: {
    fontSize: "20px",
    fontWeight: 700,
  },
  statLabel: {
    fontSize: "10px",
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginTop: "4px",
  },
  gateTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    padding: "8px 12px",
    textAlign: "left" as const,
    borderBottom: "1px solid #2a2a4a",
  },
  td: {
    padding: "10px 12px",
    fontSize: "12px",
    borderBottom: "1px solid #1a1a2e",
  },
  pass: {
    color: "#4caf50",
  },
  fail: {
    color: "#ff5252",
  },
}

const gates = [
  { name: "TypeScript", status: "pass", detail: "0 errors" },
  { name: "ESLint", status: "pass", detail: "0 warnings" },
  { name: "Vitest", status: "pass", detail: "42/42 tests" },
  { name: "Bundle Size", status: "pass", detail: "12.4 kB" },
  { name: "SSSS Schema", status: "fail", detail: "1 warning" },
  { name: "Mesh Sync", status: "pass", detail: "2 peers synced" },
]

export function CodeQualityPreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Gate Report</span>
        <span style={styles.badge}>5/6 passing</span>
      </div>
      <div style={styles.summary}>
        <div style={{ ...styles.statCard, borderColor: "#1a3a1a" }}>
          <div style={{ ...styles.statValue, color: "#4caf50" }}>5</div>
          <div style={styles.statLabel}>Passing</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: "#ff5252" }}>1</div>
          <div style={styles.statLabel}>Failing</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: "#64b5f6" }}>6</div>
          <div style={styles.statLabel}>Total Gates</div>
        </div>
      </div>
      <table style={styles.gateTable}>
        <thead>
          <tr>
            <th style={styles.th}>Gate</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {gates.map((g, i) => (
            <tr key={i}>
              <td style={styles.td}>{g.name}</td>
              <td style={{ ...styles.td, ...(g.status === "pass" ? styles.pass : styles.fail) }}>
                {g.status === "pass" ? "✓" : "✗"}
              </td>
              <td style={styles.td}>{g.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}