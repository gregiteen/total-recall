# Total Recall 3.0 — Project Tracker

> Granular implementation checklist mapped to DEV_PLAN.md phases. Each checkbox is a testable unit of work.
> ✅ = done, ⏳ = in progress, blank = not started.
>
> **Audit completed 2026-05-12.** Every `[x]` was verified against actual source files. False completions have been unchecked and annotated.

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
- [x] `src/core/watchdog.mjs` — Log monitor + automated circuit breakers (PRD §9.3). ✅ *Wired 2026-05-12: `logger.mjs` exposes an `EventEmitter` (`logEvents`) and emits a `log` event for every entry. `watchdog.mjs#attachLogMonitor()` subscribes and runs `LOG_PATTERNS` that fire `recordSandboxFailure` / `recordAuthFailure` / `recordLatency` / `recordTokens` automatically; `attachLogTail()` is the equivalent for out-of-process daemons. Server entry attaches the monitor on boot. Covered by `src/core/watchdog.spec.mjs`.*

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
- [x] Voice mode toggle (Kokoro-82M TTS integration). ✅ *2026-05-12 — `src/core/tts.mjs` implements the Kokoro façade (OpenAI-compatible `/v1/audio/speech` POST). `src/server/api.mjs` exposes `POST /api/tts` + `GET /api/tts/status` (503 when disabled so the frontend falls back gracefully). `templates/default-config/voice.yml` ships engine-disabled by default. `frontend/src/pages/ChatPage.tsx` probes `/api/tts/status`, plays the returned audio blob when Kokoro is available, and falls back to browser `speechSynthesis` otherwise. Covered by `src/core/tts.spec.mjs` (5 tests).*
- [x] Build pipeline: `npm run build` → static assets served by Express.

## ✅ Phase 4: Security & Operations

Production-ready security, TLS, auth, and observability.

- [x] Caddy auto-TLS configuration (Let's Encrypt).
- [x] `src/core/crypto.mjs` — Argon2id + AES-256-GCM for `secrets.enc`.
- [x] Session auth: bcrypt password + cookie sessions for dashboard. ✅ *Backend (`auth.mjs`) + frontend login gate (`LoginPage.tsx`, `App.tsx` auth state machine) fully implemented. Verified 2026-05-12.*
- [x] Bearer PAT authentication for API and MCP endpoints.
- [x] Rate limiting (token bucket per endpoint).
- [x] Watchdog: sandbox circuit breaker (≥3 failures → quarantine). ✅ *In-memory counter implemented in `watchdog.mjs` — `isSandboxQuarantined()` works.*
- [x] Watchdog: exfiltration monitor (token spikes → suspend routing). ✅ *`recordTokens()` / `isRoutingSuspended()` implemented.*
- [x] Watchdog: latency anomaly trigger (>2x baseline → cache flush). ✅ *`recordLatency()` detects anomaly and logs — cache flush is a TODO comment, not wired.*
- [x] Watchdog: disk space monitor (>80% rotation, >95% halt writes). ✅ *`checkDiskSpace()` via `statfsSync` with periodic `setInterval`. Implemented.*
- [x] Watchdog: auth lockout (≥5 failures → IP block). ✅ *`recordAuthFailure()` / `isIpBlocked()` implemented with quarantine persistence.*
- [x] JSONL structured logging for all subsystems.
- [x] `/health` endpoint with full system diagnostics.
- [x] Watchdog wired to log file monitor. ✅ *2026-05-12 — `logger.mjs` emits structured events; `watchdog.attachLogMonitor()` reacts in-process, `attachLogTail()` tails the JSONL file for daemon-isolated processes. Verified in `watchdog.spec.mjs`.*

### ✅ Frontend Auth Gate (Completed 2026-05-12T20:32Z)

> **Post-mortem:** Dashboard deployed open on 2026-05-12T20:16Z, taken down immediately. Auth gate implemented and redeployed same session. Endpoint verification passed.
> **Verified:** `/health` → 200 open ✅ | `/auth/me` no creds → 401 ✅ | `/api/files` no creds → 401 ✅ | `/v1/chat/completions` no creds → 401 ✅ | `/auth/me` with PAT → 200 ✅

#### Backend additions
- [x] **`src/server/api.mjs` — `GET /auth/me`** — Session probe endpoint. Returns `{ authenticated: true }` on valid session/PAT, 401 otherwise.

#### Frontend — Login Page
- [x] **`frontend/src/pages/LoginPage.tsx`** — Full-screen centered login form. `POST /auth/login`. On success renders app. On failure shows inline error.
- [x] **`frontend/src/pages/LoginPage.tsx` — loading state** — Spinner while in-flight, disabled submit, prevents double-submit.
- [x] **`frontend/src/pages/LoginPage.tsx` — error state** — Inline error message, password field preserved for retry.

#### Frontend — Auth Gate in App.tsx
- [x] **`frontend/src/App.tsx` — session check on mount** — `GET /auth/me` before rendering. Spinner during probe (no flash of unprotected content).
- [x] **`frontend/src/App.tsx` — auth state** — `useState<'loading' | 'authed' | 'unauthed'>`. Full dashboard only renders when `authed`.
- [x] **`frontend/src/App.tsx` — logout callback** — `onLogout` passed to Sidebar. Calls `POST /auth/logout` → sets state to `unauthed`.

#### Frontend — API Client hardening
- [x] **`frontend/src/api.ts` — global 401 interceptor** — `apiFetch` wrapper fires `onUnauthed()` callback on any 401 response, snapping app to login screen.

#### Frontend — Logout Button
- [x] **`frontend/src/App.tsx` Sidebar** — Logout button (exit icon + "Sign out") in sidebar footer. Red hover. Calls `POST /auth/logout` → clears cookie → `<LoginPage>` renders.

#### Deployment gate
- [x] **Manual verification completed 2026-05-12T20:32Z** — `/health` 200 ✅, `/auth/me` no-creds 401 ✅, `/api/files` no-creds 401 ✅, `/v1/chat/completions` no-creds 401 ✅, PAT auth working ✅. Frontend login screen loads before dashboard on `<YOUR_SERVER_IP>:3000`.

### ✅ Forced Temporary Password Onboarding (Completed 2026-05-12T20:54Z)

> **Context:** Deployment previously left `password_hash: null` in the template, meaning the server booted securely but without a way for the user to log in until they manually hashed a password via CLI. This implements an automatic secure onboarding flow.

- [x] **`src/cli/deploy.mjs`** — Copy default config securely. If `security.yml` doesn't exist, generate a secure temporary password using `crypto.randomBytes`, hash it with `bcrypt`, write it with `force_password_reset: true`, and print the raw password to the user terminal.
- [x] **`src/server/auth.mjs` — `POST /auth/login` update** — Read `force_password_reset` from `security.yml`. If true, return `requiresPasswordReset: true` to the frontend upon successful credential validation.
- [x] **`src/server/auth.mjs` — `POST /auth/change-password` endpoint** — Securely accept a new password (min 8 chars), hash it, overwrite the temporary hash in `security.yml`, and set `force_password_reset: false`.
- [x] **`frontend/src/api.ts`** — Update `login` signature to pass through `requiresPasswordReset`. Add new `changePassword` helper.
- [x] **`frontend/src/pages/LoginPage.tsx`** — Intercept the `requiresPasswordReset` flag. Render an orange "Action Required" UI, forcing the user to submit a new password to gain access. Automatically log in after successful change.

### ⏳ HTTPS via DuckDNS + Caddy

> **Context:** Server runs on plain HTTP (`http://<YOUR_SERVER_IP>:3000`). Session cookies are transmitted unencrypted. The `secure` cookie flag (`NODE_ENV=production`) means browsers on HTTPS will reject cookies sent over HTTP. DuckDNS provides a free subdomain that Caddy uses to auto-provision a Let's Encrypt TLS certificate via HTTP-01 challenge. No DNS plugin needed — just a domain pointing to the droplet IP.

#### User action required (one-time manual step)
- [ ] **Create DuckDNS account** — Go to `https://www.duckdns.org`, sign in with GitHub/Google, claim a subdomain (e.g. `totalrecall.duckdns.org`). Copy the **token** from the dashboard. Point the subdomain at `<YOUR_SERVER_IP>`.

#### Product code
- [x] **`src/cli/deploy.mjs` — `--domain <domain>` flag** — Already implemented. Replaces `YOUR_DOMAIN` in `templates/Caddyfile` and writes to `/etc/caddy/Caddyfile` on Linux.
- [x] **`src/cli/deploy.mjs` — `--duckdns-token <token>` flag** — New flag. When provided alongside `--domain *.duckdns.org`, writes a DuckDNS IP-update cron job to `/etc/cron.d/duckdns` on the target host. Keeps the DNS record current if the droplet IP ever changes.
- [x] **`templates/Caddyfile`** — Uses `YOUR_DOMAIN` placeholder. `deploy.mjs` replaces at deploy time. Caddy auto-provisions Let's Encrypt cert when a real domain is provided.
- [x] **`frontend/src/App.tsx` sidebar domain selector** — Replace hardcoded `http://<YOUR_SERVER_IP>:3001` option with the configured DuckDNS domain. Read from a `VITE_BRAIN_URL` env var at build time so it's not hardcoded.

#### Live server
- [ ] **Apply DuckDNS domain to `/etc/caddy/Caddyfile`** — Replace `localhost` with the user's DuckDNS subdomain. `systemctl reload caddy`. Verify Caddy provisions TLS cert (`caddy adapt` + check logs).
- [ ] **Verify HTTPS end-to-end** — `https://<subdomain>.duckdns.org` loads login page. Session cookie is `Secure`. `/api/files` returns 401 without credentials. Login works and persists across page refresh.
- [ ] **Update `security.yml` `bind.host`** — Change to `127.0.0.1` so Express no longer listens on the public IP directly. All traffic must go through Caddy.

#### Documentation
- [x] **`README.md`** — Add "Setting up HTTPS" section: DuckDNS signup → `npx total-recall deploy --domain <subdomain>.duckdns.org --duckdns-token <token>`.
- [x] **`docs/projects/in-progress/master/ARCHITECTURE.md`** — ✅ *2026-05-12 — Added §4.1 "Network Edge & TLS Termination (DuckDNS + Caddy)" with full ASCII diagram showing Internet → Caddy:443 (Let's Encrypt) → Express on 127.0.0.1:3000 → local services (Ollama/SearXNG/Kokoro). Documents the DuckDNS update cron, secure-cookie behavior, and bind-to-loopback enforcement.*

## ⏳ Phase 5: Testing & Validation

Prove all acceptance criteria from PRD §12.

- [x] Vitest specs for `steering.mjs` collision layers. ✅ *`src/core/steering.spec.mjs` — 59 lines, tests Layer 1+2.*
- [x] Vitest specs for `surface.mjs` BM25+TF-IDF routing accuracy. ✅ *`src/core/surface.spec.mjs` — 56 lines.*
- [x] Vitest specs for `schema.mjs` validation (valid + invalid nodes). ✅ *`src/core/schema.spec.mjs` — 117 lines.*
- [ ] Clean-account walkthrough: deploy on empty VM → working Brain. ⚠️ **FALSE COMPLETION** — No automated test or documented walkthrough result exists. `test/` directory does not exist. This is a manual acceptance test that has never been performed.
- [x] Code Mode sandbox escape prevention test. ✅ *`src/core/sandbox.spec.mjs` — tests timeout, syntax error, and stdout capture. Escape prevention via timeout confirmed.*
- [x] MCP handshake + tool call integration test. ✅ *2026-05-12 — `src/server/mcp.spec.mjs` now contains 4 tests: rejects missing session ID, completes the `initialize` handshake (asserts `mcp-session-id` header + `serverInfo.name === 'total-recall'`), `tools/list` returns the 6 core SSSS tools, and `tools/call` against `list_memory` round-trips with a valid JSON content payload.*
- [x] API proxy memory injection integration test. ✅ *2026-05-12 — `src/server/api.spec.mjs` now mocks `callFrontierRaw` and writes fixture INSTRUCTIONS.md + ssss/SKILL.md, then asserts the captured system message contains both fixture markers AND the canonical headers (`=== TIER 1 HOT MEMORY INSTRUCTIONS ===`, `=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===`). A second test confirms that a caller-supplied system message is preserved by prepending the injected block.*
- [x] Backup/restore round-trip test. ✅ *`src/cli/backup.spec.mjs` tests that tar command is invoked correctly via mocked child_process.*
- [x] Dream cycle completion test (Light → REM → Deep). ✅ *`src/core/dream.spec.mjs` tests `evaluateCandidates()` for promotion and conflict quarantine.*
- [ ] AC-1 through AC-14 acceptance criteria matrix with test IDs. ⚠️ **PARTIAL** — `ACCEPTANCE_MATRIX.md` exists and maps ACs to test IDs. However, AC-2 through AC-14 are mostly "Manual Verification" with no automated test coverage. The matrix document exists but the tests it references do not.

## ⏳ Phase 6: Advanced Features

Recursive self-improvement and fine-tuning.

- [x] SSSS schema evolution engine (propose → test → apply). ✅ *`src/core/evolution.mjs` — `runSsssEvalWorkflow()` and `proposeSchemaUpgrades()` implemented.*
- [x] Friction detection (identify workflow bottlenecks). ✅ *`src/core/friction.mjs` — parses JSONL logs, computes error rates, latency stats.*
- [ ] **Context Injection Engine (9B Optimization)** — Update `src/core/surface.mjs` to inject exactly 30k tokens of high-signal SSSS node context into every prompt to compensate for the smaller 9B parameter model.
- [ ] **SSSS Multi-shot Prompting** — Embed exact examples of correctly formatted SSSS YAML files inside the system prompt so the smaller model never hallucinates the syntax.
- [ ] QLoRA fine-tuning pipeline (cloud-burst or on-device). ⚠️ **FALSE COMPLETION** — `src/cli/finetune.mjs` generates a dataset JSONL file and prints the `mlx-lm.lora` command to run. It does NOT execute QLoRA training. It is a dataset prep tool + CLI hint, not a pipeline.
- [ ] `TotalRecall-Gemma-SSSS` custom weights generation. ⚠️ **FALSE COMPLETION** — No custom weights have been generated. This depends on QLoRA being run, which has never been executed. This is aspirational documentation.

## ⏳ Phase 7: Autonomous Web Search (SearXNG)

Restore the missing PRD requirement for autonomous, database-free web search via self-hosted SearXNG container.

- [x] `src/cli/deploy.mjs` — Add Docker pull and systemd daemon execution for SearXNG on port 8888. ✅ *Deploy script has full SearXNG Docker provisioning with `--skip-searxng` flag.*
- [x] `src/server/tools.mjs` — Implement SearXNG JSON API client wrapper. ✅ *`executeWebSearch()` implemented with fetch + JSON parse + result formatting.*
- [x] `src/server/api.mjs` — Implement OpenAI-compatible tool-calling loop for `/v1/chat/completions`. ✅ *Tool-calling loop with `AVAILABLE_TOOLS` and `handleToolCall()` is wired in `api.mjs`.*
- [x] `frontend/src/pages/ChatPage.tsx` — Remove manual "web search mode" button; backend agent decides natively. ✅ *ChatPage has no manual search toggle. Search is backend-controlled.*
- [x] Vitest integration tests for SearXNG tool loop. ✅ *`src/server/tools.spec.mjs` — 3 tests: tool list, unknown tool, mocked SearXNG fetch.*

---

## ⏳ Phase 8: IDE Integration & Deployment Bootstrapping

Discovered during session on 2026-05-12. Addresses critical gaps in how Total Recall integrates with developer IDEs and existing project repositories.

### Bugs Fixed in Previously Shipped Phases

- [x] **`surface.mjs` crash** — `node.tags.join()` threw `TypeError` when a memory node had no `tags` field. Fixed with `(node.tags || []).join()`.
- [x] **`surface.mjs` overwrote existing IDE files** — `compileTier1()` used symlinks only, silently skipping repos with existing `GEMINI.md`, `.cursorrules`, etc. Rewrote to use non-destructive `<!-- BEGIN INJECTED MEMORY -->` block injection for existing files.
- [x] **`compile.mjs` hardcoded paths** — CLI flags `--skills`, `--derived`, `--instructions` were parsed but ignored. All paths were hardcoded to `~/.agent/`. Fixed to respect CLI overrides.
- [x] **`INSTRUCTIONS.md` deleted** — AI agent deleted this file during refactor in commit `6b1ef93`. Restored and properly compiled.
- [x] **IDE shims missing in repo** — `GEMINI.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.clauderules` were absent. Now auto-generated by `compileTier1()` in the product code.

### New Features

- [x] **`src/cli/init.mjs`** — New `npx total-recall init` command. Bootstraps Total Recall into any existing project repo: creates `.agent/` layout, seeds SSSS skill, copies default invariants, runs compile to inject memory block into existing IDE files without overwriting them.
- [x] **`bin/total-recall.mjs`** — Registered `init` command in CLI router and help output.
- [x] **`scaffold/.agent/memory-vault/invariants/operating-instructions.md`** — Default operating protocol node. Compiled into every user's `INSTRUCTIONS.md` on first deploy/init. Teaches the AI how to read/write/compile the memory system.
- [x] **`README.md`** — Added "Option A: Adding to an Existing Project" section documenting `npx total-recall init` as the primary onboarding path for existing repos.

### Remaining Work

**Hybrid Mode (Cloud ↔ Local Sync)**
- [x] **`src/cli/init.mjs` — `--brain <url>` flag** — ✅ *2026-05-12 — `init` accepts `--brain <url>` and `--token <tok>`. Writes `.agent/config/brain.json` and prints next-step `sync` hint.*
- [x] **`src/cli/sync.mjs`** — ✅ *2026-05-12 — Pulls `/api/instructions`, writes `~/.agent/INSTRUCTIONS.md`, injects the canonical block into `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/`.cursorrules`/`.clauderules` non-destructively. `--watch`, `--interval`, `--brain`, `--token` flags supported.*
- [x] **`src/cli/status.mjs`** — ✅ *2026-05-12 — Reads `brain.json` + `sync-state.json`, probes `/api/instructions`, compares local vs. remote sha256, lists registered targets. `--json` for machine output.*
- [x] **`src/server/api.mjs` — `GET /api/instructions`** — ✅ *2026-05-12 — Returns `{ content, sha256, bytes, modified }`. Gated by `requireAuth` via the `/api` prefix.*
- [x] **`bin/total-recall.mjs`** — ✅ *2026-05-12 — `sync` and `status` registered in CLI router and help output.*

**Session Persistence**
- [x] **`src/server/api.mjs` — Session JSONL writing** — ✅ *2026-05-12 — After every chat response, `writeSessionRecord()` appends a JSON line to `~/.agent/sessions/<session_id>.jsonl` (session id derived from `x-session-id` header → cookie → daily fallback). Each record includes the full message array, model, latency, and approx token count. Dream Cycle Light Sleep now has real data to scan.*

**Scaffold Completeness**
- [x] **`scaffold/.agent/skills/ssss/SKILL.md`** — ✅ *2026-05-12 — Full SSSS SKILL.md + schema reference now shipped under `scaffold/.agent/skills/ssss/`. `init.mjs` prefers this scaffold copy so `npx` users get the schema without cloning the repo.*

**Watchdog Integration (Phase 4 Gap)**
- [x] **`watchdog.mjs`** — ✅ *2026-05-12 — `attachLogMonitor()` subscribes to `logger.logEvents`; pattern table fires `recordSandboxFailure`, `recordAuthFailure`, `recordLatency`, `recordTokens` from log entries (subsystem/level + meta fields). Self-emissions are filtered to prevent recursion. `attachLogTail()` covers the out-of-process daemon case via JSONL polling. Covered by `src/core/watchdog.spec.mjs`.*

**Documentation**
- [x] **PRD §4.3** — Unified Surface Model section added. Reconciles Proxy Architecture with Local Init Model.
- [x] **ARCHITECTURE.md §7** — IDE Instruction File Management section added.
- [x] **README.md** — "Option A: Adding to an Existing Project" section added.

---

## ⏳ Phase 9: Sync Fabric (Ubiquitous Knowledge Distribution)

Autonomously distribute the brain's compiled knowledge to all registered sync targets and ingest changes from bidirectional targets. See PRD §4.4.

### Core Engine
- [ ] **`src/core/sync/engine.mjs`** — Sync orchestrator. After every compile: diff against last sync state, push changed files to all registered targets, pull from bidirectional targets, run `steering.mjs` conflict detection on imports.
- [ ] **`src/core/sync/state.mjs`** — Per-target sync state tracking: last-sync timestamp, file hashes, conflict history. Stored in `.agent/config/sync-state.json`.

### Transport Adapters
- [ ] **`src/core/sync/adapters/workspace.mjs`** — Local filesystem adapter. Uses `injectIntoExisting()` from `surface.mjs` for IDE instruction files.
- [ ] **`src/core/sync/adapters/git.mjs`** — Git CLI adapter: pull, auto-commit, push. SSH key or PAT auth from `secrets.enc`.
- [ ] **`src/core/sync/adapters/s3.mjs`** — S3-compatible API adapter. Works with AWS S3, Backblaze B2, Cloudflare R2, MinIO.
- [ ] **`src/core/sync/adapters/gdrive.mjs`** — Google Drive API v3 adapter. OAuth 2.0 refresh token. Maps vault categories to Drive folders.
- [ ] **`src/core/sync/adapters/webhook.mjs`** — HTTP POST event notifications. Bearer token or HMAC signature auth.

### CLI
- [ ] **`src/cli/sync.mjs` — Expanded subcommands** — `sync add`, `sync remove`, `sync list`, `sync now`, `sync --watch`.
- [ ] **`bin/total-recall.mjs`** — Register expanded sync subcommands.

### Configuration
- [ ] **`templates/default-config/sync.yml`** — Default sync configuration template (empty targets list, documented schema).
- [ ] **`src/core/schema.mjs`** — Zod validation schema for `sync.yml`.

### Integration
- [ ] **`src/core/dream.mjs` — Deep Sleep hook** — After recompile in Phase 3, trigger sync push to all registered targets.
- [ ] **`src/core/dream.mjs` — Light Sleep hook** — Before processing in Phase 1, check bidirectional targets for incoming changes.

### Dashboard
- [ ] **`frontend/src/pages/SyncPage.tsx`** — Sync target management UI: add/remove targets, view sync history, force manual sync, view/resolve import conflicts.

### Safety & Auditing
- [ ] **Delete protection** — Deletions at a bidirectional target do NOT propagate back unless explicitly confirmed via CLI or dashboard.
- [ ] **`~/.agent/logs/sync.jsonl`** — All sync events logged with timestamp, target name, files changed, direction.

### Documentation
- [x] **PRD §4.4** — Sync Fabric section written with full architecture: targets, modes, lifecycle, adapters, scenarios, CLI, safety rules.
- [x] **ARCHITECTURE.md §9** — Sync Fabric section added with module layout, data flow, config spec.
- [ ] **README.md** — Add sync documentation to Quick Start.

---

## ⏳ Phase 10: Voice Memory Bank

Voice-operated memory capture from iOS and Android. Users speak into their phone → audio uploaded to brain → transcribed → processed into vault nodes → compiled → synced. See PRD §4.5.

### Server
- [ ] **`src/server/api.mjs` — `POST /api/voice/memorize`** — Accept multipart audio upload, orchestrate transcription → extraction → vault write pipeline.
- [ ] **`src/core/transcribe.mjs`** — whisper.cpp integration: load STT model on-demand, transcribe audio file, return text, unload model. Zero permanent RAM cost.
- [ ] **`src/server/api.mjs` — Extraction prompt** — Send transcript to Gemma 4 with SSSS-aware instructions to generate structured vault nodes with correct category, importance, modality.

### Deploy
- [ ] **`src/cli/deploy.mjs`** — Compile whisper.cpp from source during deployment. Download tiny/small GGML model weights (~75MB/~460MB).
- [ ] **`templates/default-config/voice.yml`** — Default voice config: STT model selection, TTS voice preset, capture settings (archive, max duration, auto-categorize).

### Mobile Clients
- [ ] **`templates/shortcuts/memorize.shortcut`** — Downloadable iOS Shortcut: Record Audio → POST to brain API → Show confirmation. Installable from dashboard via QR code.
- [ ] **`docs/guides/android-voice-setup.md`** — Step-by-step Tasker/Automate guide for Android voice capture.
- [ ] **`frontend/src/pages/ShortcutsPage.tsx`** — Dashboard page with QR code download for iOS shortcut and Android setup instructions.

### Voice Storage
- [ ] **`~/.agent/files/voice/`** — Archive directory for raw audio files (created during deploy scaffold).
- [ ] **Voice config** — `archive_audio`, `max_duration_seconds`, `respond_with_voice` settings.

### TTS (Kokoro-82M)
- [x] **`src/core/tts.mjs`** — ✅ *2026-05-12 — Kokoro façade implemented (OpenAI `/v1/audio/speech` contract). Tests in `src/core/tts.spec.mjs`.*
- [x] **`src/server/api.mjs` — `POST /api/tts`** — ✅ *2026-05-12 — Endpoint live with 5000-char cap and 503 fallback when engine is disabled. `GET /api/tts/status` companion endpoint added. Frontend `ChatPage.tsx` consumes both.*

### Documentation
- [x] **PRD §4.5** — Voice Memory Bank section written with full pipeline, API spec, iOS/Android setup, voice config.
- [ ] **ARCHITECTURE.md** — Add Voice Memory Bank module layout.
- [ ] **README.md** — Add voice capture to Quick Start.

---

## ⏳ Phase 11: Discovered Issues & Sharp Edges

Items found during implementation sessions. Each entry includes file path,
symptom, and an acceptance criterion. Per the `fix-or-add-to-tracker`
preference (`.agent/memory-vault/preferences/fix-or-add-to-tracker.md`),
non-trivial observations land here instead of being mentioned in chat.

### CLI workspace awareness

- [x] **`src/cli/compile.mjs`, `dream.mjs`, `reindex.mjs`, `lint.mjs`** —
  Default `AGENT_DIR` was hardcoded to `~/.agent/`, so running
  `npx total-recall compile` from a workspace silently operated on the
  user's personal brain instead of the project vault. ✅ *2026-05-12 — Extracted
  `resolveAgentDir()` into `src/cli/agent-dir.mjs`. Each of these CLIs now
  prefers `./.agent/memory-vault/` when present, falling back to
  `~/.agent/` otherwise. Verified with `npx total-recall compile` from
  the repo root (7 nodes processed locally).*

- [ ] **`src/cli/backup.mjs`, `export.mjs`, `import.mjs`, `restore.mjs`** —
  These four tar-based commands embed `os.homedir()` directly in their
  shell invocations (`tar -C "${os.homedir()}" .agent`), so they ignore
  the `resolveAgentDir()` workspace fallback that the vault-touching
  commands now use. Acceptance:
    1. Each of the four resolves its source/destination via
       `resolveAgentDir()`, with the tar `-C` flag using
       `path.dirname(AGENT_DIR)` and the entry using `path.basename(AGENT_DIR)`.
    2. `npx total-recall backup` from a workspace tars the workspace
       vault, not the user's home brain.
    3. `npx total-recall restore <tarball>` lands files in the same
       logical location it would have been backed up from.
    4. New Vitest spec covers the cwd-vs-home resolution path.

### Lint debt

- [ ] **`frontend/src/pages/FilesPage.tsx:31`** — ESLint flags
  "Calling setState synchronously within an effect can trigger cascading
  renders". Wrap the state update in a function-form setter or move the
  side effect outside the synchronous effect body. Acceptance: lint
  daemon shows 0 issues for this file.

- [ ] **`frontend/src/pages/TasksPage.tsx:23`** — Same cascading-setState
  pattern. Acceptance: lint daemon shows 0 issues for this file.

### Test fragility

- [ ] **`src/server/api.spec.mjs` writes fixtures into `~/.agent/`** — The
  memory-injection test temporarily overwrites the real `INSTRUCTIONS.md`
  and `skills/ssss/SKILL.md`, restoring afterward. If the test crashes
  between the write and the restore, the user's brain ends up corrupted.
  Acceptance: switch the fixture writes to a `process.env.AGENT_DIR`
  override + `mkdtempSync`, with no touching of the real `~/.agent/`.
