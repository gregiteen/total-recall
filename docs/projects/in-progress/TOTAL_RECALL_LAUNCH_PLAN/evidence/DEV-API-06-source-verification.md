# DEV-API-06 — Core composed workflow verification

Codex, sanctioned Mac mini, 2026-10-25 UTC. Baseline commit: `a821ecd`. This stage changes core resolution, invoke acceptance and documentation; plugin repositories remain assigned to another agent. No package publication, fleet rollout or serving activation.

The existing instruction projection included group commands that neither executable CLI dispatch nor invoke recognized. Invoke also guessed an immediate `.agent` instead of resolving the selected brain. A shared core execution resolver now uses the configuration owner's selected project, exact group memberships, then global fallback. Static discovery never imports command code. Instruction generation preserves the actual `.agent`/`.agents` directory. Full mode remains trusted host authority; restricted composed execution is still denied.

| Check | Actual result |
| --- | --- |
| Before-change route/HTTP baseline | 75 tests/2 files pass; exit 0; `/tmp/tr-api06-baseline.log` |
| Initial scoped owner/route/HTTP run | 90 tests/4 files pass; exit 0; `/tmp/tr-api06-focused.log` |
| Final focused run including surface owner | 111 tests/5 files pass; exit 0; `/tmp/tr-api06-final-focused.log` |
| Actual disposable auth-owned full-key HTTP | Group discovery does not create a file; execution creates the expected file with literal shell-looking argv; nonzero child exit 7 yields failed envelope; restricted and revoked keys cannot create the file |
| Shared resolver regressions | Nested `.agent`/`.agents` selection, exact membership, project shadow precedence, removed membership, explicit root selection, traversal rejection and surface-directory parity |
| Configured final full-tier quality checks | 8 checks pass, 0 findings, 3.7 seconds; actual checker completion and FRESH report verified; remote-tier full test is separate |
| Final combined-source Mini suite | 2391 tests/374 files pass, actual exit0,220.34 seconds; `/tmp/tr-api06-frozen-full.log` |

Fixtures use temporary roots. HTTP listeners, keys, created command effects and fixture brains are cleaned; no live provider request or operator credential is used. Request argv and tokens do not enter execution audit events. Node child-process behavior was checked against https://nodejs.org/api/child_process.html.

The first shell-background baseline attempt ended before starting Vitest and produced an empty log; it supplies no evidence. Re-ran through a managed background session and observed actual exit 0. An attempted direct checker help invocation selected the global root, reported absent configuration and ran no gates; the owning `total-recall code-quality-check --tier full --background` command ran the correct project configuration successfully. The first full suite began before the final surface-directory change and was stopped with SIGINT, actual exit130; it supplies no final-candidate result. The next full suite was also stopped with SIGINT/exit130 when the separate plugin agent changed and committed core plugin-runner source/spec as `4d19f52`. That commit is preserved; it raises terminal plugin output limits while retaining the server default. The final combined-source run uses `/tmp/tr-api06-frozen-full.log` after that commit, with fresh before/after source manifests. The earlier8-check report became STALE for the concurrent runner edit and is superseded by a new check.

Provider budgets, broader restricted owner/mutation adapters, plugin administrative acceptance and the complete launch journey remain open. Group membership selects full-mode workflow availability, not a restricted authorization grant. No second key store or new restricted authority was added.

## Frozen implementation SHA-256

| Source | SHA-256 |
| --- | --- |
| `bin/total-recall.mjs` | `7ae83fa75a555d1e4c7a8968372a80197cdc7952f70da3a4a8df6992c7bdac88` |
| `src/core/command-surface.mjs` | `03f9c53f1dc31a8e93f4022a9f504996a632b9c4e3a045b39c2536208ab0c072` |
| `src/core/composed-command-resolution.mjs` | `d62c49886b9d65b3f1d911f8671caafdc790ecc9fb1d20e7e3e88e25ad63111d` |
| `src/core/composed-command-resolution.spec.mjs` | `63c2cad94c400f81e72d29595c8c2c4c051e5f548e6583cc2de86e2ef60ed9be` |
| `src/core/surface.mjs` | `2ed32c4319a728807cb98dcd9995f7d0d0cecaf886acc68ce82381637878b471` |
| `src/server/routes/invoke.mjs` | `ba0f6787ae0aec3fc51a716a23346cd8432590d614627d7ebb37cc7b4b17a3cc` |
| `src/server/routes/invoke.spec.mjs` | `3dc33bca948aa7c133b6c1b5ed968ed9ac00582ad7d9007fa4e1e52aef9cdd84` |
| `src/server/routes/invoke.integration.spec.mjs` | `d428a0519e5a97f4eed7f361c848c57449f52138026af81e075c2fdd4b7e76ff` |

OpenWiki refreshed8 files/0 errors, exit0; exact fix retrieval verified in the project brain. Before/after complete tracked `src`/`bin` SHA-256 manifests are compared for the final suite; docs and generated expert metadata are separate from implementation identity.

Final result: complete tracked src/bin manifests match byte-for-byte before/after the successful suite. The broader repository release-source digest also matches before/after: `35429f5946c1b3eb3af6d3c55ac840710ee4c58fd1b302cfd95435bd88335aed`. Existing mock-hoisting warnings and nested-Git warnings from disposable fixtures are non-failing. The actual artifact contains neither fixture state nor private brain data. Formal audit/whitespace checks pass; Git publication follows.
