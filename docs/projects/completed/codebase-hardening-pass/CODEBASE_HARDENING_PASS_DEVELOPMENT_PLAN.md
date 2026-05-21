# Codebase Hardening Pass Development Plan

- **Plane**: Projects
- **Status**: In Progress
- **Created**: 2026-05-21

This plan sequences the Codebase Hardening Pass epic. Phases are ordered so
that already-shipped Pass 1 work is checked in first, then small/no-risk
runtime fixes land before larger refactors, and a Testing phase closes the
epic. Every step maps to a checkbox in
`CODEBASE_HARDENING_PASS_PROJECT_TRACKER.md`.

## Phase 0 — Pass 1: Structural (Already Shipped)

Recorded for completeness. These were implemented during the analysis
session on 2026-05-21:

- Removed all Windsurf integration code (connect, setup, sync, rest,
  README, symlinks, guide).
- Dropped `argon2` from `dependencies` after confirming `src/core/crypto.mjs`
  had no callers; migrated KDF to Node built-in `crypto.scrypt`.
- Cleaned root cruft: untracked `manual-test-agent.mjs` and
  `gemini_help.txt`; added them to `.gitignore`.
- Excluded `*.spec.mjs` from `package.json#files` so tests no longer ship
  to npm consumers.
- Added `.github/workflows/test.yml` running `vitest` on Node 20 + 22.
- Extracted `routes/memory.mjs`, `routes/keys.mjs`, `routes/sessions.mjs`,
  and `routes/_shared.mjs` from `src/server/rest.mjs`. Sub-routers mounted
  before remaining inline handlers — URL precedence unchanged. `rest.mjs`
  dropped from 1641 → 1142 LOC. All 250 tests passing.

Exit: tracker Phase 0 checkboxes all `[x]`.

## Phase 1 — Rate Limiter Wiring

Closes the highest-leverage DoS gap surfaced in Pass 2. Trivial change set,
disproportionate security win.

- Mount `apiRateLimiter()` on `restRouter` in `src/server/index.mjs` so all
  `/api/*` routes inherit the limit currently applied only to `/v1/*`.
- Add a stricter, per-key limiter specifically for `POST /api/sandbox` and
  `POST /api/sessions/ingest` (e.g. 10/min for sandbox, 120/min for
  ingest). Export from `auth.mjs`.
- Update `server/integration.spec.mjs` to assert that hitting `/api/*`
  beyond the configured threshold returns 429.

Exit: `npm test` passes; manual `curl` loop against `/api/sandbox` returns
429 after threshold.

## Phase 2 — Graceful Shutdown

Tiny, no-controversy fix that makes the brain safe to restart.

- In `src/server/index.mjs`, capture the `server` returned by `app.listen()`,
  attach `SIGTERM` and `SIGINT` handlers that call `server.close(cb)` and
  schedule a 10s hard-exit fallback with `.unref()`.
- Log the shutdown event through `logger.info`, not `console.error`.
- Ensure the embed-on-ingest `setImmediate` in `routes/sessions.mjs` does
  not leave the process hanging — drain or skip on shutdown.

Exit: sending `SIGTERM` to a running `npm start` exits cleanly within 10s;
in-flight requests finish.

## Phase 3 — Doc Drift Reconciliation & Metadata Hardening

Cheap correctness and hygiene work surfaced in Pass 2.

- Rewrite the JSDoc header at the top of `src/server/rest.mjs` to match the
  actual route inventory (the file now mounts three sub-routers; the header
  still lists routes that moved, and one stale path — `POST
  /api/memory/compile` — that never existed in the live code).
- Fix the README "20+ endpoints" line to reflect the real count (58).
- Centralize the bcrypt cost factor: introduce `BCRYPT_COST = 12` in
  `src/server/auth.mjs`, import it everywhere `bcrypt.hash(..., 10|12)` is
  called (deploy.mjs, deploy-ui.mjs, reset-password.mjs, hash-password.mjs,
  auth.mjs). 12 matches OWASP 2026 recommendation.
- Purge `@modelcontextprotocol/sdk` from dependencies in `package.json` and delete the `"mcp"` keyword. Remove any residual or unused MCP imports.
- Clean up unused imports of `execSync` and `execFileSync` in `src/core/daemon-loop.mjs`.
- Audit sensitive files writes (e.g. `secrets.enc` in `src/core/crypto.mjs`) and configure `fs.writeFileSync` to write with owner-only access (`{ mode: 0o600 }`).

Exit: `grep -rn "bcrypt.hash" src/` shows only one literal cost; route
documentation matches `router.METHOD` declarations in source; package.json no longer lists `@modelcontextprotocol/sdk`.

## Phase 4 — Sandbox Hardening Or Default-Off

`POST /api/sandbox` is currently RCE-as-a-service behind one auth check.
Two acceptable resolutions:

- **Option A (preferred):** Add Node `--permission --allow-fs-read` /
  `--allow-fs-write` limited to the sandbox temp dir and drop network
  access via `--no-addons` / process-level firewall. Requires Node ≥ 22.
- **Option B (fallback):** Mark the route default-off in
  `security.yml.sandbox.enabled`; gate it in `auth.mjs` with a clear log
  line when an admin enables it.

Pick one based on the Node baseline we're willing to require. Update
README and the `rest.mjs` header comment accordingly.

Exit: enabling `sandbox:run` scope and hitting `/api/sandbox` cannot read
arbitrary files; tested via `fs.readFileSync('/etc/passwd')` payload.

## Phase 5 — Vault Cache

Largest performance win in the epic. Memoizes the result of
`loadNodes(VAULT_DIR)` so memory routes serve from in-memory state instead
of walking the disk per request.

- Introduce `src/core/vault-cache.mjs` that exports `getNodes(vaultDir)`,
  `invalidate()`, and an `fs.watch()` registration on first call.
- Replace direct `loadNodes(VAULT_DIR)` calls in `routes/memory.mjs` (and
  any remaining callers in `rest.mjs`) with `getNodes(VAULT_DIR)`.
- After `writeNode` and the delete branch in `routes/memory.mjs`, call
  `invalidate()` explicitly so single-process writes are immediately
  reflected without waiting for the watcher.
- Add a unit test that creates two nodes, lists, deletes one, lists again,
  and verifies that the second list comes from cache (e.g. by spying on
  `walkMd`).

Exit: `loadNodes` is called once at boot + once per vault change, not per
request. New test passes.

## Phase 6 — Central Config Module

Eliminates 22+ scattered `process.env.*` reads and the duplicated
`AGENT_DIR` fallback across 20 files.

- Create `src/core/config.mjs`:
  - Read all env vars at module load.
  - Validate with zod (already in deps): URLs are URLs, ints are ints,
    booleans accept `1`/`true`/`yes`.
  - Export a frozen object: `{ agentDir, ollamaUrl, ollamaModel,
    searxngUrl, embedModel, dailySearchLimit, brave, exa, github,
    serper, tavily, researchCooldownMs, sessionSecret, nodeEnv, port,
    host, displayEnv }`.
  - Throw with a readable message on validation failure.
- Migrate `src/server/routes/_shared.mjs`, `src/server/index.mjs`,
  `src/server/rest.mjs`, `src/core/logger.mjs`, `src/core/embeddings.mjs`,
  `src/core/runtime.mjs`, `src/core/source-adapters.mjs`,
  `src/core/scheduler.mjs`, `src/core/research-queue.mjs`,
  `src/core/fact-seeker.mjs`, `src/core/tts.mjs`, `src/core/watchdog.mjs`,
  `src/core/daemon-loop.mjs`, `src/core/import-rules.mjs`,
  `src/core/emergency-alerts.mjs`, `src/core/crypto.mjs`, `src/cli/*.mjs`
  to import from `config.mjs` instead of touching `process.env` directly.
- Keep `_TR_TEST_AGENT_DIR` and other test-only overrides — they can still
  be honored, but inside `config.mjs`.
- Update `.env.example` to enumerate every variable `config.mjs` honors.

Exit: `grep -rn "process.env." src/ --include="*.mjs" | grep -v spec.mjs |
grep -v "src/core/config.mjs"` is empty.

## Phase 7 — Logger Discipline & Dynamic Import Hardening

Cuts the `console.*` noise, reveals runtime events, and ensures optional dependencies load safely.

- Audit the 620 `console.log/warn/error` calls in `src/server/` and
  `src/core/`. CLI files (`src/cli/`) keep `console.*` — they're user-
  facing.
- Replace each server/core `console.*` with the appropriate
  `logger.{info,warn,error,debug}` call. Where the original was purely
  decorative startup output, route through `logger.info` with a clear
  subsystem.
- Add an ESLint rule (`no-console`) scoped to `src/server/` and `src/core/`
  in `eslint.config.js` so this doesn't regress.
- Sweep the 170 silent `catch {}` / `catch (_e) { /* non-fatal */ }`
  blocks: each becomes `logger.debug('subsystem: operation failed', { err })`
  unless the swallow is genuinely intentional and documented inline.
- Audit all dynamic `import(...)` call sites (such as `playwright` in `src/server/tools.mjs` and dynamic imports in `src/core/fact-seeker.mjs`) and wrap them in robust catch blocks returning descriptive, clean error results instead of failing silently or crashing.

Exit: `npm run lint` reports zero `no-console` violations under
`src/server/` and `src/core/`; all dynamic imports feature safe fallback bounds.

## Phase 8 — Testing & Verification

Closes the epic. No work moves to `completed/` without this phase green.

- `npm test` — all suites pass (target: ≥ 250 tests, none skipped due to
  this epic's changes).
- Add a route-inventory test: enumerate `router._router.stack` and assert
  it matches a JSON manifest committed alongside the test, so future doc
  drift fails CI loudly.
- Add a fuzz/load smoke test for the rate limiter (hammers `/api/memory`
  and asserts 429 after threshold).
- Clean-Account VFS Init: provision a fresh `AGENT_DIR`, run
  `npx total-recall init` + `connect claude-code` + start server +
  ingest a test session + memory CRUD round-trip + graceful SIGTERM.
- Verify no new lint warnings in `start-here-lint.mjs`.

Exit: tracker testing checkboxes all `[x]`, no regressions.
