# SURFACE_COMPILATION_FIX — Architecture

> **Project Prefix**: `SURFACE_COMPILATION_FIX`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-07-14

---

## Systems Impacted
- **`src/core/surface.mjs`**: The core compilation engine that parses nodes and writes `AGENTS.md` and `INSTRUCTIONS.md`.

## Core Logic Changes
1. **`heuristicCompact(node)`**: Must separate the raw title (used for echo detection) from the sanitized title (used for final rendering).
2. **`buildRulesBlock`**: Must introduce `isImportant` filter before aggregating the `invariants`, `preferences`, and `corrections` groups. Must also correctly read `SKILL.md` files (using `gray-matter`) without swallowing errors silently.
