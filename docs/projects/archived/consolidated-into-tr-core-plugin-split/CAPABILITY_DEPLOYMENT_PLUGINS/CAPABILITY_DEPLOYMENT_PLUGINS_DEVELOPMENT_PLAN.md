---
type: project_document
title: CAPABILITY_DEPLOYMENT_PLUGINS — Development Plan
description: Dependency-ordered phases and verification gates for Total Recall app capability deployment.
timestamp: 2026-09-30T16:30:00Z
tags: [project-management, development-plan, total-recall, ssss, capability-plugins]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# CAPABILITY_DEPLOYMENT_PLUGINS — Development Plan

> **Project Prefix**: `CAPABILITY_DEPLOYMENT_PLUGINS`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-25

---

Implement in dependency order. Each phase has a binary gate; the [tracker](CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md) holds file-level progress. Keep edits in the owning repository. The legacy Festech production site is outside this project's deploy path.

## Phase 0 — Reconcile foundations

- [ ] Base implementation on the committed `PLUGIN_P2P` work now on `main`, verify the actual installed npm package before release claims, preserve brain-only plugin behavior, and run its focused tests.
- [ ] In `gregiteen/ssss`, fix and verify `registry compose`'s `types`/`primitives` mismatch, bundle parameter substitution and id/link remap, and the `ssss new --with-total-recall --install` project-brain initialization path. Reference exact SSSS commits from this tracker when complete.
- [ ] Freeze a small, versioned capability deployment contract and a compatibility matrix. Confirm a fresh `ssss new` scaffold and its conformance test run without Total Recall product code.

**Done when:** current SSSS CLI registry/bundle/scaffold commands pass their own conformance suite and a plugin manifest cannot falsely advertise unsupported app deployment.

## Phase 1 — Manifest and read-only planner in Total Recall

- [ ] Extend `metadata.plugin.schema.json`, `src/core/plugin-loader.mjs`, and `src/cli/plugin/create.mjs` with optional `deploy` metadata and a capability-plugin starter. Existing plugins remain valid.
- [ ] Implement source/hash resolution and declarative dependencies in new focused modules under `src/core/app-deploy/`; reject invalid paths, links, cycles, ownership collisions, missing adapters, conflicting SSSS extension types, and unpinned remote sources.
- [ ] Add `src/cli/app/` with `plan --json` and route it from `bin/total-recall.mjs`. Plans include source and vault diffs, permissions, resources, adapter gates, and deterministic plan hashes. No plan step invokes a provider or executes plugin code.
- [ ] Define shared adapter conformance fixtures and a contract test harness for target detection, generation, SSSS operation bridge, projection rebuild, run/health, and cleanup.

**Done when:** focused tests prove determinism; invalid/colliding plugins fail before writes; the existing Total Recall `plugin install` and context generator tests still pass.

## Phase 1B — Skills, generated CLIs, and UI elements

- Add `skills`, `commands`, and `ui` to the `deploy` contract. Generate developer/agent commands through Total Recall's existing composable CLI (plugin `cli` routing and `total-recall command`), and the app-runtime CLI per language adapter (Node, Python). Make `skills-registry.mjs` layer-aware (core vs repo layer, with `detect` or adoption) instead of adding a new renderer. Add design-token → CSS-variable generation.
- Extend `plugin create` with `--from-skill <path>` to package an existing skill as a capability plugin.
- Build the **code-quality plugin** as the first proof: install it into a TypeScript repo and into Dabber CRM. Retire the report-only bundled plugin once the new one covers `report`.

**Done when:** S12 passes for code-quality in both a Node and a Python target.

## Phase 2 — App-owned SSSS lifecycle and local apply

- [ ] Define the app-owned installation and access-grant extension types in an SSSS registry; register them without redefining core primitives. Persist grants/install status through the target app's verified SSSS Operation Contract and append-only events.
- [ ] Implement `app add`/`upgrade` using staged source writes and complete SSSS dry-run preflight. Reapply the same plan idempotently; upgrades touch structural documents and owned source only. Failed apply records a truthful repair state and preserves tenant-private data.
- [ ] Implement `app create`: invoke `ssss new` in an empty staging directory, initialize a project-level Total Recall brain for development, apply a standalone-capable plugin and runtime shell, run gates, then atomically publish the new directory. Avoid `--force` over an existing app.
- [ ] Implement `app verify` for source digests, extension lock, install events, conformance, projection rebuild, and adapter feature checks.

**Done when:** a locally sourced plugin runs in a standalone app and in an existing compatible app; both keep working with Total Recall stopped. Denied access and mid-apply failure leave no unaccounted user data change.

## Phase 3 — First capability composition

- [ ] Create a separate frontend-designer plugin repository. Adapt existing design/UI skills as agent guidance, add generic brand/page inputs and a selected UI adapter, and generate reviewable app-owned UI source plus validation. Prove no Festech brand or production URLs leak into generic output.
- [ ] Create a separate messaging/chat capability repository using existing Festech code as a source inventory, then extract the smallest functional slice. Include its own SSSS extension/bundle, Node/TypeScript + SQLite projection adapter, UI/API, resource declarations, tests, and standalone entrypoint. Do not copy Festech DB or tenant data.
- [ ] Compose these two plugins into `gregiteen/festech-modular` and an unrelated fresh app. Keep Festech's live deployment script/target isolated from the modular repo.

**Done when:** a user can create an unbranded standalone chat app, install chat into a compatible existing app, send/read a message in both, export/import the app-owned vault, and rebuild the projection. Both app tests and SSSS conformance pass.

## Phase 3B — Extract the remaining Festech capabilities into plugins

After messaging proves the contract, extract each remaining capability in the [audit inventory](CAPABILITY_DEPLOYMENT_PLUGINS_AUDIT.md#festech-capability-inventory-extraction-source) into its own plugin repo, using the same `deploy` manifest, `app plan/add/create/verify` path, and adapter fixtures. Order: email → domains → app translator → tracking cookies → onsite operations → event ticketing → marketing → secrets manager → social → accounting → legal. Extractable items go first; partial items wait for their named blocker.

For each plugin:
- Start from clean extracted source with attribution, never Festech's full history.
- Replace Festech DB, identity, and provider imports with injected ports.
- Publish a namespaced SSSS extension with alias fixtures from `festech-modular`'s ownership map.
- Pass standalone and composed installs with the shared fixtures.
- Carry no Festech names, domains, or credentials.

**Done when:** every inventory row is either a plugin with a passing standalone and composed install, or has a recorded blocker in the tracker.

## Phase 4 — Portability, agents, and integrations

- [ ] Add a Python-host adapter through a declared SSSS bridge or a native conformant implementation, with its Node dependency disclosed if bridged. Run the same app/permission/export fixtures.
- [ ] Add a second database projection adapter and run rebuild/drift tests. Advertise only tested language/database combinations; unsupported combinations must fail in `plan`.
- [ ] Have at least two distinct agents among Codex, Claude Code, and Antigravity invoke the same CLI against the same pinned capability. Compare plan hash and resulting app/conformance; document authorization differences without agent-specific business logic.
- [ ] After the base contract is stable, create a separate **API-integration meta-plugin** repository. It accepts an API description and generates a reviewed operation model that can surface through the app CLI/API and optionally MCP. Per-provider auth, pagination, rate limits, webhooks, secret handling, permission scopes, and SSSS data mapping are explicit adapter work and tests. Do not claim arbitrary APIs are fully automatic.
- [ ] Optionally create a separate MCP bridge plugin that exposes the same CLI and SSSS operations to MCP clients, using the current SDK contract at implementation time. It is not needed for the two-agent CLI proof.
- [ ] Create a separately tracked secrets-manager capability after the audited secret core is safe: standalone/composed UI, app-scoped references, provider adapters and rotation. Test `--keys` against target repo binding and historical full-projection behavior before claiming selective delivery.

**Done when:** the adapter matrix and cross-agent proof are independently reproducible. Integration and MCP plugins have separate project trackers and cannot silently bypass the core plan/apply path.

## Phase 5 — Release and verification

- [ ] Run Total Recall's repo code-quality gate and full suite on the prescribed background/Mac Mini path. Run SSSS conformance, generated app feature tests, clean-room browser checks, source package contents, and secret-surface scans.
- [ ] Run failure tests: malicious path/symlink, hash mismatch, registry collision, denied vault scope, undeclared provider/secret, interrupted apply, repeated apply/upgrade, damaged projection, and export after Total Recall removal.
- [ ] Verify local/offline creation and export with no mesh or hosted account. Test plugin distribution separately with the `PLUGIN_P2P` tracker; do not make an unverified public-exchange claim.
- [ ] Update CLI/OpenWiki/skill docs and the installed project tracker, then commit/push/verify using the Total Recall release workflow. Keep official Total Recall/SSSS repositories and forkable capability repos distinct.
- [ ] Before public listing, audit each capability repo's license, clean source history, provenance, secret/private-asset scan, immutable artifact digest, and verified install from that digest.

**Done when:** all PRD success criteria have linked test evidence and no unchecked blocker remains in the final tracker phase.

## Future hosted mesh decision gate (separate project)

Before a paid hosted Headscale/P2P control plane is offered, independently verify tenant isolation, authentication, scale under frequently moving nodes, backup/recovery, incident response, and user data exit. Headscale documents a single-tailnet design for personal/small organizations and cautions about scale under churn ([design](https://github.com/juanfont/headscale/blob/main/docs/index.md), [FAQ](https://github.com/juanfont/headscale/blob/main/docs/about/faq.md)). Do not assume one shared instance safely serves unrelated customers. Hosted control plane records may be service-owned metadata, but generated app source and SSSS data remain user-owned and exportable.

## 2026-09-30 reconciliation: target architecture versus current implementation

This section supersedes conflicting earlier statements without erasing historical scope or concurrent work. The five project documents remain present and tracked. This is a documentation/source reconciliation; no new implementation, tests, provider probes, commits or deployments occurred in this batch. Runtime baselines and readiness evidence are recorded in the central correction audit rather than inferred from checkboxes or previous session summaries.

**Actual bundled inventory:** `plugins/creative-search` 2.0.0, `plugins/dsh` 1.1.0, `plugins/git-sentinel` 1.1.0, `plugins/operator-alerts` 1.0.0 and `plugins/system-monitor` 1.1.0, read from their current manifests. `plugins/code-quality` has been removed; its separate repository exists. `package.json:25` still includes `plugins/` in published files. `default-plugins.lock.json` is absent. Consequently repository-per-plugin extraction, lock-driven installation and a core package containing no capability code remain target outcomes, not shipped behavior.

`metadata.plugin.schema.json` now declares `deploy`, `skills`, `commands`, `app_cli` and token-based `ui` elements. Schema support and source generators do not prove functioning dashboard mounts, provider calls, hooks, chat tools or independent applications. The DSH/Search UI source fails the current UI generator contract; their context generators return objects whereas `src/core/plugin-context.mjs:47` accepts strings.

**Standalone remains a prototype:** `src/core/app-deploy/standalone.mjs:108–155` writes an entrypoint that prints messages and reports `ready`; its gate asserts file presence. `apply.mjs:272,298` writes installation/grant records directly and accepts a caller-supplied actor. Registry authorization, independent capability runtime and functional feature checks must precede any successful standalone readiness claim. A passing planner or export test does not establish these behaviors.

The extraction target follows the user boundary: portable SSSS memory/vault/instruction shims are core; capability-specific integrations belong in standalone plugin repositories. Existing secrets/auth/daemon/network implementations in this tree are current topology, not an exemption from that target. Retain only the minimal generic kernel/host interfaces needed by installed plugins; record an explicit ownership decision for each remaining subsystem before moving it.

Cross-project owner and acceptance register: [PLUGIN_IMPLEMENTATION_CORRECTIONS](../PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md). Existing specific tasks remain in this project; central IDs prevent duplicate claims of closure.

### Dependency-ordered correction work

- [ ] **1 — Honest contracts and output:** PIC-009/PIC-010/PIC-013/PIC-015/PIC-016/PIC-017/PIC-018: fail on missing/invalid evidence, unify generator return type, verify runtime identity and preserve git columns. Add synthetic regressions before wiring runtime changes.
- [ ] **2 — Canonical configuration/state:** PIC-011/PIC-022: register owned SSSS extensions and route config/events through verified operations; connect actual CLI/UI settings and replayable projections.
- [ ] **3 — Functional plugin UI:** PIC-014: pass UI adapter validation and mount DSH/Search plugin-owned elements with actual data, controls, error and recovery behavior. Coordinate showcase removal of simulated previews.
- [ ] **4 — Real app lifecycle:** PIC-019: replace standalone shell with canonical scaffolder and independent runtime; operation-backed apply/grants; verify real feature execution, denied access, reapply, interrupted upgrade and tenant data preservation.
- [ ] **5 — Extract without behavior loss:** create individual repositories for the five actual bundled plugins, pin artifacts/digests in default lock, implement generic registration/unload, and remove bundled code from the published core only after independent clean-install proof.
- [ ] **6 — Verify and close:** run exact-tree full suite/conformance/gates on Mac mini as bounded background jobs; install from pinned artifacts in a clean brain; run real UI/CLI/independent app walkthroughs; retain hashes, commands and results. Live provider proof is separate from synthetic tests and HTTP reachability. No readiness checkbox closes without those records.

Scope stays In Progress. Phase 2 planner/generator milestones are partial infrastructure, not Phase 3 runtime certification. Existing Phase 3 unchecked prototype/operation-path work remains the prerequisite to capability deployment claims. External plugin phases and test totals in earlier session summaries are unverified here and must reconcile with each owning repository tracker.
