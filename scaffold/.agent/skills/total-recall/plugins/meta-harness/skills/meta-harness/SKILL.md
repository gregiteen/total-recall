---
name: meta-harness
description: Discover, configure, document, track, route, coordinate, and run coding agent harnesses through Total Recall across mesh nodes.
repo_scoped: false
---

# Meta Harness

The Meta Harness plugin coordinates 15+ coding agent runtimes (`agy`, `claude`, `codex`, `grok`, `ollama`, `hermes`, `dsh`, `openclaw`, `aider`, `goose`, `openhands`, `cline`, and IDE runners) across local and remote mesh nodes.

## Golden Rules
1. **Never Hardcode Credential Logic**: All API keys resolve via `total-recall auth secret get <KEY>` using the global encrypted vault.
2. **Total Recall First**: Every dispatched agent run enforces `total-recall context "<task>"` with `ready:true` and writes a verified preflight receipt.
3. **Deterministic Complexity Routing**: Use `meta-harness route "<task>"` to classify task complexity and avoid burning frontier quotas on mechanical edits.
4. **Isolated Verification**: In multi-agent pipelines (`Architect -> Implementer -> Verifier`), the Verifier must execute in an isolated git worktree and employ a distinct model family.

## Command Reference

### Discovery & Upstream Version Tracking
- `total-recall meta-harness status [--node <id>]`: Check installed binaries, versions, and auth status.
- `total-recall meta-harness tracking [--node <id>]`: Compare installed versions against upstream release tags and changelogs.
- `total-recall meta-harness catalog`: List all built-in and custom declarative adapter contracts.

### Smart Routing & Telemetry
- `total-recall meta-harness quota [--node <id>]`: Inspect 5-hour rolling/weekly quotas, credit balances, and free RAM.
- `total-recall meta-harness benchmarks`: View SWE-bench Pro, Terminal-Bench 2.0, and local empirical pass rates.
- `total-recall meta-harness route "<task>"`: Two-stage RouteLLM classifier and gate cascade evaluation.

### Multi-Agent Coordination & Mesh Dispatch
- `total-recall meta-harness coordinate "<task>" --mode pipeline`: Run Architect -> Implementer -> Verifier pipeline.
- `total-recall meta-harness coordinate "<task>" --mode council`: Run multi-model consensus review.
- `total-recall meta-harness dispatch <harness> "<prompt>" [--node <id>]`: Dispatch a single task with preflight receipt.

### Self-Learning & Adapters
- `total-recall meta-harness learn`: Ingest recent run receipts, update scorecards, and propose memory friction improvements.
- `total-recall meta-harness adapter add <json-or-file>`: Register custom third-party agent harnesses dynamically.
- `total-recall meta-harness adapter list`: View custom registered adapters.
