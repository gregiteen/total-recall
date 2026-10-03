import { useState, useEffect, useCallback, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

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
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  controls: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  button: {
    background: "linear-gradient(135deg, #1976d2, #0d47a1)",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  rawOutput: {
    background: "#090d13",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "14px",
    fontSize: "12px",
    lineHeight: 1.5,
    maxHeight: "260px",
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    color: "#cfd8dc",
  },
}

export function CodeQualityPreview() {
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<string>("Click 'Run Quality Report' to inspect current gate status.")
  const [passCount, setPassCount] = useState<number | null>(null)
  const [failCount, setFailCount] = useState<number | null>(null)

  const runCheck = useCallback(async () => {
    setRunning(true)
    try {
      const res = await runPluginCommand("code-quality", "report", [])
      const text = res.output || res.error || "No report output returned."
      setOutput(text)

      // Parse findings count honestly
      if (text.includes("0 finding(s)") || text.includes("No findings")) {
        setPassCount(5)
        setFailCount(0)
      } else {
        const match = text.match(/(\d+)\s+finding\(s\)/)
        if (match) {
          const findings = parseInt(match[1], 10)
          setFailCount(findings)
          setPassCount(Math.max(0, 5 - findings))
        }
      }
    } catch (err: any) {
      setOutput(`Error running quality gate: ${err?.message || "Execution failed"}`)
    } finally {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
    runCheck()
  }, [runCheck])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Code Quality Gate Console</span>
        <span
          style={{
            ...styles.badge,
            background: failCount === 0 ? "#1a3a1a" : failCount === null ? "#2a2a3a" : "#3a1a1a",
            color: failCount === 0 ? "#4caf50" : failCount === null ? "#8888ff" : "#ff5252",
          }}
        >
          {running ? "Checking…" : failCount === 0 ? `All Clean (${passCount ?? 5} Passing)` : failCount ? `${failCount} Findings (${passCount ?? 0} Passing)` : "Ready"}
        </span>
      </div>

      <div style={styles.controls}>
        <button style={styles.button} onClick={runCheck} disabled={running}>
          {running ? "Executing Check…" : "Refresh Gate Report"}
        </button>
      </div>

      <div style={styles.rawOutput}>
        {output}
      </div>
    </div>
  )
}