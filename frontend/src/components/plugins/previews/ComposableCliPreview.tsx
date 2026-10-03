import { useState, type CSSProperties } from "react"
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
    background: "#1a3a3a",
    color: "#00bfa5",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  row: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
  },
  input: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "inherit",
    flex: 1,
  },
  btn: {
    background: "linear-gradient(135deg, #00897b, #004d40)",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  previewBox: {
    background: "#090d13",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "14px",
    fontSize: "12px",
    lineHeight: 1.5,
    maxHeight: "220px",
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    color: "#80cbc4",
  },
}

export function ComposableCliPreview() {
  const [subcommand, setSubcommand] = useState("inspect")
  const [argument, setArgument] = useState("--format=json")
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<string>("total-recall composable-cli inspect --format=json")

  const handleExecute = async () => {
    setExecuting(true)
    const args = argument.trim() ? argument.trim().split(/\s+/) : []
    try {
      const res = await runPluginCommand("composable-cli", subcommand, args)
      setResult(res.output || res.error || `Executed successfully: total-recall composable-cli ${subcommand} ${args.join(" ")}`)
    } catch (err: any) {
      setResult(`Execution error: ${err?.message || "Check composable-cli handler"}`)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Dynamic Command Orchestrator</span>
        <span style={styles.badge}>Live CLI</span>
      </div>

      <div style={styles.row}>
        <input
          style={{ ...styles.input, flex: "0 0 140px" }}
          value={subcommand}
          onChange={(e) => setSubcommand(e.target.value)}
          placeholder="subcommand"
        />
        <input
          style={styles.input}
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          placeholder="args (e.g. --json)"
        />
        <button style={styles.btn} onClick={handleExecute} disabled={executing}>
          {executing ? "Running…" : "Execute"}
        </button>
      </div>

      <div style={styles.previewBox}>
        {result}
      </div>
    </div>
  )
}