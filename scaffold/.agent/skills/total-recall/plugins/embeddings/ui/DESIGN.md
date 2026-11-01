# DESIGN.md — Vector Space

```yaml
tokens:
  brand-name: "Vector Space"
  wordmark: "[VECTOR//SPACE]"
  color-primary: "#06b6d4"
  color-background: "#07171d"
  color-surface: "#0e2a35"
  color-accent: "#22d3ee"
  color-ok: "#10b981"
  color-warn: "#f59e0b"
  color-danger: "#ef4444"
  color-text: "#ecfeff"
  color-muted: "#67e8f9"
  color-line: "#164e63"
  badge: "On-Device Vectors"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  border-radius: "8px"
```

## Brand & Typographic Wordmark
- **Name**: Vector Space
- **Wordmark Logo**: `[VECTOR//SPACE]` (custom vector typographic badge, no generic emojis)
- **Palette**: Primary `#06b6d4`, Surface `#07171d`, Secondary Surface `#0e2a35`, Accent `#22d3ee`, Line `#164e63`, Text `#ecfeff`.
- **States**: Verified On-Device `#10b981`, Warning `#f59e0b`, Danger `#ef4444`.

## Interface Architecture
1. **Header**: Custom vector wordmark, strict on-device invariant badge, active embedding model indicator.
2. **Semantic Coverage Gauge**: Circular SVG arc progress gauge displaying percentage of memory vault embedded on-device.
3. **Model Weight Deck**: Grid of local embedding models with vector dimensions, context window, and status.
4. **Latency & Benchmark Meter**: Real-time throughput counter measuring on-device vector projection speed.
