# Total Recall handoff — 2026-10-24

## Start here

Total Recall is for developers. Gro CRM is for sellers. The owner explicitly approved retaining TR's single invoke endpoint as an optional developer API. Do not resume the earlier remove/keep/extract debate or apply Gro's seller restrictions to intentional developer access.

Run `total-recall --help`, read `.agent/skills/total-recall/SKILL.md`, require a ready task context and recall before decisions. Use Total Recall and the owning plugins for memory, credential and mesh operations. Credentials belong to `total-recall auth secret`; do not restore a native/top-level secrets implementation or print secrets into logs. Tests/builds run on the sanctioned Mac mini, never GitHub Actions. Follow repository release skills and the standing whole-tree commit/push rule.

The single active project is [TOTAL_RECALL_LAUNCH_PLAN](docs/projects/in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_PROJECT_TRACKER.md). Read its [PRD](docs/projects/in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_PRD.md), [architecture](docs/projects/in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_ARCHITECTURE.md), [development plan](docs/projects/in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md) and audit. Continue this project rather than creating another competing plan. Append actions/failures/verification to the final Action Log.

## Approved direction — DEV-API-01

- Keep `/v1/invoke` as an **optional developer API** for CLI, memory, composed workflows and decisions. Explicit full developer/admin access is legitimate; restricted agent keys must remain restricted through actual execution.
- Local remember/recall/context remains the baseline and needs no HTTP server, public endpoint or cloud instance. Document local server, private mesh and hosted use separately.
- Gro owns its seller CRM gateway, public seller skills/guide, integrated DSH runtime and optional seller-memory integration. Those do not become TR launch dependencies. No DSH bundle into every TR installation was established.
- Existing generic TR skills, agent integrations and developer tooling remain valid. API documentation must describe verified TR behavior rather than reuse Gro seller assumptions.
- The latest docs replace undecided invoke disposition with retention and hardening. Implementation/security acceptance is still pending; do not describe the existing route as already hardened.

## Current implementation and gaps

Commit `69addd2` added `src/server/routes/invoke.mjs`, its route tests and the mount in `src/server/index.mjs`. The separate memory-only app does not mount invoke. Auth supplies key identity/role/expiry/scopes, and the route checks operation-family scopes.

The important gap: `cli.run` spawns the CLI with the server environment/package-root cwd rather than a restricted caller execution context. A broad `sandbox:run` scope does not authorize individual commands/arguments/targets. `composable.run` validates name syntax but does not establish registry membership. Memory targets are not bound to key-specific brain grants; writes can request global scope. Direct argv/no-shell execution is useful but does not constrain CLI authority. Existing output/default timeout controls do not establish the complete server-controlled resource contract.

## Next implementation batch

Follow PRD API-1–API-6 and the development plan's DEV-API-01 batch:

1. Map auth key/role contracts, command catalogs, argument handling, brain/project selection and nested execution. Define explicit full/restricted modes, current-key migration, command/target/credential grants, delegation ceilings, revocation and treatment of already-running work. Reuse the auth owner; no parallel credential/key store.
2. Authorize registered command, arguments and target, then carry the same authority into CLI/plugin/composed execution. Preserve intentionally granted full developer capabilities. Restricted execution fails closed when the owning handler cannot enforce grants. Prevent scope-changing flags, aliases or child operations from expanding authority.
3. Control child environment/credential capabilities and execution resource ceilings: timeouts, concurrency, output and provider spending. Report nonzero exit, truncation and termination accurately. Audit identity/authorized target/operation/outcome without token or secret payloads. Capability discovery must match execution authorization.
4. Prove explicit full access and permitted restricted workflows, denied escalation/foreign brains, plugin/composed enforcement, expiry/revocation/delegation and resource limits. Use an independent agent with its own granted key for a real round trip. Separately prove server-free local CLI memory.
5. Write the developer guide from actual verified behavior; complete required TR gates, packaging and upgrade acceptance before release claims. Do not assume cloud hosting is required.

This is work within the existing six LR streams, not a new product project. Continue the other open launch work: instruction synchronization and harness readback, fleet propagation, private-state-safe distribution, standalone capability bricks, state-preserving/recoverable upgrades and the [complete launch journey](docs/projects/in-progress/TOTAL_RECALL_LAUNCH_PLAN/LAUNCH_ACCEPTANCE_JOURNEY.md).

## Verification and source state

- Current API-plan commit before this handoff: `bf2b957`; corresponding Gro documentation commit `9c13aed`. Both were pushed, clean and had zero unpushed commits.
- Relevant source history: `0062229` panel/card contract and modernized specs; `8de9f11` capsule telemetry/action prediction; `69addd2` invoke implementation. D1 is resolved: one bespoke face, unlimited plugin-owned panels. The historical 4,000-token D2 overflow blocker is superseded by measured project configuration at 16,000; instruction sync and universal curation policy are separate questions.
- Latest TR fast quality gates in this chat: exit 0, zero findings, 3.1 seconds. Ten-document scope/Action Log checks, unique API-1–API-6 requirements and whitespace checks passed. Local OpenWiki refreshed with eight imports/zero errors; updated scope memory retrieval verified.
- Only 13 invoke route-unit tests were freshly rerun earlier in this chat; they passed. The pasted handoff's 2,263 full-suite result is historical. Neither establishes end-to-end restricted dispatch security. Full suites were not rerun for docs-only edits.
- Gro's separate last full gate passed 523 runtime tests then failed an obsolete native-policy tool-list assertion. It is tracked in Gro, not a TR failure or dependency.
- No runtime code, package version, npm release, image or serving process was changed during reconciliation/docs updates. Local TR brain/OpenWiki state stays excluded from the public Git artifact. Keep publication, installation and deployment evidence distinct.

This handoff replaces the older local October 21 root handoff. Project action logs carry the verification history; do not treat the older handoff's open-task list as the current plan.
