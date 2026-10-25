# Launch acceptance journey

> **Project**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Requirement**: R26
> **Status**: Not yet run

One journey, one account of record, one host per stage recorded. This is the decisive launch test. Its purpose is to make it impossible to certify components in isolation: **each stage must produce its own artifact, and a green stage never certifies the next.**

## Rules

1. Run on a **clean machine** the published package, not the source checkout (R24).
2. Record the command, the host, and the output for every stage.
3. Sanctioned suites run on the **Mac mini** (R28). Local results are labeled local.
4. A failure stops the journey. Fix at the source, then restart from the first affected stage.
5. No stage may be satisfied by a different stage's evidence. A healthy container does not prove browser boot; a model response does not prove persistent memory.
6. Before starting any HTTP server, prove local `remember`, `recall --local` and `context` on an isolated initialized brain with no cloud instance or running server. Record output, persistence and exit status. Server/mesh readiness below is a separate configured-runtime acceptance, not a prerequisite for ordinary CLI memory. Gro CRM endpoints, public seller skills and its DSH image are outside this journey.

## Stages

| # | Stage | Command | Proves | Artifact |
| --- | --- | --- | --- | --- |
| 1 | Install from the published package | `npm i -g total-recall-brain@<version>` | The published artifact installs | install log, resolved version |
| 2 | Installed version equals published | `total-recall --version` vs `npm view total-recall-brain version` | L2 | both version strings |
| 3 | Runtime health | `total-recall startup check --json` | L1, `shared_ready: true` | full JSON |
| 4 | Health commands agree | `total-recall status` vs stage 3 | R7 | both outputs, compared |
| 5 | Brain reaches ready | `total-recall status` | L3, brain ready | brain block, node count |
| 6 | Instructions in sync | `total-recall status` | L3, `In sync: yes` | local/remote bytes and hashes |
| 7 | Capsule satisfies its gate | `total-recall context "<task>" --action read` | L3, `ready: true` within budget | token count, exit code |
| 8 | Plugin installs and runs | `total-recall plugin install <id>` then `<ns> --help` | L4, contract valid | install output, help output |
| 9 | Card face renders | open the plugin surface | R15/R16, bespoke face renders | screenshot, viewport sizes |
| 10 | Memory written | `total-recall remember fact "..." --project` | Write path works | created node path |
| 11 | Memory recalled with source | `total-recall recall "<query>" --local` | L5, recall returns the source | recall output showing provenance |
| 12 | Upgrade | install the next release | L5 | before/after version |
| 13 | State preserved | re-run stage 5, 10, 11 | L5, nothing lost | node count, recall output |
| 14 | Runtime still healthy | re-run stage 3 | L6 | full JSON |

## Failure-mode checks

### DEV-API-01 optional developer API acceptance

Run this matrix against the server candidate when the developer API is delivered; it does not replace the server-free CLI baseline or require a cloud host. Record commands, key grant metadata (never token values), target identity, outcomes and source/package identity.

| Case | Required evidence |
| --- | --- |
| Explicit full developer key | Intentionally permitted administrative/CLI/plugin/composed operations work within its recorded target/credential grants; Gro seller restrictions are not applied |
| Restricted key | Allowed command/arguments succeed on its authorized project/brain; foreign targets and scope-changing flags are denied |
| Restricted fact creation | Writer creates a descriptive fact and a separate reader retrieves it; read-only keys, rule categories, arbitrary metadata, caller paths and routing tags are denied; partial/unknown commitment is reported truthfully |
| Nested execution | CLI/plugin/composed children retain the caller's authority; unregistered command aliases and privilege escalation fail |
| Lifecycle/delegation | Expired/revoked keys cannot start new/child work; delegated grants cannot exceed the issuer; running-work behavior matches the documented policy |
| Resource and failure handling | Server timeout/concurrency/output/cost limits hold; exit failures, truncation and termination are accurate; audits contain no credentials |
| Independent client and discovery | A second agent uses its own granted key, sees only executable capabilities and completes a real permitted round trip with denial controls |

DEV-API-02 staged source evidence is recorded in [the verification artifact](evidence/DEV-API-02-source-verification.md): explicit full CLI, restricted retrieval, discovery, lifecycle/denial/resource cases, independent auth-owned-key HTTP and server-free memory pass. Unsupported restricted mutation/owners are denied. Provider quotas and the complete matrix remain pending; no deployed or complete-journey claim is made.

DEV-API-03 adds [confined fact creation evidence](evidence/DEV-API-03-source-verification.md), using actual auth-owned restricted writer/reader keys over loopback HTTP, a generated create-only memory path, generator-free local indexing and a separate server-free CLI exercise through the shared owner. General restricted mutations/owner adapters and provider quotas remain unfinished. This source stage does not certify a published package, active endpoint or complete launch journey.

### General runtime failure checks

Run separately; each must fail honestly rather than report success.

| Check | Expected |
| --- | --- |
| Disk or container full | Explicit resource failure, no partial success report |
| Runtime not running | `shared_ready: false` with the reason named |
| Foreign daemon PID | Conflict, never healthy (R6) |
| Interrupted upgrade | Recoverable, no memory loss |
| Stale or failed consumer | Named in the per-consumer report (R10) |

## Evidence slots

Filled when the journey runs. Until then this file is a plan, not a result.

| Stage | Host | Commit | Result | Artifact path |
| --- | --- | --- | --- | --- |
| 1–14 | — | — | **not run as one journey** | — |

### Partial results measured on 2026-10-24 (Mac mini, local)

Not a substitute for the journey, but each is a stage that now has evidence:

| Stage | Measured | Evidence |
| --- | --- | --- |
| 2 — installed = published | **pass** `3.40.7` = `3.40.7` | `total-recall --version`, `npm view` |
| 3 — runtime health | **pass** `shared_ready: true` | `startup check --json` from `/tmp` |
| 4 — health commands agree | **partial** — both read the daemon as running; `status` still does not name a *foreign* installation | LR-1 remediation |
| 5 — brain ready | **pass** | `startup check --json` |
| 8 — plugin installs and runs | **pass for creation** — `plugin create` → install → list active (previously impossible) | LR-4 evidence |
| 10–11 — memory written and recalled | not re-run in this pass | 1,617 global brain nodes present |
| 6 — instructions in sync | **fail** `In sync: no` | `total-recall status` |
| 7 — capsule meets its gate | **recorded telemetry passes** at the configured 16,000 project budget; remeasure the final candidate | tracker Measurement substrate; TR-003 overflow evidence superseded |
| 12–14 — upgrade, preservation, restart | not run | — |

**The journey remains unproven as a whole.** A separate disposable server-free CLI baseline now passes in DEV-API-02; it does not complete a fresh published-install journey. Stage 6, final-candidate stage 7 and stages 12–14 remain open; L6 cannot be claimed. Earlier rows are historical evidence, not a current rerun.

## Why this replaces per-component acceptance

The predecessor projects each held green checks: 34 valid manifests, a healthy brain, a published package, passing suites. Simultaneously the installed CLI was three versions behind, the runtime could not identify its own daemon, and the instructions had never synced. Every one of those green checks was true, and the product still did not work end to end.

This journey is the gate that would have caught all three.
