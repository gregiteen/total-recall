import { useState, type CSSProperties } from "react"

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
    marginBottom: "16px",
  },
  label: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  badge: {
    background: "#3a1a1a",
    color: "#ff8a80",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
  },
  confidence: {
    marginBottom: "16px",
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px",
  },
  slider: {
    flex: 1,
    WebkitAppearance: "none" as const,
    height: "6px",
    borderRadius: "3px",
    background: "#2a2a4a",
    outline: "none",
  },
  thresholdValue: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#7c4dff",
    minWidth: "36px",
    textAlign: "center" as const,
  },
  stage: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "8px",
  },
  stageHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "6px",
  },
  stageName: {
    fontSize: "13px",
    fontWeight: 600,
  },
  stageStatus: {
    fontSize: "12px",
  },
  stageBar: {
    height: "4px",
    borderRadius: "2px",
    background: "#2a2a4a",
    overflow: "hidden" as const,
  },
  barFill: {
    height: "100%",
    borderRadius: "2px",
    transition: "width 0.3s ease",
  },
  fallbackNote: {
    fontSize: "11px",
    color: "#888",
    marginTop: "12px",
    padding: "8px",
    border: "1px dashed #2a2a4a",
    borderRadius: "6px",
    textAlign: "center" as const,
  },
}

interface DecisionStage {
  name: string
  score: number
  passes: boolean
}

export function DecisionPreview() {
  const [threshold, setThreshold] = useState(65)

  const stages: DecisionStage[] = [
    { name: "Rule Match", score: 92, passes: 92 >= threshold },
    { name: "Semantic Coherence", score: 78, passes: 78 >= threshold },
    { name: "Mesh Consensus", score: 45, passes: 45 >= threshold },
  ]

  const allPass = stages.every((s) => s.passes)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Decision Gate</span>
        <span style={{ ...styles.badge, color: allPass ? "#4caf50" : "#ff8a80", background: allPass ? "#1a3a1a" : "#3a1a1a" }}>
          {allPass ? "Passed" : "Blocked"}
        </span>
      </div>
      <div style={styles.confidence}>
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>Confidence Threshold</div>
        <div style={styles.sliderRow}>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.thresholdValue}>{threshold}%</span>
        </div>
      </div>
      <div>
        {stages.map((s) => (
          <div key={s.name} style={styles.stage}>
            <div style={styles.stageHeader}>
              <span style={styles.stageName}>{s.name}</span>
              <span style={{ ...styles.stageStatus, color: s.passes ? "#4caf50" : "#ff8a80" }}>
                {s.passes ? "✓" : "✗"} {s.score}%
              </span>
            </div>
            <div style={styles.stageBar}>
              <div style={{ ...styles.barFill, width: `${s.score}%`, background: s.passes ? "#4caf50" : "#ff5252" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={styles.fallbackNote}>
        {allPass
          ? "All gates passed — executing primary route"
          : "Mesh consensus below threshold — activating fallback route"}
      </div>
    </div>
  )
}