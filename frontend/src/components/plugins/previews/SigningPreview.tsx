import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0f1923, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e0e0e0",
    maxWidth: "520px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  label: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  badge: {
    background: "#1a3a1a",
    color: "#4caf50",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
  },
  docFrame: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "12px",
  },
  docTitle: {
    fontSize: "15px",
    fontWeight: 600,
    marginBottom: "8px",
    color: "#c0c0ff",
  },
  field: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #1e1e3a",
  },
  fieldLabel: {
    fontSize: "13px",
    color: "#aaa",
  },
  fieldValue: {
    fontSize: "13px",
    color: "#d0d0d0",
  },
  sigBlock: {
    background: "#1a1a2e",
    border: "1px dashed #4a4a7a",
    borderRadius: "6px",
    padding: "20px",
    textAlign: "center" as const,
    marginTop: "8px",
    position: "relative" as const,
  },
  sigLine: {
    borderTop: "1px solid #4a4a7a",
    width: "180px",
    margin: "0 auto 4px",
  },
  sigPrompt: {
    fontSize: "11px",
    color: "#888",
    marginTop: "16px",
  },
}

export function SigningPreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Signature Pad</span>
        <span style={styles.badge}>Documenso</span>
      </div>
      <div style={styles.docFrame}>
        <div style={styles.docTitle}>Service Agreement — v3.2</div>
        <div style={styles.field}>
          <span style={styles.fieldLabel}>Recipient</span>
          <span style={styles.fieldValue}>operator@mesh.local</span>
        </div>
        <div style={styles.field}>
          <span style={styles.fieldLabel}>Expires</span>
          <span style={styles.fieldValue}>2026-12-31</span>
        </div>
        <div style={styles.field}>
          <span style={styles.fieldLabel}>Pages</span>
          <span style={styles.fieldValue}>12</span>
        </div>
      </div>
      <div style={styles.sigBlock}>
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px" }}>Drop signature here</div>
        <div style={styles.sigLine} />
        <div style={{ fontSize: "13px", fontWeight: 500, color: "#d0d0ff" }}>operator@mesh.local</div>
        <div style={styles.sigPrompt}>Click to place signature</div>
      </div>
    </div>
  )
}