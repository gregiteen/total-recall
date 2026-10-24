# TOTAL_RECALL_LAUNCH_PLAN — Product Requirements

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Author**: Claude (DeepSeek Harness)
> **Date**: 2026-10-24
> **Based on audit**: [`TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md`](TOTAL_RECALL_LAUNCH_PLAN_AUDIT.md) (Complete, `aee2ad0`)

## 1. Purpose

### October 24 scope reconciliation

SCOPE-RECONCILE-01 in the audit is the provenance for this correction. Total Recall remains an independently installable, MIT-licensed, local-first memory and instruction system with generic plugin/tooling interfaces. Local remember/recall/context use must not require a hosted cloud instance or public endpoint. Optional server and mesh interfaces do not change that baseline.

Gro CRM owns its seller-scoped CRM gateway, public agent bootstrap/skills and integrated DSH runtime. Gro's optional Total Recall companion and R28 memory integration belong to Gro's plan; they do not require bundling DSH into TR or adding hosted seller services to TR's launch. Existing generic TR agent integrations remain supported on their own terms.

**DEV-API-01 owner decision:** retain `/v1/invoke` as an optional developer API. It is not Gro's seller gateway and does not make HTTP/cloud hosting a requirement for local memory. The former keep/extract/remove item is resolved in favor of retention and authorization hardening. A public TR-specific skill URL is not a substitute for Gro's public CRM skills; TR's own developer API needs its own accurate integration documentation.

Total Recall is finished enough to launch, but it is governed by **13 competing projects** whose instructions contradict each other. The last consolidation drifted: 12 new projects appeared after it, and the README still names a single active project that is not single.

This project **consolidates all 13 in-progress projects into one owner with one priority order and one acceptance journey**, then archives the predecessors with their evidence intact.

It is a consolidation and launch-readiness project. It is not a rewrite, and it does not re-open settled architecture.

## 2. Launch definition

Total Recall is **launched** when a new user can install it, get a working brain, use a plugin, upgrade without losing memory, and the maintainer can prove all of that from evidence — with no manual repair step and no unverified claim.

A launched release means all six of these hold simultaneously:

| # | Requirement | Why it is a launch gate |
| --- | --- | --- |
| L1 | `startup check --json` reports `shared_ready: true` on the sanctioned host | Everything downstream is unprovable while the runtime cannot identify itself |
| L2 | The installed CLI version equals the published npm version, verified independently | A published release that does not run is not released |
| L3 | Instruction surfaces report `In sync: yes`, and the context capsule fulfils `ready: true` within its budget | The documented gate must be satisfiable, or every agent starts degraded |
| L4 | A fresh install reaches a working brain and a working plugin with no manual repair | This is the actual first-run experience |
| L5 | An upgrade preserves memories, vault content, configuration and plugin state | Loss of memory is the one unrecoverable failure |
| L6 | One complete journey passes end to end, with evidence recorded | Isolated green components do not prove a working product |

## 3. Requirements

### 3.1 Consolidation (R1–R5)

- **R1** — Exactly **one** project owns Total Recall launch work. Every other in-progress folder is archived, not deleted, and not marked complete.
- **R2** — Every pending item from the 13 predecessors is mapped to exactly one workstream, with its original text and provenance preserved. No item is silently dropped.
- **R3** — Contradictions between predecessors are **resolved explicitly**, with the losing requirement named and marked superseded. Preserving both is not acceptable.
- **R4** — A checked box in a predecessor is a **claim**, not proof. It carries forward to a workstream until that workstream supplies source or runtime evidence.
- **R5** — The repository's own project index ([`docs/projects/README.md`](../../README.md)) names the same single owner this plan names. The index must not drift again.

### 3.2 Runtime and release (R6–R10)

- **R6** — The runtime health check distinguishes *running*, *this checkout's process*, and *another owner's process*. A foreign PID must be reported as a conflict, never as healthy.
- **R7** — `status` and `startup check` must never disagree about whether the daemon is running.
- **R8** — Publishing propagates: the published package, the tag, the installed CLI, and every registered consumer are verified independently and reported per surface.
- **R9** — An upgrade preserves user memory, vault content, configuration and plugin state, and is recoverable if interrupted.
- **R10** — Failure is reportable. A release that failed to propagate must say so; it must not print success.

### 3.3 Memory and instructions (R11–R14)

- **R11** — The instruction capsule reaches `ready: true` within its stated budget for every documented action.
- **R12** — Instruction surfaces are compiled from the **scaffold as the publish source**. Live copies are never hand-edited.
- **R13** — A silent no-op write can never report success. Freshness is asserted after compile and checked by `doctor`.
- **R14** — The capsule reports its own overflow honestly, with the required set and the overage named.

### 3.4 Plugins and cards (R15–R19)

- **R15** — A card face is **bespoke owner code**, declared once in `ui.elements[]`. A declared `card_layout` is invalid.
- **R16** — Core contains **no layout vocabulary**: no template allowlist, no widget kinds, no region model, no per-template CSS. *(Satisfied — see audit §2.1. This plan keeps it satisfied and removes the documentation that still teaches the old model.)*
- **R17** — Every instruction surface that teaches plugin authoring teaches the bespoke model. **No shipped document may teach `card_layout`.** *(Currently violated by `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176–189`.)*
- **R18** — A **brick** is a capability, not a plugin: it has no card, no manifest UI block, and no `total-recall` runtime dependency in its vendored payload.
- **R19** — The scaffolder emits a **valid** plugin or reports honestly that the face is authored later by hand. It must not emit a face that the validator will reject, and it must not emit a credential-entry pattern in generated UI code.

### 3.5 Packaging safety (R20–R22)

- **R20** — Private state (credentials, vault content, browser profiles, installed package caches) never enters a distributed artifact. This applies to **every** path: export, import, scaffold, install, `skill deploy`, and sharing.
- **R21** — A packaging claim is accepted only against the path it names. Fixing `skill deploy` does not certify `plugin create --from-skill`. *(Audit §2.5: these are separate code paths today.)*
- **R22** — The unpublished security fix for the private-state leak reaches the installed package before launch.

### 3.6 Launch surface (R23–R25)

- **R23** — Public claims describe only behavior that has passed R26. Planned integrations are labeled planned.
- **R24** — Installation instructions match the published package, verified from a clean machine.
- **R25** — The launch surface is owned by this project; discovery and experimentation do not become a second live product track.

### 3.7 Acceptance (R26–R28)

- **R26** — One **complete journey** passes end to end: clean install → working brain → plugin use → memory written and recalled → upgrade → recall still intact → runtime still healthy. Recorded as one artifact.
- **R27** — Every gate names the command that produced it and the host it ran on. Local results are never presented as sanctioned gates.
- **R28** — Sanctioned suites and gates run on the **Mac mini**, never the MacBook, Chromebook, or cloud droplet.

### 3.8 DEV-API-01 — Optional developer API requirements

- **API-1 — Audience and modes:** support explicit full developer access and restricted agent keys. Full developer grants can intentionally authorize CLI administration, plugins, project files and composed workflows; do not impose Gro seller restrictions. A broad scope name alone must not silently imply full access. Existing keys need an explicit, documented migration/grant treatment.
- **API-2 — Authority through dispatch:** authenticate key identity, role, expiry and grants, then authorize the exact command, arguments and target. Carry that authority through CLI, plugin and composed execution. Restricted calls fail closed when a handler cannot enforce the requested restrictions. Validate names against the actual registered command catalog; syntax checks are insufficient. Child operations cannot gain more authority than their parent grant.
- **API-3 — Brain/project and credentials:** define allowed projects/brains and enforce selectors, paths and scope-changing flags. Full access is explicit about its target reach. Resolve only authorized credential capabilities, with a controlled execution environment; no accidental inheritance of the server's administrative identity. Administrative credential operations are available only when intentionally granted; raw values never enter routine audit records.
- **API-4 — Delegation and lifecycle:** keys can be named, bounded, revoked and expired. Issuing/delegating a key cannot expand the issuer's command, target, credential or expiry grants. Revoked/expired keys cannot start new work or child operations; cancellation/handling of already-running work is defined and tested.
- **API-5 — Execution and evidence:** keep direct argv/no-shell execution; enforce server-controlled timeout ceilings, concurrency, output and provider-spending limits. Failures, truncation and termination are reported accurately. Audit caller, authorized operation/target and outcome without token/secret payloads.
- **API-6 — Availability and acceptance:** document local, private-mesh and hosted use separately, using the existing configured binding rather than promising public reachability. No server is required for remember/recall/context. Prove full access, restricted access, forbidden escalation, isolation, lifecycle/resource limits and an independent-agent round trip before claiming the hardened API is delivered.

These requirements extend the existing LR workstreams; they do not introduce a new product project, DSH bundle or Gro dependency. Implementation is still pending.

## 4. Requirement reconciliation

The conflicts the audit found, each with one decision. Losing requirements are superseded by name so no future agent implements them again.

| Conflict | Decision | Superseded |
| --- | --- | --- |
| Template vs bespoke card model | **Bespoke wins.** Enforced in `card.mjs:109`; 0 of 34 plugins declare a template | `PLUGIN_UI_OVERHAUL` "Recipe Contract … layout templates"; `PLUGIN_UI_OVERHAUL` "visual wizard to set … template"; `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176–189`; TR-010 FC-A/FC-C shared-renderer items |
| `PLUGIN_UI_OVERHAUL` marked "Completed" | **Not completed.** Its own PRD and plan say In Progress; its Phase 3 has all 34 boxes unchecked; it prescribes the dead model. Its genuine remaining scope (catalog, install, permissions, navigation) moves to the plugin-surface workstream | The `Completed` status in its tracker |
| Bricks need `ui` optional vs every plugin needs a card face | **Both hold, at different levels.** A *plugin* requires one bespoke face; a *brick* has no face and no UI at all. The contract validates each against its own requirement set | The ambiguity that let the scaffolder emit a stub panel |
| Creator removed scaffolder UI generation vs BRICK says it still emits `panel.js` | **BRICK's audit is correct.** `create.mjs:118` still accepts `--with-ui` and `:472` still advertises `ui/panel.js`. The creator's checked box is stale | The creator tracker's checked "remove UI generation" item |
| Shared global skill templates vs no-template/independent plugin authoring | **No shared templates.** Authoring is per plugin, by hand | `SURFACE_COMPILATION_FIX` Phase 12 "Enforce Global Templates" / 12A global skill templates |
| `status` daemon running vs `startup check` foreign PID | **`startup check` is authoritative.** A foreign PID is a conflict, never healthy | The `status` reading as a health claim |
| npm `3.40.7` vs installed `3.40.4` | **Propagation is incomplete.** The published artifact is correct; the installed surface is behind | Any claim that 3.40.7 is released |
| Plugin count 29/30/32/33/34 across documents | **34 is authoritative** (`plugin list --json`) | Every other count |
| Capsule budget 4,000 vs real corpus | **Historical blocker superseded.** Tracker telemetry passes at the configured 16,000 project budget; final candidate still requires per-action evidence | Old D2 launch block; no universal default or curation policy is newly decided |
| Test/gate counts (2,353 / 2,405 / 309 / 184) | **Historical.** Each workstream re-measures on its own host | Prior counts as current evidence |
| Four projects each owning one card face | **One card workstream.** Three are already complete and verified | The four-project structure |

## 5. Out of scope

Named so it is not re-litigated:

- Rewriting the memory core. It is healthy (`brain: ready`, 1,617 nodes).
- Restoring the template/card-engine model. It is removed and must stay removed.
- Product work for monetized plugins (identity, tenancy, credits, AI gateway, store, payouts) — **TR-007/TR-009 remain open items in their own workstream, not launch gates.** They must not block launch.
- Harness experimentation from `TR_LAUNCH_HARNESS_DISCOVERY` (Pi, Hermes, OpenCode, Goose, OpenHands, Aider). Discovery only; nothing here is a launch dependency.
- The four completed card faces (`git-sentinel`, `stripe`, `system-monitor` verified complete; `mesh` in progress). Only `mesh` carries open work.

## 6. Success criteria

1. One in-progress project exists; 13 predecessors are archived; the README agrees.
2. Every pending predecessor item has exactly one workstream and one disposition.
3. Every contradiction in §4 is resolved in writing with the loser named.
4. L1–L6 hold, each with a recorded command and host.
5. `R26`'s complete journey passes as a single recorded artifact.
6. No shipped document teaches `card_layout`.
