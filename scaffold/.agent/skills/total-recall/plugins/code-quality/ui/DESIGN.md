# DESIGN.md — Nitpicker

```yaml
tokens:
  brand-name: "Nitpicker"
  wordmark: "[NIT//PICKER]"
  color-primary: "#eab308"
  color-background: "#0f172a"
  color-surface: "#1e293b"
  color-accent: "#38bdf8"
  color-ok: "#10b981"
  color-warn: "#f59e0b"
  color-danger: "#ef4444"
  color-text: "#f8fafc"
  color-muted: "#94a3b8"
  color-line: "#334155"
  badge: "Fail-Closed Gates"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  border-radius: "8px"
```

## Brand & Typographic Wordmark
- **Name**: Nitpicker
- **Wordmark Logo**: `[NIT//PICKER]` (custom vector typographic badge, no generic emojis)
- **Palette**: Primary `#eab308`, Surface `#0f172a`, Secondary Surface `#1e293b`, Accent `#38bdf8`, Line `#334155`, Text `#f8fafc`.
- **States**: Pass `#10b981`, Warning `#f59e0b`, Danger `#ef4444`.

## Interface Architecture
1. **Header**: Custom vector wordmark, tier badge, repository cleanliness indicator.
2. **Gate Health Matrix**: Real-time status cards for configured gates (`typecheck`, `syntax`, `test`, `lint`, `format`, `secrets`).
3. **Structured Violation Browser**: Expandable inspection rows for errors and warnings with file paths, line numbers, and rule identifiers.
4. **Execution & Freshness Bar**: Interactive tier buttons (`fast`, `full`, `remote`) and worktree drift detection.
