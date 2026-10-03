import { useState, type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e0e0e0",
    maxWidth: "540px",
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
    background: "#3a2a1a",
    color: "#ffb74d",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "16px",
  },
  control: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  ctlLabel: {
    fontSize: "11px",
    color: "#aaa",
  },
  input: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "6px 10px",
    color: "#fff",
    fontSize: "12px",
    fontFamily: "var(--font-mono, monospace)",
  },
}

export function DesignPreview() {
  const [primaryColor, setPrimaryColor] = useState("#ec4899")
  const [borderRadius, setBorderRadius] = useState("10px")
  const [surfaceBg, setSurfaceBg] = useState("#1e1e38")
  const [accentText, setAccentText] = useState("Generative UI Active")

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Design System & Token Playground</span>
        <span style={styles.badge}>Live Tokens</span>
      </div>

      <div style={styles.controlsGrid}>
        <div style={styles.control}>
          <label style={styles.ctlLabel}>--color-primary</label>
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            style={{ ...styles.input, height: "34px", padding: "2px", cursor: "pointer" }}
          />
        </div>
        <div style={styles.control}>
          <label style={styles.ctlLabel}>--border-radius</label>
          <select
            style={styles.input}
            value={borderRadius}
            onChange={(e) => setBorderRadius(e.target.value)}
          >
            <option value="4px">4px (Subtle)</option>
            <option value="10px">10px (Default)</option>
            <option value="18px">18px (Smooth)</option>
            <option value="28px">28px (Pill)</option>
          </select>
        </div>
        <div style={styles.control}>
          <label style={styles.ctlLabel}>--surface-bg</label>
          <input
            type="color"
            value={surfaceBg}
            onChange={(e) => setSurfaceBg(e.target.value)}
            style={{ ...styles.input, height: "34px", padding: "2px", cursor: "pointer" }}
          />
        </div>
      </div>

      {/* Live Component styled solely by the active token values */}
      <div
        style={{
          background: surfaceBg,
          borderRadius: borderRadius,
          border: `1px solid ${primaryColor}40`,
          padding: "20px",
          transition: "all 0.2s ease",
          boxShadow: `0 4px 20px ${primaryColor}20`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Dynamic Token Card</span>
          <span
            style={{
              background: `${primaryColor}25`,
              color: primaryColor,
              borderRadius: borderRadius,
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            Active
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "#bbb", marginBottom: "14px" }}>
          Custom elements consume DESIGN.md tokens without modifying plugin source code.
        </div>
        <button
          style={{
            background: primaryColor,
            color: "#fff",
            border: "none",
            borderRadius: borderRadius,
            padding: "8px 16px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => setAccentText(`Updated ${new Date().toLocaleTimeString()}`)}
        >
          {accentText}
        </button>
      </div>
    </div>
  )
}