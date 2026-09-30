import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-mono, 'SF Mono', monospace)",
    color: "#e0e0e0",
    maxWidth: "600px",
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
    background: "#1a2a3a",
    color: "#64b5f6",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
  },
  toolbar: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
  },
  filterBtn: {
    background: "#1e1e3a",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "6px 14px",
    color: "#aaa",
    fontSize: "12px",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "#2a2a5a",
    border: "1px solid #5a5a9a",
    borderRadius: "6px",
    padding: "6px 14px",
    color: "#c0c0ff",
    fontSize: "12px",
    cursor: "pointer",
  },
  table: {
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
    letterSpacing: "1px",
  },
  td: {
    padding: "10px 12px",
    fontSize: "13px",
    borderBottom: "1px solid #1a1a2e",
  },
  typeA: { color: "#64b5f6" },
  typeAAAA: { color: "#ce93d8" },
  typeCname: { color: "#4caf50" },
  typeMx: { color: "#ffb74d" },
  typeTxt: { color: "#e0e0e0" },
  ttl: {
    color: "#666",
    fontSize: "11px",
  },
}

interface RecordRow {
  type: string
  name: string
  value: string
  ttl: string
}

const records: RecordRow[] = [
  { type: "A", name: "@", value: "192.168.1.10", ttl: "300" },
  { type: "AAAA", name: "@", value: "fd12::1", ttl: "300" },
  { type: "CNAME", name: "mail", value: "mail.example.com", ttl: "3600" },
  { type: "MX", name: "@", value: "mail.example.com (priority 10)", ttl: "3600" },
  { type: "TXT", name: "@", value: '"v=spf1 include:_spf.example.com ~all"', ttl: "86400" },
]

const typeStyles: Record<string, CSSProperties> = {
  A: styles.typeA,
  AAAA: styles.typeAAAA,
  CNAME: styles.typeCname,
  MX: styles.typeMx,
  TXT: styles.typeTxt,
}

export function DomainsPreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>DNS Records</span>
        <span style={styles.badge}>Vercel DNS</span>
      </div>
      <div style={styles.toolbar}>
        {["All", "A", "AAAA", "CNAME", "MX", "TXT"].map((f) => (
          <span key={f} style={f === "All" ? styles.filterBtnActive : styles.filterBtn}>{f}</span>
        ))}
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Value</th>
            <th style={styles.th}>TTL</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td style={{ ...styles.td, ...typeStyles[r.type] }}>{r.type}</td>
              <td style={styles.td}>{r.name}</td>
              <td style={{ ...styles.td, ...typeStyles[r.type] }}>{r.value}</td>
              <td style={{ ...styles.td, ...styles.ttl }}>{r.ttl}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}