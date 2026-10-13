# Verification evidence

Sanctioned Mac mini isolated source snapshots. No production brain or vault copied. Tests and source scans are separate evidence.

| Scope | Tests | Actual exit |
|---|---:|---:|
| decision earlier owner baseline | 32 | 0 |
| deploy earlier owner baseline | 9 | 0 |
| design earlier owner baseline | 43 | 0 |
| domains earlier owner baseline | 74 | 0 |
| image-generator earlier owner baseline | 7 | 0 |
| maps earlier owner baseline | 11 | 0 |
| phone-companion earlier owner baseline | 7 | 0 |
| phone earlier owner baseline | 51 | 0 |
| security earlier owner baseline | 27 | 0 |
| signing earlier owner baseline | 91 | 0 |
| skill-manager earlier owner baseline | 11 | 0 |
| stripe earlier owner baseline | 11 | 0 |
| text earlier owner baseline | 49 | 0 |
| tickets earlier owner baseline | 12 | 0 |
| translator earlier owner baseline | 5 | 0 |

Later superseding results: security 28; deploy 10 including stale-UI clearing; Alerts 10; auth 11 Node +156 Vitest; mesh 249 Vitest +3 Node; core 2,025. CRM transport and actual CLI-function boundaries only: 12 Python tests; syntax checks also pass. Whole CRM runtime is not certified.

All 29 manifests declare auth. Expanded source audit exits 1 while CRM credential ownership and review findings remain. This is an intentional failed acceptance result, not a passing all-plugin gate. Source identity records list exact scoped files and digests; report readers cannot infer Git identity in the non-Git isolated snapshot.

After the full core run, whitespace-only cleanup touched two frontend API files and CLI skill formatting. Auth later changed help text only and refreshed bundled hash pins; owner suite and fast gates were rerun. No additional core behavior changed.

OpenWiki imported six hubs with zero errors and process exit 0; exact CRM/security hub recalls match 100%. Receipt files are retained.


### CRM local settings continuation

Current evidence: crm-local-auth-final (29 isolated Python tests, exit 0); crm-settings-final (2 Node tests for CLI/Python/auth-port migration and actual source-transfer archive exclusion, exit 0); crm-local-source-identity (18 selected files match, exit 0); crm-local-project-audit (five files pass, exit 0); installed-source-crm-local-audit (29 manifests declare auth, 30 CRM review findings, ecosystem exit 1). Isolated ports and function-definition tests do not certify whole CRM, Google dependencies, deployed services or real auth/provider credentials. No live data or credentials were migrated.

Superseding result: generated API transport now uses auth only, with no local-daemon startup. Final native slice is 31 Python tests (exit 0); the first expanded run had two AST-harness deferred-annotation errors, fixed before the passing rerun. Final identity scope is 19 files.
