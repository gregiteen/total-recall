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
    background: "#2a1a3a",
    color: "#ce93d8",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginBottom: "16px",
  },
  th: {
    color: "#888",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    padding: "8px",
    textAlign: "left" as const,
    borderBottom: "1px solid #2a2a4a",
  },
  td: {
    padding: "8px",
    fontSize: "12px",
    borderBottom: "1px solid #1a1a2e",
  },
  slider: {
    width: "100%",
    accentColor: "#ab47bc",
  },
  winnerBox: {
    background: "#0d1117",
    border: "1px solid #4a148c",
    borderRadius: "8px",
    padding: "14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  score: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#e1bee7",
  },
}

export function DecisionPreview() {
  const [weights, setWeights] = useState<Record<string, number>>({
    Performance: 8,
    Maintainability: 7,
    Security: 9,
  })

  const [optAScores, setOptAScores] = useState<Record<string, number>>({
    Performance: 9,
    Maintainability: 7,
    Security: 8,
  })

  const [optBScores, setOptBScores] = useState<Record<string, number>>({
    Performance: 7,
    Maintainability: 9,
    Security: 9,
  })

  const [evaluating, setEvaluating] = useState(false)
  const [output, setOutput] = useState<string | null>(null)

  const calcWeightedScore = (scores: Record<string, number>) => {
    let sum = 0
    let totalWeight = 0
    for (const [k, w] of Object.entries(weights)) {
      sum += (scores[k] || 0) * w
      totalWeight += w
    }
    return totalWeight > 0 ? (sum / totalWeight).toFixed(2) : "0.00"
  }

  const scoreA = parseFloat(calcWeightedScore(optAScores))
  const scoreB = parseFloat(calcWeightedScore(optBScores))
  const winner = scoreA >= scoreB ? "Option A" : "Option B"

  const handleRunEvaluation = async () => {
    setEvaluating(true)
    try {
      const res = await runPluginCommand("decision", "eval", [
        `OptionA=${scoreA}`,
        `OptionB=${scoreB}`,
      ])
      setOutput(res.output || res.error || `Decision logged: Winner is ${winner}`)
    } catch (err: any) {
      setOutput(`Evaluation error: ${err?.message || "Check decision plugin"}`)
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Typed Decision Matrix</span>
        <span style={styles.badge}>Jev Evaluation</span>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Criterion</th>
            <th style={styles.th}>Weight</th>
            <th style={styles.th}>Option A</th>
            <th style={styles.th}>Option B</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(weights).map((c) => (
            <tr key={c}>
              <td style={styles.td}>{c}</td>
              <td style={styles.td}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={weights[c]}
                  style={styles.slider}
                  onChange={(e) => setWeights({ ...weights, [c]: parseInt(e.target.value, 10) })}
                />
              </td>
              <td style={styles.td}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={optAScores[c]}
                  style={styles.slider}
                  onChange={(e) => setOptAScores({ ...optAScores, [c]: parseInt(e.target.value, 10) })}
                />
              </td>
              <td style={styles.td}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={optBScores[c]}
                  style={styles.slider}
                  onChange={(e) => setOptBScores({ ...optBScores, [c]: parseInt(e.target.value, 10) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.winnerBox}>
        <div>
          <div style={{ fontSize: "11px", color: "#888" }}>RANKED OUTCOME</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
            {winner} (Score: {Math.max(scoreA, scoreB)})
          </div>
        </div>
        <button
          style={{
            background: "linear-gradient(135deg, #7b1fa2, #4a148c)",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            color: "#fff",
            fontSize: "12px",
            cursor: "pointer",
          }}
          onClick={handleRunEvaluation}
          disabled={evaluating}
        >
          {evaluating ? "Evaluating…" : "Evaluate Decision"}
        </button>
      </div>

      {output && (
        <div style={{ marginTop: "12px", fontSize: "11px", color: "#ce93d8" }}>
          {output}
        </div>
      )}
    </div>
  )
}