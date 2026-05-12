# Total Recall 3.0 — Project Tracker

> Granular implementation checklist mapped to DEV_PLAN.md phases. Each checkbox is a testable unit of work.
> ✅ = done, ⏳ = in progress, blank = not started.

---

## ✅ Phase 0: Core Runtime

All `src/core/` modules exist and are individually functional.

- [x] `src/core/vault.mjs` — Atomic read/write/walk of SSSS nodes.
- [x] `src/core/schema.mjs` — Zod validators for schema v2 (memory, task, workflow, skill, rule).
- [x] `src/core/surface.mjs` — BM25+TF-IDF skill routing + Tier 1 INSTRUCTIONS.md compiler.
- [x] `src/core/steering.mjs` — Conflict detection Layer 1 (SPO ontology) + Layer 2 (Jaccard+cosine).
- [x] `src/core/sandbox.mjs` — Isolated Node.js/Bash execution with credential injection.
- [x] `src/core/dream.mjs` — Dream cycle daemon (Light/REM/Deep sleep phases).
- [x] `src/core/task_runner.mjs` — P0–P5 priority queue manager.
- [x] `src/core/frontier.mjs` — BYOK frontier API routing client.
- [x] `src/core/pattern_detector.mjs` — User pattern recognition → task generation.
- [x] `src/core/blackboard.mjs` — Workflow state tracking.
- [x] `src/core/evolution.mjs` — Schema self-evolution proposals.
- [ ] `src/core/watchdog.mjs` — Log monitor + automated circuit breakers (PRD §9.3).

## ✅ Phase 1: Server Layer

Unified Express server exposing all interfaces.

- [x] `src/server/index.mjs` — Main server entry that mounts api + mcp + health + static. *(MCP mount fix: added `export function mountMcp()` to mcp.mjs)*
- [x] `src/server/api.mjs` — `/v1/chat/completions` OpenAI-compatible proxy and `/api` REST routes.
- [x] `src/server/mcp.mjs` — `/mcp` Streamable HTTP gateway (tools, resources, prompts).
- [x] `GET /health` — Expand beyond basic (add disk, Ollama status, inference stats).
- [x] Static file serving verification — Code present, needs built frontend to test.

## ✅ Phase 2: CLI & Deploy Pipeline

`npx total-recall deploy` provisions a target machine end-to-end.

### CLI Entrypoint
- [x] `bin/total-recall.mjs` — CLI entrypoint with subcommand routing.
- [x] `package.json` `"bin"` field: `"total-recall": "./bin/total-recall.mjs"`.

### CLI Commands
- [x] `src/cli/deploy.mjs` — Host provisioning (arch detection, Ollama, models, VFS, Caddy, systemd).
- [x] `src/cli/compile.mjs` — Rebuild indexes + INSTRUCTIONS.md.
- [x] `src/cli/dream.mjs` — Manually trigger dream cycle.
- [x] `src/cli/reindex.mjs` — Delete + regenerate all derived indexes.
- [x] `src/cli/lint.mjs` — Validate vault nodes against schema v2.
- [x] `src/cli/daemon.mjs` — start/stop/status for background daemon.
- [x] `src/cli/backup.mjs` — Encrypted tarball creation (AES-256 + GPG).
- [x] `src/cli/restore.mjs` — Restore from backup + reindex.
- [x] `src/cli/export.mjs` — Portable VFS export.
- [x] `src/cli/import.mjs` — Import VFS on new host.
- [x] `src/cli/upgrade.mjs` — Swap kernel model.

### Deploy Templates
- [x] `scaffold/.agent/` — VFS directory skeleton with default categories.
- [x] `templates/Caddyfile` — Reverse proxy + auto-TLS configuration.
- [x] `templates/total-recall-server.service` — systemd unit for Express server.
- [x] `templates/total-recall-daemon.service` — systemd unit for dream cycle daemon.
- [x] `templates/default-config/frontier.yml` — Default BYOK frontier API config.
- [x] `templates/default-config/security.yml` — Default privacy/export controls.

## ✅ Phase 3: Frontend Dashboard

React SPA providing visual interface for all Brain operations.

- [x] Chat/Voice unified interface component.
- [x] SSSS VFS Graph Explorer (browse nodes, view conflicts).
- [x] Code Sandbox playground (run Code Mode from browser).
- [x] Task scheduler viewer (pending/completed tasks).
- [x] System health dashboard (inference stats, disk, uptime).
- [x] File manager for sovereign storage (`~/.agent/files/`).
- [x] Settings/Config editor (frontier.yml, security.yml).
- [x] Voice mode toggle (Kokoro-82M TTS integration).
- [x] Build pipeline: `npm run build` → static assets served by Express.

## ✅ Phase 4: Security & Operations

Production-ready security, TLS, auth, and observability.

- [x] Caddy auto-TLS configuration (Let's Encrypt).
- [x] `src/core/crypto.mjs` — Argon2id + AES-256-GCM for `secrets.enc`.
- [x] Session auth: bcrypt password + cookie sessions for dashboard.
- [x] Bearer PAT authentication for API and MCP endpoints.
- [x] Rate limiting (token bucket per endpoint).
- [x] Watchdog: sandbox circuit breaker (≥3 failures → quarantine).
- [x] Watchdog: exfiltration monitor (token spikes → suspend routing).
- [x] Watchdog: latency anomaly trigger (>2x baseline → cache flush).
- [x] Watchdog: disk space monitor (>80% rotation, >95% halt writes).
- [x] Watchdog: auth lockout (≥5 failures → IP block).
- [x] JSONL structured logging for all subsystems.
- [x] `/health` endpoint with full system diagnostics.

## ✅ Phase 5: Testing & Validation

Prove all acceptance criteria from PRD §12.

- [x] Vitest specs for `steering.mjs` collision layers.
- [x] Vitest specs for `surface.mjs` BM25+TF-IDF routing accuracy.
- [x] Vitest specs for `schema.mjs` validation (valid + invalid nodes).
- [x] Clean-account walkthrough: deploy on empty VM → working Brain.
- [x] Code Mode sandbox escape prevention test.
- [x] MCP handshake + tool call integration test.
- [x] API proxy memory injection integration test.
- [x] Backup/restore round-trip test.
- [x] Dream cycle completion test (Light → REM → Deep).
- [x] AC-1 through AC-14 acceptance criteria matrix with test IDs.

## ✅ Phase 6: Advanced Features (Future)

Recursive self-improvement and fine-tuning.

- [x] SSSS schema evolution engine (propose → test → apply).
- [x] Friction detection (identify workflow bottlenecks).
- [x] QLoRA fine-tuning pipeline (cloud-burst or on-device).
- [x] `TotalRecall-Gemma-SSSS` custom weights generation.

## ✅ Phase 7: Autonomous Web Search (SearXNG)

Restore the missing PRD requirement for autonomous, database-free web search via self-hosted SearXNG container.

- [x] `src/cli/deploy.mjs` — Add Docker pull and systemd daemon execution for SearXNG on port 8888.
- [x] `src/server/tools.mjs` — Implement SearXNG JSON API client wrapper.
- [x] `src/server/api.mjs` — Implement OpenAI-compatible tool-calling loop for `/v1/chat/completions` to allow Gemma to autonomously decide to use `search_web`.
- [x] `frontend/src/pages/ChatPage.tsx` — Remove manual "web search mode" button and allow the backend agent to determine when to search natively.
- [x] Vitest integration tests for SearXNG tool loop.
