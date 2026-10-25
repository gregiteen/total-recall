# LR-1 shared daemon identity — source evidence

Codex; sanctioned Mac mini; October24, 2026 (2026-10-25 UTC).

Baseline commit: `813edca`. Plugin implementations remain assigned to the other agent. This stage changes generic core lifecycle/status and documentation, with no package publication, fleet propagation or serving restart.

## Finding and implementation

A-027: daemon-control used substring identity, while startup resolved a canonical entry. Lifecycle collapsed unreadable/live foreign identity into dead and could start another process. Startup also accepted unresolved entry suffixes. One `observeDaemon` now supplies both paths using the existing `processIdentity` owner. Only a resolved matching canonical entry is running. A second installation is conflict; unreadable/malformed PID, inaccessible liveness, unavailable command or unresolved entry is unknown. Missing lock is not-started; confirmed absent process is stopped. Conflict/unknown prevents direct starts and managed start/ensure/stop. Direct stop never signals or unlinks an unverified owner. Status preserves its compatibility string and exposes the structured observation, expected and observed entries; server health degrades on conflict/unknown. The old alleged dream fallback actually still spawned the missing daemon-loop entry; it now fails explicitly.

Official Node process documentation reviewed: https://nodejs.org/api/process.html. Signal0 proves process existence, not installation identity. Canonical files, the process command and process cwd establish the local observation. This remains trusted-host process observation, not protection against a malicious operator replacing files after observation.

## Verification

- Fresh baseline:47 tests/4 files pass, exit0, `/tmp/tr-lr1-baseline.log`. Baseline8 full-tier checks pass,0 findings; actual per-check exits0.
- Focused:69 tests/5 files pass, exit0, `/tmp/tr-lr1-focused-final.log`. Cases cover malformed/unreadable locks, unknown liveness/command/cwd, second installations, same canonical entries and CLI diagnostic presentation. A real disposable child proves canonical matching and foreign-install rejection; child and fixtures are cleaned.
- Actual CLI fixture acceptance: `node /tmp/tr-lr1-cli-acceptance.mjs`, exit0; `/tmp/tr-lr1-cli-acceptance.json`. All3 commands (`daemon start`, `stop`, `ensure`) reject a real foreign child, return exit1, retain its PID lock and leave the process alive. Fixture child and tree are cleaned afterward.
- Actual Mini read-only acceptance: `total-recall status --json` and `startup check --json`, exits0, show the same PID16322 and canonical entry from this checkout; shared_ready:true. This verifies identity agreement, not daemon source reload or harness readback. Raw JSON remains local in `/tmp/tr-lr1-status.json` and `/tmp/tr-lr1-startup.json`.
- Final full Mini suite:2412 tests/374 files pass, actual exit0,331.33s (`/tmp/tr-lr1-full.log`). Before/after release-source identity matches `388ba30a29c324e055ef52a765cb547b5f585f3c23c733c8006a5fc0b0748f67`; that digest includes implementation, tests, CLI, scripts, scaffold and frontend source. No implementation drift occurred during verification. Existing disposable nested-Git and mock-hoisting warnings are non-failing.
- Final8 full-tier checks pass,0 findings,4.2s; each actual exit0. Log: `/Users/gregoryiteen/.agent/commands/reports/code-quality-check-04d7da08-5d1d-4c4d-b89c-99e9d230c9b3.log`. The omitted remote-tier test is supplied separately by the full Mini suite, never inferred from this report.

## Failures and limits

The first focused test attempt passed60 tests but the new daemon CLI suite failed to load because its child-process mock lacked a default export. Fixed the mock and reran all5 suites successfully. Two documentation/test patch attempts failed validation and applied no files; corrected before implementation/testing. No failed run is counted as a passing result.

Full provider budgets, broader restricted owners, actual harness surface readback, publication/upgrade/fleet evidence and complete launch acceptance remain in progress. No plugin source or production credentials changed.

Corrected an older tracker overclaim: the5 historical startup identity/tooling regressions do not prove that silent surface writes fail loudly. That acceptance item is explicitly unverified alongside harness readback; its original startup evidence remains preserved.

Formal project audit checker, working/staged whitespace checks and reviewed19-file publication pass. Final quality report is FRESH with0 findings. OpenWiki ingestion imported8 files with0 errors, exit0; exact local fix-memory retrieval succeeds. Private brain state and disposable fixtures stay outside the Git artifact.
