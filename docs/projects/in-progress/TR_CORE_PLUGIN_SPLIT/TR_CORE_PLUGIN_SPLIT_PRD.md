# TR_CORE_PLUGIN_SPLIT — PRD

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-07
> **Based on audit**: TR_CORE_PLUGIN_SPLIT_AUDIT.md (Complete, 9b2e21f)

Greg's current direction is a Total Recall memory core with every other feature implemented as a plugin. This project is the single source for priorities previously spread across 13 active projects and one planned project.

## Requirements

Greg's subsequent functional-plugin instruction supersedes selected-plugin delivery acceptance. Every installed plugin needs its own repository containing UI, adapters, configuration, CLI and tests. Every supported integration feature must have an explicit coverage entry and working operation; a generic command launcher or fake successful preview is insufficient. Secure credential entry and all supported settings belong on each plugin. Phone provides real calls and call controls; Text provides real conversation threads, composition, media and delivery states. Remain in progress until the expanded batch is verified.

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

The unpublished 3.38.0 candidate contains existing rules/daemon/kernel/Claude-hook fixes. Complete the retained memory/plugin implementation and validate its final source/artifact before any tag, push or publication. Cloud rollout has its own safety gate and live version proof.

External plugin repositories keep their own implementation history and tests. Require their acceptance only for capabilities selected in this migration. Their complete roadmaps do not block memory-core delivery.

## Scope removed after value review

Do not implement the old host showcase/marketing/review/rating system, speculative application/industry plugin catalog, new notification channels, optional Jev navigation, independent public marketplace/P2P expansion, broad cross-repo skill propagation, or unrelated app rebuilds in this project. Existing working capabilities use their current owners. Unsupported product surfaces are removed or kept unavailable during extraction rather than expanded into new subsystems.

The fresh Dabber native total-context reduction acceptance belongs to that app/session integration and is removed from this core project's release criteria. Core acceptance measures its own capsule correctness, complete required-rule coverage, retrieval behavior and actual memory workflow. Replace all-default-plugin multi-day soak requirements with focused installed migration/failure checks for selected capabilities and memory with plugins disabled.

## Success

The core package contains memory plus demonstrated minimal host contracts. Every retained capability runs from its separately owned plugin; unused feature code can be removed after its imports and state obligations are audited. Disabling all features leaves memory usable. Current-core and selected-plugin checks pass on the Mac mini, clean installs work, state survives upgrade/rollback, and supported operational claims have evidence. The project remains In Progress until those outcomes hold.

## Current release acceptance — 3.39.0

Publish the recent source and plugin scaffold as a compatible npm artifact. Expose the isolated memory runtime explicitly, preserve existing public entrypoints and secure consumer imports, show Preview features above public npm latest, and prevent preview downgrades. Release evidence does not close the ongoing feature extraction or external integration acceptance.

## Dynamic plugin card face acceptance — added request

The card face should be generated as working code from the actual plugin capabilities, available state and allocated space. It must efficiently expose the relevant credentials, accounts, actions, analytics and notifications without fabricated data or unsupported controls. Generate credential input/status controls; existing secret values never enter model prompts or generated code. Live data should update without discarding in-progress input or repeatedly rewriting the layout. Details and provenance remain accessible outside the primary face. Generation ownership and inclusion in the current release require resolution before delivery claims.

## Security boundary refresh — 2026-10-08

Pre-launch security acceptance includes read-only PAT password rejection, trusted first-run browser origins, public auth work limits, production TLS proxy trust, non-executable Markdown metadata, isolated owner UI with functioning declared-command/draft behavior, and zero published dependency advisories. Native plugins remain explicit trusted-code installs. Generation acceptance still requires actual owner generator and live data contracts; browser attack fixtures do not certify these future features.

## Verified pre-launch security candidate — 2026-10-08 UTC

The current candidate security checks pass for exact source `72abfdd410ebdc9fae6bda227a8fd05745e415b988b24331979cc43c10d56207`: nine gates, 383 test files and 2,405 tests, native source/installed health, clean consumer dependency audit and 43 installed lifecycle operations. Both lockfiles have zero reported advisories. Publishing dry run passes; all 579 package files match between test/publishing hosts, with zero credential-pattern/private-credential-path matches. Initialization preserves existing and concurrent credentials. Test-host configuration was restored byte-exact from the pre-incident snapshot, canonical memory preserved, owned additions quarantined, local indexes rebuilt with zero drift and snapshot unmounted. SSH cannot unlock the restored store, so live decryption remains unverified. Detailed evidence: [security audit](evidence/release-3.39.0/security-audit.md). Model-generated card faces remain unimplemented and unaudited; the project stays In Progress. No publication or live runtime upgrade.
