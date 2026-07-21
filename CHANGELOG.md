## 3.19.0 — 2026-07-21

### Fixed / Added
- Added OpenRouter as an embedding provider (`getOpenRouterEmbedding`), tried first in the fallback chain — Google's embedding API is currently returning `403 Lightning dunning decision is deny` (billing hold), so trying it first was taxing every `recall` call with a ~15-20s guaranteed-failing timeout before falling through
- Fixed `throttled-fetch.mjs`'s network-policy file watchers (`policyWatcher`/`parentWatcher`) never calling `.unref()`, which kept one-shot CLI commands (e.g. `recall`) alive well past printing their results
- Fixed `config.mjs`'s secrets loader stopping at the first non-empty `secrets.enc` found across its candidate paths, silently discarding real secrets (like `OPENROUTER_API_KEY`) that only existed in a later, richer store — now merges across all found stores instead, earlier sources still winning on key collisions
- Fixed network-policy audit events being written inline through the full SSSS kernel commit path (`processViaPackageKernel`/`getTotalRecallEngine` measured 30s+ per call on this vault) — now queued and flushed on a deferred macrotask so it never blocks concurrent request I/O
- Fixed a second server instance losing the `listen()` port race hanging forever with no bound port — now fails fast via a PID lockfile + `error` handler
- Fixed Skills page 404s on any skill under the synthesized "Global" catalog repo (`resolveRegisteredProject` never knew about it, only `project-registry.json` entries)
- Fixed the Rules page ignoring the brain selector entirely (`/api/rules` always read the server's own `cwd()`-detected project via `getBothBrains()`, never the selected brain) — now scoped through `resolveAllVaultsFromQuery` like memory/graph/skills
- Fixed the Skills page's brain-selector integration: multi-brain selection collapsed the list to "Global" only, the deploy-toggle checkbox compared against `'Global'` instead of the real `'global'` id, and toggle/preview calls passed the raw brain id instead of the actual project path
- Fixed a misleading search-availability warning that named services generically instead of the actual env vars to set (`BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` / `SERPER_API_KEY`)
- Skill sync now also scans known repos for live-but-undiscovered copies of a skill, and self-heals stale auto-generated skill dirs onto the canonical source without needing `--force`
- New `/api/secrets/account-sync`, `/api/secrets/shared-values`, `/api/secrets/tracking-health` endpoints
- Raised vitest's global test timeout (5s → 20s) and fixed several test-isolation bugs (recall's merged search leaking into the real global vault, a broken logger mock, a test treating a returned slug as a filesystem path) surfaced while getting this release to a clean gate

## 3.18.3 — 2026-07-20

### Fixed / Added
- Live provider account/usage tracking + shared-key detection across secrets
- Research queue actually produces memory nodes (phase gates, deep research factSlug)
- webSearch fallback chain; **SearXNG preferred** via SEARX_URL
- GitHub push webhooks coalesce deploy tasks (no queue flood)

