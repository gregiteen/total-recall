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

