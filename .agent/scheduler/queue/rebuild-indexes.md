---
type: task
priority: 90
category: memory-maintenance
target: rebuild-indexes
estimated_calls: 5
deadline: null
created_by: system
reason: "Memory vault has changed, derived indexes must be rebuilt"
status: pending
progress: 0
---

## Objective
Rebuild the derived JSONL indexes and Tier 1 `INSTRUCTIONS.md` from the SSSS memory vault using your native MCP tools.

## Steps
1. Call your `recompile_surface` MCP tool directly. This is the canonical way to rebuild indexes in Total Recall — do NOT run Node.js scripts.
2. Verify the response confirms nodes were processed and skills were injected.
3. Update this file's `status` field to `done`.

## Success Criteria
- [ ] `recompile_surface` tool returned success.
- [ ] `INSTRUCTIONS.md` contains the latest Tier 1 invariants.
- [ ] `graph-index.jsonl` is freshly generated.
