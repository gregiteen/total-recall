# Consolidated source project register

All former active/planned projects are historical source records. They are archived as consolidated, never marked completed by this operation. The master tracker alone controls current priorities.

| Source project | Checklist entries / pending | Canonical work | Disposition |
| --- | --- | --- | --- |
| [AGENT_SPAWN_TOOLS](../../archived/consolidated-into-tr-core-plugin-split/AGENT_SPAWN_TOOLS/AGENT_SPAWN_TOOLS_PROJECT_TRACKER.md) | 11 / 4 | TR-002/TR-005 | Superseded; historical boxes need source/runtime proof |
| [CAPABILITY_DEPLOYMENT_PLUGINS](../../archived/consolidated-into-tr-core-plugin-split/CAPABILITY_DEPLOYMENT_PLUGINS/CAPABILITY_DEPLOYMENT_PLUGINS_PROJECT_TRACKER.md) | 108 / 78 | TR-004/TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [CLI_AGENT_SKILL_UPDATE](../../archived/consolidated-into-tr-core-plugin-split/CLI_AGENT_SKILL_UPDATE/CLI_AGENT_SKILL_UPDATE_PROJECT_TRACKER.md) | 10 / 0 | TR-005 | Superseded; historical boxes need source/runtime proof |
| [CLOUD_DAEMON_HANDOFF](../../archived/consolidated-into-tr-core-plugin-split/CLOUD_DAEMON_HANDOFF/CLOUD_DAEMON_HANDOFF_PROJECT_TRACKER.md) | 24 / 5 | TR-002/TR-006 | Superseded; historical boxes need source/runtime proof |
| [CONTEXT_OPTIMIZATION](../../archived/consolidated-into-tr-core-plugin-split/CONTEXT_OPTIMIZATION/CONTEXT_OPTIMIZATION_PROJECT_TRACKER.md) | 78 / 2 | TR-003/TR-006 | Superseded; historical boxes need source/runtime proof |
| [EXTENSION_OVERHAUL](../../archived/consolidated-into-tr-core-plugin-split/EXTENSION_OVERHAUL/EXTENSION_OVERHAUL_PROJECT_TRACKER.md) | 39 / 1 | TR-005 | Superseded; historical boxes need source/runtime proof |
| [OPERATOR_ALERTS_PLUGIN](../../archived/consolidated-into-tr-core-plugin-split/OPERATOR_ALERTS_PLUGIN/OPERATOR_ALERTS_PLUGIN_PROJECT_TRACKER.md) | 31 / 24 | TR-004/TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [PLUGIN_IMPLEMENTATION_CORRECTIONS](../../archived/consolidated-into-tr-core-plugin-split/PLUGIN_IMPLEMENTATION_CORRECTIONS/PLUGIN_IMPLEMENTATION_CORRECTIONS_PROJECT_TRACKER.md) | 15 / 10 | TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [PLUGIN_P2P](../../archived/consolidated-into-tr-core-plugin-split/PLUGIN_P2P/PLUGIN_P2P_PROJECT_TRACKER.md) | 75 / 20 | TR-004/TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [PLUGIN_SHOWCASE_UI](../../archived/consolidated-into-tr-core-plugin-split/PLUGIN_SHOWCASE_UI/PLUGIN_SHOWCASE_UI_PROJECT_TRACKER.md) | 58 / 50 | TR-004/TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [SHARED_PROJECT_MANAGEMENT](../../archived/consolidated-into-tr-core-plugin-split/SHARED_PROJECT_MANAGEMENT/SHARED_PROJECT_MANAGEMENT_PROJECT_TRACKER.md) | 9 / 3 | TR-001/TR-005 | Superseded; historical boxes need source/runtime proof |
| [SHARED_STARTUP_RUNTIME](../../archived/consolidated-into-tr-core-plugin-split/SHARED_STARTUP_RUNTIME/SHARED_STARTUP_RUNTIME_PROJECT_TRACKER.md) | 14 / 1 | TR-003/TR-006 | Superseded; historical boxes need source/runtime proof |
| [SKILL_PROPAGATION_REPAIR](../../archived/consolidated-into-tr-core-plugin-split/SKILL_PROPAGATION_REPAIR/SKILL_PROPAGATION_REPAIR_PROJECT_TRACKER.md) | 19 / 7 | TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |
| [TR_CORE_PLUGIN_SPLIT](../../archived/consolidated-into-tr-core-plugin-split/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md) | 58 / 49 | TR-004/TR-005/TR-006 | Superseded; historical boxes need source/runtime proof |

## Value decisions and reduced scope

- Core keeps memory and minimum safe loading interfaces. Product scheduling, agents, network administration, app composition, speech, collaboration, monitoring and product UI move to capability owners.
- Existing standalone plugin implementations and their owner projects take precedence over recreating those features in the Total Recall host.
- PIC-001–023, PIC-030–049 and PIC-050–053 retain their identifiers. Repeated occurrences point to one canonical work package; a fix and its acceptance evidence close all mapped occurrences together.
- Host-owned operational previews, fabricated popularity/trust, blanket feature prerequisites and a duplicate Jev skill are superseded approaches. Preserve useful contracts and real implementations through their plugin owners.
- External app feature catalogs are outside active core scope and remain with their existing owners. Consolidation does not make them new Total Recall code tasks or authorize work in another repository.
- Current 3.38.0 publication and the eventual split release use the same release work package with distinct artifact evidence. Publishing current fixes does not complete the extraction.

## Current source verification

| Former project | Code or actual evidence checked | Current acceptance limit |
| --- | --- | --- |
| AGENT_SPAWN_TOOLS | `src/core/meta-harness.mjs`, daemon PID-lock reassertion and watcher settled-event specs; full current suite | Agent/secret-carrier live lifecycle remains owned work; source fixes are not every runtime proof |
| CAPABILITY_DEPLOYMENT_PLUGINS | `src/core/app-deploy/standalone.mjs` generates a ready shell; `apply.mjs` writes canonical records directly | Independent runtime and operation contract remain incomplete |
| CLI_AGENT_SKILL_UPDATE | Current credential-clean helper/evaluation sources; fresh mini helper cases passed; canonical/local package file comparison | Installed status hash drift/missing root must be reconciled; provider execution/auth is separately qualified |
| CLOUD_DAEMON_HANDOFF | Live cloud health and separate-brain leadership/worker observations; current stop/restart deployment source | Configuration handoff works; cloud code rollout and npm publication are distinct |
| CONTEXT_OPTIMIZATION | Current context/rules/skill-optimizer sources and complete suite | Fresh native startup reduction and provider navigation are not proved by fixture passes |
| EXTENSION_OVERHAUL | Manifest 0.2.0, semantic similarity, private-field sanitizer, recent sorting and persisted random collab JWT source | Implemented source exists; actual Chrome reload is unverified; browser feature ownership still moves |
| OPERATOR_ALERTS_PLUGIN | Installed `notify-core.mjs` still contains Telegram/Expo stubs, Slack/Discord resolution mismatch and weak email acceptance | Source confirms unresolved adapters/receipts; metadata `ok` does not certify delivery |
| PLUGIN_IMPLEMENTATION_CORRECTIONS | Current review request identity/default conformance, app generator, preview mounting and installed DSH tool inventory | Old defect IDs remain mapped; no blanket closure or external provider certification |
| PLUGIN_P2P | `src/core/plugin-loader.mjs`, store/runner/context source and current suite; no default lock | Actual public sender/recipient and private-node exchange remain separate acceptance |
| PLUGIN_SHOWCASE_UI | PluginsPage consumes host preview registry; review routes accept supplied identity/trust and default conformance | Actual installed UI/evidence owner work remains; host simulation is not completion |
| SHARED_PROJECT_MANAGEMENT | Shared helpers/hooks source; fresh mini fixture suite proves conservative triage/move/validation | Generic package propagation and overlay/source ownership remain explicit integration checks |
| SHARED_STARTUP_RUNTIME | Startup-health source performs authenticated instructions probe and rejects HTTP errors; live brain status is ready | Old 403 claim is stale; selected-project identity remains qualified and local daemon intentionally off |
| SKILL_PROPAGATION_REPAIR | `src/core/skills-registry.mjs`, CLI error handling and current full specs | Whole-package adoption/collision and actual target coverage require owner acceptance; do not overwrite overlays |
| Previous TR_CORE_PLUGIN_SPLIT | Current package excludes `plugins/`, loader still supports bundled lookup, feature router/tool/daemon coupling remains | Partial packaging progress is implemented; extraction and generic host extensions remain incomplete |

These checks qualify the consolidation findings. They do not re-certify all 295 historical checked items. Those exact claims remain labeled historical in the machine-readable register until their canonical owner supplies source and the required runtime evidence.

## Coverage and evidence

`evidence/consolidation/source-items.json` stores all 549 source checklist entries, including 254 pending/in-progress entries. Each has one canonical work ID and explicit disposition, original text, original line and pre-consolidation tracker SHA-256. A historical checked box is explicitly labeled a claim requiring source/runtime evidence.

The audit records current code findings and gate limits. The final consolidation integrity check must confirm every source item still exists in its archived tracker and every canonical ID exists in the master. No item is silently discarded or placed in a deferred backlog.

Private machine examples are redacted in the register display. The original-text SHA-256 verifies each item against its preserved historical tracker without reintroducing those examples into the active plan.

## Pending source-item dispositions after value review

- external_owner: 97 historical pending items.
- fulfilled_current_evidence: 1 historical pending items.
- merged: 78 historical pending items.
- retired: 78 historical pending items.

The 295 historically checked entries remain qualified claims, not active tasks or proof of complete behavior. The master has seven concrete acceptance checks across six workstreams. Merged entries are bounded to the delivered memory/selected-plugin scope; external-owner items do not block this core project unless that capability is selected. Retired items are removed from current scope, with a per-item reason, rather than placed in a new backlog.
