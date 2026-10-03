import { useState, useRef, useEffect, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

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
    background: "#1a3a1a",
    color: "#4caf50",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  docFrame: {
    background: "#0d1117",
    border: "1px solid #2a2a4a",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  },
  docTitle: {
    fontSize: "14px",
    fontWeight: 600,
    marginBottom: "6px",
    color: "#c0c0ff",
  },
  canvasBox: {
    background: "#141428",
    border: "1px dashed #4a4a7a",
    borderRadius: "8px",
    padding: "8px",
    marginBottom: "12px",
    textAlign: "center" as const,
  },
  canvas: {
    background: "#0d1117",
    borderRadius: "4px",
    cursor: "crosshair",
    display: "block",
    margin: "0 auto",
  },
  actions: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  signBtn: {
    background: "linear-gradient(135deg, #2e7d32, #1b5e20)",
    border: "none",
    borderRadius: "6px",
    padding: "10px 20px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    flex: 1,
  },
  clearBtn: {
    background: "#2a2a4a",
    border: "none",
    borderRadius: "6px",
    padding: "10px 16px",
    color: "#aaa",
    fontSize: "13px",
    cursor: "pointer",
  },
  receipt: {
    background: "#090d13",
    border: "1px solid #1a3a1a",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "11px",
    fontFamily: "var(--font-mono, monospace)",
    color: "#81c784",
    wordBreak: "break-all" as const,
  },
}

export function SigningPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [signatureHash, setSignatureHash] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.strokeStyle = "#80d8ff"
    ctx.lineWidth = 2
    ctx.lineCap = "round"
  }, [])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    setIsDrawing(true)
    setHasSignature(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    setStatus(null)
    setSignatureHash(null)
  }

  const handleSign = async () => {
    if (!hasSignature) return
    setStatus("Generating cryptographic digest...")

    try {
      const canvas = canvasRef.current
      const dataUrl = canvas?.toDataURL() || "empty"
      const encoder = new TextEncoder()
      const data = encoder.encode(dataUrl + Date.now().toString())
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      setSignatureHash(hashHex)

      const res = await runPluginCommand("signing", "verify", [hashHex])
      setStatus(res.output || `Cryptographically verified signature digest: ${hashHex.slice(0, 16)}…`)
    } catch (err: any) {
      setStatus(`Signing error: ${err?.message || "Cryptographic operation failed"}`)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Cryptographic Document Signing</span>
        <span style={styles.badge}>Live Canvas</span>
      </div>

      <div style={styles.docFrame}>
        <div style={styles.docTitle}>Verification Certificate — Total Recall Node</div>
        <div style={{ fontSize: "12px", color: "#888" }}>Documenso & SSSS Cryptographic Carrier</div>
      </div>

      <div style={styles.canvasBox}>
        <canvas
          ref={canvasRef}
          width={440}
          height={120}
          style={styles.canvas}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
        <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>
          Draw signature above to authorize cryptographic verification
        </div>
      </div>

      <div style={styles.actions}>
        <button style={styles.clearBtn} onClick={clearCanvas}>
          Clear
        </button>
        <button
          style={styles.signBtn}
          onClick={handleSign}
          disabled={!hasSignature}
        >
          Sign & Verify Hash
        </button>
      </div>

      {signatureHash && (
        <div style={styles.receipt}>
          <div><strong>SHA-256 Receipt:</strong> {signatureHash}</div>
          <div style={{ marginTop: "4px", color: "#a5d6a7" }}>{status}</div>
        </div>
      )}
    </div>
  )
}