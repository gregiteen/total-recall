# TR_CORE_PLUGIN_SPLIT — PRD

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-07
> **Based on audit**: TR_CORE_PLUGIN_SPLIT_AUDIT.md (Complete, 9b2e21f)

Greg's current direction is a Total Recall memory core with every other feature implemented as a plugin. This project is the single source for priorities previously spread across 13 active projects and one planned project.

## Requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| R-01 | One active project and ordered tracker | Every prior checklist item has one canonical owner; original wording/logs remain archived; no competing active/planned trackers |
| R-02 | A usable memory-only core | Remember, recall, forget, SSSS validation, memory search and instruction retrieval/compilation work without feature plugins, mesh or a provider account |
| R-03 | Minimum generic plugin contracts | Reuse working CLI/task/loading contracts. Add an interface only when the next existing capability needs it; prove that consumer, scope, failure and unload behavior |
| R-04 | One implementation per capability | Extract working source into its existing owner repository where possible; remove the core duplicate after installed proof |
| R-05 | Preserve canonical state and ownership | Plugin config/events use validated operations; upgrade/disable/remove preserves vault data, app state, overlays and unrelated secrets |
| R-06 | Optional feature installation | Memory-only installation works; selected plugins install from immutable digests; existing enabled installations survive upgrade; missing features report unavailable |
| R-07 | Truthful UI and runtime claims | Plugin-owned interfaces use actual state/actions; unknown conformance stays unknown; identity and evidence derive from authentication and the installed artifact |
| R-08 | Complete source traceability and task reduction | Every historical task is retained, merged, retired with a reason, or assigned to an existing external owner; no automatic carry-forward of old scope |
| R-09 | Real delivery evidence | Distinguish source tests, installed behavior, provider acceptance/delivery, public exchange and production version; verified boxes link code and artifacts |
| R-10 | Safe production and separate brains | Cloud work stays cloud-owned; no brain merge; staged healthy rollout, graceful traffic switch and retained rollback precede cloud version claims |

## Ownership boundary

Core owns portable SSSS memory, vault access, memory retrieval/indexes and instruction surfaces. The minimum loading, authorization and transport interfaces needed to expose memory or attach a plugin remain generic. Research, agents, scheduling, monitoring, notifications, mesh/network management, skills tooling, app composition, product UI, collaboration, speech, browser capture and provider/secret administration belong to capability owners.

Feature-specific source remaining in the core is migration work. Its current location does not make it a permanent exception. Auth/encryption/daemon abstractions need a documented consumer before any portion is retained; administrative/provider workflows belong to plugins.

## Delivery boundaries

The current 3.38.0 batch contains the existing rules/daemon/kernel/Claude-hook changes and this consolidation. Publishing that batch does not close the master extraction project. Finish and validate this reduced plan before publishing; then verify the final package source/artifact. Cloud rollout has its own safety gate and live version proof.

External plugin repositories keep their own implementation history and tests. Require their acceptance only for capabilities selected in this migration. Their complete roadmaps do not block memory-core delivery.

## Scope removed after value review

Do not implement the old host showcase/marketing/review/rating system, speculative application/industry plugin catalog, new notification channels, optional Jev navigation, independent public marketplace/P2P expansion, broad cross-repo skill propagation, or unrelated app rebuilds in this project. Existing working capabilities use their current owners. Unsupported product surfaces are removed or kept unavailable during extraction rather than expanded into new subsystems.

The fresh Dabber native total-context reduction acceptance belongs to that app/session integration and is removed from this core project's release criteria. Core acceptance measures its own capsule correctness, complete required-rule coverage, retrieval behavior and actual memory workflow. Replace all-default-plugin multi-day soak requirements with focused installed migration/failure checks for selected capabilities and memory with plugins disabled.

## Success

The core package contains memory plus demonstrated minimal host contracts. Every retained capability runs from its separately owned plugin; unused feature code can be removed after its imports and state obligations are audited. Disabling all features leaves memory usable. Current-core and selected-plugin checks pass on the Mac mini, clean installs work, state survives upgrade/rollback, and supported operational claims have evidence. The project remains In Progress until those outcomes hold.
