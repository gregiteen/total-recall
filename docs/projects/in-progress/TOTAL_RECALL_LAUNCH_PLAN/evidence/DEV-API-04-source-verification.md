# DEV-API-04 — bounded decision execution

Date:2026-10-25 UTC. Actor:Codex. Host:Gregorys-Mac-mini.local (Node v25.9.0). Baseline:96a7ddb. Source acceptance only; no npm release, fleet rollout or serving activation.

## Finding and change

Both decision handlers previously called the installed provider/auth modules in the HTTP process. The authority monitor aborted an unused signal; child timeout/output/process-group limits did not govern these handlers. Both now use the existing executor and a structured stdin adapter, keeping provider and auth resolution in a full-mode child. The decision owner retains the provider implementation and credential store. Prediction retains its advisory abstention result; a failed provider now produces a failed API envelope. Diagnostics from decision dependencies are never returned, including on timeout, malformed output or nonzero exit. Discovery now reports the configured limits instead of constants when the router is configured with different ceilings.

Official Node child-process documentation reviewed:https://nodejs.org/api/child_process.html (2026-10-25 UTC). Direct argv, detached groups and close/error lifecycle remain governed by the existing executor. Restricted decision operations stay denied. Full mode is trusted host authority; cancellation cannot reverse accepted remote billing or provide a spending quota.

## Verification

- Baseline:`npx vitest run src/server/routes/invoke.spec.mjs src/server/invoke-execution.spec.mjs`, exit0,57 tests/2 files (`/tmp/tr-api04-baseline.log`).
- Initial focused run:70 pass/1 fail. The disposable prediction client lacked the confidence accessor consumed by the real predictor; completed the adapter and supplied a deterministic local command index. No production denial or assertion was weakened.
- Focused before final discovery regression:81 tests/3 files pass, exit0 (`/tmp/tr-api04-focused-final.log`), including action-predictor tests.
- Real child/HTTP regressions cover typed choice/boolean/score output, actual prediction, missing credentials, null provider result, credential-bearing exception sanitization, hanging owner cancellation for both operations, key revocation/PID retirement, output overflow and malformed/failed output. A local HTTP provider connection is established, then actual authority revocation terminates the child and closes the connection. Tests use disposable adapters and no live provider credentials or charges. All fixture directories and listeners are removed.
- Final focused:`npx vitest run src/server/routes/invoke.spec.mjs src/server/invoke-execution.spec.mjs src/core/action-predictor.spec.mjs`, exit0,82 tests/3 files (`/tmp/tr-api04-focused-final2.log`).
- Full Mini suite:`npm test`, actual exit0,2359 tests/372 files passed in209.63s (`/tmp/tr-api04-full.log`). Source hashes below match the final candidate. Existing Vitest mock-hoisting deprecation warnings do not represent failing tests.
- Eight configured full-tier quality gates passed,0 findings, actual checker exit0 (`code-quality-check-d0a516b5-ed63-4c1d-98a8-89c792f9e5a9.log`). The checker explicitly omits its remote-tier suite; the Mini full `npm test` run supplies that separate evidence.
- Five-file audit convention checker and whitespace checks pass. Updated developer guide, architecture, acceptance journey, root handoff and scaffold operations reference. OpenWiki ingestion:8 files/0 errors; fix saved through Total Recall.

## Limits and remaining work

Tested source SHA-256:

| Source | SHA-256 |
| --- | --- |
| `src/server/routes/invoke.mjs` | `0db8e6457fbcbec262bf4700eb82441002003e1f994607aff5194c5364749294` |
| `src/server/invoke-decision-child.mjs` | `d4e501f3ef04aabf430d69178b40d1a7d15fd333d77afd724a9f775e2d932aa7` |
| `src/server/routes/invoke.spec.mjs` | `805ef9c78e48e11faefd4052a36dcbc51bdaf72e037a76a570f65681999dc04f` |

These tests certify local source behavior and loopback connection teardown, not a real provider refund, spending quota or published endpoint. Broader restricted owner adapters, project/brain grants, provider budgets, private-state-safe distribution, fleet propagation, recoverable upgrades and the full launch journey remain in progress. No new credential store or production credential change was introduced.
