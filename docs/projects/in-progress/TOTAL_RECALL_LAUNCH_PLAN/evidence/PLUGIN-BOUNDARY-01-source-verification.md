# OpenWiki / OKF ownership and instruction artifact integrity

Source stage, 2026-10-25, Codex on the sanctioned Mac mini. No release, deployment or paid provider call. Plugin UI remains assigned to the other agent.

## Implemented boundary

- `tr-plugin-okf` owns conversion, validated bundle import, export, metadata lint, explicit index/log projection, 25 migrated adapter tests and all OKF bundle fixtures. Core contains no duplicate adapter or fixtures. Core compatibility commands load its declared active `adapter` through the generic runtime; missing owners fail explicitly. Import now awaits compilation and propagates errors instead of announcing detached work as success.
- `tr-plugin-openwiki` owns the six seed pages and explicit `bootstrap` operation. Creation is idempotent, preserves authored pages and page symlink targets, validates destinations before writes and supports dry run. Core initialization, project-brain completeness and compilation have no wiki creation dependency. Removed the nested core-skill scaffold copy as well as the former top-level templates.
- OKF's previous canned validation, schema registry and HTTP health claims are removed. Validation checks actual readable frontmatter and the required nonempty `type` under the reviewed OKF 0.2 specification. Its result explicitly limits this to structural checks. Probe loads the real host adapter. No comprehensive semantic/domain conformance claim.
- Instruction compiler writes are read back exactly. Disposable `surface-artifacts.json` binds required relative output paths, canonical destinations and SHA-256 hashes. Incremental reuse also checks required outputs and connected-client configuration. Deleted/edited files repair; unsafe retargeting and silent writes fail. Rebuild callers reject stale compiler skips. Actual harness consumption remains separate acceptance.

## Verification

Pre-change core boundary baseline: 43 tests / 6 files, exit 0. Surface baseline: 58 tests / 4 files, exit 0. Eight meaningful new regressions failed against the original compiler; final focused surface suite: 66 tests / 4 files, exit 0. Combined affected suite: 88 tests / 10 files, exit 0. New owner-delegation and actual init checks: 16 tests / 2 files, exit 0. Registry/hygiene follow-up: 48 tests / 2 files, exit 0.

OKF `dae4934`: 6 Node CLI/manifest tests plus 25 Vitest adapter tests, exit 0. OpenWiki `e28df87`: 13 tests, exit 0. Both owner manifests: real host validator reports zero errors/warnings. Actual installed-owner CLI import/export/project/validate all exit 0 against disposable data; temporary vault/bundle directories removed. OKF dependency audit: zero vulnerabilities after fixing the observed body-parser dev dependency advisory.

Final core suite: 2420 tests / 376 files pass, actual exit 0. Before/after source identity matches `7665019836a28364616cd825463353289729e3ec3ead55c4596e368b624da5b3`. Eight configured full-tier quality checks pass with zero findings; the full suite runs separately because the configured test gate belongs to the remote tier. Checks include actual npm artifact inventory/import closure, dist freshness, private-path checks, scaffold state, SSSS registry and both dependency audits. Independent npm pack dry runs confirm the OKF runtime modules and OpenWiki bootstrap/templates are included in the owning packages.

OpenWiki documentation ingest: 8 files imported, 0 errors, exit 0. Local retrieval returns the updated ownership and artifact-integrity text. Completed fix saved as project memory `openwiki-okf-owner-extraction`. Startup check reports shared_ready:true with the expected canonical daemon entry; selected project identity is explicitly outside that readiness claim.

## Failures retained

Initial transient zod import failures recovered after the concurrently changing dependency files reappeared; they are not passing evidence. One full run was terminated (143) after focused regressions exposed a remaining nested wiki scaffold and an overbroad runtime mock. Fixed the nested source and retained real auth loading in the test. Next full run: 2418 passed / 2 failed, matching before/after source hash `9cfcb41ba18ba622ab3ee5df5074092dba1dfaca5911111cab210dd0044dc80b`. Failures were the obsolete trackRepo wiki expectation and hygiene reading deleted files still present in Git's index. Changed the expectation to prove absence and staged candidate deletions before the final rerun. Manifest argument declarations initially omitted required labels; real validation rejected them and labels were added before acceptance.

No push performed. The current saved push-only-on-request rule requires Greg's explicit instruction after reviewable commits. Full-tree commits preserve concurrent shared-plugin activation/provisioning fixes and pre-existing generated agent surfaces. Provider budgets, broader restricted workflows, actual harness readback and launch acceptance remain in progress.
