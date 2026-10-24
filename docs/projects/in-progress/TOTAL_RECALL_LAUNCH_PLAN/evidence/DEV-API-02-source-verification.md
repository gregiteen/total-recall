# DEV-API-02 source verification — 2026-10-24

Actor: Codex, with independent agent `/root/invoke_roundtrip`. Host: Gregorys-Mac-mini.local (sanctioned Mac mini), local disk checkout. Baseline Git commit: `6f48d39`; implementation source hashes below identify the tested working tree. No npm package or serving release was activated.

## Implemented boundary

Explicit literal invoke mode grants replace implicit wildcard access. Full mode is trusted host administration and requires full grants throughout its issuer chain; restricted mode permits only authorized server-brain local retrieval and discovery. Fresh shared-auth roles, key/issuer revocation and expiry apply. Unsupported restricted mutation, CLI/plugin/composed and provider execution fails closed. Generic command membership is checked against executable registries. Direct children receive controlled environments, bounded concurrency/time/output and group cancellation. Authorization/outcome audit uses validated SSSS events; unavailable pre-execution audit denies execution.

## Verification

| Command | Actual result | Evidence |
| --- | --- | --- |
| `total-recall startup check --json` | exit0; shared_ready:true | Mini identity verified separately with `hostname`; shared-runtime evidence only |
| `npm test` (first run) | exit1;2296 passed,1 failed;370 files | Raw log `/tmp/tr-dev-api-full-suite.log`; stale blanket root-handoff ban reproduced |
| `npm test` (final implementation run) | exit0;2303 tests,371 files passed;202.16s | Raw log `/tmp/tr-dev-api-final-suite.log` |
| `npx vitest run src/server/routes/invoke.spec.mjs src/server/routes/invoke.integration.spec.mjs src/server/invoke-execution.spec.mjs src/core/vault-files.spec.mjs src/cli/server-free-memory.integration.spec.mjs src/core/repo-hygiene.spec.mjs` | exit0;56 tests,6 files passed;6.90s | Raw log `/tmp/tr-dev-api-final-focused.log`; includes the final descendant-cleanup assertion |
| `total-recall code-quality-check --tier full` | exit0;8 checks,0 findings;3.2s (final documentation/package recheck) | Raw log `/tmp/tr-dev-api-quality-final.log`; report reader confirms FRESH |
| `total-recall code-quality-report` | exit0;0 findings,8 gates current | Configured checker excludes its remote-tier test; the separate actual Mini `npm test` above supplies full-suite evidence |
| `node <project-management-skill>/scripts/check-audit.mjs docs/projects` | exit0;active project audit passes | Initial run found the old audit lacked required formal sections and parseable commit metadata; added evidence-based baseline, preserved history |
| `total-recall openwiki ingest openwiki --project` | exit0;8 imports,0 errors | Local private projection only |
| `total-recall recall 'DEV-API-02 staged invoke security boundary' --local -k 1` | exit0;exact project fact found | Canonical fix recorded through `remember`; no manual vault writes |

Quality checks: package closure/private-state exclusion, dashboard freshness, core and shipped path policies, scaffold state, SSSS registry lock and root/frontend dependency advisories. Full-suite logs contain pre-existing mock-hoisting deprecation warnings and deliberately exercised fixture Git warnings; neither was counted as a passed test or a release outcome.

## Actual acceptance and limits

The independent agent issued its own named ephemeral PATs through the actual auth owner and used actual loopback HTTP with actual full CLI/read children. Five independent tests prove permitted full CLI, restricted retrieval/discovery, denied escalation, roles, expiry, delegation and issuer revocation. Tokens stayed in memory; key stores, fixture vaults and listener were removed. These cases also pass in the final suite.

Separate server-free acceptance creates a disposable brain, points TR_BRAIN at an unreachable loopback address, and runs actual `remember`, `recall --local` and `context` children. Memory is canonically written, recalled and context reports ready:true; no HTTP server is started for that test. The fixture is removed.

The hierarchy now allows the owner-requested project root handoff while checking it for private state and excluding it from npm; private per-user state remains forbidden. No other repository or production key was changed.

Restricted mutations and arbitrary owner confinement remain unavailable; provider-spending quotas and provider cancellation are not certified. Full host authority is deliberately broader than a directory sandbox and can intentionally execute nested host operations. No live paid provider call, full-plugin administrative workflow, fleet propagation, package upgrade or complete launch journey is certified. The project and API-1–API-6 acceptance remain in progress.

## Tested implementation SHA-256

| File | SHA-256 |
| --- | --- |
| `src/server/routes/invoke.mjs` | `b147701ca59def5998aad0526c0859c64297c53bd9aec33e5adc8ef768760282` |
| `src/server/invoke-policy.mjs` | `6d53175d1095e5c34835d95ce183dfbfd67d08afac19c194f79fcd9dcfa40ff5` |
| `src/server/invoke-execution.mjs` | `645141e71c4c67f6fca0b4bc092f21d5cc4cdcb9240ce70efc44927c4eaf732f` |
| `src/server/invoke-read-child.mjs` | `ef6ab49258dbb480ea245f90aadced0cf7e716c40cb09ae8e602c4da84108449` |
| `src/core/vault-files.mjs` | `8beee3368898558399c5011c75ea62fccd52ff6d79962b210cc599a8ca6cfd0a` |
| `src/core/fast-recall.mjs` | `ef0db1326ea570274403fed5bc0ffb760eeacc2ce86cc5fdfe288ae8c4a41569` |
| `src/core/vault.mjs` | `4aa43637217077a19419a259db059ab30e7b0ccb04d3a56c8dc503b1fa943274` |
| `src/core/ssss-kernel-bridge.mjs` | `8778cba7ff37509fc42cd7aece9360625d902c274e50da121805372a50be56db` |
