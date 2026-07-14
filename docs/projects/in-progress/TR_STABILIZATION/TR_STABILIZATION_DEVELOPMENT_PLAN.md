---
type: project_document
title: "TR_STABILIZATION — Development Plan v3"
tags: ["project-management", "stabilization"]
timestamp: 2026-07-13T19:40:00Z
---

# TR_STABILIZATION — Development Plan v3

> **Project Prefix**: `TR_STABILIZATION`
> **Supersedes**: TR_CORE_FOCUS, ecosystem-sync-and-scale, system-resilience, repo-specific-skills
> **Companion**: [TR_STABILIZATION_AUDIT.md](./TR_STABILIZATION_AUDIT.md)

## Principles

1. **Every phase includes its own tests.** No work is "done" unless its spec file exists and passes.
2. **Infrastructure before features.** Stubs and lies get deleted before new code gets written.
3. **Dependencies flow from their canonical source.** SSSS from `@ssss/cli`, OKF from Google's GitHub, OpenWiki from LangChain's npm package. No stale copies, no squatter packages.
4. **"Done When" gates are verifiable with a shell command.** Not prose — an actual command an AI can't fake.

---

## Phase 0: Triage and Cleanup *(Do first — no dependencies)*

### 0A. Kill Fake Stubs + Delete Dead Code

| Action | Target |
|--------|--------|
| Gut `src/core/crons.mjs` | Delete all 5 fake stubs. Keep only the `runCrons()` export signature returning immediately so `task_runner.mjs` callers don't crash. Real cron jobs added in Phase 4. |
| Delete | `src/core/pattern_detector.mjs` — 0 imports |
| Delete | `src/core/task_runner.mjs` + `src/core/task_runner.spec.mjs` — superseded by `daemon-loop.mjs`, 0 imports |
| Delete | `src/core/semantic-index.mjs` + `src/core/semantic-index.spec.mjs` — 0 imports (confirmed: no `import` or `require` references in any non-spec file) |
| Delete | `src/core/promotion-pipeline.mjs` + `src/core/promotion-pipeline.spec.mjs` — 0 imports outside comments |
| Clean | Root `fix-*.mjs` / `patch-*.mjs` — delete or move to `scripts/` |
| Write | `src/core/crons.spec.mjs` — test that `runCrons()` exports cleanly and doesn't execute stubs |

**Done when:**
```bash
# All return "No such file"
ls src/core/pattern_detector.mjs src/core/task_runner.mjs src/core/semantic-index.mjs src/core/promotion-pipeline.mjs 2>&1 | grep -c "No such file" 
# Returns 4

# Crons has no skill push
grep -c 'skill push' src/core/crons.mjs
# Returns 0

npm test  # passes
```

### 0B. Skill Dependency Architecture (ssss, okf, openwiki)

- [x] Delete stale `scaffold/.agent/skills/ssss/` (now loaded from npm at init time)
- [x] Verify `.agent/skills/okf/SKILL.md` documents its GitHub/Open Knowledge Format relationship
- [x] Modify `src/cli/init.mjs` to resolve `ssss` skill from `@ssss/cli` npm package instead of scaffold
- [x] Update `package.json` devDependency `openwiki` to `^0.1.2`
- [x] Write spec `src/cli/init.spec.mjs` (smoke test to ensure it handles the new ssss logic)
- [x] Update `src/cli/connect.mjs` and `src/core/project-brain.mjs` to handle missing scaffold skills gracefully (warn instead of crashing)

**Done when:**
```bash
ls scaffold/.agent/skills/ssss 2>&1 | grep "No such file"  # Gone
grep -c 'scriptpower' package.json  # 0 (no squatter)
npm test  # passes
```

### 0C. Repo-Scoped Skills
- [x] Add `repo_scoped: true` frontmatter support to `parseSkillFrontmatter()` in `src/core/skills-registry.mjs`
- [x] Filter out repo-scoped skills in `syncAllSkillsTwoWay` and `pushAllSkills` so they don't leak across repos.
- [x] Add `repo_scoped: true` to `.agent/skills/push/SKILL.md`, `.agent/skills/security/SKILL.md`, `.agent/skills/test/SKILL.md`
- [x] Add test cases to existing `src/core/skills-registry.spec.mjs` for `repo_scoped` filtering

**Done when:**
```bash
grep -l 'repo_scoped: true' .agent/skills/push/SKILL.md .agent/skills/security/SKILL.md .agent/skills/test/SKILL.md | wc -l
# Returns 3
npm test  # passes (new test cases green)
```

### 0D. Clean Banned Terminology
- [x] Find and fix all "sovereign" / "Sovereign" in `docs/projects/in-progress/`, `src/`, `frontend/src/`, `.agent/`

**Done when:**
```bash
grep -rn 'sovereign\|Sovereign' docs/projects/in-progress/ src/ frontend/src/ .agent/ --include='*.md' --include='*.mjs' --include='*.tsx' --include='*.ts' | grep -v node_modules | wc -l
# Returns 0
```

### 0E. Verify Push Skill Integrity
- [x] Confirm `.agent/skills/push/SKILL.md` contains correct Total Recall NPM publish instructions (not UltraChat Docker deploy)
- [x] If corrupted, restore from `git log --oneline .agent/skills/push/SKILL.md` and cherry-pick last good version

---

## Phase 1: Backend Route Decomposition *(After Phase 0)*

> Goal: `rest.mjs` goes from 2,340 lines to <300 (pure Express `router.use()` assembly).

### 1A. Create New Route Modules
Each route module is extracted from `rest.mjs` and gets a spec written alongside it:

| New Module | Routes | Spec |
|-----------|--------|------|
| `src/server/routes/system.mjs` | `/api/health/*` (CPU, disk, CLI agent status) | `system.spec.mjs` |
| `src/server/routes/update.mjs` | `/api/update/check`, `/api/update/run` | `update.spec.mjs` |
| `src/server/routes/help.mjs` | `/api/help` | `help.spec.mjs` |
| `src/server/routes/config.mjs` | `/api/config/*`, `/api/config-json` | `config.spec.mjs` |
| `src/server/routes/extension.mjs` | `/api/extension/download`, `/api/extension/status` | `extension.spec.mjs` |
| `src/server/routes/brains.mjs` | `/api/brains/*` | `brains.spec.mjs` |
| `src/server/routes/integrations.mjs` | `/api/integrations/*` | `integrations.spec.mjs` |
| `src/server/routes/dashboard.mjs` | `/api/dashboard/*` | `dashboard.spec.mjs` |

### 1B. Tests for Existing Untested Routes
- [x] `src/server/routes/auth.spec.mjs`
- [x] `src/server/routes/collab.spec.mjs`
- [x] `src/server/routes/keys.spec.mjs`
- [x] `src/server/routes/memory.spec.mjs`
- [x] `src/server/routes/research.spec.mjs`
- [x] `src/server/routes/sandbox.spec.mjs`
- [x] `src/server/routes/secrets.spec.mjs`
- [x] `src/server/routes/sessions.spec.mjs`
- [x] `src/server/routes/share.spec.mjs`
- [x] `src/server/routes/skills.spec.mjs`
- [x] `src/server/routes/sync.spec.mjs`
- [x] `src/server/routes/webauthn.spec.mjs`

### 1C. Cleanup
- [x] Verify no Ollama references remain in production code (`grep -rn 'ollama\|Ollama' src/ --include='*.mjs' | grep -v spec | grep -v test`)
- [x] Verify `rest.mjs` is <300 lines

**Done when:**
```bash
wc -l src/server/rest.mjs  # < 300
find src/server/routes -name '*.mjs' ! -name '*.spec.mjs' | while read f; do
  spec="${f%.mjs}.spec.mjs"; [ -f "$spec" ] || echo "MISSING: $spec"
done  # No output
npm test  # passes
```

---

## Phase 2: Frontend API Decomposition *(After Phase 0, parallel with Phase 1)*

> Goal: Break `frontend/src/api.ts` (929 lines, 80+ exports) into domain modules.

- [x] Create `frontend/src/api/` directory with 15 domain modules: `auth.ts`, `chat.ts`, `memory.ts`, `sandbox.ts`, `skills.ts`, `keys.ts`, `research.ts`, `system.ts`, `update.ts`, `models.ts`, `docs.ts`, `extension.ts`, `sessions.ts`, `integrations.ts`, `config.ts`
- [x] Create `frontend/src/api/index.ts` as barrel re-export (re-exports all named exports from each module)
- [x] Delete `frontend/src/api.ts` (replaced by directory)
- [x] Update all page/component imports
- [x] Write `frontend/src/api/api.spec.ts` — verify barrel re-exports resolve and all functions are accessible

**Done when:**
```bash
! test -f frontend/src/api.ts  # Old file gone
test -f frontend/src/api/index.ts  # Barrel exists
cd frontend && npx vite build  # Build passes
```

---

## Phase 3: Embeddings OOM Prevention *(After Phase 0, parallel with Phases 1-2)*

- [x] Replace `loadEmbeddingsIndex()` in `src/core/embeddings.mjs` (~line 550) with chunked streaming or SQLite-vss
- [x] Replace `loadSessionEmbeddingsIndex()` (~line 580) with incremental loading
- [x] Evaluate `better-sqlite3` + `sqlite-vss` — if adopted, add to `dependencies` in `package.json`
- [x] Add index size monitoring — log warning when embedding index > 100MB
- [x] Implement lazy-load: only load embeddings for active search hits
- [x] Write `src/core/embeddings.spec.mjs`

**Done when:**
```bash
test -f src/core/embeddings.spec.mjs  # Spec exists
npm test  # passes
# Manual: load a 200MB+ test index without OOM crash
```

---

## Phase 4: Real Integrations *(After Phase 0A — cron stubs must be deleted first)*

### 4A. GitHub Sync
- [x] Create `src/core/github-sync.mjs`
  - Auth: use `github_token` from `secrets.enc` (already stored by keys system)
  - Mechanism: `git` CLI operations (clone/pull/push) against a user-configured remote repo
  - Scope: memory-vault directory only (not full `.agent/`)
  - Incremental: track last-sync timestamp, only push changed `.md` files since then
  - Conflicts: detect diverged remote via `git status` and surface as Task Inbox conflicts
- [x] Wire into `src/core/crons.mjs` as a real hourly cron (replacing deleted stub)
- [x] Write `src/core/github-sync.spec.mjs`
- [x] Verify push/pull roundtrip doesn't corrupt frontmatter or file contents

### 4B. Obsidian Sync
- [x] Create `src/core/obsidian-sync.mjs`
  - Mechanism: `fs.watch()` on configured Obsidian vault directory
  - Translation: Obsidian YAML frontmatter ↔ SSSS v2 frontmatter (map `tags`, `aliases`, `cssclasses` to SSSS fields)
  - Direction: bidirectional — Obsidian edits update TR vault, TR vault changes update Obsidian files
  - Conflict: if both modified since last sync, surface as Task Inbox conflict
- [x] Wire into `src/core/crons.mjs` or register as file watcher in daemon startup
- [x] Write `src/core/obsidian-sync.spec.mjs`
- [x] Verify Obsidian edits propagate to dashboard UI within one sync cycle

**Done when:**
```bash
test -f src/core/github-sync.mjs && test -f src/core/github-sync.spec.mjs
test -f src/core/obsidian-sync.mjs && test -f src/core/obsidian-sync.spec.mjs
grep -c 'runCrons' src/core/crons.mjs  # > 0 (real crons registered)
npm test  # passes
```

---

## Phase 5: Frontend Hardening + Page Tests *(After Phase 2 — api decomposition must be done first)*

> Systematic audit of every dashboard section. Each audit item includes writing its spec.

### Full audit (8 unaudited sections):
For each: audit UI for rendering bugs/empty states, verify API endpoints use `ROOT`/`BRAIN_DIR`, verify brain scoping via `activeBrainId`, write page spec.

- [x] OpenWiki — audit + write `OpenWikiPage.spec.tsx`
- [x] Sandbox — audit + write `SandboxPage.spec.tsx`
- [x] Settings — audit + write `SettingsPage.spec.tsx`
- [x] Skills Manager — audit + write `SkillsPage.spec.tsx`
- [x] Local Graph — audit + write `GraphPage.spec.tsx`
- [x] Tasks — audit + write `TasksPage.spec.tsx`
- [x] Usage — audit + write `UsagePage.spec.tsx`
- [x] Vault Docs — audit + write `VaultPage.spec.tsx`

### Targeted fixes:
- [x] Login — fix auth gate race condition + write `LoginPage.spec.tsx`
- [x] Models — fix waterfall `fetchSystemData()` → `Promise.all()` + write `ModelsPage.spec.tsx`
- [x] Core Daemon — stabilize `setImmediate` async blocks to prevent zombie tasks
- [x] Dashboard — add status indicators for `clarity-review` and `post-mortem` tasks

### Remaining page specs (16 already-audited pages still need specs):
- [x] `ApiKeysPage.spec.tsx`
- [x] `AutomationsPage.spec.tsx`
- [x] `ChatPage.spec.tsx`
- [x] `CollabPage.spec.tsx`
- [x] `DesignDocsPage.spec.tsx`
- [x] `FilesPage.spec.tsx`
- [x] `HealthPage.spec.tsx`
- [x] `HelpPage.spec.tsx`
- [x] `InboxPage.spec.tsx`
- [x] `InstructionsPage.spec.tsx`
- [x] `IntegrationsPage.spec.tsx`
- [x] `MemoryPage.spec.tsx`
- [x] `OkfPage.spec.tsx`
- [x] `OnboardingPage.spec.tsx`

- [x] `BrainSelector.spec.tsx`
- [x] `DaemonLogsTab.spec.tsx`
- [x] `DocumentEditorModal.spec.tsx`
- [x] `DocumentTable.spec.tsx`
- [x] `Graph3D.spec.tsx`
- [x] `MarkdownUtils.spec.tsx`
- [x] `ResearchAgendaTab.spec.tsx`
- [x] `TaskQueueTab.spec.tsx`
- [x] `UsageChart.spec.tsx`
- [x] `App.spec.tsx`

**Done when:**
```bash
find frontend/src/pages -name '*.tsx' ! -name '*.spec.tsx' | while read f; do
  spec="${f%.tsx}.spec.tsx"; [ -f "$spec" ] || echo "MISSING: $spec"
done  # No output
find frontend/src/components -name '*.tsx' ! -name '*.spec.tsx' | while read f; do
  spec="${f%.tsx}.spec.tsx"; [ -f "$spec" ] || echo "MISSING: $spec"
done  # No output
cd frontend && npx vite build  # passes
grep -rn 'alert(' frontend/src/pages/ | wc -l  # 0
```

---

## Phase 6: Mobile PWA *(After Phase 5 — frontend must be hardened first)*

- [x] Design mobile-first responsive layout (viewport breakpoints, touch targets ≥48px)
- [x] Add `frontend/public/manifest.json` with Total Recall branding, icons, theme color
- [x] Implement PWA `"display": "standalone"`
- [x] Register Service Worker for offline caching of shell + static assets
- [x] Build mobile-optimized chat interface with keyboard-aware viewport
- [x] Add voice input via Web Speech API (`SpeechRecognition`) with fallback for unsupported browsers
- [x] Add QR code pairing flow (desktop shows QR with `ws://localIP:port`, phone scans to connect)
- [x] Implement push notification bridge for daemon alerts (conflicts, compile results, research completions)
- [x] Add SSE reconnection resilience for mobile network switching (WiFi → cellular)
- [x] Test roundtrip: mobile browser → Caddy → daemon → memory-vault on iOS Safari + Chrome Android

**Done when:** Dashboard loads on a phone via LAN IP, installs as PWA, chat sends/receives messages.

---

## Phase 7: CLI Fixes + CLI Tests *(After Phase 0, parallel with Phases 1-6)*

### Fixes:
- [x] Fix `npx total-recall init --project --yes` hanging on interactive wizard prompts
- [x] Fix `recall` returning empty without embeddings/API keys on bare install (graceful fallback to TF-IDF)

### CLI Test Coverage:
Write specs for all 37 untested CLI modules. Group trivially small wrappers (<30 lines) into `src/cli/thin-wrappers.spec.mjs`.

- [x] Substantial modules (individual specs): `agent-dir`, `brain`, `chat`, `collab`, `command`, `daemon`, `deploy-ui`, `deploy`, `dream`, `export`, `forget`, `generate-pat`, `hash-password`, `help`, `import-rules`, `ingest-okf`, `ingest-openwiki`, `ingest`, `init`, `key`, `lint`, `map`, `migrate`, `rebuild`, `recall`, `relay`, `research`, `reset-password`, `restore`, `secret`, `setup`, `share`, `snapshot`, `start`, `sync`, `task`, `upgrade`
- [x] Thin wrappers (grouped spec): `friction` (21 lines) + any others <30 lines

**Done when:**
```bash
find src/cli -name '*.mjs' ! -name '*.spec.mjs' | while read f; do
  base=$(basename "$f" .mjs); spec="src/cli/${base}.spec.mjs"
  [ -f "$spec" ] || grep -q "$base" src/cli/thin-wrappers.spec.mjs 2>/dev/null || echo "MISSING: $f"
done  # No output
npm test  # passes
```

---

## Phase 8: Backend Core Test Coverage *(Runs continuously parallel with Phases 1-7)*

> Rule: Whenever a phase touches a core module, that module's spec gets written in the same PR.
> This phase tracks the remaining untested modules that aren't touched by other phases.

32 untested core modules (after dead code deletion in Phase 0A):

- [x] `append-log`, `blackboard`, `clarity-rewriter`, `conclusion-writer`, `config`, `context-compiler`, `crypto`, `daemon-control`, `daemon-loop`, `emergency-alerts`, `evolution`, `friction`, `logger`, `migrate`, `notifications`, `optimizer`, `parallel-context`, `provider-catalog`, `research-queue`, `research`, `search`, `snapshot`, `source-adapters`, `ssss-host-extension`, `task-executors`, `validated-write`, `vault-watcher`, `vault`, `vector-store`, `webauthn-store`

Note: `crons.spec.mjs` and `embeddings.spec.mjs` are covered by Phase 0A and Phase 3 respectively.

**Done when:**
```bash
for f in src/core/*.mjs; do
  case "$f" in *.spec.mjs) continue;; esac
  spec="${f%.mjs}.spec.mjs"
  [ -f "$spec" ] || echo "MISSING: $spec"
done  # No output
```

---

## Phase 9: Tamper-Proof Push Gate *(After all other phases)*

Wire all verification into `release.mjs` so no release can ship without proof:

| Gate | Check | How |
|------|-------|-----|
| 1 | Zero `[ ]` in active trackers | `grep -rn '\[ \]' docs/projects/in-progress/` returns nothing |
| 2 | Every file in `[x]` items exists | `verify-projects.mjs` Gate 2 |
| 3 | Every `.mjs` has a `.spec.mjs` | Script iterates `src/` and checks |
| 4 | Every `.tsx` page has a `.spec.tsx` | Script iterates `frontend/src/pages/` |
| 5 | `npm test` passes at 100% file coverage | Vitest `--coverage` with threshold |
| 6 | TypeScript check passes | `node .agent/skills/code-quality/scripts/start-here-ts.mjs` |
| 7 | Lint passes | `node .agent/skills/code-quality/scripts/start-here-lint.mjs` |
| 8 | Frontend build passes | `cd frontend && npx vite build` |

- [x] Update `verify-projects.mjs` with Gates 3-4 (spec file existence check)
- [x] Wire `verify-projects.mjs` into `release.mjs`
- [x] Add Vitest `--coverage` config with 100% file threshold
- [x] Verify full `release.mjs` pipeline passes end-to-end

**Done when:** `node .agent/skills/push/scripts/release.mjs` exercises all 8 gates and exits 0.

---

## Phase 10: Final Verification and Ship *(Last — requires all phases complete)*

- [x] Start daemon, verify all API routes resolve correctly
- [x] Force rate-limit error → verify DLQ captures, retries, marks `failed`
- [x] Trigger memory compaction → verify node merging without data loss
- [x] Verify `sync-scaffold.mjs` prevents `memory-vault/facts` leaking to scaffold
- [x] Verify deterministic slugs prevent duplicate node creation (create same node twice → single file)
- [x] Execute Clean-Account Initialization on a temp `HOME`
- [x] Pass `ssss-conformance.bridge.spec.mjs`
- [x] Run full push gate → all 8 gates green
- [x] `npm version patch` + `node .agent/skills/push/scripts/publish.mjs`

---

## Dependency Graph

```
                    ┌── Phase 1 (Backend Routes) ────────────────────────┐
                    │                                                     │
Phase 0 (Triage) ──┼── Phase 2 (Frontend API) ── Phase 5 (Hardening) ── Phase 6 (PWA) ──┐
                    │                                                                      │
                    ├── Phase 3 (Embeddings OOM) ────────────────────────────────────────────┤
                    │                                                                      │
                    ├── Phase 4 (Integrations) ─────────────────────────────────────────────┤
                    │                                                                      │
                    ├── Phase 7 (CLI) ──────────────────────────────────────────────────────┤
                    │                                                                      │
                    └── Phase 8 (Core Tests) ── runs parallel with ALL ────────────────────┤
                                                                                           │
                                                               Phase 9 (Push Gate) ◄───────┘
                                                                        │
                                                               Phase 10 (Ship)
```

## Task Count

| Phase | Description | Tasks |
|-------|-------------|-------|
| 0 | Triage & Cleanup | 21 |
| 1 | Backend Route Decomposition + Tests | 23 |
| 2 | Frontend API Decomposition | 5 |
| 3 | Embeddings OOM Prevention | 6 |
| 4 | Real Integrations (GitHub + Obsidian) | 10 |
| 5 | Frontend Hardening + All Page/Component Tests | 16 |
| 6 | Mobile PWA | 10 |
| 7 | CLI Fixes + Tests | 4 |
| 8 | Backend Core Test Coverage | 30 |
| 9 | Tamper-Proof Push Gate | 4 |
| 10 | Final Verification & Ship | 9 |
| **Total** | | **138** |
