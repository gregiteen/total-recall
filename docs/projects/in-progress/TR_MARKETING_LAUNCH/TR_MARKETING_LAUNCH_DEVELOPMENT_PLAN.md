# TR_MARKETING_LAUNCH — Development Plan

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Based on audit**: `TR_MARKETING_LAUNCH_AUDIT.md` (Complete, d7fc0bc16f0c9c6b4d2a15f0b81031e410d7e423)

---

## 1. Plan Overview & Objectives

This development plan coordinates the execution milestones required to launch Total Recall as **The Vibe Brain & Autonomous Software Factory**.

Every milestone directly resolves findings `A-001` through `A-012` from `TR_MARKETING_LAUNCH_AUDIT.md`:
1. Build the **Automatic Semantic CLI Index** so no command or plugin verb gets lost (`A-011`).
2. Build the official **`tr-plugin-marketing` (`total-recall marketing`)** plugin as both Total Recall's launch engine and a vendorable app brick (`A-012`).
3. Align plugin paths, scaffold synchronization, and visual cards across the 32-plugin catalog (`A-003`–`A-007`).
4. Overhaul public documentation, OpenWiki hubs, and onboarding assets with strict compliance forbidding competitor IDE strings and trailing prepositions (`A-002`, `A-004`, `A-008`–`A-010`).

---

## 2. Milestone Breakdown

### Phase 0: Exhaustive Audit, Web Discovery, and Typed Decision Set (Completed)
- [x] Complete comprehensive codebase, 32-plugin ecosystem, and process audit in [TR_MARKETING_LAUNCH_AUDIT.md](/Users/gregoryiteen/github/total-recall/docs/projects/in-progress/TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_AUDIT.md).
- [x] Conduct extensive web research analyzing 2026 vibe coding viral hooks, software factories, and semantic CLI search tools (`A-002`, `A-011`).
- [x] Fix `tr-plugin-decision` CLI help and candidate secret store resolution, push changes, and record typed SSSS decision events for launch strategy (`marketing-launch-strategy.md`).
- [x] Sync default scaffold plugins via `syncScaffoldPlugins`, verifying zero drift (`A-003`).

### Phase 1: Automatic Semantic CLI & Verb Index
- **Goal:** Implement automatic zero-cost semantic vector indexing over all 415+ built-in commands, plugin operations, and composed commands (`A-011`, `D-002`).
- Tasks:
  - Create `src/core/cli-semantic-index.mjs` to harvest and hash all command signatures and descriptions.
  - Wire index generation into `compileSurface` (`src/core/surface.mjs`) using local/cloud Ollama `nomic-embed-text:latest` vectors with hybrid keyword fallback.
  - Enrich `total-recall context "<task>"` to inject top matched CLI and plugin verbs automatically before agent actions.
  - Update `src/cli/help.mjs` to support natural-language queries and unknown-command fallback via the semantic index.
  - Add unit tests verifying index rebuilds, vector queries, and context enrichment.

### Phase 2: Official Marketing Plugin (`tr-plugin-marketing`)
- **Goal:** Build and integrate `tr-plugin-marketing` (`total-recall marketing`) as an official plugin and vendorable brick (`A-012`, `D-003`).
- Tasks:
  - Initialize repository at `/Users/gregoryiteen/github/tr-plugin-marketing` with `plugin.json` and package manifest.
  - Implement SSSS brand positioning storage (`brand` subcommand).
  - Implement deterministic copy compliance gate (`lint` subcommand) checking banned terms (`A-007`) and trailing prepositions (`A-008`).
  - Implement SEO/OpenGraph auditor (`seo-audit` subcommand) and UTM click attribution (`links` subcommand).
  - Implement bespoke interactive JavaScript card (`ui/card.js`).
  - Symlink into project and global brain plugin roots and register with Total Recall CLI.

### Phase 3: Plugin, Scaffold & Multi-Root Parity Alignment
- **Goal:** Resolve repository path discrepancies and complete visual card coverage across all plugins (`A-003`–`A-007`).
- Tasks:
  - Relocate `/Users/gregoryiteen/tr-plugin-embeddings` to `/Users/gregoryiteen/github/tr-plugin-embeddings`.
  - Align symlinks in `.agent/skills/total-recall/plugins/` and `~/.agent/skills/total-recall/plugins/` to guarantee full parity.
  - Author bespoke functional `ui/card.js` cards for `embeddings` and `hermes`.

### Phase 4: Public Positioning, OpenWiki Hubs & Launch Assets
- **Goal:** Overhaul public onboarding surfaces and author viral launch campaigns (`A-002`, `A-010`).
- Tasks:
  - Rewrite `README.md` and `package.json` to showcase the Software Factory, Daily Driver, 32 plugins, and zero-cost embeddings.
  - Sanitize OpenWiki templates and update `openwiki/` hubs with complete plugin and software factory documentation.
  - Author persona-specific launch threads for Makers, Builders, Founders, and Sellers.

### Phase 5: Quality Gate & Verification Walkthrough
- **Goal:** Complete deterministic verification, surface compilation, and git push.
- Tasks:
  - Run `check:package`, `check:dist`, `check:ssss-registry`, and scaffold state validation.
  - Recompile all instruction surfaces with `total-recall compile`.
  - Verify clean working tree and push all commits to remote repositories.

---

## 3. Invariants & Guardrails

- **Zero Sentence-Ending Prepositions (`preferences-e415549e`):** Every authored line across documentation, READMEs, OpenWiki hubs, and code comments must conclude without a terminal preposition.
- **Zero Prohibited Competitor Mentions (`no-cursor-or-windsurf-mentions`):** All copy must remain free from restricted IDE terms.
- **Always Push Everything (`always-push-everything`):** All completed commits across `total-recall` and plugin repositories must push to remote origin immediately.
- **Full Automation:** Tool discovery, surface compilation, and scaffold maintenance must execute automatically without requiring manual operational steps from Greg.
