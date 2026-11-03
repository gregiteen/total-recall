# CLI_AGENTS_CARD — Development Plan

> **Project Prefix**: `CLI_AGENTS_CARD`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-10-25
> **Based on audit**: `CLI_AGENTS_CARD_AUDIT.md` (Complete, `3047ee7caea8546a1becf1e57e1cfe259d1ed302`)

---

## 1. Plan Overview
This plan implements the complete architectural overhaul of `command-fleet-card`, resolving findings A-001 through A-004 across four phases.

## 2. Phased Execution

### Phase 1: Design Documentation & Tokenization (Audit Fixes A-003, A-004)
- Author `ui/DESIGN.md` establishing domain tokens, brand palette, and layout principles.
- Declare the `--face-*` custom property block in `ui/card.js`, eliminating 23 raw hex literals.
- Bind dashboard custom properties (`--text-primary`, `--border`, `--card-accent`, `--tone-ok`, `--tone-danger`, `--tone-warn`).
- Implement `prefers-reduced-motion` media queries and 44px minimum touch targets.

### Phase 2: Bespoke Multi-Agent Matrix (Audit Fix A-001)
- Strip `.telemetry-row` 3-metric strip completely.
- Build the bespoke Multi-Agent Matrix displaying discovered agents with binary status, auth badges, and versions.
- Render fail-closed `—` characters when agents are unverified.

### Phase 3: Fleet Inspector & Node Switcher (Audit Fix A-002)
- Eradicate `<pre id="card-out">` and terminal output text sinks.
- Build the structured Fleet Inspector displaying agent details, permission gates, model context, and doc status.
- Implement mesh node selection buttons querying agents across local and remote nodes.

### Phase 4: Final Testing & Validation
- Add unit test suite verifying custom element definition, template elimination, and agent matrix rendering.
- Run `npm test` verifying all 15+ unit tests pass.
- Run `record.mjs` verifying zero errors and zero card warnings.
- Update Project Tracker Action Log with verification evidence.
