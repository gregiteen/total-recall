### Mandatory bottom append-only Action Log

Every active tracker ends with `## Action Log`, which remains its final section. Append an entry for **all meaningful actions**: reads/inventory, decisions, file writes, commands, tests, deployments, delegation, failures and verification. Related repeated read-only work may share one entry listing its scope; never hide a failed attempt or material decision in a generic success summary. Record actual UTC time, actor, files/commands, observed result and evidence. Do not include secret values or credential-bearing output.

Create the ledger when the tracker is created and capture preceding audit/planning actions accurately. Append throughout execution and reconcile before a task/phase/final response is marked complete. Keep historical rows unchanged; correct an earlier statement with a new row referencing it. Add new phases or other sections above the Action Log. Delegated workers return their actions/evidence; the coordinator must reconcile them into the owning tracker before claiming completion. No unsolicited external messages are authorized by this requirement.

Use a verified existing tracker append command when available. Otherwise edit this ordinary Markdown tracker directly; it is documentation, not a memory-vault node. Do not invent a new logging service/helper solely to append rows. Local audit/triage helpers provide limited checks, never evidence of live deployment or remote GitHub validation.

