import { type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0f1923, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e0e0e0",
    maxWidth: "480px",
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
    background: "#2a1a3a",
    color: "#ce93d8",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
  },
  palette: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
    flexWrap: "wrap" as const,
  },
  swatch: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    border: "2px solid #2a2a4a",
  },
  typography: {
    marginBottom: "16px",
  },
  h1: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: "4px",
  },
  h2: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#d0d0ff",
    marginBottom: "4px",
  },
  bodyText: {
    fontSize: "13px",
    color: "#aaa",
    lineHeight: 1.6,
  },
  glass: {
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "10px",
    padding: "14px 20px",
    fontSize: "13px",
    color: "#ccc",
  },
  labelSm: {
    fontSize: "10px",
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginBottom: "8px",
  },
}

const swatches = [
  { name: "Primary", color: "#7c4dff" },
  { name: "Secondary", color: "#00bfa5" },
  { name: "Accent", color: "#ff6d00" },
  { name: "Surface", color: "#1a1a2e" },
  { name: "Error", color: "#ff1744" },
]

export function DesignPreview() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Design Tokens</span>
        <span style={styles.badge}>DESIGN.md</span>
      </div>
      <div style={styles.labelSm}>Color Palette</div>
      <div style={styles.palette}>
        {swatches.map((s) => (
          <div key={s.name} title={s.name}>
            <div style={{ ...styles.swatch, background: s.color }} />
            <div style={{ fontSize: "9px", color: "#666", textAlign: "center" as const, marginTop: "4px" }}>{s.name}</div>
          </div>
        ))}
      </div>
      <div style={styles.labelSm}>Typography</div>
      <div style={styles.typography}>
        <div style={styles.h1}>Heading 1</div>
        <div style={styles.h2}>Heading 2</div>
        <div style={styles.bodyText}>
          Body text with a clean 400-weight font at 13px. Designed for readability at scale.
        </div>
      </div>
      <div style={styles.labelSm}>Glassmorphic Surface</div>
      <div style={styles.glass}>
        backdrop-filter: blur(12px) — the modern glass aesthetic
      </div>
    </div>
  )
}