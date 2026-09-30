import { useState, type CSSProperties } from "react"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0d1117, #1a1a2e)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', monospace)",
    color: "#e0e0e0",
    maxWidth: "520px",
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
  terminal: {
    background: "#0a0a1a",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "12px",
    minHeight: "100px",
    overflow: "auto" as const,
  },
  line: {
    fontSize: "12px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
  },
  prompt: {
    color: "#4caf50",
  },
  cmd: {
    color: "#e0e0e0",
  },
  output: {
    color: "#888",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "#0a0a1a",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "8px 12px",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#4caf50",
    fontFamily: "var(--font-mono, 'SF Mono', monospace)",
    fontSize: "12px",
    outline: "none",
  },
  commands: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
    marginTop: "12px",
  },
  cmdChip: {
    background: "#1e1e3a",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    color: "#aaa",
    cursor: "pointer",
  },
}

const initialLines = [
  { kind: "prompt", text: "total-recall@mesh:~$ " },
  { kind: "cmd", text: "total-recall --help" },
  { kind: "output", text: "\nTotal Recall Composable CLI v2.1.0" },
  { kind: "output", text: "\nCommands:" },
  { kind: "output", text: "\n  recall      <query>        Search memory" },
  { kind: "output", text: "\n  remember    <category>     Write memory" },
  { kind: "output", text: "\n  compile                     Rebuild surfaces" },
  { kind: "output", text: "\n  mesh        nodes           List mesh peers" },
  { kind: "output", text: "\n  plugin      list            Show installed plugins" },
  { kind: "output", text: "\n  vercel-rotate               Rotate API token" },
  { kind: "prompt", text: "\ntotal-recall@mesh:~$ " },
]

export function ComposableCliPreview() {
  const [cmdHistory, _setCmdHistory] = useState(initialLines)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Composable CLI</span>
        <span style={styles.badge}>Active</span>
      </div>
      <div style={styles.terminal}>
        {cmdHistory.map((l, i) => (
          <div key={i} style={styles.line}>
            {l.kind === "prompt" && <span style={styles.prompt}>{l.text}</span>}
            {l.kind === "cmd" && <span style={styles.cmd}>{l.text}</span>}
            {l.kind === "output" && <span style={styles.output}>{l.text}</span>}
          </div>
        ))}
      </div>
      <div style={styles.inputRow}>
        <span style={{ ...styles.prompt, fontSize: "12px" }}>$</span>
        <input style={styles.input} placeholder="Type a command..." readOnly />
      </div>
      <div style={styles.commands}>
        {["help", "recall", "remember", "compile", "mesh", "plugins"].map((c) => (
          <span key={c} style={styles.cmdChip}>{c}</span>
        ))}
      </div>
    </div>
  )
}