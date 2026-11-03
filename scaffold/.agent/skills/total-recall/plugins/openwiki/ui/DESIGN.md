# DESIGN.md — OpenWiki Knowledge Graph

Documentation hub discovery, semantic knowledge graph visualization, and repository memory ingestion console.

```yaml
tokens:
  brand-name: "OpenWiki"
  wordmark: "[BRAIN//DUMP]"
  badge: "Knowledge Graph"
  color-primary: "#b45309"
  color-primary-hover: "#d97706"
  color-background: "#0f172a"
  color-surface: "#1e293b"
  color-surface-subtle: "#334155"
  color-border: "#475569"
  color-text: "#f8fafc"
  color-text-muted: "#94a3b8"
  color-accent: "#f59e0b"
  color-success: "#10b981"
  color-danger: "#ef4444"
  font-mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
  font-sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  border-radius: "8px"
  min-touch-target: "44px"
```

## 1. Brand Identity & Visual Language

- **Entity**: OpenWiki Documentation & Knowledge Graph Engine
- **Typographic Badge**: `[BRAIN//DUMP]`
- **Color System**: Deep slate foundation with amber gold illumination
- **Typography**: Clean monospace badges paired with legible system sans-serif headers

## 2. Card Architecture & Views

1. **Header Bar**: Displays the typographic mark, hub counter, and operational state indicator.
2. **Hub Roster Deck (`hub-list`)**: Displays discovered Markdown documentation hubs, line counts, and storage metrics.
3. **Ingestion Controller (`ingest-deck`)**: Provides direct path configuration, preview dry-run toggles, and execution controls.
4. **Execution Summary Deck**: Displays structured result telemetry, scanned file counts, and error descriptions without raw terminal dumps.

## 3. Ergonomics & Accessibility

- **Touch Ergonomics**: All interactive buttons, inputs, and toggles declare minimum 44px heights.
- **Motion Restraint**: Media query `@media (prefers-reduced-motion: reduce)` disables all animations and transitions.
- **Host Token Binding**: Binds directly to `--text-primary` and `--border` dashboard custom properties.
