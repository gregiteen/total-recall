# DESIGN.md — Command Fleet

```yaml
tokens:
  brand-name: "Command Fleet"
  wordmark: "[FLEET//COMMAND]"
  color-primary: "#3b82f6"
  color-background: "#0c1427"
  color-surface: "#1e293b"
  color-accent: "#38bdf8"
  color-ok: "#10b981"
  color-warn: "#f59e0b"
  color-danger: "#ef4444"
  color-text: "#f1f5f9"
  color-muted: "#94a3b8"
  color-line: "#1e293b"
  badge: "Agent Runtime Matrix"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  border-radius: "8px"
```

## Brand & Typographic Wordmark
- **Name**: Command Fleet
- **Wordmark Logo**: `[FLEET//COMMAND]` (custom vector typographic badge, no generic emojis)
- **Palette**: Primary `#3b82f6`, Surface `#0c1427`, Secondary Surface `#1e293b`, Accent `#38bdf8`, Line `#1e293b`, Text `#f1f5f9`.
- **States**: Verified Pass `#10b981`, Warning `#f59e0b`, Danger `#ef4444`.

## Interface Architecture
1. **Header**: Custom vector wordmark, mesh target chip, total verified agent counter.
2. **Mesh Node Switcher**: Quick toggle buttons for mesh nodes (`Local`, `Cloud`, `MacBook`).
3. **Multi-Agent Matrix**: Grid of supported CLI agents with binary status, auth badge, and version.
4. **Structured Fleet Inspector**: Interactive inspector displaying permissions, primary model, and doc freshness.
