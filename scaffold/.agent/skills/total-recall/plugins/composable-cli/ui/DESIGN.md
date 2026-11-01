# DESIGN.md — Pipe Dream

```yaml
tokens:
  brand-name: "Pipe Dream"
  wordmark: "[PIPE//DREAM]"
  color-primary: "#a855f7"
  color-background: "#09090b"
  color-surface: "#18181b"
  color-accent: "#22c55e"
  color-ok: "#22c55e"
  color-warn: "#eab308"
  color-danger: "#ef4444"
  color-info: "#38bdf8"
  color-text: "#f4f4f5"
  color-muted: "#a1a1aa"
  color-line: "#27272a"
  badge: "CLI Pipelines"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  border-radius: "8px"
```

## Brand & Typographic Wordmark
- **Name**: Pipe Dream
- **Wordmark Logo**: `[PIPE//DREAM]` (custom vector typographic badge, no generic emojis)
- **Palette**: Primary `#a855f7`, Surface `#09090b`, Secondary Surface `#18181b`, Accent `#22c55e`, Line `#27272a`, Text `#f4f4f5`.
- **Risk States**: Read `#22c55e`, Write `#eab308`, Destructive `#ef4444`, Send `#38bdf8`.

## Interface Architecture
1. **Header**: Custom vector wordmark, command scope indicator, total pipeline count.
2. **Composed Command Matrix**: Grid of registered composed verbs displaying scope badge (`project` / `global`) and color-coded risk badge.
3. **Structured Command Inspector**: Interactive parameter inspector displaying arguments, implementation notes, and structured JSON results.
4. **Execution & History Deck**: Interactive run triggers and version rollback actions.
