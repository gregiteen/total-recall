---
name: "Code Quality Gates"
plugin: code-quality
tokens:
  color-primary: "#eab308"
  color-primary-strong: "#facc15"
  color-background: "#0f172a"
  color-surface: "#1e293b"
  color-border: "#334155"
  color-text: "#f8fafc"
  color-muted: "#94a3b8"
  color-accent: "#38bdf8"
  color-success: "#10b981"
  color-warning: "#f59e0b"
  color-danger: "#ef4444"
  color-on-primary: "#0f172a"
  font-body: "'Space Grotesk', system-ui, sans-serif"
  font-mono: "'JetBrains Mono', 'Fira Code', monospace"
  radius-md: "8px"
  space-4: "16px"
components:
  report:
    backgroundColor: "{tokens.color-surface}"
    textColor: "{tokens.color-text}"
    rounded: "{tokens.radius-md}"
    padding: "{tokens.space-4}"
  workflow:
    backgroundColor: "{tokens.color-background}"
    textColor: "{tokens.color-text}"
    rounded: "{tokens.radius-md}"
    padding: "{tokens.space-4}"
---

# Code Quality Gates — design

The plugin's own visual language, for the Home panel, the SSSS UI chunks and any
host that themes them. Values follow `branding.color` in `plugin.json` and the
card palette in `ui/DESIGN.md`.

## Meaning of colour

- `color-success`: a report with status `clean` and nothing else.
- `color-warning`: `partial`, `stale`, `unknown-freshness`, `zero-scope`, and skipped gates.
- `color-danger`: `failed`, `unparsed-failure`, `infrastructure`, `unreadable`, `missing`, and failing gates.
- `color-primary`: the one action that runs gates.

No colour ever signals "passing" without a `clean` report view. Absent data is
shown as absent, in `color-muted`.

## Type

`font-mono` for gate ids, file paths, revisions and commands; `font-body` for
everything else.
