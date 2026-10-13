---
name: total-recall
description: Operate Total Recall memory, instructions, plugin discovery and runtime; route auth/secrets, OpenWiki, CRM and mesh work to their owning plugins.
metadata:
  version: "3.39.1"
  source: total-recall-brain
---

# Total Recall

Run `total-recall --help` first (source checkout: `node bin/total-recall.mjs --help`). Run `total-recall context "task description" --action read,edit,test` before action; read the complete capsule and require `ready:true`. On exit 2, inspect overflow and raise the explicit budget or curate applicability. Refresh when the task, action, project, rules or skills change.

Total Recall is working memory and the operation toolbox. Before decisions about credentials, nodes, agents, configuration or earlier user instructions, run `total-recall recall "topic" --local`. Canonical memory is SSSS Markdown; writes use validated CLI or kernel operations. Never search, edit or copy vault files directly. Derived indexes and compiled instruction surfaces are disposable.

## Route the work to its owner

| Work | Owner and discovery | Read when needed |
| --- | --- | --- |
| Remember, recall, context, compile, dream, proposals, vault | Core portable memory and SSSS contracts | [Memory and instructions](references/memory.md) |
| Credentials, passwords, sessions, passkeys, PATs, encryption, rotation, projections, sync | `total-recall auth --help`; `auth secret --help` | [Auth and secrets](references/auth.md) |
| Documentation hubs and graph ingestion | `total-recall openwiki --help`; `openwiki hubs --json` | [OpenWiki](references/openwiki.md) |
| Accounts, buyers, records, branding, portable CRM instances | `total-recall crm status`; `crm menu` | [CRM](references/crm.md) |
| Nodes, access, enrollment, control server, presence, dispatch | `total-recall mesh --help` | [Mesh](references/mesh.md) |
| Install, author, configure and run plugins | `total-recall plugin --help`; `plugin list --json` | [Plugins](references/plugins.md) |
| Machines, networks, fleet audits and verified hardening | `total-recall security status --json`; owning plugin skill | [Security](references/security.md) |
| Runtime, tests, repair and release evidence | `startup check --json`; owning repo skills | [Operations](references/operations.md) |

Auth ships with the scaffold and owns secret storage, password/session operations, passkeys and PAT lifecycle. See the auth reference for explicit legacy migration, stdin password setup and encrypted uninstall preservation. Core has no secret implementation or legacy execution fallback. Plugin operations require their declared owner. Missing/invalid plugins, failed decryption, failed provider checks and unavailable peers must produce explicit failures. Do not substitute ambient environment credentials, another store, another brain, synthetic topology, or a successful UI badge.

Every capability's implementation, UI, configuration and tests belong to its plugin repository. Core hosts generic loading and memory contracts. An auth manifest declaration is not proof of runtime credential routing; inspect real reads, writes and setup flows. Keep device facts in SSSS entities, never product constants.

## Maintain the documentation during the work

Update the project's AUDIT, PRD, ARCHITECTURE, DEVELOPMENT_PLAN and PROJECT_TRACKER before implementation; append timestamp, actor, action, failures and verification to the final Action Log. Keep project status in progress while required work remains.

Use OpenWiki as part of the workflow: inspect hubs before architecture work, update relevant Markdown hubs from owning source, and ingest with `openwiki ingest <directory> --project` after reviewing the diff. A missing hub directory means missing documentation, not an indexed wiki. Check the CLI import count, errors and exit status; validate retrieval afterwards. Never claim a health probe proves indexing or completeness.

Update this skill and relevant references whenever behavior changes, including OpenWiki, auth/secrets, CRM and plugin boundaries. Synchronize the entrypoint and references into `scaffold/.agent/skills/total-recall/`; publish the same sources through the repository's skill tooling when authorized. Keep detailed procedures in the linked references, not an obsolete second master manual. Record implementation, tested source, package, release, deployment and live provider evidence separately. A version string or configured task proves none of those outcomes.

All suites and quality gates run in background on the configured sanctioned test node. Read its resolved access through Total Recall, verify source identity, inspect actual logs/exit status, clean fixtures and owned jobs. Keep local and cloud brains separate. Deployment and publication require their applicable authorization and owning skills.
