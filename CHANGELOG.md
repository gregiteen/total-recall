## 3.39.6 — 2026-10-16

- Write the project instruction surface at the repository root, not inside
  `.agent/`. `compile`, `rebuild` and plugin install each built the surface path
  from the agent directory, which names the *brain's* directory — so a project's
  rules were written to `<repo>/.agent/INSTRUCTIONS.md` while every harness reads
  `<repo>/INSTRUCTIONS.md` through the `AGENTS.md`/`CLAUDE.md` symlinks. The
  surface an agent actually loaded therefore never changed, and the commands
  still reported "Post-build verification passed: 0 drift", so the failure was
  invisible from the exit code. The surface directory is now resolved in one
  place, `resolveSurfaceDir`, instead of being re-derived at each call site. The
  global brain keeps its surface in `~/.agent`, where the agent directory *is*
  the workspace root.
- Keep an installed plugin's record and files even when the surface cannot be
  written, and report that as a compilation failure rather than an installation
  failure. The tests pinning this behaviour were failing on `main`.

## 3.39.5 — 2026-10-16

- Allow skills to live in git. The hygiene spec forbade every path under
  `.agent/`, but git does not descend into an ignored directory — so a blanket
  rule left 11 skill directories (~317 files) committed by `9e83665` while the
  spec, added later, called all 317 violations and the suite went red on `main`.
  The two are reconcilable because the invariant was never "no skills"; it was
  "no per-USER state in an open-source package". `.agent/skills/` is now allowed
  and everything else under those directories is still forbidden, so memory
  vaults, handoffs, secrets and IDE projections remain blocked — including a
  `memory-vault/` nested inside a skill directory.
- Actually ship the daily-log size cap. The cap itself (`TR_LOG_MAX_BYTES`,
  64 MiB per file, plus `TR_LOG_TOTAL_MAX_BYTES`, 512 MiB across all logs) landed
  after the 3.39.4 release commit, but the version was never moved past 3.39.4 —
  so the fix has been carrying a version that npm already had, and no install
  could ever receive it. The published 3.39.4 tarball's `logger.mjs` is the old
  age-only version. Because `total-recall update` compares semver ranges rather
  than file contents, it reported success while every host kept running
  retention that only deletes by age and has no per-file ceiling. One runaway
  day wrote 1.5 GB of `system-*.jsonl` and filled a 228 GB disk to 93%; that
  failure was still reachable on every install that had been told it was fixed.
- Find the control server when the credential is not in the project brain.
  `resolveBrainDir('auto')` prefers a project brain when one exists, and a
  project brain's secrets store is normally empty, so `mesh` searched a store
  with no `provider: headscale` entry and reported "Headscale API Key not
  configured in ApiKeysPage" — while the key sat in the global store. Every
  control-server command then fell back to local discovery and looked merely
  unconfigured. Node records already treated reachability as a fact about the
  machine (global brain under `auto`); the credential now comes from the same
  layer. An explicit `--global` or `--project` still selects the store, so
  per-project credentials keep working.
- Import `headscaleFetch` in the mesh CLI. It was called twice and never
  imported, so any command reaching the control server died with a
  `ReferenceError: headscaleFetch is not defined` that the catch reported as an
  unavailable control server.

## 3.39.4 — 2026-10-15

- Ship the corrected bundled `auth` plugin. `secret remote deploy <target>
  --keys k1,k2` is documented and the deploy path already honoured `opts.keys`,
  but the argument parser had no case for the flag, so it fell through and a
  deploy wrote the target's whole key list — 26 keys where the caller asked for
  one. The bundled copy predated the fix, so every packaged install carried it.
- Sync the bundled `mesh` plugin with its published copy.
- Bundled plugin manifests declare `card_layout`. With no layout declared, every
  dashboard card fell through to one hardcoded live/status/actions/activity
  fallback, so all plugins rendered identically regardless of what they do.

## 3.39.3 — 2026-10-15

- Install a copied plugin's declared runtime dependencies. A plugin whose
  `package.json` declares dependencies was copied without them, and because the
  loader imports every installed plugin at load time, a single unresolvable
  import aborted every `total-recall plugin` command in that scope — not just
  the plugin that owned it. Installing now runs the dependency install, reports
  how many packages landed, and undoes the copy when the install fails so a
  plugin can never be left behind in a state that breaks the subsystem. Linked
  plugins are developer checkouts and are left untouched.
- Let a brain configure its instruction token budget. The rule sections are
  measured in characters, but the token total that had to hold them was fixed
  at 4000 (2500 for the bootstrap shim), so a brain with rich required rules
  overflowed and wrote no instruction surface at all. `surface.yml`
  `budget.total_tokens` / `budget.bootstrap_total_tokens` now override it, with
  `TR_CONTEXT_BUDGET_TOKENS` as the outermost override, using the same
  precedence as the rule budgets.

## 3.39.2 — 2026-10-14

- Ship the plugin state and document stores that installed plugins import at
  runtime: `src/core/plugin-state-store.mjs` and
  `src/core/plugin-document-store.mjs`. The published 3.39.1 artifact predated
  both files, so plugins that depend on them (`auth`, `operator-alerts`,
  `decision`, `composable-cli`) could not run against a clean npm install.
- No behavior changes to the host; this is a packaging/currency release.

## 3.39.1 — 2026-10-08

- Enforce mandatory Total Recall first-step directives across IDE instruction
  surfaces, shims, startup skill prerequisites, and operating instructions.
- Provide explicit CLI help discovery (`total-recall --help`), context routing
  (`total-recall context`), and local recall (`total-recall recall --local`) in
  all generated agent instruction surfaces.

## 3.39.0 — 2026-10-08
 
- Preserve the compatible dashboard/plugin scaffold and add an explicit portable
  memory runtime with verified installed plugin lifecycle operations.
- Show “Preview features” when the installed version exceeds the npm public
  release; distinguish host updates from registered consumer upgrades.
- Isolate plugin UI in opaque browser frames with a bounded declared-command
  bridge; require scoped password changes and bound public authentication work.
- Replace executable frontmatter parsing with safe data-only YAML/JSON and
  repair dependency advisories in both package lockfiles and clean consumers.
- Honor explicit initialization roots, preserve active credential stores across
  reinitialization and concurrent writes, and isolate native fixtures from HOME.
- Extend universal IDE instruction surfaces across Cursor, Grok, Replit, Lovable,
  Windsurf/Devin Desktop, Trae, Goose, Aider, OpenHands, Zed, and Roo Code.
- Implement live harness version currency detection and remaining quota tracking
  (5-hour rolling session window and weekly compute allocations) across
  `total-recall brief`, `total-recall startup check`, and `total-recall harness usage`.
- Synchronize scaffold skills for new installations with strict personal-data exclusion.

## 3.35.0 — 2026-10-01

- Emit a compact CLI budget-failure diagnostic instead of repeatedly loading
  the entire unadmitted rule set. Successful retries still return all required
  instructions; API and explicit debug coverage remain unchanged.
- Add optional bounded metadata navigation to skill-manager through the
  existing configured decision client, with scope checks, typed validation,
  deterministic fallback and a short-lived content/config cache.

## 3.34.1 — 2026-10-01

- Pin the repaired SSSS 0.10.3 through its exact npm registry alias. Existing
  installations could retain an older Git dependency after updating Total
  Recall, causing large event-log commits to fail despite the new version.

## 3.34.0 — 2026-10-01

- Add lossless skill optimization with compact entrypoints, retained source and
  supporting references, explicit ownership checks and content-hash caching.
- Add the skill-manager daemon plugin with configurable skill roots and an
  explicitly selected mesh node; unset and other nodes remain idle.
- Align installed plugin CLI host context with daemon and dashboard commands.
- Remove private SearXNG defaults and persist validated creative-search settings
  through SSSS; context compilation performs no network health probes.
- Update portable IDE skill projections and the single decision skill's current
  integration guidance. OpenAI Decisions remains a limited-preview capability.
- Consume SSSS 0.10.3, which reads large event histories in bounded UTF-8 chunks.

## 3.21.0 — 2026-08-01

### Proposal lifecycle — the optimizer finally has a consumer

The dream cycle generated proposals, a gate stamped ~100% of them `accepted`, and
a storage pruner deleted them three days later. Nothing in between ever read one:
no CLI command, no REST route, no UI. The global vault reached **16,309 proposals
covering 594 distinct targets** (~28 copies each, 64 MB, 95% of the vault) because
every proposal got a random slug, so two proposals requesting identical work never
collided and each cycle re-filed all of them.

- New `total-recall proposals list|show|apply|reject|revert|supersede|stale` and
  `GET/POST /api/proposals*`
- New `src/core/proposal-applier.mjs`: real status machine
  (`draft → accepted → applied | rejected | superseded`), handlers that perform the
  work, byte-exact undo snapshots taken before any mutation, append-only audit trail
- `evaluateProposalGate` now verifies against live vault state and can **reject**.
  It previously accepted `memory-cleanup` if the rationale *string* contained
  "identical predicate:object" — the optimizer grading its own prose — and marked
  every other topic `rejected` without evaluating it, silently discarding real
  findings (stalled workflows, skill decay). Those now park as `draft` for review.
- Duplicate suppression via a stable `topic::target` key, reading `proposals/*.md`
  directly (`getNodes()` returns only `type: memory` nodes and `walkMd()` skips
  `proposals/`, so a `getNodes()`-based check silently suppresses nothing)
- Staleness no longer writes tickets. `refreshStaleKnowledge` enqueues research the
  daemon can actually perform, rate-limited and most-stale-first; `findStaleNodes`
  answers the same question as a read-time query
- The pruner deletes only `applied`/`superseded`. It previously aged out proposals
  alongside log files, destroying open work before anyone could act on it — which is
  much of why this stayed invisible: the queue emptied itself

### Fixed — silent vector-index destruction

A project brain sat at **520 nodes and 0 embeddings**, serving keyword-only recall
indistinguishable from real semantic results, while `compile` printed "Rebuilt…",
"Post-build verification passed: 0 drift" and exited 0.

- `rebuild` did `fs.rmSync(derivedDir, {recursive: true})`, deleting `embeddings.db`.
  Each vector is a provider call and the index is content-hash incremental and
  self-pruning, so discarding it was pure loss. Now preserved across rebuilds.
- `compileSurface` rebuilt embeddings **fire-and-forget** with a bare
  `.catch(() => {})`, so the CLI exited before a single vector was written; and
  `semanticResult` was a hardcoded `{ indexed: 0, unavailable: true }` literal no
  code path could update. Now awaited, with real counts and logged failures.
  Steady-state cost is nil — a second compile reports `0 built, 520 unchanged`.
- `rebuild` now prints vector coverage; the drift check only ever validated the
  jsonl indexes and passed happily on an empty vector index.

### Fixed — destructive duplicate detection

Found by running the applier against a real vault, not by any unit test.

- `generateMemoryCleanupProposals` keyed on `predicate:object` and **ignored
  `subject`**, so every node sharing a *type marker* formed one "duplicate" set —
  15 distinct research projects under `tracked_research_project:knowledge_vault`,
  98 under `documents:portfolio-site`, 156 under `remembers_fact:brain`. Now keyed
  on the full `subject:predicate:object` triple.
- Added `MAX_AUTO_MERGE_SET = 5` and a Jaccard content-similarity floor: a matching
  triple says nodes are *about* the same thing, not that they *state* it. The gate
  enforces the same rules so it can never be laxer than the applier.
- `revertProposal` returned proposals to `accepted` — the daemon's work queue —
  so the next cycle re-applied what was just undone. Now returns to `draft`.
- `rejected` proposals were re-filed every cycle (+5 files/cycle indefinitely),
  because terminal statuses stopped suppressing re-filing. Suppression now covers
  every status except `superseded`, and `rejected` tombstones are never aged out.

**Auto-apply ships disabled** (`AUTO_APPLICABLE_TOPICS` is empty). The
`memory-cleanup` handler is complete and passes every guard, but those guards have
seen exactly one real vault. `proposals apply` runs the identical path with a human
pressing the button. Re-enabling is a one-line change.

### Fixed — firewall bypass window on boot (security)

`throttled-fetch.mjs` called `loadFirewallPolicy(brainDir)` fire-and-forget at
module scope while `throttledFetch` consulted the firewall **synchronously**.
`loadFirewallPolicy` performs three dynamic `import()`s before it ever populates
`blockedDomains`, so every fetch issued during that window saw an empty blocklist
and was allowed through — an empty blocklist being indistinguishable from
"nothing is blocked". The window widens exactly when the process is busy.

`throttledFetch` now awaits the boot load before checking. This also removes a
long-standing suite flake: the three firewall/rate-limit specs failed
intermittently under full-suite load (documented in `vitest.config.js`, which
serialises spec files to compensate) while passing 15/15 in isolation. Verified
across 5 consecutive full runs, 1269 tests, 0 failures.

### Added — provider usage/billing

- New `src/core/usage-fetcher.mjs`, wired into the daemon cycle (self-throttling to
  one live fetch/hour), `GET /api/usage/providers`, and a "Reported by Provider"
  panel on the Usage page. Complements the local token×price-table estimate, which
  cannot see usage from other machines, cache discounts, or tier changes.
- Verified against the provider docs rather than assumed: OpenAI
  `/v1/organization/costs` and Anthropic `/v1/organizations/cost_report` both
  require **admin** keys, not the stored inference keys; OpenRouter
  `/api/v1/credits` works with the ordinary key (lifetime figure, labelled as
  such); **Google has no usage or cost endpoint at all** — spend is only reachable
  through Cloud Billing. These are reported as distinct `needs_admin_key` /
  `unsupported` states, never silently zeroed.

### Fixed — health metric false alarm (regression from 3.20.1)

`/health` counted every `.md` under the vault against embeddings, including
`proposals/` which is never embedded by design, so a 100%-healthy brain reported
"847/16701 — 5% coverage" and tripped a degraded alarm. Now asks `loadNodes()`.

### Testing

- `+80` tests (1187 → 1267, 272 files, 0 failures)
- Embedding contract pinned to the *invariant*, not the model name — this caught
  `runtime.mjs` hardcoding `text-embedding-004` while `embeddings.mjs` defaulted to
  `gemini-embedding-2`, two competing defaults with nothing reconciling them
- Search performance benchmarks: `fastSearch` p95 **8.45ms** against a 50ms budget
- Parallel subagent dispatch / progressive-disclosure integration tests

## 3.19.1 — 2026-07-21

### Fixed / Added
- Fixed network-policy audit events being written inline through the full SSSS kernel commit path (`processViaPackageKernel`/`getTotalRecallEngine` measured 30s+ per call on this vault) — now queued and flushed on a deferred macrotask so it never blocks concurrent request I/O
- Fixed a second server instance losing the `listen()` port race hanging forever with no bound port — now fails fast via a PID lockfile + `error` handler
- Fixed Skills page 404s on any skill under the synthesized "Global" catalog repo (`resolveRegisteredProject` never knew about it, only `project-registry.json` entries)
- Fixed the Rules page ignoring the brain selector entirely (`/api/rules` always read the server's own `cwd()`-detected project via `getBothBrains()`, never the selected brain) — now scoped through `resolveAllVaultsFromQuery` like memory/graph/skills
- Fixed the Skills page's brain-selector integration: multi-brain selection collapsed the list to "Global" only, the deploy-toggle checkbox compared against `'Global'` instead of the real `'global'` id, and toggle/preview calls passed the raw brain id instead of the actual project path
- Fixed a misleading search-availability warning that named services generically instead of the actual env vars to set (`BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `SERPER_API_KEY`)
- Skill sync now also scans known repos for live-but-undiscovered copies of a skill, and self-heals stale auto-generated skill dirs onto the canonical source without needing `--force`
- New `/api/secrets/account-sync`, `/api/secrets/shared-values`, `/api/secrets/tracking-health` endpoints
- Raised vitest's global test timeout (5s → 20s) and fixed several test-isolation bugs (recall's merged search leaking into the real global vault, a broken logger mock, a test treating a returned slug as a filesystem path) surfaced while getting this release to a clean gate

## 3.19.0 — 2026-07-21

### Fixed / Added
- Added OpenRouter as an embedding provider (`getOpenRouterEmbedding`), tried first in the fallback chain — Google's embedding API is currently returning `403 Lightning dunning decision is deny` (billing hold), so trying it first was taxing every `recall` call with a ~15-20s guaranteed-failing timeout before falling through
- Fixed `throttled-fetch.mjs`'s network-policy file watchers (`policyWatcher`/`parentWatcher`) never calling `.unref()`, which kept one-shot CLI commands (e.g. `recall`) alive well past printing their results
- Fixed `config.mjs`'s secrets loader stopping at the first non-empty `secrets.enc` found across its candidate paths, silently discarding real secrets (like `OPENROUTER_API_KEY`) that only existed in a later, richer store — now merges across all found stores instead, earlier sources still winning on key collisions

## 3.18.3 — 2026-07-20

### Fixed / Added
- Live provider account/usage tracking + shared-key detection across secrets
- Research queue actually produces memory nodes (phase gates, deep research factSlug)
- webSearch fallback chain; **SearXNG preferred** via SEARX_URL
- GitHub push webhooks coalesce deploy tasks (no queue flood)
