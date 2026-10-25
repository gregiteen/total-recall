# DEV-API-05 — restricted project brain grants

Date:2026-10-25 UTC. Actor:Codex. Host:Gregorys-Mac-mini.local, Node v25.9.0. Incoming baseline:80c95dc. Source verification only; no npm release, fleet rollout or serving activation.

## Authority and target binding

Restricted read/fact operations accept `project:<uuid>` under the existing effective auth-owned scope `brain:project-<uuid>` plus the family scope. The operator's existing global project registry and toggles select candidate brains; strict owner reads distinguish missing metadata from corrupt/unreadable metadata. Only granted candidates are inspected. The canonical project location and `config/brain.json` UUID must agree, and unsafe linked roots/index files are denied. Duplicate granted IDs fail closed. Discovery returns only usable granted IDs and operation families, with no paths or project names. A project-only grant supplies no default server access.

The server pins the canonical target before audit/dispatch and rechecks registration, enabled state, identity/path and current key/issuer/role authority before dispatch, every250ms and after completion. Changed bindings terminate continuation; known post-commit write state remains truthful. The existing credential-free read/fact children, validated SSSS memory owner and per-brain mutation serialization operate on the selected brain. Generic restricted CLI/plugin/composed/provider execution remains denied.

No new credential/policy store or auth-owner repository change was required. Existing `brain register/on/off`, `project-id` and auth-key CLI controls remain authoritative. Official Node permissions documentation reviewed:https://nodejs.org/api/permissions.html (2026-10-25 UTC). Trusted package/host assumptions remain; these controls do not isolate malicious host administrators or package code.

## Verification and failures

- Baseline86 tests/2 files passed, exit0 (`/tmp/tr-api05-baseline.log`).
- First policy/owner checks:94 tests/3 files passed. Expanded project checks:108 tests/4 files passed.
- Actual auth-owned loopback acceptance validates project UUID scope issuance, role/delegation ceilings, project fact write/read, default/server denial, revocation and secret-free audit. Test keys/listeners/brains are disposable and cleaned; no live provider credentials or charges.
- Focused six-file suite initially passed126 tests. A repeat hit one HTTP parse error at a rapidly rebound Supertest listener (125 pass/1 fail). Source inspection confirmed Superagent already disables connection pooling, correcting the initial hypothesis. The test fixture now owns one listener per test and closes its connections explicitly; final focused126 tests/6 files pass, exit0 (`/tmp/tr-api05-focused-stable.log`). Production policy assertions were retained.
- Project regression cases include two-project isolation, filtered discovery, read-only/issuer denials, corrupt metadata, identity mismatch/duplicates, unsafe paths/links, and cancellation after unregister, disable, identity change or physical rebind retaining the UUID.
- Concurrent brick-contract edits appeared during verification and another process committed the complete shared tree as6dbc9cf. All changes were preserved under the standing whole-tree publication rule. The initial full suite/gate started before that final source and therefore cannot alone certify it; final verification uses the combined source plus the test-listener repair. A complete tracked-src hash manifest is retained at`/tmp/tr-api05-source-before.sha256` for comparison after final tests.
- Initial full Mini suite passed2379 tests/373 files, actual exit0 in228.91s (`/tmp/tr-api05-full.log`). Because concurrent source edits and the listener repair occurred during that run, final acceptance requires the subsequent run and source-hash comparison.
- Onboarding review found `brain register` did not always persist a UUID in its registry row. The registration owner now uses the existing identity creator automatically; malformed identities fail instead of being overwritten, and CLI provisioning failure no longer creates an incomplete fallback row. Actual CLI registration/preservation plus identity/brain-owner regressions pass9 tests/4 files, exit0 (`/tmp/tr-api05-onboarding-final.log`). A full run already in flight mixed old transformed registration code with the new assertion and failed that case; final acceptance reruns the frozen candidate rather than reusing that result.
- Final frozen-source Mini suite:`npm test`, actual exit0,2382 tests/373 files passed in231.20s (`/tmp/tr-api05-full-frozen.log`). Complete tracked-src SHA-256 manifests before/after match exactly. Existing Vitest mock-hoisting deprecation warnings remain non-failing.
- Final configured checker:`total-recall code-quality-check --tier full`, actual exit0,8 gates/0 findings in3.6s (`/tmp/tr-api05-gates-final.log`). Its remote-tier test is explicitly omitted; the independently executed full Mini suite above supplies that evidence. Final report is checked for freshness before publication.
- Five-file audit checker, staged whitespace checks and implementation hashes pass. OpenWiki refreshed8 files/0 errors; project-grant and automatic-registration fixes saved through Total Recall and retrieved. Source commit/push state is recorded in the tracker Action Log.

## Remaining work

Project-grant implementation SHA-256:

| Source | SHA-256 |
| --- | --- |
| `src/server/invoke-targets.mjs` | `d1ef83fe7fb65f637236862a346e1d3ee6e8e2d39c00df53989d546c51d80ae8` |
| `src/server/invoke-policy.mjs` | `fdfb4ba5a55c11dd5337a9d82ffbfcd7c52b0a5c3537d55e903cd0e9edb95f05` |
| `src/server/routes/invoke.mjs` | `1d922dbba73d8303a2b86a9d1e1486292ece277b474a167f301daef8292e49db` |
| `src/core/brain-registry.mjs` | `1ad6ec1ad2371957b1830f2bce375cdf529c119ce6bed7e1652853f8655874fa` |

The final frozen-source hash manifest also covers the automatic-registration changes in `src/cli/brain.mjs`, `src/core/memory-brain.mjs`, `src/core/project-id.mjs` and their regression tests. Shared-source commits6dbc9cf,886e34e and39148f2 preserve both the project-grant work and concurrent brick work; final test evidence applies to the combined source, without certifying every brick requirement as complete.

Broader restricted owner adapters/mutation schemas, provider spending controls, fleet/distribution/upgrade evidence and complete launch acceptance remain in progress. Stable project target grants do not complete API-1–API-6. No unverified brick-completion claim is made from the concurrent source changes.
