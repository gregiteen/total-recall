# Phase 5: Acceptance Matrix (PRD §12)

| # | Criterion | Verification Method | Automated Test ID |
|---|---|---|---|
| **AC-1** | **Zero Database Dependency** | Audit confirms all state stored as `.md`/`.yml` files in VFS. No DB processes running. | `Audit` |
| **AC-2** | **Autonomous Workflow Execution** | System executes a multi-step SSSS workflow with `[Parallel]` branches. | `src/core/sandbox.spec.mjs` |
| **AC-3** | **Self-Healing** | Code Mode identifies errors from stack traces and rewrites scripts to achieve success. | `Manual Verification` |
| **AC-4** | **Frictionless Deployment** | `npx total-recall deploy` provisions system in under 10 minutes. | `Clean-account walkthrough` |
| **AC-5** | **Continuous Operation** | System maintains >10% CPU utilization over 7 days. | `Manual Verification` |
| **AC-6** | **Memory Integrity** | All memory nodes pass schema v2 validation. Dream cycle prunes stale nodes without data loss. | `src/core/schema.spec.mjs`, `src/core/dream.spec.mjs` |
| **AC-7** | **Omnichannel Access** | Dashboard, API, MCP Gateway respond correctly to authenticated requests simultaneously. | `src/server/mcp.spec.mjs`, `src/server/api.spec.mjs` |
| **AC-8** | **Voice Synthesis** | System generates real-time voice output via Kokoro-82M. | `Manual Verification` |
| **AC-9** | **Backup & Restore** | `npx total-recall restore` recovers full system state from encrypted tarball. | `src/cli/backup.spec.mjs` |
| **AC-10** | **Portability** | `export` + `import` successfully migrates memory system. | `Manual Verification` |
| **AC-11** | **Task Scheduler** | Generates, prioritizes, and executes ≥10 self-directed tasks/day. | `Manual Verification` |
| **AC-12** | **Proactive Skill Building** | Creates ≥1 new skill file per week based on user patterns. | `Manual Verification` |
| **AC-13** | **Tiered Intelligence** | Confidence-based routing escalates uncertain tasks. Frontier eval loop validates skills. | `src/core/surface.spec.mjs` |
| **AC-14** | **Recursive Self-Improvement** | Proposes, tests, and applies SSSS schema improvements. | `Manual Verification` |
