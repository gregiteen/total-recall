# Changelog

## [3.23.3] — 2026-08-15

### 🐛 Bug Fixes
- **`/health` took 25-57 seconds**: for every active brain the handler parsed every node in that brain's vault and loaded that brain's embeddings index — 12MB on the machine this was found on — all inside the request. Measured on a loaded laptop: `/health` 39s, 28s, 31s, 55s, 55s while the dashboard on the same server answered in 116ms. This is the worst endpoint to make slow, because `/health` is what the watchdog and every monitor poll: a liveness probe that times out is indistinguishable from a server that is down, and it was in fact misread that way — the server was declared dead and restarted repeatedly while it was serving the UI normally the whole time. Coverage is now computed off the request path behind a single-flight 30s cache, bringing `/health` to 0.27-2.8s. A cache would trade one wrong answer for another if it could pass a stale reading as current, so the response carries `embedding_coverage_as_of`, reports "no reading yet" as null rather than as clean, and keeps the previous reading and its original timestamp when a refresh fails — the degraded-vector-search signal this reading exists to raise cannot be hidden by a failed refresh.

## [3.23.2] — 2026-08-15

### 🐛 Bug Fixes
- **3.23.0 and 3.23.1 shipped a dashboard bundle without their own feature**: `frontend/dist/` is gitignored but listed in `files`, so the tarball takes whatever build happens to be on the publishing machine's disk — nothing tied it to the sources beside it. Both releases therefore shipped the mesh access UI as source next to a bundle built five days earlier, and the dashboard those packages actually serve does not have the feature the release was about. Verified against the published tarball: `frontend/src/pages/MeshPage.tsx` carries the UI, `frontend/dist/assets/index-DJjuZ3t3.js` does not. No test or gate could see it — the sources are correct, and the stale bundle is not compiled from them. This release ships a bundle built from the current sources, and `prepublishOnly` now refuses to publish when the bundle is older than `frontend/src`, `index.html`, the vite config, or the frontend manifest. It checks rather than builds, so publishing does not start a vite build on whatever machine runs it.
- **The quality gates could report clean while failing**: both reporters derive their per-file view from a regex over the report body, then print "✅ No problems found" whenever that view comes back empty — without consulting the exit code the tool actually returned. Any diagnostic the regex cannot match therefore reads as an all-clear. One does not match: "Unused eslint-disable directive (no problems were reported from '<rule>')" ends in a quote and a paren rather than a trailing rule id, so a red gate printed green. That is how 3.23.1 shipped with lint exiting 1. `TOTAL_ERRORS` and `EXIT_CODE` come from ESLint and tsc themselves; when they disagree with the parser, the tool is right — so both reporters now print the raw report body and exit non-zero instead of inventing a success, and a run that prints problems can no longer also exit 0.
- **Unused lint directive**: removed the stale `react-hooks/set-state-in-effect` disable in `OpenWikiPage` — the problem it suppressed no longer occurs, which is what the gate was reporting.

## [3.23.1] — 2026-08-15

### 🐛 Bug Fixes
- **Daemon refused to start after PID reuse**: 3.23.0 fixed this for the server's lock but left the daemon's, which carried the same check — and the same bug. Found live on a developer machine, where `daemon.pid` held a PID the OS had since handed to an unrelated desktop app: the liveness test passed, and the daemon would have exited with "another daemon is already running" on every start from then on. Both locks now share one adjudicator (`core/pid-lock.mjs`) that requires the process to look like the program that wrote the lock.

## [3.23.0] — 2026-08-15

### 🚀 Features
- **Node access is mesh state**: a `mesh_node` entity now carries an `access` record — login account, port, key path, Tailscale build variant, and mesh-SSH capability. The control server can say a machine is up but not which account you reach it as, and connecting as the wrong user is refused in exactly the way an unreachable host refuses. That fact previously lived only in each operator's `~/.ssh/config`, where no other machine and no agent could read it.
- **`mesh ssh <node>`**: opens a session using the recorded access — no username, address, or key path to remember. A configured identity is pinned with `IdentitiesOnly` so a crowded agent cannot offer the wrong key first and get refused before the right one is tried.
- **`mesh access` / `mesh access import`**: show or record access, or propose it from this host's ssh config. Proposals are shown before they are applied — a wrong login written to the vault is worse than none, because it then looks authored. The config's `HostName` is deliberately never imported: it is usually a LAN address, correct only from the machine that wrote it, while the mesh address works from anywhere.
- **Mesh dashboard**: nodes list their resolved login, the detail pane shows and edits access, and a banner names any node whose login is unknown, offering the ssh-config import. Address precedence is resolved server-side so the UI cannot drift from the CLI.
- **Keychain as a master-password carrier**: `secret rekey` previously updated only file carriers (LaunchAgent plist, env file). On macOS a shell profile typically reads the password from the Keychain, which was invisible to it — so a rotation re-encrypted the store, reported success, and left every interactive shell holding the retired password. The Keychain entry is now included automatically when present (`--keychain <service>` / `--no-keychain`), with a pre-flight match check, verification, and rollback. The password is passed to `security` on **stdin, never argv**.

### 🐛 Bug Fixes
- **Route manifest drift**: two routes shipped in `08409ce` were never added to `route-manifest.json`, leaving that spec red on `main`. Extraction now lives in a shared `route-inventory.mjs` used by both the spec and a new `npm run routes:manifest` generator, so the tripwire can no longer be defeated by having no way to update it.
- **`tailscale status` timeout**: 2s in discovery and 5s in enrollment against a measured 1.2–1.7s baseline. A timeout returned nothing, the mesh read as completely empty, and every node reported missing rather than unknown — indistinguishable from never having enrolled. One shared 10s constant.
- **Tailscale CLI lookup**: resolution fell back to a bare `tailscale`, which is not on `PATH` for macOS GUI installs — the machines most likely to need it.
- **Duplicate node entities**: entities were keyed on the fully-qualified hostname, so a tailnet rename minted a second document per machine. Now keyed on the short label.
- **Legacy node documents**: a patch validates the whole resulting document, and the earliest `mesh_node` entities predate `title`/`description` becoming required — so every write to one failed validation permanently, including the access record it most needed. Missing required fields are backfilled on write.
- **Store format detection**: an encrypted store opens with a random 16-byte salt, so its first byte is `{` about once in every 256 stores (measured 17 in 5000). Five copies of a "first byte is `{` therefore plain JSON" check decided the format from that byte; `migrateSecretsToEncryptedIfNeeded` consequently reported valid ciphertext as `not-json` and told its caller the store still needed migrating. One shared check that parses instead of guessing.
- **PID lock blocked startup after PID reuse**: the server's lock only tested whether *something* was alive at the recorded PID. PIDs are recycled aggressively after a reboot — one machine's lock pointed at a system daemon, and the server exited with "another server instance is already running" on every boot thereafter. A lock is now honored only when the process also looks like this server.
- **Panel refetch on unmount**: `EmbeddingProviderPanel` could apply a response after unmount or let a slow response overwrite a newer one.
- **Stale detail pane**: the mesh page captured the selected node object, so polling could not update it — including immediately after saving an edit.

### 🧪 Testing
- New specs for mesh access resolution, the self-node entity write, the Keychain carrier and its rollback, and PID-lock adjudication.
- `supportsTailscaleSsh` took its daemon signal from the real filesystem, so its macOS cases would invert on any machine with the Homebrew formula installed; the signal is now injected, and the previously untested macOS-with-daemon case is covered.
- Removed a genuinely flaky assertion that the migrated store's first byte is not `{` — a property the format does not guarantee.

## [3.21.3] — 2026-08-08

### 🐛 Bug Fixes
- **Code Quality**: Fixed strict type checking (`@typescript-eslint/no-explicit-any`) across frontend components and specs.
- **React State Warnings**: Resolved synchronous `setState` cascading warnings inside `useEffect` by wrapping them in `setTimeout`.
- **Hoisting**: Fixed variable access initialization errors in `RulesPage`.

## [3.19.2] — 2026-07-21

### 🧪 Testing
- **`logger.mjs` test-isolation sweep**: extends 3.19.1's `webhook-handlers.spec.mjs` fix across the rest of `src/core/` — 37 spec files transitively imported `logger.mjs` without mocking it, so running the suite appended real JSON lines into the actual global brain's `logs/` directory on every run. `watchdog.spec.mjs` needed a different fix since it exercises the real `logger`/`logEvents` EventEmitter wiring — mocked `config.mjs`'s `brainDir` to a throwaway path instead of mocking `logger.mjs` itself.
- **`obsidian-sync.spec.mjs` real-write leak**: its "surfaces conflict" test mocked `node:fs` but not the bare `fs` specifier used by `task-envelope.mjs`/`vault.mjs`, so `addTask()` ran for real and wrote actual task files into `<repo>/brain/scheduler/queue/` on every run, using the test's literal fixture args. Mocked `task-envelope.mjs` directly (matching `github-sync.spec.mjs`'s existing pattern) and strengthened the test to assert the conflict task is actually queued.

## [3.19.1] — 2026-07-21

### 🐛 Bug Fixes
- **Skills page "Global" repo 404s**: viewing/editing/auditing any skill under the synthesized "Global" catalog repo (`repo-expert`, `security`, etc.) 404'd — `resolveRegisteredProject` only checked `project-registry.json`, which never contained the synthetic Global entry.
- **Rules page ignored the brain selector**: `/api/rules` always resolved via `getBothBrains()` (the server process's own `cwd()`), never the selected brain — every brain showed the same two vaults regardless of selection. Now scoped through the shared `resolveAllVaultsFromQuery`, matching memory/graph/skills.
- **Skills page brain-selector integration**: multi-brain (comma) selection collapsed the repo list to just "Global"; the enable/disable-skill checkbox compared against `'Global'` (capital) instead of the real `'global'` id so it never gated correctly; and the deploy/toggle calls passed the raw brain id (e.g. `project:foo`) straight through as a filesystem path instead of the actual registered project path.
- **Misleading search-availability warning**: "no paid web-search key" warning named services generically instead of the actual env vars (`BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `SERPER_API_KEY`).
- **Network-policy audit events**: no longer written through the full SSSS kernel commit path inline (`processViaPackageKernel`/`getTotalRecallEngine` measured 30s+ per call on this vault) — queued and flushed on a deferred macrotask so it never blocks concurrent request I/O; in-memory audit log remains the network audit trail until the kernel commit path itself is fixed.
- **Duplicate server instances**: a second instance losing the `listen()` port race used to hang forever with no bound port; now fails fast via a PID lockfile + `error` handler, mirroring the daemon loop's lock pattern.
- **Skill sync**: `isRepoScopedSkill` now also scans known repos for live-but-undiscovered copies (previously only the registry-tracked ones), and stale auto-generated skill dirs (e.g. from `repo-expert-generate.mjs`) self-heal onto the canonical source even without `--force`.

### 🚀 Features
- **Provider account tracking**: new `/api/secrets/account-sync`, `/api/secrets/shared-values`, `/api/secrets/tracking-health` endpoints.

### 🧪 Testing
- Raised vitest's global `testTimeout` (5s → 20s) — several unrelated tests (scrypt-backed secrets round-trips, module-init-heavy imports) were intermittently timing out purely from CPU contention with the rest of the suite, not logic errors.
- Fixed a test-isolation bug where `recall`'s merged search read the real global vault instead of the test's isolated fixture (missing `_TR_TEST_AGENT_DIR` override — `detectProjectBrain` ignores `AGENT_DIR`).
- Fixed a broken `webhook-handlers.spec.mjs` mock (unmocked `logger.mjs` tried a real `mkdirSync` under a fake root-level `brainDir`).
- Fixed `pruning-optimization.spec.mjs` treating `writeOrUpdateConsolidatedDraft`'s return value (a memory-node slug) as a filesystem path.

## [3.19.0] — 2026-07-21

### 🐛 Bug Fixes
- **Embeddings provider order**: OpenRouter tried first (Gemini's budget is exhausted), falling back to Google/OpenAI — avoids taxing every embedding call with a slow Google timeout first.
- **Secrets config merge**: multiple `secrets.enc` stores (global root vs. the total-recall skill's own) now merge instead of the first non-empty file silently winning and hiding real values in a later store.

### 🚀 Features
- **OpenRouter embeddings**: `OPENROUTER_API_KEY` config support end-to-end as a first-class embedding provider.

## [3.18.4] — 2026-07-20

### 🐛 Bug Fixes
- **Project brain routing**: `resolveBrainDir` honors `--global` / `--project` / auto (no longer always global); `forget --project` works.
- **Remember dedup**: Word Jaccard used real `\b\w+` tokens; archive writes use gray-matter YAML.
- **Multi-brain API**: Semantic search, vault compile/status/hash, dream, field, context, export, import, dashboard, conflicts, and share honor `brain` query/header via `pathsForVault`.
- **Instructions GET**: Defined `sendTextResource`; GET/PUT share path resolution (no crash / path mismatch).
- **Daemon instructions path**: Surfaces compile from agent root (`~/.agent/INSTRUCTIONS.md`), not `brainDir`.
- **Vault file paths**: `loadNodes` attaches `_filePath`/`_filepath`; clarity stamps invalidate vault root; API strips internal paths.
- **Docs path safety**: Resolve under vault only (no traversal).
- **Forget cache**: Invalidate after delete and `--project-all` trash.
- **Self-captured titles**: Default titles from body; provenance via `self-captured` tag + `source.capture`; migration script cleans description/citations.

### 🚀 Features
- **Research web search**: Prefer SearXNG (`SEARX_URL`) with full provider fallback; research queue actually writes memory nodes.
- **Provider account tracking**: Live usage/subscription probes + shared-key detection on secrets.
- **Package auto-update API**: Returns `success` correctly for dashboard.

## [3.18.3] — 2026-07-19

### 🚀 Features
- **SearXNG research**: Prefer mesh/local SearX for research web search.
- **Secrets tracking**: Provider account sync + shared-value detection.

### 🐛 Bug Fixes
- **Research queue**: Produce real memory nodes; fail empty phases; require node_slug.
- **Webhooks**: Coalesce GitHub push deploy tasks (no deploy flood).
- **Update API**: Package auto-update reports success correctly.

## [3.18.2] — 2026-07-18

### 🐛 Bug Fixes
- **Embeddings CI**: Runtime API key resolution; sqlite-vss bare-path load + JSON-only fallback when VSS unavailable.
- **Sandbox timeout**: SIGKILL after timeout (no unshare orphan loops on Linux).
- **Skill specs**: Import skill-deploy helpers from git-tracked scaffold.
- **Route manifest**: Regenerated to 187 routes.

## [3.18.1] — 2026-07-18

### 🚀 Features
- **Package auto-update hook**: Daemon cron + boot + `total-recall update [--apply]` auto-installs `total-recall-brain@latest` into every project-registry / `TR_SYNC_REPOS` root that already depends on the package. Opt-out: `TR_AUTO_UPDATE_PACKAGE=0`. Source monorepos are skipped (git, not npm into self). APIs: `GET/POST /api/update/check|run` report multi-project status.

## [3.18.0] — 2026-07-18

### 🚀 Features
- **Mesh device entities**: `mesh_node` entity variables (role, labels, capabilities, notes, interfaces, I/O profile); live Tailscale/LAN merge without hardcoding fleet names.
- **LAN discovery & register**: Interface kind classification, ARP/neighbor LAN scan, TR `/health` probe, `POST /api/mesh/lan/register` for TR-reachable peers.
- **Mesh latency UX**: From-this-node latency matrix + RTT sparklines; `GET /api/mesh/latency` through the fetch gate.
- **Durable election history**: SSSS `mesh_election` events on isolated workspace `mesh-election` (avoids scanning huge default.jsonl); dashboard loads history.
- **Webhook re-deliver**: `POST /api/webhooks/events/:id/redeliver` + Webhooks UI button; webhook events isolated to workspace `webhooks`.
- **Network gate indicator**: Sidebar green/amber/red from `/health` `fetch_gate` stats; Network page live path.
- **Mesh Auto-Bind**: Server binds mesh IP plus loopback when enrolled (`src/core/network-bind.mjs`).
- **Mesh Auth & VFS Documents**: `mesh-auth` and `vfs-documents` SSSS primitives with specs.
- **minIntervalMs gate**: Per-domain minimum interval on throttled-fetch; policy parity + knobs.
- **Deterministic leader election**: Lowest mesh IP; `FAILOVER_BOUND_MS` documented; lease redesign cleaned up.
- **Cline connect surface**: CLI connect/import/protect for Cline rules.
- **Auto-pull frontend rebuild**: Cloud `auto-pull.sh` runs vite build after pull so gitignored `frontend/dist` stays current.

### 🐛 Bug Fixes
- **`/health` fetch_gate**: Gate stats exposed on public health (not only `/api/health`).
- **Secrets migrate**: Boot re-encrypts plain-JSON `secrets.enc` when `TR_SECRETS_PASSWORD` is set; project `.agent` and brainDir both migrated.
- **Publish secrets**: `publish.mjs` loads `npm_token` via AES secrets-store (no plain JSON requirement).
- **Site-wide 401 (auth catch-22)**: Scoped headscale auth so login/static are not gated by pathless middleware.
- **Mesh HTTPS exemption**: Mesh CGNAT/Tailscale sockets exempt from HTTPS redirect (WireGuard already encrypts).
- **Damaged lockfile**: Regenerated `package-lock.json` for clean installs.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.18.0`.

## [3.17.0] — 2026-07-16

### 🚀 Features
- **Headscale Mesh Integration**: UI and backend primitives to provision Total Recall into a Headscale WireGuard mesh.
- **Webhooks & Network Policies**: Webhooks UI and default firewall policies for outbound agent fetch.
- **Network Safety**: Centralized `secrets-store` and `throttled-fetch` for rate-limited cross-node communication.

### 🐛 Bug Fixes
- **Skill Sync Fix**: `skill sync` no longer pollutes `.agent` with global `.claude` / `.agents` fallback directories.

## [3.15.0] — 2026-07-15

### ✨ Features
- **Surface Compilation Fixes**: Stripped redundant memory prefixes without triggering duplication bugs, enforced importance-based filtering to preserve token budget, elevated rule instructions to the top of surfaces, and improved deductive similarity algorithms to prevent accidental archival of valid rules.
- **Rules Dashboard UI**: Created a complete Rules Page UI allowing real-time viewing and management of invariants, preferences, and corrections from the web interface.
- **TR Stabilization**: Conducted comprehensive cross-repository skill contamination cleanup across `total-recall`, `festech.live`, and other linked projects. Completed backend route and API decomposition to eliminate bloated monolithic routers, migrated to decoupled brain layers, and established a Tamper-Proof Push Gate.
- **Skills Management Upgrade**: Delivered a new Skills system enabling global template installations with automatic repo-level adaptation, secure `.trash` retention for removed skills, and interactive UI rule rendering. Added agent-driven `skills.sh` registry integration for native package discovery.
- **Fast Recall**: Introduced a high-speed substring-matching `fast-recall` subsystem to provide <200ms searches for memory nodes without triggering full semantic evaluations.
- **100% Test Coverage**: Resolved all underlying Vitest timeouts and integration race conditions. Achieved and verified 100% passing tests for both the full Backend and Frontend Vitest suites.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.15.0`.

## [3.14.8] — 2026-07-14

### ✨ Features
- **Mobile PWA Integration**: Added `MobilePairing` component securely embedding connection QR Code within Settings.

### 🐛 Bug Fixes
- **Test Stability**: Fixed UI test flakiness in `ChatPage.spec.tsx` (mocking issue) and `InstructionsPage.spec.tsx` (timing race condition) related to async data fetching and state updates.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.14.8`.

## [3.14.1] — 2026-07-13

### 🐛 Bug Fixes
- **Route Manifest Sync**: Added the newly created `/api/skills/toggle` and `/api/skills/audit` routes to the Express route manifest to satisfy inventory tests.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.14.1`.

## [3.14.0] — 2026-07-13

### ✨ Features
- **Repo-Scoping Skill Controls**: Added UI toggles to the Skills Manager allowing users to copy global skills into specific repository `.agent/skills/` directories.
- **AI Skill Auditor**: Replaced static regex-based skill improvement suggestions with an intelligent LLM-driven `POST /api/skills/audit` endpoint that uses the local runtime to identify outdated or problematic skill instructions.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.14.0`.

## [3.13.0] — 2026-07-06

### ✨ Features
- **OpenWiki Skill Integration**: Updated `total-recall` and `repo-expert` skill documentation to include native integration commands for initializing and ingesting OpenWiki (`npx -y openwiki --init` and `npx total-recall ingest openwiki <path>`).
- **Advanced Skill Lifecycle & P2P Network Docs**: Documented Total Recall's new advanced skill capabilities within `tr-skill` SKILL.md, detailing Skill Lifecycle/Versioning, Auto-Improvement loops, and the upcoming P2P Skills Network.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.13.0`.

## [3.12.0] — 2026-07-05

### ✨ Features
- **Interactive Scaffolding Prompts**: Updated the `total-recall init` CLI wizard to prompt users to optionally initialize OpenWiki for auto-documentation and import OKF knowledge bundles directly during the bootstrap process.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.12.0`.

## [3.11.0] — 2026-07-04

### ✨ Features
- **LangChain OpenWiki Integration**: Added \`total-recall ingest openwiki <path>\` command to automatically ingest LangChain's auto-generated architectural OpenWiki directories into Total Recall's semantic knowledge graph.

### 📦 Publishing
- Published to npm as \`total-recall-brain@3.11.0\`.

## [3.10.0] — 2026-07-01

### ✨ Features
- **Namespaced Total Recall sub-skills**: Renamed bundled nested skills to `tr-cli-agents`, `tr-research`, `tr-skill`, and `tr-ssss` so packaged Total Recall skills no longer collide with user-authored generic slash commands.
- **Scope-aware skill projection**: Added project/global skill projection helpers and `init` wiring so repo skills are exposed only to the IDE skill surfaces that are actually in use.
- **SSSS delete envelope and schema expansion**: Added delete-envelope validation/auditing and the `email_account` primitive schema.
- **Research runtime refinements**: Hardened research planning/synthesis prompts, stripped scratchpad output from stored reports, and marked empty acquisition runs as failed instead of silently advancing.

### 🐛 Bug Fixes
- **Packaged skill CLI helpers resolve correctly**: `total-recall skill` and `/api/skills/*` now load helper scripts from the active brain first, then fall back to the shipped scaffold, preventing dev-only `.agent` path failures after npm install.
- **Skill manager helpers are self-contained**: Restored missing `searchAndSort`, scanner `runScan`, and safe install wrapper behavior in the `tr-skill` bundle.
- **Runtime config compatibility**: Agent registry lookup now checks both namespaced and legacy `cli-agents` paths.
- **Dependency audit cleanup**: Updated transitive lockfile entries to clear npm advisories for `form-data`, `js-yaml`, and `vite`.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.10.0`.

## [3.9.0] — 2026-06-18

### ✨ Features
- **`connect` projects repo skills as native slash commands** across IDEs via the open Agent Skills standard. Every `.agent/skills/<name>/SKILL.md` is symlinked into the connected client's Agent-Skills directory so it becomes a `/<name>` slash command:
  - **Claude Code** → `<project>/.claude/skills/` (project-scoped)
  - **Antigravity CLI** → `<project>/.agents/skills/` (project-scoped; replaces the deprecated Gemini CLI `~/.gemini/commands` location)
  - **Codex** → `~/.codex/skills/` (global — Codex has no project-local skills dir)
- **Self-healing skill symlinks**: a broken or stale skill link (e.g. after the source repo moves) is refreshed automatically on `connect`, without requiring `--force`.

### 🐛 Bug Fixes
- **Nested symlink projections no longer dangle**: `connect` targets like Antigravity's `.agents/rules/AGENTS.md` now create their parent directory and point the symlink at `INSTRUCTIONS.md` using a path relative to the link's own directory, instead of a hardcoded `INSTRUCTIONS.md` that resolved incorrectly from a nested folder.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.9.0`.

## [3.8.1] — 2026-06-18

### ✨ Features
- **Unbreakable Invariant Enforcements**: Surface compiler now wraps invariant and correction injections in aggressive system prompt override boundaries (`# 🔴 ABSOLUTE SYSTEM OVERRIDE 🔴`) to structurally protect memory rules from ephemeral IDE prompt interference.
- **Native Memory Deduplication**: CLI `remember` automatically scans for existing nodes in the category and gracefully archives duplicates based on >80% textual Jaccard similarity or identical titles, preventing context saturation from repeated corrections.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.8.1`.

## [3.8.0] — 2026-06-18
### ✨ Features
- **OKF-Aligned Surface Compilation Quality** (inspired by OKF enrichment agent patterns):
  - **Modality Markers**: Compiled shims now prefix every rule with `[MUST]`, `[MUST NOT]`, `[SHOULD]`, `[CORRECTION]`, or `[PREF]` — giving agents instant priority signal instead of treating all rules identically.
  - **Title/Body Deduplication**: Auto-generated "Self-captured memory:" titles that echo the body are now detected and eliminated, preventing doubled text in compiled output.
  - **Sentence-Boundary Truncation**: Long rules are now truncated at the nearest sentence boundary instead of mid-word, producing cleaner summaries.
  - **Content Deduplication**: Rules with identical body text are automatically deduplicated during compilation, keeping the higher-importance node.
  - **Compact CLI Reference**: Replaced the 73-line CLI reference manual with an 8-line Quick Reference block (OKF §6 progressive disclosure), moving rules from line 79 to line 15 of compiled shims.

### 🐛 Bug Fixes
- **Force Flag Propagation**: The `force` parameter is now threaded through the entire compilation pipeline (`compileSurface` → `compilePointers` → `writeShim` → `buildRulesBlock` → `compactNode`). Previously, forced recompilation skipped the vault-hash check but still served stale compaction cache entries. Cache writes use OKF augmentation pattern: reloads full cache before writing to preserve other nodes' entries.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.8.0`.

## [3.7.0] — 2026-06-18

### ✨ Features
- **Open Knowledge Format (OKF v0.1 Draft) Integration**:
  - Implemented bidirectional schema mappings, allowing GCP/git-based knowledge catalogs to sync with the SSSS v2 memory vault.
  - Added `total-recall ingest okf <path>` to recursively import OKF bundles with custom override parameters, conflict strategies, and automated background recompilation.
  - Added `total-recall export <path> --okf` to export SSSS memories as OKF-compliant bundles with directory partitions, `index.md` relative links compilation, and `log.md` chronologically populated audit logs.
  - Added `total-recall lint --okf` to audit memory nodes for OKF metadata parameters, supporting `--strict` error conversion.
  - Enhanced graph indexing by expanding relative Markdown links extraction (`[text](./target.md)`).
  - Created a dedicated `okf` skill package detailing format specifications, helper script wrappers, validation assertions, and delegation prompts.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.7.0`.

## [3.6.10] — 2026-06-17

### 🐛 Bug Fixes
- **Shim Injection Target Fix**: Fixed a bug in `surface.mjs` where `compilePointers` mapped Gemini and Antigravity clients to empty arrays, causing them to be silently skipped during surface injection. They now properly map to `GEMINI.md` and `AGENTS.md`. Additionally, `compileSurface` now correctly tracks and reports the exact number of updated shims to the CLI.

## [3.6.9] — 2026-06-13

### ✨ Features
- **SSSS Improvements Epic**: Completed and archived the full SSSS Improvements project — secure memory validation with schema v2 conditional requirements (`TotalRecallMemoryValidator`), feedback privacy scopes to prevent workspace data leaking into system cache, and optimizer promotion pipeline (`workspace` → `system_candidate` → `system_promoted`) with strict provenance stripping and PII redaction.

### 🐛 Bug Fixes
- **Context Bloat (Definitive Fix)**: Completely removed the fallback shim generation loop in `surface.mjs`. When `clients.json` is missing, only the canonical `INSTRUCTIONS.md` is now written. Client-specific shims (`.cursorrules`, `.clauderules`, `AGENTS.md`, etc.) are exclusively generated via `npx total-recall connect`. This supersedes the partial fixes in v3.6.7 and v3.6.8.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.9`.

## [3.6.8] — 2026-06-11

### 🐛 Bug Fixes
- **Restored IDE Support**: Restored out-of-the-box IDE support without triggering context bloat by generating hidden dotfile shims (e.g. `.clauderules`, `.codexrules`) by default instead of `.md` files that are eagerly globbed by Antigravity and Gemini.

## [3.6.7] — 2026-06-11

### 🐛 Bug Fixes
- **Context Bloat Reduction**: Patched a fallback loop in the `surface.mjs` compiler that was indiscriminately writing full copies of active vault directives to multiple IDE shim files, consuming 80KB+ of context. Now, only the canonical `INSTRUCTIONS.md` is generated by default unless IDEs are explicitly registered via `.agent/config/clients.json`.
- **Symlink Preservation**: Added protection in `writeShim` to preserve existing symbolic links rather than unlinking and hard-copying them, preventing further rule duplication.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.7`.

## [3.6.6] — 2026-06-09

### 🐛 Bug Fixes
- **Extension Side Panel Flow**: Removed `default_popup` from `manifest.json` and added dynamic `sidePanel.setPanelBehavior` routing so clicking the extension icon organically opens the side panel.
- **Unauthenticated Errors**: The extension content script now inspects API failure payloads and explicitly renders a visible `❌ Auth Error - Check PAT` toast rather than failing silently if `total-recall` requests return a 403.
- **Research Queue Slugs**: Repaired the dynamic task generation lifecycle in `scheduler.mjs` and `daemon-loop.mjs` to properly propagate and respect `node_slug`, preventing human-readable topic strings from corrupting the factual document slugs.
- **Completed Scheduler Tasks**: `GET /api/tasks` now cleanly filters out completed tasks by default. Added a new `DELETE /api/tasks/cleanup` endpoint to easily garbage-collect execution piles.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.6`.

## [3.6.5] — 2026-06-05

### 🐛 Bug Fixes
- **BrainSelector UX**: Fixed brain selection buttons failing to trigger correctly by replacing invalid HTML nested inputs with valid wrapper `<div>`s, properly isolating checkbox toggles from single-select actions, and ensuring the dropdown closes dynamically on selection.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.5`.

## [3.6.4] — 2026-06-02
### ✨ Features
- **CLI Agent Diagnostics Panel**: Replaced the deprecated mock model-pulling widget on the Deployments page with a functional diagnostics panel. It connects to the new `POST /api/diagnostics/agents` endpoint, runs `upgrade --agents` in the background, and outputs live CLI results.
- **Clean Collaboration Labels**: Cleaned up the simulated sandbox styling terminology in the CollabPage views, renaming it to clear real-world descriptors like "Connect URL" and "Active browse context URL".

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.4`.

## [3.6.3] — 2026-06-02

### ✨ Features
- **Real Browser-Level Collaboration**: Integrated group sharing of webpage annotations, live user presence counting, and real-time site-scoped messaging directly into the Chrome Extension side panel (replacing the simulated sandbox).
- **Check for Updates Button**: Added a manual "Check for Updates" button to the System Health Page to check registry versions on demand.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.3`.

## [3.6.2] — 2026-06-02

### ⚡ Performance & UX
- **Optimized Claude Code Completions in UI**: Added `--setting-sources local` and `--tools ""` to the default and compiled `claude` agent flags, bypassing the loading of the user's 30 global plugins and disabling local directory/command scanning, speeding up UI responses significantly.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.2`.

## [3.6.1] — 2026-06-02

### 🐛 Bug Fixes
- **CLI Agent Key Isolation**: Patched runtime spawning logic to delete `GOOGLE_API_KEY` for `antigravity` and `gemini` agent commands, preventing API key validation errors when both keys are loaded.
- **Codex Git Trust Flags**: Added `--skip-git-repo-check` to the default `codex` flags to prevent execution failures in untrusted git directories.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.1`.

## [3.6.0] — 2026-06-02

### ✨ Features
- **Collaborative Workspaces & Teams Platform**: Integrated user auth, invite-code groups, URL note-pinning, and simulation sandbox in the visual dashboard.
- **WebSocket Synchronization Channel**: Built real-time message broadcasting and presence indicators over secure WebSocket links `/collab-ws`.
- **Dedicated Markdown Help Document Viewer**: Added HelpPage.tsx dynamically reading guides (CLI, SSSS spec, System Architecture, Collaboration) from the backend API.
- **Glassmorphic Graph Overlay Chat**: Elevated Chat workspace with interactive, translucent glass backdrop overlays rendering on top of the background 3D Sovereign Graph.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.6.0`.

## [3.5.0] — 2026-06-02

### ✨ Features
- **Core Self-Update System**: Integrated `/api/update/check` and `/api/update/run` endpoints into the REST router to query the npm registry for updates, pull the latest git code, install dependencies, and reboot the system kernel.
- **Health Check Update Alerts & Dynamic UI**: Modified the frontend Health Page to dynamically fetch update availability, display an animated update banner, prompt for confirmation, and run the self-update sequence.
- **Progress Overlay & Resilient Polling Recovery**: Built an updating spinner overlay with blurred glassmorphic backdrops and programmed auto-polling to restore the tab state once the server restarts.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.5.0`.

## [3.4.0] — 2026-06-02

### ✨ Features
- **Hybrid Semantic/Lexical Search (RRF)**: Merged cosine-similarity vector search and keyword matching density (TF-IDF approximation) using Reciprocal Rank Fusion (RRF), improving recall accuracy across exact code identifiers, symbol names, and intent.
- **Hierarchical Parent-Child Search**: Documents and rules are chunked and embedded individually under the parent slug's index. The pluggable search engine compares query embeddings against both parent and children vectors, matching on maximum similarity.
- **Pluggable Vector Store Interface**: Extracted vector index storage and scanning loops into a modular `VectorStore` class (`src/core/vector-store.mjs`), enabling seamless drop-in integrations of native engines (SQLite-VSS, HNSWLib) while preserving database-free flat-file VFS.
- **Instruction Compaction**: Implemented a smart heuristic rule compactor that limits rules in prompt shims to 180 characters (merging title and first body sentence, eliminating redundancies). Added cache-backed LLM compiler options enabled via `TR_LLM_COMPACT=true`.
- **Category Partitioning**: Kept prompt shims lightweight by reserving active injection shims strictly for high-priority `invariants`, `preferences`, and `anti-patterns`, while keeping `facts`, `concepts`, and `decisions` strictly search-only (recall mode).
- **Asynchronous Compile Backgrounding**: Spawns detached, unreferenced compiler subshells (`process.argv[0] compile`) during CLI remembers/forgets, preventing write latency blocking for the developer.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.4.0`.

## [3.3.0] — 2026-05-30

### ✨ Features
- **Permanent Chrome Extension Card**: Added a permanent, visually premium Chrome Extension Card to the Integrations page with a direct dynamic zip download button (`/api/extension/download`).
- **Defensive JavaScript Hardening**: Hardened popup and sidepanel quick-action buttons to query tabs defensively, preventing API errors on invalid webpage tabs (like system pages).

### 🐛 Bug Fixes & Refinement
- **Chrome Extension Tabs Permission**: Added the `"tabs"` permission to MV3 `manifest.json`, granting the extension direct access to active tab URLs/titles for seamless "Remember Page" and "Research Page" capabilities.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.3.0`.

## [3.2.3] — 2026-05-29

### ✨ Features
- **Chrome Extension Side Panel Redesign**: Overhauled the side panel layout with a modern tab navigation system (`Memories`, `Chat`, `Research`, `Settings`).
- **Context-Aware Web Grounding**: Integrated real-time grounding inside the Extension Chat, automatically retrieving page text selections or inner DOM body text to enrich prompt completions.
- **Interactive UI Feedback**: Added smooth `:active` scale transitions and asynchronous click-loading states (`⏳ Remembering...` / `⏳ Researching...` / `⏳ Saving...`) in both the side panel and popup extension views.
- **Sovereign Settings Shortcuts**: Added direct controls inside the settings tab for selecting active project brain layers, fast domain blocklisting, and manual index recompilation.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.2.3`.

## [3.2.0] — 2026-05-29

### ✨ Features
- **Chrome Extension Download from Dashboard**: New `GET /api/extension/download` endpoint streams the extension directory as a `.zip`. Dismissible banner on the Chat home page prompts install when extension is available but not yet connected.
- **Extension Connection Detection**: `GET /api/extension/status` returns `{ available, connected }`. The share endpoint writes a `.extension-connected` marker when the extension first phones home.
- **Settings Extension Card**: Permanent download card with installation instructions in the Settings page.

### 📦 Publishing
- Published to npm as `total-recall-brain@3.2.0`.

## [3.1.2] — 2026-05-29

### 🐛 Bug Fixes & Refinement
- **BrainSelector UI Selection:** Refactored sidebar dropdown clicks; clicking a row switches the active context to that single brain (single-select), while checking the checkbox toggles multiple layers (multi-select).
- **Non-Intrusive Test Isolation:** Patched `src/core/research-queue.mjs` and `fact-seeker.spec.mjs` to dynamically bind queue directory writes relative to `AGENT_DIR` during test runs, preventing tests from polluting the active live research queue.

## [3.1.1] — 2026-05-29

### 🧠 Brain Architecture Overhaul
- **Decoupled Brain Layers**: Removed blind global-to-project merge from `compileSurface()`. Global and project brains are now fully independent vaults.
- **Client-Aware Surface Compiler**: `compilePointers()` reads `config/clients.json` and only writes shim files for connected IDE clients (backward compatible — writes all if no config).
- **Temporal Rules Engine**: New `expires_at` schema field, `--expires <duration>` CLI flag (e.g. `7d`, `2w`), and auto-archive of expired rules during compilation.
- **Brain-Scoped API Routes**: All `/api/memory` endpoints and chat completions accept `?brain=<id>` query param or `brainId` body field. Defaults to global brain.
- **Thread-Brain Binding**: Chat threads now carry `brainId` — switching threads auto-switches the active brain context in the dashboard.
- **Environment-Aware Surfaces**: `buildRulesBlock()` accepts `{ consumer }` option; API consumers get a minimal header instead of full CLI quickstart docs.

### 🔌 Chrome Extension (MV3)
- **Context Menus**: Right-click "Send to Brain", "Remember This" (selected text), "Research This"
- **Side Panel**: Semantic memory search, quick actions (Remember/Research/Quick Note), live research feed
- **Popup**: Quick note, URL share (auto-filled), passive tracking toggle, connection status
- **Content Script**: Shadow DOM floating pill showing related memory count per page
- **Options Page**: Brain URL, PAT token, domain blocklist, capture granularity settings

### 📥 Ingestion Pipeline
- **Share-to-Brain API**: `POST /api/share` endpoint with auto-routing heuristic (URL → research, text → remember) + `npx total-recall share` CLI command
- **Google Takeout Parser**: `npx total-recall ingest google-takeout <path>` with parsers for Search History, Chrome Bookmarks, Google Keep, YouTube History. Supports `--dry-run`, `--types`, `--max-age`.
- **SSSS Schema Extensions**: Added `x_location`, `x_media_refs`, `x_browser_context` optional fields
- **Open Source Whitelist**: `quick-capture.mjs` now accepts any valid kebab-case source (not just `slack`/`discord`)

### 🔬 Research UI Enhancements
- **Lifecycle Controls**: Pause, Resume, Re-run, Steer, Conclude, Cancel buttons on research items
- **Steer Modal**: Direct research with custom direction notes
- **Expand/Collapse Reports**: Gradient fade at 500px with toggle (replaces fixed 350px cap)
- **Rich Citation Cards**: Favicons, domain names, "Research deeper" button
- **URL Detection in Chat**: Auto-detects URLs in chat input, shows [🔬 Research] [📌 Remember] action bar

### 🐛 Bug Fixes
- **CLI agent spawning environment**: Fixed environment variable propagation inside `spawnSync` when spawning local CLI agents headlessly by injecting config-loaded API keys (such as `GOOGLE_API_KEY`, `TAVILY_API_KEY`, etc.) directly from `secrets.enc` into the spawned environment.
- **POST /api/share syntax error**: Made the Express route handler callback `async` to resolve dynamic import syntax errors.
- **Route Manifest Validation**: Added `GET /api/extension/status` to `route-manifest.json` to align with the live API routes and pass testing.
- **BrainSelector**: Fixed checkbox `readOnly`/`onClick` swallowing clicks, removed deselect guard, added empty state
- **localStorage Persistence**: `activeBrainId` survives page reload
- **Route Manifest**: Updated for new `/api/share` endpoint

### 📊 Testing
- **335 tests** across 45 test files — all passing
- 0 TypeScript errors, 0 lint issues


## [1.0.0] — 2026-05-01

### 🎉 Initial Release

Total Recall is a local-only, Markdown-first cognitive memory system for AI coding agents.

### Core Engine
- **4-Layer Memory Architecture**: Episode Archive → Search Index (FTS5) → Knowledge Graph (Zettelkasten wiki) → Behavioral Surface
- **Signal Score Ranking**: `intensity × (access+1)^0.5 × max(0.1, 0.5^(days/half_life))` with type-specific decay rates
- **Behavioral Surface Compiler**: Auto-generates curated rules from wiki nodes, injected into system prompt
- **Behavioral Steering**: `total-recall steer --type always|never|correct "directive"` for immediate behavior changes
- **Dream Daemon**: Consolidation cycle (NREM/REM/decay/prune) for memory maintenance
- **FTS5 Full-Text Search**: Sub-50ms search across all memory tiers (BM25 ranked)
- **Episode Archive**: Structured session logs with YAML frontmatter, organized by date

### Co-Processor
- **Real-time Background Daemon**: Watches conversations and runs 5 parallel analysis checks
- **Steering Detection**: Identifies "always", "never", "correct" directives
- **Sentiment Analysis**: Detects user mood shifts (praise, frustration)
- **Relevance Check**: Surfaces related memories via FTS5
- **Contradiction Detection**: Flags statements conflicting with wiki knowledge
- **System 2 Researcher**: Background web-backed fact-checking of uncertain claims

### IDE Support (Phase 11-14)
- **IDE Watchers**: Antigravity, Claude Code, Cursor, Aider, Windsurf, Generic
- **CLI Adapters**: Gemini, Claude, Codex, Aider, Copilot (+ any CLI agent)
- **`total-recall sync-prompts`**: Auto-detects IDEs and writes surface to native formats
  - Cursor: `.cursor/rules/total-recall.mdc` (MDC format)
  - Windsurf: `.windsurf/rules/total-recall.md`
  - Roo Code: `.roo/rules/total-recall.md`
  - Continue: `.continue/rules/total-recall.md`
  - INSTRUCTIONS.md / CLAUDE.md: Section injection with symlink detection
- **Multi-file config**: `systemPromptFiles` array for simultaneous injection

### Multi-Agent Pipeline
- **3-Agent Extraction**: Archivist (Gemini Flash), Synthesizer (Claude), Fact-Checker (Codex)
- **CLI Agent Adapters**: Override any role with `agents.default` in config
- **Non-blocking dispatch**: Pipeline runs as background fire-and-forget

### Notifications (Phase C4)
- **Multi-channel**: macOS native, Slack, Discord, Email
- **Directory-based queue**: `~/.total-recall/notifications/`
- **CLI**: `total-recall notify "title" "message"`

### Security (Phase 18)
- **Zero shell injection**: All CLI dispatches use `spawn()` with argument arrays
- **AES-256-GCM**: Encrypted config sharing (PBKDF2 600K iterations, SHA-512)
- **File permissions**: `~/.total-recall/` at `0o700`, `.env` at `0o600`
- **Secrets management**: `.env`, `*.key`, `*.pem` in `.gitignore`
- **Minimum password**: 8 characters for encrypted config bundles

### Concurrent Handoff (Phase 17)
- **HANDOFF.md-first**: Self-sufficient handoff written as Step 1 of /switch
- **Resilient boot**: /start uses priority cascade `START.md → HANDOFF.md → raw files`
- **Zero blocking**: Incoming agent can start immediately without waiting for outgoing

### Documentation
- **README**: IDE compatibility matrix, "Choose Your IDE" quick start
- **Per-IDE Guides**: Antigravity, Claude Code, Cursor, Windsurf, Aider, Generic
- **Architecture Guide**: Adapter patterns, surface sync system, concurrent handoff model
- **Prompt Templates**: Archivist, Synthesizer, Fact-Checker templates in `templates/prompts/`

### Testing
- **73 tests** across 29 suites covering: utils, ranking, wiki, episodes, dream, FTS5, crypto, watchers, notifications, lint
