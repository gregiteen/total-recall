# CLI_AGENTS_CARD — PRD

> **Project Prefix**: `CLI_AGENTS_CARD`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-10-25
> **Based on audit**: `CLI_AGENTS_CARD_AUDIT.md` (Complete, `3047ee7caea8546a1becf1e57e1cfe259d1ed302`)

---

## 1. Product Objective
Rebuild `command-fleet-card` into a purpose-built Command Fleet coordination console. Eliminate template artifacts including `.telemetry-row` 3-metric strips, terminal readout boxes (`#card-out`), missing design documentation, and unreferenced dashboard tokens identified in Audit findings A-001 through A-004.

## 2. Target Operator Experience
The developer or autonomous agent operator needs an interactive console for fleet coordination:
- Which terminal coding agents are installed and verified across mesh nodes (Claude Code, DSH, Hermes, Antigravity, Codex, etc.)?
- Which agents have valid authentication and verified tool execution?
- Is official documentation for each agent fresh and accessible locally?
- Can agents be dispatched to tasks with verified permission boundaries?

## 3. Functional Requirements
### FR-1: Fleet Agent Matrix
- Replace generic metric boxes with an interactive Multi-Agent Matrix.
- Display each discovered agent with its binary status (installed / uninstalled), authentication state, version, and primary model.

### FR-2: Node Fleet Switcher
- Provide interactive node switcher buttons (`Local`, `Cloud 100.64.0.1`, `MacBook 100.64.0.6`) querying agent capabilities across mesh nodes.

### FR-3: Documentation Freshness Monitor
- Query documentation status via `host.run('docs-status', ['--json'])`.
- Render live freshness status (Fresh, Outdated, Syncing) with page counts.

### FR-4: Agent Detail & Dispatch Inspector
- Replace raw `<pre id="card-out">` terminal dumps with a structured Agent Inspector.
- Display permission gates (`read`, `write`, `send`, `destructive`), model context limits, and dispatch history.

## 4. Design & Compliance Constraints
- **Zero Templates:** Every control is hand-crafted specifically for fleet agent coordination.
- **Tokens Only:** Author `ui/DESIGN.md` declaring the `--face-*` custom property block, binding `--text-primary` and `--border`.
- **Ergonomics & Motion:** Minimum 44px touch targets on interactive buttons and complete `prefers-reduced-motion` compliance.
- **Copy Integrity:** Ensure zero sentences end with prepositions across all copy.
