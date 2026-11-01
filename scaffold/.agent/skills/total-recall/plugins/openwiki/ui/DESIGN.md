# DESIGN.md — Brain Dump

```yaml
tokens:
  brand-name: "Brain Dump"
  wordmark: "[BRAIN//DUMP]"
  color-primary: "#3b82f6"
  color-background: "#0f172a"
  color-surface: "#1e293b"
  color-accent: "#facc15"
  color-ok: "#10b981"
  color-warn: "#f59e0b"
  color-danger: "#ef4444"
  color-text: "#f8fafc"
  color-muted: "#94a3b8"
  color-line: "#334155"
  badge: "Knowledge Graph"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  border-radius: "8px"
```

## Brand & Typographic Wordmark
- **Name**: Brain Dump
- **Wordmark Logo**: `[BRAIN//DUMP]` (custom vector typographic badge, no generic emojis)
- **Palette**: Primary `#3b82f6`, Surface `#0f172a`, Secondary Surface `#1e293b`, Accent `#facc15`, Line `#334155`, Text `#f8fafc`.
- **States**: Verified Knowledge `#10b981`, Warning `#f59e0b`, Danger `#ef4444`.

## Interface Architecture
1. **Header**: Custom vector wordmark, knowledge graph badge, active hub count.
2. **Hub Tree Matrix**: Grid of verified documentation files (`openwiki/*.md`), rendering title, path, file size in bytes, and line count.
3. **Structured Ingestion Deck**: Interactive controls for cross-repo documentation ingest with target path input, dry-run toggle, and run button.
4. **Bootstrap & Inspection Deck**: One-click bootstrap trigger and execution receipts without terminal stdout dumps.
