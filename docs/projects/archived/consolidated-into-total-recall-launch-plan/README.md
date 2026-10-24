# Consolidated into TOTAL_RECALL_LAUNCH_PLAN

These 13 projects were consolidated into [TOTAL_RECALL_LAUNCH_PLAN](../../in-progress/TOTAL_RECALL_LAUNCH_PLAN/TOTAL_RECALL_LAUNCH_PLAN_PROJECT_TRACKER.md) on **2026-10-24** at source `aee2ad0`.

They are archived as **consolidated**, never as completed. Their history, evidence and unfinished work are preserved exactly as they were. Their checked boxes are **claims**, not acceptance results. The successor's [source register](../../in-progress/TOTAL_RECALL_LAUNCH_PLAN/LAUNCH_SOURCE_REGISTER.md) gives every item an explicit disposition and names the workstream that owns it.

## Why this happened

This is the **second** consolidation of the same work. The first, `TR_CORE_PLUGIN_SPLIT`, absorbed 13 predecessors and mapped 549 items — and then **12 more projects were created after it** while `docs/projects/README.md` kept claiming a single active project. Naming a single owner in prose did not prevent drift.

The successor therefore adds a custody rule: a new `in-progress/` folder may only be created by the active plan naming it as a successor, or by Greg. Workstreams live inside the plan.

## The 13 predecessors

| Project | Checked / open | Folded into | Note |
| --- | --- | --- | --- |
| [TR_CORE_PLUGIN_SPLIT](TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md) | 23 / 44 | LR-1, LR-2, LR-3, LR-5 | Itself a prior consolidation; carries the 549-item register |
| [PLUGIN_CARDS_BESPOKE](PLUGIN_CARDS_BESPOKE/PLUGIN_CARDS_BESPOKE_PROJECT_TRACKER.md) | 23 / 8 | LR-5 | Phases 1–3 verified; its `ui.elements` contract is the surviving model |
| [PLUGIN_CREATOR_SKILL](PLUGIN_CREATOR_SKILL/PLUGIN_CREATOR_SKILL_PROJECT_TRACKER.md) | 31 / 4 | LR-4 | Its unpublished security fix is a launch blocker |
| [PLUGIN_BRICK_STANDALONE](PLUGIN_BRICK_STANDALONE/PLUGIN_BRICK_STANDALONE_DEVELOPMENT_PLAN.md) | 11 / 33 | LR-5 | Had **no tracker**; the development plan carried the checklist |
| [PLUGIN_UI_OVERHAUL](PLUGIN_UI_OVERHAUL/PLUGIN_UI_OVERHAUL_PROJECT_TRACKER.md) | 43 / 0 | LR-5 | **Superseded, not completed** — it prescribed the deleted template model |
| [SURFACE_COMPILATION_FIX](SURFACE_COMPILATION_FIX/SURFACE_COMPILATION_FIX_PROJECT_TRACKER.md) | 78 / 0 | LR-1 | Every box checked while its own note said acceptance was unmet |
| [UNIFORM_BRAIN_UPDATES](UNIFORM_BRAIN_UPDATES/UNIFORM_BRAIN_UPDATES_PROJECT_TRACKER.md) | 3 / 1 | LR-2 | Its one open item was executed outside its own project |
| [TR_MARKETING_LAUNCH](TR_MARKETING_LAUNCH/TR_MARKETING_LAUNCH_PROJECT_TRACKER.md) | 26 / 1 | LR-6 | Public claims now follow demonstrated behavior |
| [TR_LAUNCH_HARNESS_DISCOVERY](TR_LAUNCH_HARNESS_DISCOVERY/TR_LAUNCH_HARNESS_DISCOVERY_AUDIT.md) | 0 / 0 | LR-6 | Audit only, no checklist; yields no launch dependency |
| [GITSENTINEL_CARD_BESPOKE](GITSENTINEL_CARD_BESPOKE/GITSENTINEL_CARD_BESPOKE_PROJECT_TRACKER.md) | 40 / 0 | LR-5 | Verified complete: 625-line face |
| [STRIPE_CARD_BESPOKE](STRIPE_CARD_BESPOKE/STRIPE_CARD_BESPOKE_PROJECT_TRACKER.md) | 40 / 0 | LR-5 | Verified complete: 790-line face |
| [SYSTEMMONITOR_CARD_BESPOKE](SYSTEMMONITOR_CARD_BESPOKE/SYSTEMMONITOR_CARD_BESPOKE_PROJECT_TRACKER.md) | 46 / 0 | LR-5 | Verified complete: 655-line face |
| [MESH_CARD_BESPOKE](MESH_CARD_BESPOKE/MESH_CARD_BESPOKE_PROJECT_TRACKER.md) | 2 / 11 | LR-5 | The only card project with real open work |

## Reading these records

- **Do not** implement `card_layout`, templates, widget kinds or region models from anything in `TR_CORE_PLUGIN_SPLIT` or `PLUGIN_UI_OVERHAUL`. That model is deleted and invalid; see `PLUGIN_CARDS_BESPOKE` for the surviving contract.
- **Do not** treat a checked box here as proof. Verify against source at the current commit.
- **Do** trust the evidence files inside each folder; they travel with the record unchanged.

The machine-readable per-item provenance for the first consolidation remains inside [TR_CORE_PLUGIN_SPLIT/evidence/consolidation/](TR_CORE_PLUGIN_SPLIT/evidence/consolidation/) — 549 items with original text, source line and tracker SHA-256.
