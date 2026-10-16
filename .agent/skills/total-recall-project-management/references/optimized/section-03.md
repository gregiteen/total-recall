## Readiness for the changed path

Prioritize memory/data safety, schema integrity, instruction correctness and core workflow reliability before polish. Treat lost writes, schema failures, credential exposure and false success as blockers. Review ownership boundaries between core, plugins, host adapters and projections against current code.

A readiness walkthrough identifies snapshot/digest, date, environment, actor and observed results. Exercise only the path relevant to the change: initialize an isolated permitted fixture; save and recall validated memory; compile and inspect connected instruction surfaces; verify applicable authorization and failed-write behavior; and verify plugin/provider actions separately when included in scope. Synthetic/local tests do not prove provider execution, public exchange, deployment or sustained daemon operation. Do not prescribe a fixed model, CPU load, or an unverified universal operating-system checklist.

