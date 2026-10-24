# Total Recall projects

The single active project is [TOTAL_RECALL_LAUNCH_PLAN](in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_PROJECT_TRACKER.md). It coordinates launch readiness across six workstreams: runtime truth, release propagation, the memory and instruction contract, packaging safety, the plugin/brick/card contract, and one end-to-end acceptance journey.

- [Audit](in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md)
- [Requirements](in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_PRD.md)
- [Architecture](in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_ARCHITECTURE.md)
- [Development plan](in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md)
- [Source register](in-progress/TOTAL_RECALL_LAUNCH_PLAN/LAUNCH_SOURCE_REGISTER.md)
- [Acceptance journey](in-progress/TOTAL_RECALL_LAUNCH_PLAN/LAUNCH_ACCEPTANCE_JOURNEY.md)

## One active project, by rule

**A new folder under `in-progress/` may only be created by the active plan naming it as a successor, or by Greg.** Workstreams live inside the active plan; a folder is not a workstream.

This rule exists because the previous consolidation failed without it. `TR_CORE_PLUGIN_SPLIT` absorbed 13 predecessors and mapped 549 items, then 12 more projects were created after it while this README kept naming a single owner. Naming one owner in prose did not prevent drift.

## Archives

| Archive | Contents |
| --- | --- |
| [consolidated-into-total-recall-launch-plan](archived/consolidated-into-total-recall-launch-plan/) | The 13 projects consolidated on 2026-10-24 at `aee2ad0`, including `TR_CORE_PLUGIN_SPLIT` and its 549-item machine register |
| [consolidated-into-tr-core-plugin-split](archived/consolidated-into-tr-core-plugin-split/) | The first consolidation's 13 predecessors, preserved from 2026-10-15 |
| [superseded-by-network-security-completion](archived/superseded-by-network-security-completion/) · [superseded-by-sovereign-os-release-readiness](archived/superseded-by-sovereign-os-release-readiness/) · [superseded-by-ssss-sovereign-ai-os](archived/superseded-by-ssss-sovereign-ai-os/) | Earlier supersession records |

Archived records preserve claims and unfinished tasks; **they do not certify completion.** Completed historical projects remain in `completed/`.

## Warning for agents

Do **not** implement `card_layout`, layout templates, widget kinds or region models from anything under the archives. That model is deleted from the codebase and invalid: `src/core/plugin-contracts/card.mjs:109` rejects it. A card face is bespoke owner code declared once in `ui.elements[]`. See the [plugin card contract](../../.agents/skills/plugin/references/card-design.md) for the surviving model.
