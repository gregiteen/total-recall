import { useState, type CSSProperties } from "react"
import { runPluginCommand } from "../../../api"

const styles: Record<string, CSSProperties> = {
  container: {
    background: "linear-gradient(135deg, #0f172a, #1e1b4b)",
    borderRadius: "12px",
    padding: "24px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "#e2e8f0",
    maxWidth: "600px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  label: {
    color: "#94a3b8",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    fontWeight: 600,
  },
  badge: {
    background: "rgba(244, 63, 94, 0.2)",
    color: "#f43f5e",
    border: "1px solid rgba(244, 63, 94, 0.4)",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
  },
  controlGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "14px",
  },
  ctlLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    fontWeight: 500,
  },
  select: {
    background: "#090d16",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#f8fafc",
    fontSize: "13px",
    cursor: "pointer",
  },
  textarea: {
    background: "#090d16",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#f8fafc",
    fontSize: "13px",
    fontFamily: "inherit",
    minHeight: "72px",
    resize: "vertical" as const,
  },
  chipsRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  chip: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    color: "#cbd5e1",
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    gap: "10px",
    marginTop: "16px",
  },
  generateBtn: {
    background: "linear-gradient(135deg, #f43f5e, #be123c)",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  previewCard: {
    background: "#090d16",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "16px",
    marginTop: "18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  image: {
    maxWidth: "100%",
    maxHeight: "320px",
    borderRadius: "8px",
    objectFit: "contain" as const,
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  },
}

const MODELS = [
  { id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell] — Ultra-Fast (Recommended)" },
  { id: "fal-ai/flux/dev", name: "FLUX.1 [dev] — Detailed High Quality" },
  { id: "fal-ai/flux-pro/v1.1", name: "FLUX 1.1 [pro] — Professional Studio" },
  { id: "fal-ai/recraft-v3", name: "Recraft v3 — Vector & Logo Design" },
  { id: "fal-ai/fast-sdxl", name: "Fast SDXL — Lightweight Diffusion" },
]

export function ImageGeneratorPreview() {
  const [model, setModel] = useState("fal-ai/flux/schnell")
  const [prompt, setPrompt] = useState("minimal vector brand logo for phone dialer on dark sleek background")
  const [size, setSize] = useState("square_hd")
  const [loading, setLoading] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setStatusMessage("Submitting inference request to fal.ai...")

    try {
      const args = ["--prompt", prompt.trim(), "--model", model, "--size", size, "--json"]
      const res = await runPluginCommand("image-generator", "generate", args)

      if (res.output) {
        try {
          const parsed = JSON.parse(res.output)
          if (parsed.url) {
            setGeneratedUrl(parsed.url)
            setStatusMessage(`Successfully generated via ${model}`)
            return
          }
        } catch {
          // not json, inspect raw text
        }

        const match = res.output.match(/URL:\s*(https?:\/\/[^\s]+)/)
        if (match) {
          setGeneratedUrl(match[1])
          setStatusMessage(`Successfully generated via ${model}`)
          return
        }
      }

      if (res.error) {
        setStatusMessage(`Inference error: ${res.error}`)
      } else {
        setStatusMessage(res.output || "Generated without output URL")
      }
    } catch (err: any) {
      setStatusMessage(`Generation failed: ${err?.message || "Check network/FAL_KEY"}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>fal.ai Generative Media Console</span>
        <span style={styles.badge}>Live Inference</span>
      </div>

      {/* Model Selector Front & Center */}
      <div style={styles.controlGroup}>
        <label style={styles.ctlLabel}>Inference Model</label>
        <select
          style={styles.select}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loading}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Prompt input */}
      <div style={styles.controlGroup}>
        <label style={styles.ctlLabel}>Prompt Description</label>
        <textarea
          style={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the branding image, logo, or icon to generate..."
          disabled={loading}
        />
        <div style={styles.chipsRow}>
          <button
            type="button"
            style={styles.chip}
            onClick={() => setPrompt("sleek modern app icon for telecom dialer, minimal geometry on obsidian backdrop")}
          >
            📞 App Icon
          </button>
          <button
            type="button"
            style={styles.chip}
            onClick={() => setPrompt("vector brand emblem for cryptographic document signing, purple gradient, crisp lines")}
          >
            ✍️ Brand Seal
          </button>
          <button
            type="button"
            style={styles.chip}
            onClick={() => setPrompt("minimalist globe DNS network icon with glowing cyan nodes and dark glass badge")}
          >
            🌐 DNS Badge
          </button>
        </div>
      </div>

      {/* Size Selector */}
      <div style={styles.controlGroup}>
        <label style={styles.ctlLabel}>Aspect Ratio / Dimensions</label>
        <select
          style={styles.select}
          value={size}
          onChange={(e) => setSize(e.target.value)}
          disabled={loading}
        >
          <option value="square_hd">Square HD (1024 × 1024) — Best for Logos & Icons</option>
          <option value="landscape_16_9">Landscape 16:9 — Best for Banners</option>
          <option value="portrait_16_9">Portrait 9:16 — Best for Mobile</option>
        </select>
      </div>

      <div style={styles.actions}>
        <button
          style={styles.generateBtn}
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
        >
          {loading ? "Generating Image with fal.ai…" : "✨ Generate Asset"}
        </button>
      </div>

      {statusMessage && (
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
          {statusMessage}
        </div>
      )}

      {generatedUrl && (
        <div style={styles.previewCard}>
          <img src={generatedUrl} alt="Generated Asset" style={styles.image} />
          <div style={{ display: "flex", gap: "8px", width: "100%", justifyContent: "center" }}>
            <a
              href={generatedUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "12px", textDecoration: "none" }}
            >
              Open Full Resolution ↗
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
