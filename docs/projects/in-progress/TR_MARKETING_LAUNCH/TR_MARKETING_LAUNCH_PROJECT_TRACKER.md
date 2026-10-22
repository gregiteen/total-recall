# TR_MARKETING_LAUNCH — Project Tracker

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Based on audit**: `TR_MARKETING_LAUNCH_AUDIT.md` (Complete, d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423)

---

## ✅ Phase 0: Exhaustive Audit, Web Discovery, and Typed Decision Set

Goal: Establish comprehensive, evidence-based process and product audit, execute web discovery, and record typed SSSS decision events.

- [x] Complete comprehensive codebase and 32-plugin audit in [TR_MARKETING_LAUNCH_AUDIT.md](/Users/gregoryiteen/github/total-recall/docs/projects/in-progress/TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_AUDIT.md)
- [x] Conduct extensive web research on 2026 vibe coding viral hooks, AI software factories, and semantic CLI search engines
- [x] Fix `tr-plugin-decision` CLI help and candidate secret store resolution, push changes, and record typed SSSS decision events for launch strategy (`marketing-launch-strategy.md`)
- [x] Sync default scaffold plugins via `syncScaffoldPlugins` and verify zero drift
- [x] Author comprehensive brand PRD in [TR_MARKETING_LAUNCH_PRD.md](/Users/gregoryiteen/github/total-recall/docs/projects/in-progress/TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_PRD.md)
- [x] Author unified system architecture in [TR_MARKETING_LAUNCH_ARCHITECTURE.md](/Users/gregoryiteen/github/total-recall/docs/projects/in-progress/TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_ARCHITECTURE.md)
- [x] Author phased development plan in [TR_MARKETING_LAUNCH_DEVELOPMENT_PLAN.md](/Users/gregoryiteen/github/total-recall/docs/projects/in-progress/TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_DEVELOPMENT_PLAN.md)

## ⏳ Phase 1: Automatic Semantic CLI & Verb Index

Goal: Implement automatic zero-cost semantic vector indexing over all 415+ built-in commands, plugin operations, and composed commands (`A-011`, `D-002`).

- [ ] Create `src/core/cli-semantic-index.mjs` to harvest, hash, and index all built-in commands, plugin operations, and composed commands
- [ ] Integrate automatic index rebuild into `compileSurface` (`src/core/surface.mjs`) using zero-cost Ollama `nomic-embed-text:latest` vectors
- [ ] Enrich `total-recall context "<task>"` to inject the top matched CLI and plugin verbs automatically
- [ ] Update `src/cli/help.mjs` to support natural-language queries and unknown-command fallback via the semantic index
- [ ] Add unit tests verifying index rebuilds, vector queries, and context enrichment

## ⏳ Phase 2: Official Marketing Plugin (`tr-plugin-marketing`)

Goal: Build and integrate `tr-plugin-marketing` (`total-recall marketing`) as an official plugin and vendorable brick (`A-012`, `D-003`).

- [ ] Initialize repository at `/Users/gregoryiteen/github/tr-plugin-marketing` with `plugin.json` and package manifest
- [ ] Implement SSSS brand positioning storage (`brand` subcommand)
- [ ] Implement deterministic copy compliance gate (`lint` subcommand) checking banned terms (`A-007`) and trailing prepositions (`A-008`)
- [ ] Implement SEO/OpenGraph auditor (`seo-audit` subcommand) and UTM click attribution (`links` subcommand)
- [ ] Implement bespoke interactive JavaScript card (`ui/card.js`)
- [ ] Symlink into project and global brain plugin roots and register with Total Recall CLI

## ⏳ Phase 3: Plugin, Scaffold & Multi-Root Parity Alignment

Goal: Resolve repository path discrepancies and complete visual card coverage across all plugins (`A-003`–`A-007`).

- [ ] Relocate `/Users/gregoryiteen/tr-plugin-embeddings` to `/Users/gregoryiteen/github/tr-plugin-embeddings`
- [ ] Align symlinks in `.agent/skills/total-recall/plugins/` and `~/.agent/skills/total-recall/plugins/` to guarantee full parity
- [ ] Author bespoke functional `ui/card.js` cards for `embeddings` and `hermes`

## ⏳ Phase 4: Public Positioning, OpenWiki Hubs & Launch Assets

Goal: Overhaul public onboarding surfaces and author viral launch campaigns (`A-002`, `A-010`).

- [ ] Rewrite `README.md` and `package.json` to showcase the Software Factory, Daily Driver, 32 plugins, and zero-cost embeddings
- [ ] Sanitize OpenWiki templates and update `openwiki/` hubs with complete plugin and software factory documentation
- [ ] Author persona-specific launch threads for Makers, Builders, Founders, and Sellers

## ⏳ Phase 5: Quality Gate & Verification Walkthrough

Goal: Complete full verification suite, surface compilation, and git remote push.

- [ ] Run `check:package`, `check:dist`, `check:ssss-registry`, and scaffold state validation
- [ ] Recompile all instruction surfaces with `total-recall compile`
- [ ] Verify clean working tree and push all commits to remote origin

---

## Verification Log

- 2026-10-21: `node bin/total-recall.mjs doctor` — Passed with verified server and clean instruction surfaces.
- 2026-10-21: `npm run check:package` — Passed cleanly with 850 files verified.
- 2026-10-21: `node scripts/check-scaffold-state.mjs` — Passed cleanly with 0 errors.
- 2026-10-21: `npm run check:ssss-registry` — Passed cleanly with spec 0.9 integrity verified.
- 2026-10-21: `node bin/total-recall.mjs openwiki ingest openwiki` — Ingested 7 hubs cleanly with 0 errors.
- 2026-10-21: `node bin/total-recall.mjs openwiki hubs` — 7 hubs active and indexed.
- 2026-10-21: `node bin/total-recall.mjs compile` — Rebuilt with zero-cost local/cloud embeddings via `nomic-embed-text:latest`: 926 built, 0 unchanged, 0 drift.
- 2026-10-21: `node bin/total-recall.mjs embeddings status` — Verified 926 embedded nodes (98% coverage) with zero-cost Ollama endpoint.
- 2026-10-21: `node scripts/sync-scaffold-plugins.mjs` — Synchronized 209 pinned files across 9 default plugins, verified 0 changes with `--check`.
- 2026-10-21: `node bin/total-recall.mjs decision sets validate` — Passed 1/1 sets (`marketing-launch-strategy`).
- 2026-10-21: `node bin/total-recall.mjs decision run --set marketing-launch-strategy` — Successfully executed with deterministic fallback logged to `.events/decisions.jsonl`.

---

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-22T03:21:37Z | Antigravity | Web research regarding 2026 vibe coding and agent memory trends | Completed | Retrieval log step 2 |
| 2026-10-22T03:21:40Z | Antigravity | Executed `total-recall --help` | Succeeded | CLI inventory displayed |
| 2026-10-22T03:21:43Z | Antigravity | Executed `total-recall context` | Ready: true | Capsule token count 12684 |
| 2026-10-22T03:22:43Z | Antigravity | Executed `total-recall doctor` | Passed | Diagnostics healthy |
| 2026-10-22T03:22:47Z | Antigravity | Executed package and registry integrity checks | Passed | Clean exits across all checks |
| 2026-10-22T03:25:06Z | Antigravity | Authored initial `TR_MARKETING_LAUNCH_AUDIT.md` | Created | Audit marked Complete |
| 2026-10-22T03:30:24Z | Antigravity | Executed full semantic `total-recall compile` using Ollama | Succeeded | 926/926 nodes embedded via nomic-embed-text:latest |
| 2026-10-22T03:30:32Z | Antigravity | Verified zero-cost embeddings status | Verified | 926 nodes embedded, 0 cost |
| 2026-10-22T03:39:01Z | Antigravity | Tested `sync-scaffold-plugins --check` | Identified drift | 1 file changed in cli-agents/src/setup.mjs |
| 2026-10-22T03:40:17Z | Antigravity | Executed `node scripts/sync-scaffold-plugins.mjs` | Succeeded | 209 pinned files synced, 0 changes remaining |
| 2026-10-22T03:40:43Z | Antigravity | Removed premature non-standard marketing files | Cleaned | Restored strict 5-file project set |
| 2026-10-22T03:43:09Z | Antigravity | Rewrote `TR_MARKETING_LAUNCH_AUDIT.md` with full 32-plugin audit | Completed | Findings A-001 through A-012 documented |
| 2026-10-22T03:44:38Z | Antigravity | Updated audit findings with A-011 and A-012 | Updated | Semantic index and marketing plugin defined |
| 2026-10-22T03:45:23Z | Antigravity | Rewrote `TR_MARKETING_LAUNCH_PRD.md` from comprehensive audit | Updated | Unified vision and automated architecture |
| 2026-10-22T03:46:03Z | Antigravity | Rewrote `TR_MARKETING_LAUNCH_ARCHITECTURE.md` | Updated | Detailed Semantic CLI Index and tr-plugin-marketing |
| 2026-10-22T03:47:13Z | Antigravity | Fixed `--help` and `-h` handling in `tr-plugin-decision/cli.mjs` | Fixed | Pushed commit 9858b96 to tr-plugin-decision |
| 2026-10-22T03:49:00Z | Antigravity | Fixed multi-store secret resolution in `tr-plugin-decision/auth-client.mjs` | Fixed | Pushed commit 8b97582 to tr-plugin-decision |
| 2026-10-22T03:49:49Z | Antigravity | Web research regarding viral adoption and semantic CLI discovery | Completed | 2026 agentic CLI trends cataloged |
| 2026-10-22T03:50:26Z | Antigravity | Authored `marketing-launch-strategy.md` SSSS decision set | Created | Validated in vault |
| 2026-10-22T03:51:10Z | Antigravity | Added SSSS question-set deterministic fallback to `tr-plugin-decision` | Fixed | Pushed commit 337dbe4 to tr-plugin-decision |
| 2026-10-22T03:51:16Z | Antigravity | Ran `total-recall decision run --set marketing-launch-strategy` | Succeeded | Fallback recorded in .events/decisions.jsonl |
| 2026-10-22T03:51:47Z | Antigravity | Updated `TR_MARKETING_LAUNCH_DEVELOPMENT_PLAN.md` | Updated | Six-phase execution roadmap defined |
