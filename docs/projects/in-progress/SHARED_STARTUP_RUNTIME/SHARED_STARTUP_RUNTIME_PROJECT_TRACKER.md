---
type: project_document
title: SHARED_STARTUP_RUNTIME — Project_Tracker
description: CLI-first shared startup health and bounded local repair.
timestamp: 2026-09-30
tags: [project-management, startup, runtime]
---

# SHARED_STARTUP_RUNTIME — Project_Tracker

> **Project Prefix**: `SHARED_STARTUP_RUNTIME`
> **Kanban State**: In Progress
> **Date**: 2026-09-30

> **Based on audit**: SHARED_STARTUP_RUNTIME_AUDIT.md (Complete, working-tree baseline)

## Phase 0 — Audit
- [x] Complete source audit and record sanctioned working-tree baseline.
## Phase 1 — Corrections
- [x] SSR-001 generic startup command and brief status/global instructions.
- [x] SSR-002 daemon/server identity verification without log leakage.
- [x] SSR-003 bounded managed ensure and readiness recheck.
- [x] SSR-004 explicit current-repo registered app command checks/start.
## Follow-up repairs
- [x] Retry transport failures with bounded ten-second probes; preserve HTTP/auth/process failures.
- [x] Ship CLI help references and verify installed offline help.
- [x] Correct owned-listener doctor diagnosis and update shared start/TR skills.
- [x] Clear active project/global research and verify both queues.

## Final verification
- [x] Focused tests on Mac mini background, attach report.
- [x] Full current-tree suite/gates on Mac mini, attach evidence.
- [x] Read-only/live configured manager smoke without production restart.
- [x] Root propagates global package and verifies repository startup references.
## Current configured runtime limitation

- [ ] SSR-005: owning Total Recall project connection must have instructions:read before its shared startup readiness can succeed. Current CLI instructions list reports403 Insufficient token scope; server, daemon and SSSS tooling are ready. No credential/scopes changed. The Dabber installed CLI independently passes the shared-runtime check with its own configuration; no app declaration means no app readiness certification.

## Actions/evidence
2026-09-30: audit complete before plan/code; parent baseline recorded; no local tests.


## Action Log

2026-09-30 — plugin_docs_a — read existing source and shared start instructions, accepted parent Mac-mini baseline, completed audit before implementation; wrote five project documents and source/package files listed below. `git diff --check`: exit0. No test command executed locally.

Native startup check/ensure, read-only brief integration, bounded lifecycle observation, separate authenticated instructions readiness, and generic shared start wrapper/reference/evals/review prompt implemented. Thirteen focused core synthetic tests and five CLI tests authored in `src/core/startup-health.spec.mjs`; not run on laptop. Parent must execute focused and final suites on the Mac mini from the stable final tree, then record results here. Managed-service and authenticated runtime smoke remain unverified by this subagent. Global propagation is owned by parent. Installed older CLI must report missing builtin support unless an explicit wrapper is configured.

- 2026-09-30T19:31:44Z — /root: Ran CLI status --json; observed healthy server/running daemon alongside configured authenticated brain HTTP403. Delegated separate brain readiness and compatibility corrections. Preserved Dabber startup after full body read; generic source is not safe to push over that distinct workflow.
- 2026-09-30T19:31:44Z — /root/showcase_docs, reconciled by /root: Read startup, process control, server health, instructions resolver and dispatch paths (19:24:13–19:25:17 UTC). Reported weak PID/entry identity, offline-versus-stopped start distinction, builtin name collision, remote/local daemon mixing, ignored brief error, missing-vault falsegreen and origin/token pairing. Writer owns fixes and regression cases; review performed no source edits, tests or live mutations.

2026-09-30 — plugin_docs_a — incorporated reviewer findings: full canonical entry identity, listener PID binding, no start for live/unknown/foreign server PID, strict VFS, remote daemon health provenance, exact registered app module dispatch with builtin collisions rejected, token-origin pairing, repo SSSS launcher discovery, combined wrapper failure exit. Added registered-root source resolver and generic registration reference; root owns CLI registration and propagation. Instructions-access scope explicitly does not prove selected project identity. `git diff --check` passed; remote focused/full suites remain pending.

2026-09-30 — plugin_docs_a — parent reports focused Mac-mini startup tests passed 18/18, exit0. Compatibility fixture failed on macOS `/var` alias versus canonical `/private/var`; fixed fixture expectations with `fs.realpathSync` while retaining all resolver identity/ambiguity guards. Compatibility remote rerun pending; no local test run.

2026-09-30T20:00:19.230454+00:00 — plugin_docs_a — global start propagation completed via explicit `skill deploy start --global --repo <registered-root>`: 24 targets, 8 source-managed files each byte-identical; 54 IDE aliases resolve correctly, including 46 new relative aliases. The distinct repo-scoped start body was excluded and its SHA256 preserved. Initial project-registry calls refused cross-repository scoped-source deployment (no writes); explicit global selection fixed routing. Eight identical previously reviewed/backed-up generic copies then refused unadopted collisions; after body/hash comparison, explicit per-target `--force` adopted only those eight. No bulk push. Global install map verifies all 24 start targets and all 25 project-management entries remain present; catalog hash `2e6b468b31fa7713`. Metadata evidence: `/tmp/start-propagation-results.json`.

2026-09-30T20:00:19.230959+00:00 — plugin_docs_a — older installed repository launcher `./total-recall startup-check check --json` produced real parsed metadata and exit0: server ready with verified local listener; authenticated instructions access ready with project-identity qualification; local daemon running; declared repo SSSS launcher available; app not declared; readiness scope shared-runtime-only; actions empty. No ensure/service start, credential change, or provider call. Metadata `/tmp/start-older-cli-smoke.json`. Parent reports remote compatibility fixture passed and startup focused suite 18/18 passed; final current-tree gates and authenticated current-repository readiness reconciliation remain owned by parent.

- 2026-09-30T20:00:38Z — /root: Native startup18/18 focused cases passed0 on Mac mini; compatibility resolver1/1 passed0 after correcting macOS realpath expectations. Registered canonical shared start with CLI and created global startup-check through command create using its reference body. Read full security skill and instructions/auth/key code; CLI instructions list --json isolated403 to missing instructions:read. No secret values printed, scopes changed, credential rotation or service restart. Current fullgate first run had one unrelated phone-preview path finding and full suite passed; final complete gate/build rerun launched remotely in background after tracked preview correction.

2026-09-30 — /root: Reproduced missing installed offline help references and transient transport false negatives. Added two bounded ten-second transport attempts without retrying HTTP/auth errors; aligned status health checks; doctor verifies canonical/registered source server identity and actual listener before treating port 3000 as healthy. Updated requested global start and CRM Total Recall skills, canonical scaffold copies, shared wrapper and 24 compatible generic installations; repository-specific start workflows preserved. Installed repair passes daemon/server/startup JSON help and doctor (three optional dependency warnings). Both research layers cleared through CLI cancel: eight unfinished jobs removed, 95 completed global reports preserved; both unfinished counts zero. Live installed startup-check returns ready with no lifecycle actions and instructions synchronized. Mac-mini focused regression suite passes 31/31; packaging help proof and all five quality gates pass. Initial remote missing dependency and jsdom URL fixture failures were corrected in isolated test copy/source; no production restart or credential changes. Full suite result follows.

2026-09-30T23:56Z — /root: Final isolated Mac-mini snapshot passes all 364 Vitest files / 2,256 tests (exit0, 176.61s), five full-tier quality gates (zero findings), frontend build, packaged daemon/server help (both exit0), and canonical shared-start resolver fixture (1/1). Tarball contains CLI reference and scaffold start skill. Commands and reports under /tmp/tr-runtime-repair-0930. No npm publication performed. Scope restriction SSR-005 remains for the separately configured source connection; installed CRM readiness is independently verified.
