# DEV-API-03 source verification — 2026-10-24 local / October 25 UTC

Actor: Codex. Host: Gregorys-Mac-mini.local, sanctioned Mac mini, local disk. Baseline commit: `182ee62`. Source-only stage; no npm release, fleet propagation or serving activation. The existing five-file project stays in progress.

## Implemented boundary

Restricted `ssss.write` requires `invoke:restricted`, `ssss:write` and `brain:server`. Only descriptive fact creation is supported. Exact input validation rejects rule categories, caller-selected paths/slugs, arbitrary metadata, foreign/global selectors and routing tags. The shared memory owner generates UUID paths and uses an agent principal with memory:create only through the existing SSSS kernel. Facts cannot replace existing memory or become instruction nodes through this adapter.

The dedicated child receives structured input and no bearer token or credential environment. It imports trusted local memory/kernel/search code, with no CLI/configuration/auth/plugin bootstrap. The kernel bridge loads its configuration-dependent logger only for the optional shadow diagnostic. Filesystem permissions allow trusted source/dependencies and the canonical server brain, with writes to vault/audit and derived directories only. Symlink destinations are rejected. POSIX child time/output/heap/group limits and current shared-auth lifecycle checks remain enforced. Confined writes are serialized per brain across routers in the same server process; independent servers and trusted host administration remain outside that serialization.

The local CLI exposes the same owner with `remember fact "content" --confined-fact`. The CLI's normal bootstrap remains its own trusted interface; the API never dispatches that bootstrap for confined creation. The local search projection rebuilds without executing surface generators. Successful writes report committed/indexed state. Failed post-commit indexing, ended authority and outcome-audit failure preserve known mutation identity/state; killed children without a result report unknown commitment. Retries create fresh identities and require checking canonical state first.

## Verification

| Command or case | Result | Evidence |
| --- | --- | --- |
| `hostname`; `total-recall startup check --json` | Mini verified; exit0, shared_ready:true | Shared runtime only, not candidate serving activation |
| Baseline `npx vitest run src/server/routes/invoke.spec.mjs` | exit0;34 tests pass | `/tmp/tr-dev-api03-baseline.log` |
| Initial focused mutation/kernel tests | exit0;81 tests pass | Trusted adapter before added runtime filesystem flags |
| Added runtime permission cases | Initially4 failures, then1 fresh-brain failure | Canonicalized macOS `/private` paths and added explicit descendant write permissions for not-yet-created directories; actual children then passed |
| Transient short-lived Supertest connection reset |1 fixture failure | Explicit Connection:close prevents socket reuse after the test listener is retired; no retries or denied-case weakening |
| Full `npm test` before the final CLI error-output refinement | exit0;2342 tests/372 files pass;225.71s | `/tmp/tr-dev-api03-full.log`; actual process exit verified |
| Final focused6-file suite | exit0;107 tests/6 files pass;9.70s | `/tmp/tr-dev-api03-final-focused.log` |
| Final-source `npm test` | exit0;2343 tests/372 files pass;227.89s | `/tmp/tr-dev-api03-final-full.log`; actual process completion verified |
| `total-recall code-quality-check --tier full` | exit0;8 configured checks,0 findings; final source refresh4.1s | `/tmp/tr-dev-api03-gates.log`; final refresh `/tmp/tr-dev-api03-final-gates.log` |
| `node <project-management-skill>/scripts/check-audit.mjs` | exit0;active audit passes | Required five-file baseline preserved |
| `total-recall openwiki ingest openwiki --project` | exit0;8 imports,0 errors | Updated local architecture hub; private projection excluded from Git |
| `total-recall recall "DEV-API-03 confined fact mutation" --local -k 1` | exit0;exact project fact retrieved | Canonical fix saved through remember |

The eight quality gates cover package/private-state closure, dashboard freshness, core/shipped path policy, scaffold state, SSSS registry and root/frontend dependency advisories. The checker intentionally omits its remote-tier test; the separately executed actual Mini full suite supplies that coverage. Existing mock-hoisting deprecation and disposable fixture Git warnings are preserved in raw logs and are not release outcomes.

## Actual HTTP and server-free acceptance

The six-case loopback integration suite uses the actual auth owner's disposable PAT store, actual HTTP and actual CLI/read/write children. Added cases verify a reader cannot write, a writer creates and indexes a fact, a separate reader retrieves it, rule mutation is rejected and a revoked writer is denied. Existing full-developer, discovery, role/issuer/delegation, foreign-target and lifecycle cases remain intact. This turn reran the earlier independent-agent regression; it did not spawn a new independent reviewer or claim independent acceptance for broader owner adapters.

A separate actual CLI exercise used a disposable home/brain and unreachable loopback server URL. `remember fact "Standalone glacier observation" --confined-fact --project` exited0 and returned committed/indexed:true. `recall "Standalone glacier observation" --local --format json --no-sessions` exited0 and returned the canonical fact. No HTTP listener or provider was configured. All disposable brains, keys and listeners were cleaned.

Tests also verify generated identities do not overwrite repeated-content records, Markdown body/frontmatter separation, absent configuration logs, denied path/routing/role escalation, symlink destinations, partial index failures, cross-key write serialization and truthful commitment after authority/audit failure.

## Remaining acceptance

General restricted mutations, authorized project catalogs, CLI/plugin/composed owner adapters, provider budgets/cancellation and the full installation/upgrade/fleet/launch journey remain open. Permission flags constrain trusted code; they do not isolate malicious administrators, hostile concurrently replaced host directories or arbitrary plugin code. No paid provider or production credential was exercised. This stage does not claim API-1–API-6 completion or a released/deployed endpoint.

## Tested implementation SHA-256

| File | SHA-256 |
| --- | --- |
| `src/core/confined-memory.mjs` | `250cc5f9092514d96af56a6082cb6876c2ab430aee7ada08762ec4e4620255ac` |
| `src/core/ssss-kernel-bridge.mjs` | `35ae9e05ac8a7ee35a879f8c73426ef2e319327c81e391fea9094e8c4174dcab` |
| `src/server/invoke-policy.mjs` | `bfbf641dae511042e7da15eaead623e47efe28e6e8bda3ae399b761c9e3b7f28` |
| `src/server/routes/invoke.mjs` | `4f13d4be4f53581f9defaf7606ee567a990bced1e5c19ea5543953ac37d0af61` |
| `src/server/invoke-write-child.mjs` | `c5b3330b60269b18db80f324d0b81d6a420181be26ebd1d9524d6a7822fe66d9` |
| `src/cli/remember.mjs` | `d8b530ba563e934760739e57aa2b046c6cde846dcfbf5887eb0f67d752481bb7` |
