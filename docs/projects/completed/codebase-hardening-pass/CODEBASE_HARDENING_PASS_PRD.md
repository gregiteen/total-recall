# Codebase Hardening Pass PRD

- **Plane**: Product
- **Status**: In Progress
- **Created**: 2026-05-21
- **Owner**: Total Recall

## Summary

Following two analysis passes against the Total Recall reference
implementation, this epic captures the resulting hardening work. Pass 1
focused on **structure** (file size, dependency surface, repo hygiene,
CI). Pass 2 focused on **runtime behavior** (rate limiting, performance,
observability, lifecycle, sandbox safety). Pass 1 was partly implemented
inline during the analysis session; this PRD also tracks the remaining
deferred items and the full set of Pass 2 findings.

The goal is a Total Recall codebase that:

1. Has no unguarded DoS surfaces — every authenticated route is rate
   limited; the sandbox endpoint is either truly isolated or default-off.
2. Serves memory CRUD without re-walking the vault on every request.
3. Logs through one structured channel; silent error swallowing is the
   exception, not the norm.
4. Resolves runtime configuration through one schema-validated module
   instead of 22+ inline `process.env.*` reads.
5. Shuts down cleanly on `SIGTERM`/`SIGINT`, draining in-flight requests
   and persisting background work.
6. Has internally consistent docs (route headers, README endpoint counts,
   bcrypt cost factors).

## Problem

The 2026-05-21 analysis surfaced the following classes of issue:

### Pass 1 (structural — partly resolved this session)

1. **Megafiles.** `src/server/rest.mjs` (1641 LOC), `src/cli/deploy-ui.mjs`
   (1633), `src/core/fact-seeker.mjs` (1554), `src/cli/deploy.mjs` (1134),
   `src/cli/connect.mjs` (833), `src/core/session-watcher.mjs` (850) all
   mix several concerns in one file.
2. **CLI sprawl.** `init.mjs`, `setup.mjs`, `deploy.mjs`, `deploy-ui.mjs`
   independently re-implement parts of provisioning and onboarding.
3. **Two password hashers.** `argon2` and `bcrypt` both declared as
   dependencies.
4. **No type safety on a 30k LOC JS server.** Hand-rolled validation in
   most handlers despite `zod ^4.4.3` being in deps.
5. **Tests shipped to npm.** `package.json#files` listed `src/` wholesale,
   bundling every `*.spec.mjs` into published tarballs.
6. **Repo cruft + Windsurf.** Stray root files (`manual-test-agent.mjs`,
   `gemini_help.txt`) and a defunct vendor (Windsurf, dissolved July 2025).
7. **No CI.** No `vitest` workflow despite a `test` script and 250 tests.

### Pass 2 (runtime — not yet addressed)

1. **Rate limiter has a hole.** `apiRateLimiter()` is mounted on `/v1/*`
   but not on `restRouter` (`/api/*`), so the entire 50-route admin
   surface — including `POST /api/sandbox` — has no throttle.
2. **`loadNodes()` re-walks the vault on every memory request.** Even
   `GET /api/memory/:slug` reads + YAML-parses every `.md` in the vault.
   With 200 nodes that's hundreds of syscalls per request.
3. **Observability gap.** 620 `console.*` calls in `src/` vs 144
   `logger.*` calls (4:1). 170 silent `catch {}` blocks. Operators have
   neither structured logs nor exception trails when something fails.
4. **Scattered config.** 22+ environment variables read inline at use
   sites; `AGENT_DIR` resolved independently in 20+ files with the same
   duplicated fallback.
5. **No graceful shutdown.** `src/server/index.mjs` ends at `app.listen()`
   — no `SIGTERM`/`SIGINT` handler, in-flight requests get cut, background
   `setImmediate` embed work may drop on restart.
6. **The "sandbox" isn't.** `core/sandbox.mjs` spawns `node script.mjs`
   with an env whitelist and a timeout. The child can read/write anywhere
   on disk, make network calls, and spawn subprocesses.
7. **Doc drift.** `rest.mjs` header lists `POST /api/memory/compile`
   (actual: `/api/vault/compile`); README says "20+ endpoints" (actual:
   58); bcrypt cost factor is 10 in five places and 12 in one (the
   `hash-password` CLI).
8. **Dependency Bloat & Metadata Drift.** Purge `@modelcontextprotocol/sdk` from dependencies and `"mcp"` keyword in `package.json` to reflect full purging of the MCP protocol. Clean up unused `child_process` imports from `src/core/daemon-loop.mjs`.
9. **Insecure File Creation Permissions.** Enforce strict POSIX owner-only (`0o600`) write permissions for sensitive credential files like `secrets.enc` in `src/core/crypto.mjs`.
10. **Fragile Dynamic Imports.** localized try-catch blocks and cleaner error paths for runtime optional/dynamic dependencies (such as `playwright` in `src/server/tools.mjs` and `child_process` in `src/core/fact-seeker.mjs`).

## Non-Goals

- This epic does **not** convert the server to TypeScript. JSDoc
  `// @ts-check` is in scope only for files touched by other tasks.
- This epic does **not** rewrite `deploy-ui.mjs` / `connect.mjs` /
  `session-watcher.mjs`. The route-extraction pattern from `rest.mjs`
  has been demonstrated; those follow in a future epic.
- This epic does **not** add a full OpenAPI spec — only fixes drift in
  existing docs.

## Acceptance Criteria

The system is release-ready for this epic when:

- [ ] `/api/*` routes are throttled by `apiRateLimiter()` and `/api/sandbox`
      has a strict per-key limit.
- [ ] `GET /api/memory/:slug` does not walk the vault on every request
      (cached + invalidated by writes or fs.watch).
- [ ] `src/core/config.mjs` exists, exports a zod-validated frozen config,
      and is the only place `process.env.AGENT_DIR` is read.
- [ ] `src/server/index.mjs` handles `SIGTERM` and `SIGINT` with a 10s
      drain and exit.
- [ ] `core/sandbox.mjs` is either hardened (Node 24 `--permission`
      flags) or default-off in `security.yml`.
- [ ] Internal docs match code: `rest.mjs` header lists actual routes;
      README endpoint count is accurate; bcrypt cost factor is one constant.
- [ ] Obsolete `@modelcontextprotocol/sdk` dependency is purged from `package.json` and all unused imports are removed.
- [ ] Secrets and highly sensitive local key files are created with owner-only access (`0o600`).
- [ ] All dynamic imports feature safe, caught validation boundaries.
- [ ] All 250 existing tests still pass; new tests cover the rate limiter
      wiring, graceful shutdown, and config validation.
