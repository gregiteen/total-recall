# CONTEXT_OPTIMIZATION — Development Plan

> **Project Prefix**: `CONTEXT_OPTIMIZATION`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-09-30
> **Based on audit**: CONTEXT_OPTIMIZATION_AUDIT.md (Complete, 5b67b20b73a3bd2896036e26cb02ba917fafbfb5)

---

## Execution boundary

This plan follows the completed audit and PRD. Release 3.33.0 passed its frozen-snapshot gates, but the capsule path was reopened for A-014/A-015; those corrections require their own verification. Retain the audit baseline and final verification evidence. Read SSSS and skill-management methods only when the corresponding implementation is activated. Test and quality jobs run in background on the sanctioned Mac mini. The user subsequently authorized build and publication after completion.

## Phase 0 — Audit and planning

Complete code inventory, runtime preflight, source baseline, findings and the five-file set. Record the initial dependency failure and successful fresh-install rerun. Preserve test/gate evidence and the single latency observation without equating it to a benchmark.

## Phase 1 — Correct P1 findings with fixtures before wiring

1. Build synthetic fixture oracles for universally required and action-specific rules, shared-prefix scoped rules, oversized required sets, unknown applicability, provider outage and project switching. These fixtures must reproduce A-001/A-002/A-003/A-013 before policy changes.
2. Inventory full contribution sources and add rendered-output accounting fixtures, including large plugin blocks and index entries (A-005). Explicitly replace the existing never-drop-all-index behavior with coverage-preserving applicability, without hiding a rule policy change.
3. Reproduce populated-vault cold hydration and top-k shortfall behavior using synthetic Markdown and stubbed embeddings. Record cold startup/index/match/hydrate/embedding/exit timings (A-011/A-012). Confirm exact/local calls make zero provider calls.
4. Diagnose instruction 403 through configured authentication/brain access (A-009). Preserve authorization; isolate configuration failure from code failure before selecting remediation. No credential rotation or widened scope is implicit.
5. Correct required-set overflow, prefix dedup, full-render budget and local retrieval paths according to fixture evidence. Canonical source/generated entrypoint changes address A-004 in the next dependent phase, with the task already tracked here.

Exit: each P1 finding has either a verified correction or an explicit remaining blocker. Planning documents alone do not satisfy this phase.

## Phase 2 — Canonical entrypoints and applicability

Define explicit universal curation and action-trigger applicability while preserving modality and existing rule meaning (R-01/R-02/R-09). Verify supported SSSS fields/extension contracts before any persistent-state change. Resolve credential prose supersession and misleading privilege wrappers (A-007).

Split core and generated repository-expert entrypoints into compact routing plus references. Update the generator and canonical live package; verify regenerate/install/projection behavior and managed support files. Profile catalog-only duplication separately from full-body consumption. Preserve repository identity and exclude cross-repo fan-out.

Exit: fixture coverage is complete, canonical regeneration does not recreate oversized mandatory files, and package-relative references resolve.

## Phase 3 — Shared selection, search and budget integration

Unify static/dynamic applicability and contribution semantics without blindly reusing the current slot packer (A-006). Use selective document hydration and disposable local full-text/locator indexes. Ensure index updates/pruning are incremental, atomic and consistent with validated writes. Expose explicit local/exact modes and labeled semantic enrichment; avoid restricted provider paths (A-008).

Count the complete rendered capsule, return explicit required-set overflow, and bound optional plugin/research/reference contributions. Configure targets and report estimates honestly. Add version invalidation for task/action/brain/policy/skill changes and use existing runtime boundaries rather than a new daemon.

Exit: all R-01–R-10 fixture cases pass; no missing critical instruction or falsely reported budget compliance.

## Phase 4 — Shadow evaluation and supported client verification

Compare current and proposed outputs over the same synthetic scenario matrix. Report required coverage, irrelevant bytes/tokens, cumulative reads, cold/warm latency, failure modes and provenance. Evaluate initial 1,000/4,000-token and 500/50-ms targets; any revised target needs recorded evidence and rationale.

Verify at least one actual IDE consuming the generated bootstrap, retrieving applicable instructions before action, refreshing after a rule/skill change and handling offline access. Validate API selected-vault authorization separately. Treat host-owned context as outside Total Recall's control and report unsupported capabilities instead of fabricating hooks.

Exit: default change justified by zero critical coverage loss and measured savings, with no unsupported live-readiness claim.

## Phase 5 — Testing, delivery preparation and cleanup

Run relevant focused suites and the full Mac mini suite after significant edits; run configured package/scaffold/registry/path gates using the proper dependencies and a verified built bundle when assessing publication readiness. Perform isolated validated save → recall → compile → client consumption walkthrough and check denied access, offline retrieval, stale/deleted documents and rollback.

Refresh authoritative architecture and repository expert references, remove temporary compatibility code, clean owned processes/fixtures, reconcile the tracker ledger and inspect complete Git diff. Publication is authorized by the 2026-09-30 user request and follows the push skill. Archive only when all testing and readiness criteria are verified; no unfinished task is declared complete.

## Dependency and ownership notes

Measurement precedes choosing storage/index optimizations. Required-set policy precedes reducing static visibility. Canonical source changes precede generated artifact refresh. Synthetic cases precede production wiring. No cross-repository skill deployment, provider migration, general security audit or unrelated dependency remediation is bundled into this project.

## Reopened correction — A-014/A-015

Default task routing returns required instructions only with compact output. Knowledge and diagnostic inventories are explicit opt-ins. Entire serialized responses determine readiness. A repository-local validated decision records manually curated action triggers and concise directives bound to canonical source hashes; unknown, malformed or stale entries retain original required rules. Canonical bodies remain retrievable. Verify actual local capsule sizes and conservative fallback, then run focused/full sanctioned checks before completion.

## Authorized 3.33.1 release — A-016

Update only the compatible ip-address lock resolution, verify the exact package/source snapshot on Mac mini with zero production audit findings, native boot and clean scaffold, then commit/tag/publish, verify registry and registered installs, refresh the managed runtime and archive after cleanup.


## Skill optimizer extension (A-017–A-019)

Provide `skill optimize` with explicit package/root scope, default dry-run, lossless reference extraction, content-hash concurrency checks, retained source, package lock and bounded output. Compact authored routers carry essential constraints; automatic optimization retains normative paragraphs and flags ambiguous/oversized candidates for review. Preserve repo ownership and managed blocks. Include task-ranked reference navigation as advice only. Ship updated shared scaffold methods, propagate identical shared copies and schedule a daily Total Recall daemon task. Total fresh-start token count remains an acceptance item independent of package estimates.


## Jev and IDE acceptance (A-020–A-022)

Use current primary docs; expose one portable `decision` skill with Jev guidance in its references. Implement optional typed decision assistance over bounded skill metadata; enforce scope/required rules in code and retain deterministic failure fallback. Verify real adapter formats and supported native invocation syntax, preserve command collisions and repo-specific content, and include public scaffolds. Do not claim interactive IDE/provider readiness solely from generated files or mocked tests.

## Generic scaffold configuration and later extraction

Public scaffolded skills use generic schema/default configuration where possible; resolve repository paths, runtime targets and decision providers from configuration or flags. Keep repository-specific instances in local config/overlays and exclude personal hosts, credentials, accounts and private injected memory from shipped artifacts. Prefer the existing decision capability as the public skill name, with Jev as a configurable implementation.

Verify current behavior in this project. Subsequent skill manager extraction is explicitly tracked in [TR_CORE_PLUGIN_SPLIT](../../planned/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md) and waits for functional evidence; no migration is performed by this addendum.

## A-023 execution order

1. Complete the official-doc/local-adapter matrix in the audit, correct the historical automation claim, and run a current-tree Mac mini baseline plus `project-management/check-audit.mjs` before any more code edits. The earlier provisional IDE edits remain explicitly disclosed.
2. Inspect plugin manifest validation, daemon discovery, scheduler persistence and current optimizer CLI. Add a small daemon-owned plugin task using generic configuration and conservative automatic application. Require explicit authorized roots and do not traverse foreign repositories by default. Add a validated, shared node selector that each daemon checks, with a fail-closed unset state. Add synthetic selected/non-selected due-slot, idempotence, invalid config, collision and report tests before live wiring. Choose the Mac mini through mesh-resolved deployment configuration; its current LaunchAgent targets old `dream.mjs` and exits on a missing dependency, so repair/restart it before claiming daemon ownership. Verify the laptop does not run the optimizer.
3. Reconcile IDE projection tests with the documented host-specific invocation syntax; test scaffold package paths and generic configuration. Verify a native `/decision` on a supported installed host. Label remaining hosts unverified.
4. Add optional Jev suggestion only through `decision`, parse the documented typed fields, enforce deterministic scope and mandatory rules, and fall back without provider reliance. Keep the foreign plugin repository untouched.
5. Capture a fresh Dabber startup context measurement, then build, run the full Mac mini suite and quality gates on an exact source snapshot, verify daemon run/report and runtime startup, and only then proceed with the already-authorized release/version/consumer update. Reconcile the action log and cleanup before archival.
6. Remove the A-025 private SearXNG default from the shipped integration. Reuse one validated setting across its CLI, compiled generator and browser UI; test unconfigured/no-network and configured URL behavior. Preserve this installation's URL only in private instance configuration. Re-run the shipped-file literal audit before release.
7. Add the A-026 OpenAI Decisions preview to the existing single `decision` skill's integration reference and its tracked scaffold copy. Keep Jev and OpenAI contracts distinct and provider selection configurable. Do not add an OpenAI API call until public schema, access and runtime tests are available.

Current implementation passes selected/unset/other-node synthetic checks and an
installed CLI walkthrough on the mini. Next: freeze exact source, run full
sanctioned gates, deploy the verified runtime without overwriting the mini's
authored skill overlays, repair its old LaunchAgent command, configure the
selected plugin and observe one actual daemon slot. Complete native invocation,
optional decision-advice, fresh startup measurement and release/consumer
requirements before closing the project.

A-027 interrupts deployment: baseline the SSSS dependency on the mini, add
synthetic multi-chunk/UTF-8/cursor/duplicate/corrupt-log cases, implement bounded
index/replay reads, run full conformance, bump the owning package and consume
the verified dependency. Then retry the actual plugin installation and daemon
configuration before releasing Total Recall. This is a directly blocking
dependency repair within this project; preserve other repo-local edits.

Actual installed interactive commands also require the existing runner's host
package/plugin context. Align CLI dispatch and verify the real executable in an
isolated installed-plugin fixture, then repeat the mini configuration command.
