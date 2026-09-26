---
type: project_document
title: CAPABILITY_DEPLOYMENT_PLUGINS — Project Tracker
description: Living checklist for the Total Recall-owned capability composer and its external proof dependencies.
timestamp: 2026-09-26T03:05:55Z
tags: [project-management, tracker, total-recall, ssss, capability-plugins]
---

# CAPABILITY_DEPLOYMENT_PLUGINS — Project Tracker

> **Project Prefix**: `CAPABILITY_DEPLOYMENT_PLUGINS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-25

---

`[x]` verified · `[/]` actively underway · `[ ]` pending. This is the Total Recall-owned composer project. SSSS and capability-repository work is linked here as an external dependency, then executed in its owning repository.

## ✅ Phase 0: Canonical project scope

Goal: Ground the deployment design in current code and the user's corrected product boundary.

- [x] Audit current Total Recall plugin lifecycle, `ssss new`/bundle/registry paths, Festech reference pack path, and mesh sharing status in [AUDIT](CAPABILITY_DEPLOYMENT_PLUGINS_AUDIT.md) (M)
- [x] Define deployable capability, standalone app, app-owned SSSS data, forkability, and optional hosted mesh in [PRD](CAPABILITY_DEPLOYMENT_PLUGINS_PRD.md) (S)
- [x] Specify app deployment and adapter boundaries in [ARCHITECTURE](CAPABILITY_DEPLOYMENT_PLUGINS_ARCHITECTURE.md) (M)
- [x] Sequence work and verification in [DEVELOPMENT_PLAN](CAPABILITY_DEPLOYMENT_PLUGINS_DEVELOPMENT_PLAN.md) (S)
- [x] Create this project tracker with cross-repo ownership and objective gates (S)

## ⏳ Phase 1: Foundation and external SSSS blockers

Goal: Start implementation from a coherent plugin release and a functioning SSSS scaffold/provisioning path.

- [ ] Base implementation on the committed `PLUGIN_P2P` work (`main` at `5e21133` on 2026-09-25); verify installed package contents and complete independent live sharing checks before claiming public distribution (`src/core/plugin-*`, `docs/projects/in-progress/PLUGIN_P2P/`) (M)
- [ ] **SSSS repo project:** `gregiteen/ssss` → `docs/projects/planned/CAPABILITY_PROVISIONING_CONTRACT/` tracks every SSSS dependency: the three fixes below plus resource bindings, dependency ordering, structural-only upgrade, the HTTP/JSON wire contract + `ssss serve` for non-JS hosts, projection conformance, and path-scoped grants. Record its released version here (M)
- [ ] **SSSS repo:** fix `scripts/cmd-registry.mjs` serializing `set.primitives` when the composed result returns `types`; add CLI regression case (S)
- [ ] **SSSS repo:** complete `src/bundle.mjs` parameter substitution, deterministic id/link remapping, and replay fixtures per spec §§16–17 (L)
- [ ] **SSSS repo:** ensure `scripts/cmd-new.mjs --with-total-recall --install` initializes the new repo's project brain rather than only the default global brain; add scaffold test (S)
- [ ] Record tested SSSS version/ref and adapter compatibility matrix; validate `ssss new` plus canonical conformance on a clean temp app (M)

## ⏳ Phase 2: Total Recall manifest and planner

Goal: Produce a safe, deterministic plan before writing an app.

- [ ] `metadata.plugin.schema.json`: add optional versioned `deploy` contract while preserving current brain-only plugins (M)
- [ ] `src/core/plugin-loader.mjs`: validate targets, adapter names, required SSSS version, resource/access declarations, and relative artifact paths (M)
- [ ] `src/cli/plugin/create.mjs`: scaffold a capability plugin with deployment files and a distinct name from the existing context generator (M)
- [ ] `src/core/app-deploy/source.mjs` + spec: pinned source/hash verification, safe extraction, no symlink/path traversal, no secret/env leakage (M)
- [ ] `src/core/app-deploy/resolve.mjs` + spec: dependency DAG, version constraints, cycles, registry/file ownership collisions, adapter compatibility (L)
- [ ] `src/core/app-deploy/plan.mjs` + spec: source diff, SSSS dry-run envelopes, explicit grants/resources, deterministic plan hash, JSON output (L)
- [ ] `src/cli/app/index.mjs` and `bin/total-recall.mjs`: `app plan --json`; document stable exit codes and result schema (M)
- [ ] Shared adapter contract fixtures: target detection, source generation, kernel bridge, projection rebuild, run/health, cleanup (M)
- [ ] Negative test: an untrusted or incompatible plugin fails planning without writes, provider calls, or plugin execution (M)

## ⏳ Phase 2B: Skills, generated CLIs, and UI elements

Goal: Every plugin ships a repo-adapted skill, a generated CLI, and design-token-driven UI elements.

- [ ] `metadata.plugin.schema.json` + `plugin-loader.mjs`: `skills`, `commands`, `ui` artifact groups (M)
- [ ] Developer/agent commands use Total Recall's existing composable surface, with no new dispatcher: the plugin `cli` handler (`bin/total-recall.mjs` plugin routing) plus project custom commands (`total-recall command create`, stored in `.agent/commands/<name>.mjs`, dispatched at `bin/total-recall.mjs:179`). Extend `src/cli/command.mjs` so a command spec from the manifest generates those files, with `--json`, exit codes, `--help`, and background long-runners (M)
- [ ] App-runtime CLI (must run with Total Recall absent, like Dabber's `crm.py`): per-adapter generation, Node and Python argparse (M)
- [ ] Extend `src/core/skills-registry.mjs`, not a new module: `deploySkill` installs the core under `.agent/skills/<id>/core/` and creates the repo layer once (via `detect`, or by adopting the existing repo skill); `hashSkillContent`/`skillStatus` hash and report the core and the repo layer separately; build on the existing `adaptSkillDescription` per-repo adaptation (L)
- [ ] Plugin `config.schema.json` → generated `total-recall <plugin> config get|set`, collection verbs, `detect [--apply]`, guided `init`, emitted through the same `command` mechanism; all writes validated (L)
- [ ] `skill_config` SSSS host extension type; repo-layer config written through the operation service; `config.json` regenerated as a projection (M)
- [ ] `src/cli/skill.mjs` `push`/`sync`/`pull`: sync only the core layer and never overwrite a repo layer; test with two repos whose code-quality gates differ (M)
- [x] White-label sweep (2026-09-25; grep gate TR-OSS-002 / TR-SHIP-004): replace personal example values in `src/server/tools.mjs` tool descriptions (`gregoryiteen`, `macmini`, `100.64.0.2`) and in any plugin template/help/UI default with generic placeholders; add a grep gate (S)
- [ ] Skill layer contract checks in `skill status` (required config fields, resolvable gate commands, valid tiers); `app verify` calls the same check (M)
- [ ] Adoption test: adopt the existing code-quality skills of total-recall, festech-modular, moogie_crm, and ssss with zero lost gates; a core upgrade leaves every repo layer byte-identical (M)
- [ ] `src/core/app-deploy/design-tokens.mjs` + spec: `DESIGN.md` YAML tokens → CSS variables; reject hardcoded brand values in plugin UI (M)
- [ ] UI element adapters: React/Next and plain web components (for Flask/Jinja hosts like Dabber CRM) (L)
- [ ] `src/cli/plugin/create.mjs`: `--from-skill <path>` packages an existing skill as a capability plugin (M)
- [ ] **Code-quality plugin repo:** skill template + `detect` + generated `check`/`report` CLI + gate-status panel; install into a TypeScript repo and into Dabber CRM (L)
- [ ] Retire bundled `plugins/code-quality` (report-only) once the code-quality plugin repo covers it (coordinated with TR_CORE_PLUGIN_SPLIT Phase 0B) (S)
- [ ] Package the next skills from the audit's skill inventory (test, security, notifications, pwa), each in its own repo (M each)

## ⏳ Phase 3: App-owned apply and standalone mode

Goal: Install a capability into a target app without making Total Recall its runtime/data owner.

- [ ] Define and validate app-local `app_capability_installation` and access-grant SSSS extension types; record status/source pin/grants, no secret values (M)
- [ ] `src/core/app-deploy/apply.mjs` + spec: staged file writes, preflight, verified SSSS actor, append-only install events, repair status after failure (L)
- [ ] `src/core/app-deploy/upgrade.mjs` + spec: structural-only migration, preserved tenant-private data, reapply and interrupted-upgrade tests (L)
- [ ] `src/core/app-deploy/standalone.mjs` + spec: `ssss new` in empty staging directory, project Total Recall init, runnable app shell, gates, publish (L)
- [ ] `src/cli/app/` add/create/upgrade/verify commands; `--json` and dry-run cover each mutating operation (M)
- [ ] `src/core/app-deploy/verify.mjs` + spec: hashes, SSSS lock/conformance, app feature tests, projection drift/rebuild (M)
- [ ] Denied data read/write, undeclared secret/provider, and malicious path tests prove access boundaries (M)
- [ ] Clean-room test: standalone app starts and exports its vault with Total Recall stopped; existing app preserves unrelated code/data after add/reapply (L)

## ⏳ Phase 4: First reusable capability repositories

Goal: Show that skills become portable app features, not Festech-specific runtime modules.

- [ ] **Frontend-designer plugin repo:** create own repo, manifest, generic authoring skill, brand/page input, selected UI adapter, design-plan and output tests (L)
- [ ] **Frontend-designer plugin repo:** validate responsive/accessibility/browser behavior and reject hardcoded Festech domain, palette, logo, or production secrets in generic output (M)
- [ ] **Messaging/chat plugin repo:** inventory reusable Festech code; extract a minimal vertical slice into its own repo with SSSS extension, structural bundle, runtime UI/API, Node/TypeScript/SQLite adapter, and tests (L)
- [ ] **Messaging/chat plugin repo:** prove standalone operation, existing-app install, send/read flow, permissions, private-data export and projection rebuild (L)
- [ ] **Festech-modular repo:** compose frontend-designer and messaging plugins; run a second clean unrelated app from the same plugin pins (L)
- [ ] Verify original Festech production target remains untouched pending its separate parity/cutover project (S)

## ⏳ Phase 4B: Festech capability extraction into plugins

Goal: Turn each Festech capability in the [audit inventory](CAPABILITY_DEPLOYMENT_PLUGINS_AUDIT.md#festech-capability-inventory-extraction-source) into a standalone-or-composable Total Recall capability plugin. Every item needs clean extracted source, injected ports, a namespaced SSSS extension with alias fixtures, and passing standalone plus composed installs.

- [ ] **Gate:** `festech-modular` type-ownership and alias map (its A-04) exists before any extraction renames a type (external) (M)
- [ ] **Email plugin repo:** extract `email.ts` + `packages/email`; provider port; send/receive status events (L)
- [ ] **Domains plugin repo:** extract `domains.ts`; registrar/DNS/SSL ports; shared identity contract with email (L)
- [ ] **App-translator plugin repo:** extract `next-intl` catalogs + string extraction + translation pipeline; model port via CLI agents/OpenRouter (no Gemini API); per-app locale list; RTL check for `ar` (M)
- [ ] **Tracking-cookies plugin repo:** extract consent banner, page-view tracker, analytics router; make consent gate every non-essential tracker (currently "Essential only" gates nothing); consent choice + page views as SSSS events (M)
- [ ] **Onsite-operations plugin repo:** extract `operations.ts`/`liveops.ts` + scanner; event/scanner id contract with ticketing (L)
- [ ] **Event-ticketing plugin repo:** move `tickets.ts` direct writes to canonical SSSS first, then extract sales/check-in/transfer/refund (L)
- [ ] **Marketing plugin repo:** extract campaign paths from `comms.ts` onto the messaging plugin; independent runtime (M)
- [ ] **Secrets-manager plugin repo:** re-test and fix `--keys` scoped delivery first; app-owned runtime store that works with Total Recall offline (L)
- [ ] **Social plugin repo:** extract `social.ts`; live provider acceptance before the release flag is turned on (M)
- [ ] **Accounting plugin repo:** canonicalize `finance.ts` ledger writes; protected-action authorization and audit (L)
- [ ] **Legal plugin repo:** extract `legal.ts`/`contracts.ts`; protected-action audit; human review gate (L)
- [ ] Each plugin: `app plan` + standalone + composed install pass shared fixtures; no Festech identifiers or credentials in output (M each)

## ⏳ Phase 5: Portability and optional bridges

Goal: Prove extensibility across agents, languages, and projections without claiming universal support prematurely.

- [ ] Python host adapter modeled on Dabber CRM (`ssss_bridge.py` → stdin-JSON `ssss-store.mjs`) passes SSSS fixtures, app-owned data tests, and runtime proof; disclose any Node bridge requirement (L)
- [ ] Second SQL projection adapter passes rebuild/drift fixtures; unsupported stack pairs fail `app plan` with a clear error (M)
- [ ] Codex plus Claude Code or Antigravity invoke the same composable CLI on the same pinned capability; compare plan hash, output, conformance, and explicit auth/grant prompts (M)
- [ ] Create a separate API-integration meta-plugin repo/project: one described provider yields a reviewed operation model and app CLI/API surface; test provider auth, pagination, rate limit, webhook verification, permissions, secrets, and SSSS mapping (L)
- [ ] Optional MCP bridge plugin repo/project exposes the same approved CLI/SSSS operations to MCP clients; no duplicate business logic, no requirement for base CLI proof (M)
- [ ] Secrets-manager plugin repo/project: preserve audited key-handling core, add standalone/composed secret-reference UI, scoped provider adapters and rotation; prove `--keys` cannot deliver another app's key or a whole-project projection (L)

## ⏳ Phase 6: Test, release, and truthful claims

Goal: Verify a real app lifecycle and document every material limitation before release.

- [ ] Run Total Recall background code-quality gate and full suite on Mac Mini; run SSSS conformance and each plugin repo's own gate (M)
- [ ] Test source/package contents, signature/hash failure, path/symlink escape, dependency cycle, registry collision, denied scope, secret isolation, mid-apply failure, repeat/upgrade, and data export/import (L)
- [ ] Verify local/offline create/add/run/export without mesh or paid service; separately close `PLUGIN_P2P` live public exchange before advertising that path (M)
- [ ] Run real browser UI/API smoke in standalone and modular reference apps; preserve Festech live production until the modular project authorizes cutover (M)
- [ ] Update Total Recall CLI/OpenWiki/plugin-authoring docs, SSSS links, and app-generated documentation; then verify commit/push/release artifact under the repo's release skill (M)
- [ ] Public-plugin gate: explicit license, clean forkable repository history, source provenance, secret/private-asset scan, reproducible package, and pinned immutable digest verified on install (M)
- [ ] Publish an honest support matrix: tested adapters, languages, databases, agent surfaces, remaining gaps, and ownership/export guarantees (S)

## Hosted mesh commercialization blocker (separate project)

The composer may optionally use a private mesh executor, but no paid hosted multi-user Headscale service is ready from this tracker. Headscale documents a [single-tailnet design](https://github.com/juanfont/headscale/blob/main/docs/index.md) and [scale limits under node churn](https://github.com/juanfont/headscale/blob/main/docs/about/faq.md). A separate commercial project must prove tenant/control-plane isolation, authorization, scale, support and incident response, and app-owner data exit before launch. One shared multi-tenant instance is not an accepted default.

## Verification Log

- 2026-09-25: Read-only audit of current Total Recall source (rebased to `5e21133`), SSSS 0.9.6 source/spec, and Festech pack/host bridge. Canonical five-document project created in an isolated Total Recall worktree; implementation and end-to-end deployment have not started.
- 2026-09-25: `node .agent/skills/ssss/scripts/validate-schema.mjs <each project document>` passed all five universal frontmatter checks. The helper warns that `project_document` is a repo document convention outside the SSSS core registry; these docs are outside the managed application vault. No app-state conformance is implied by this document check.
- 2026-09-25: Moved into the `total-recall` main checkout from an uncommitted worktree (`total-recall-capability-deploy`, branch `docs/capability-deployment-plugins`). Added the Festech capability inventory (audit), Phase 3B (plan), and Phase 4B (tracker) so the full extraction is tracked here per user direction. Deleted the obsolete `planned/gpu-intelligence-network` and `planned/living-memory-capsule-ultrachat` projects.
- 2026-09-25: Added the app-translator and tracking-cookies plugins to the inventory and Phase 4B (user request). Created the SSSS dependency project `CAPABILITY_PROVISIONING_CONTRACT` in `gregiteen/ssss` after reproducing its defects with the installed CLI 0.9.6.
- 2026-09-25: Added requirements from the user: code-quality plugin, skills → plugins (scaffold the skill, generate the CLI), CLI + UI elements for every plugin themed by design tokens, and Dabber CRM as the Python reference host (Phase 1B plan / Phase 2B tracker, S12). Read `moogie_crm` `ssss_bridge.py`, `scripts/ssss-store.mjs`, `crm.py`, `DESIGN.md`, `registry/extensions/dabber-crm.json`.
- 2026-09-25: User: code-quality must be customized per repo; many core skills have repo-specific implementations. Measured: 7–21 repo copies per core skill in ~/Github; the code-quality gates of 4 repos share only a test tier, and the runner itself has drifted. Plan changed to two-layer skills (plugin-owned core, repo-owned implementation, adoption + drift report).
- 2026-09-25: User: skill plugins must be customizable through the Total Recall CLI so they scaffold correctly; everything white-label and open source; standard Total Recall features should split out the same way (new planned project `TR_CORE_PLUGIN_SPLIT`). Found that `skill push`/`sync` fan one copy out to every repo and would overwrite repo layers; added a task to restrict them to the core layer.
- 2026-09-25: User decision: every plugin has its own repository, including skill plugins and the plugins bundled today.
- 2026-09-25: Reworked Phase 2B to reuse Total Recall's composable CLI instead of new modules: plugin `cli` routing + project custom commands (`total-recall command`, dispatched at `bin/total-recall.mjs:179`) for generated commands, and `skills-registry.mjs` (`deploySkill`, `skillStatus` hash drift, `adaptSkillDescription`) for two-layer skills. Dropped the planned `cli-gen.mjs` and `skill-render.mjs`.
