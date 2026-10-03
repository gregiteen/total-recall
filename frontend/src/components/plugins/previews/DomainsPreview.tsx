import { useState, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

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
    background: "#1a2a3a",
    color: "#64b5f6",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  input: {
    flex: 1,
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  button: {
    background: "linear-gradient(135deg, #0288d1, #01579b)",
    border: "none",
    borderRadius: "6px",
    padding: "8px 16px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  resultBox: {
    background: "#090d13",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "14px",
    fontSize: "12px",
    lineHeight: 1.5,
    maxHeight: "260px",
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    color: "#b0bec5",
  },
}

export function DomainsPreview() {
  const [domain, setDomain] = useState("localhost")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>("Enter a domain name to inspect DNS routing and registrar status.")

  const handleLookup = async () => {
    if (!domain.trim()) return
    setLoading(true)
    setResult(`Querying DNS records for ${domain.trim()}...`)
    try {
      const res = await runPluginCommand("domains", "inspect", [domain.trim()])
      if (res.success && res.output) {
        setResult(res.output)
      } else {
        setResult(res.output || res.error || `No records found or command executed: total-recall domains inspect ${domain.trim()}`)
      }
    } catch (err: any) {
      setResult(`Lookup failed: ${err?.message || "Verify network connection"}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>DNS & Domain Resolution</span>
        <span style={styles.badge}>{loading ? "Querying…" : "Online"}</span>
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
        />
        <button style={styles.button} onClick={handleLookup} disabled={loading || !domain.trim()}>
          {loading ? "Inspecting…" : "Inspect DNS"}
        </button>
      </div>

      <div style={styles.resultBox}>
        {result}
      </div>
    </div>
  )
}