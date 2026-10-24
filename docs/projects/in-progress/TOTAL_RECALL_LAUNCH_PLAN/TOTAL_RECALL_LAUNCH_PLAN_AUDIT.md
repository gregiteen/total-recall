# TOTAL_RECALL_LAUNCH_PLAN — Audit

## SCOPE-RECONCILE-01 — Complete source audit, October 24

Owner clarification: Gro CRM owns its seller-facing scoped command API, public agent guide/skills and integrated DSH runtime. The pasted handoff mixed these requirements with Total Recall work. Gro source already implements its gateway/catalog/guide and public skill/client routes in `crm_runtime/server.py`; Gro's own plan owns empty-platform discovery, scoped external-agent acceptance, native UI restoration and optional seller-memory provisioning. A downloadable MCP client is not an MCP server. No DSH bundle into Total Recall is specified by this launch plan.

Actual implementation discrepancy: commit `69addd2` adds `src/server/routes/invoke.mjs` and mounts `/v1/invoke` in the full TR server. The separate `src/server/memory-app.mjs` does not mount it. CLI recall searches local vault/index state; ordinary memory does not require HTTP hosting. The full server uses configured/mesh/loopback binding; the memory server defaults to loopback. Endpoint existence does not prove public exposure, independent-agent acceptance or product scope. Record disposition under LR-6; this documentation change neither removes the route nor promotes it into a core launch requirement.

Plan drift is independently visible: `8de9f11` adds capsule telemetry and action prediction, and tracker measurements show the old overflow blocker is stale. `0062229` and tracker evidence resolve the panel decision and modernize the card tests. The pasted handoff reports 2,263 tests for `69addd2`; this is historical evidence, not a fresh full-suite certification. The development plan and Readiness summary lagged those changes. This reconciliation updates known statuses without asserting fleet propagation, current sync, upgrade preservation or completed launch acceptance.

> **Project Prefix**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Kanban State**: In Progress
> **Audit Status**: Complete
> **Audited commit**: `aee2ad0` (source `3.40.7`), 2026-10-24T05:17Z
> **Audit host**: MacBook (`/Users/gregoryiteen/github/total-recall`)
> **Author**: Claude (DeepSeek Harness)

This audit establishes the real state before any consolidation edit. Every claim below carries the command or file that produced it. Nothing here is certified beyond the stated scope: **the sanctioned gates were not run on the Mac mini for this audit**, so all results are local-host observations, not release evidence.

## 1. Why this project exists

Greg's instruction (2026-10-24, continuing the Codex thread `01a16c06`):

> "ok i really need to finish total recall first i really want to get these projects done and launched... i just want to combine all these projects into one cohesive launch plan and get it done can you help with that?"
>
> "we can archive all the old projects once we have the cohesive launch plan"

The Codex thread ended at 05:01:17 with the agent having only **announced** the consolidation; it wrote no plan and archived nothing. The work was never started.

### 1.1 A consolidation already happened once, and drifted

This matters more than anything else in this audit. `TR_CORE_PLUGIN_SPLIT` was itself the product of an earlier consolidation:

- 13 predecessor projects were archived into [`archived/consolidated-into-tr-core-plugin-split/`](../../archived/consolidated-into-tr-core-plugin-split/).
- 549 source checklist items were mapped to canonical work IDs in `evidence/consolidation/source-items.json` (254 pending at the time).
- [`docs/projects/README.md`](../../README.md) declared: *"The single active project is TR_CORE_PLUGIN_SPLIT."*

**Then 12 more projects were created after it**, and the README was never updated. `TR_CORE_PLUGIN_SPLIT` is now one of 13 in-progress folders, not the single owner. The drift is the defect this project fixes, and it is why the fix must be structural rather than another README edit.

Current state — `ls docs/projects/in-progress/`:

```
in-progress: 13   completed: 37   archived: 8
```

### 1.2 The 13 in-progress projects

| Project | Created by | Declared state | Relationship to this plan |
| --- | --- | --- | --- |
| `TR_CORE_PLUGIN_SPLIT` | Codex | In Progress | **Predecessor master** — carries TR-001…TR-006 and the 549-item register |
| `PLUGIN_CARDS_BESPOKE` | DSH agent | In Progress | Owns card faces; supersedes UI Overhaul's template model |
| `PLUGIN_UI_OVERHAUL` | Antigravity | **Says "Completed"** | Contradicts Bespoke; must be superseded, not completed |
| `PLUGIN_CREATOR_SKILL` | DSH agent | In Progress | Private plugin creation |
| `PLUGIN_BRICK_STANDALONE` | — | In Progress (**no tracker**) | Capability extraction |
| `UNIFORM_BRAIN_UPDATES` | Codex | In Progress | Update propagation |
| `SURFACE_COMPILATION_FIX` | Antigravity | In Progress (returned from completed) | Instruction surfaces |
| `TR_MARKETING_LAUNCH` | Greg & Antigravity | In Progress | Public launch surface |
| `TR_LAUNCH_HARNESS_DISCOVERY` | Codex | In Progress (**audit only**) | Harness/landing discovery |
| `GITSENTINEL_CARD_BESPOKE` | DSH agent | In Progress | One card face |
| `MESH_CARD_BESPOKE` | Claude Sonnet agent | In Progress | One card face |
| `STRIPE_CARD_BESPOKE` | DSH agent | In Progress | One card face |
| `SYSTEMMONITOR_CARD_BESPOKE` | DSH agent | In Progress | One card face |

Four separate projects each own **one** plugin card face. That is project overhead, not engineering work: they share one contract, one acceptance test, and one migration gauge.

## 2. Verified current state

### 2.1 The card architecture is settled and enforced in code

The single largest open contradiction between projects is already resolved in source. Measured:

| Claim | Command | Result |
| --- | --- | --- |
| Template vocabulary removed from core | `grep -rn "CARD_TEMPLATES\|CARD_WIDGETS\|WidgetKind\|CardRegion" src/` | **0 matches** |
| Card validator replaced | `grep -rn "validateCardFace\|validateLayout" src/` | Only `validateCardFace` at `src/core/plugin-contracts/card.mjs:109`; no `validateLayout` |
| No plugin declares a template | `grep -l card_layout` across all `plugin.json` | **0 of 9** in-repo plugins |
| In-repo plugins carry a bespoke face | `find -path "*/plugins/*/ui/card.js"` | **9** (one per in-repo plugin) |

`src/core/plugin-contracts/card.mjs:109` now **errors** on `card_layout`:

```
"'card_layout' is not supported: a card face is bespoke owner code in ui.elements[], never a shared template"
```

**Consequence for the plan**: `PLUGIN_CARDS_BESPOKE` Phases 1–3 are genuinely complete. `PLUGIN_UI_OVERHAUL`'s template prescription (`PLUGIN_UI_OVERHAUL_DEVELOPMENT_PLAN.md:22` — "layout templates") and its `Completed` status are both wrong and must be explicitly superseded. Only Phase 4 of Bespoke (34 hand-authored faces) remains, and it is design work, not a launch blocker for the platform.

### 2.2 The runtime is NOT ready — this is the launch blocker

`total-recall startup check --json` at 05:17:39Z:

```json
{
  "server": { "status": "conflict", "reason": "server-process-unverified" },
  "brain":  { "status": "ready", "scope": "instructions-access-only; selected project identity not independently verified" },
  "daemon": { "status": "conflict", "reason": "foreign-pid", "source": "local-pid" },
  "ssss":   { "status": "available" },
  "app":    { "status": "not-declared" },
  "required_plugins": { "status": "ready", "errors": [] },
  "shared_ready": false,
  "ready": false
}
```

`shared_ready: false`. The server cannot be verified as the process it claims to be, and the daemon PID does not match this checkout's owner — a **foreign PID** holds the lock. `total-recall status` separately reports `Daemon Status: 🟢 Running`, so the daemon is running but is **not this checkout's daemon**. Two conflicting signals over one lock is exactly the class of defect that produced earlier brain-routing and surface-dir incidents.

### 2.3 Version skew between source, npm, and the installed CLI

| Surface | Version | Command |
| --- | --- | --- |
| Source checkout | `3.40.7` | `node -p "require('./package.json').version"` |
| Published npm | `3.40.7` | `npm view total-recall-brain version` |
| **Installed CLI** | **`3.40.4`** | `total-recall --version` |

npm and the tag agree at `3.40.7` (`git tag` shows `v3.40.7`), and the working tree is level with `origin/main` (no unpushed commits). But the CLI actually on `PATH` is **three patch versions behind the published package**. The release exists; the release is not what runs. Per the standing invariant *"A release that is only on npm is not released,"* propagation to this machine is incomplete.

### 2.4 Instruction surfaces are out of sync

`total-recall status`:

```
Local INSTR.:     28192 bytes, sha=ebb5a95cd762…
Remote INSTR.:    24897 bytes, sha=06177c3992a3…
In sync:          no
Last sync:        never
Sync targets:     (none)
```

A 3,295-byte divergence, no sync targets, and `never` synced. `TR_CORE_PLUGIN_SPLIT` records this class of defect as already re-opened once (TR-003, the surface-dir audit) on the reasoning that *"every command still reported success."* The 28,192-byte local figure is also close to the documented capsule-overflow problem: TR-003 records 12 of 13 capsules **over budget** at ~9,807–9,870 tokens against a 4,000 budget, with `context "x" --action read` exiting 2.

### 2.5 Codex's plugin-creator findings are confirmed in live source

| Finding | Verification |
| --- | --- |
| `tokenPanelSource()` still present though the tracker claims removal | `src/cli/plugin/create.mjs:76` — `function tokenPanelSource(id, panelClass, pluginName, apiKeys)` |
| `plugin create` still has a separate recursive skill-import path | `src/cli/plugin/create.mjs:163` `--from-skill`, `:174` `skillSourceDir`, `:181–187` reads `SKILL.md` and parses frontmatter independently of the shared exclusion predicate |

The tracker's completion claim is unreconciled with the source. Packaging acceptance must cover **every export, import, scaffold, install and sharing path**, not `skill deploy` alone — which is precisely the gap the earlier private-state leak came through.

### 2.6 Scale of the ecosystem

| Measure | Value |
| --- | --- |
| Installed plugins | 34 (`total-recall plugin list --json`) |
| In-repo plugin directories | 9 |
| Spec files | 312 (`find -name "*.spec.mjs"`) |
| Registered project brains | 56 |
| Global brain nodes | 1,617 compiled SSSS nodes |
| Connected clients | 11 (Codex, Claude Code, Antigravity, Gemini, DSH, Cursor, Grok Build, Muse Code, Pi, Hermes, Obsidian) |

34 installed plugins against 9 in-repo directories confirms the plugin-ownership mandate: most capabilities live in their own `tr-plugin-*` repositories, not in this tree.

## 3. Contradictions that must be resolved by this plan

These are recorded as findings, not silently rewritten. Each gets one owner and one disposition in the plan.

| # | Contradiction | Evidence | Required resolution |
| --- | --- | --- | --- |
| C1 | A single active project exists, and 13 projects are in progress | `README.md` vs `ls in-progress/` | One owner; the other 12 archived with history preserved |
| C2 | `PLUGIN_UI_OVERHAUL` is "Completed" while prescribing the template model that `PLUGIN_CARDS_BESPOKE` forbids and the validator now rejects | Overhaul tracker header vs `card.mjs:109`, 0 `card_layout` anywhere | Overhaul superseded, not completed; its real remaining scope (catalog, install, permissions, navigation) reassigned |
| C3 | Creator tracker claims `tokenPanelSource()` removed; source contains it | `PLUGIN_CREATOR_SKILL_PROJECT_TRACKER.md` vs `create.mjs:76` | Reconcile claim against source before any customer-facing creation ships |
| C4 | npm publishes `3.40.7`; the installed CLI is `3.40.4` | `npm view` vs `total-recall --version` | Propagation must be completed and independently verified |
| C5 | `status` reports the daemon running; `startup check` reports a foreign PID conflict | `total-recall status` vs `startup check --json` | Resolve lock ownership; the two commands must agree |
| C6 | Instructions report `In sync: no`, `never` synced, no targets | `total-recall status` | Reconcile from scaffold as publish source; never hand-edit the live copy |
| C7 | The capsule is unusable at its default budget, so the documented `ready:true` gate cannot be met | TR-003 evidence, 59% overshoot | Curate or explicitly justify a higher budget — **blocked on Greg's decision** |
| C8 | Four projects each own one plugin card face | 4 card-bespoke trackers | Fold into the single card workstream with one contract and one gauge |

## 4. What is genuinely near launch

Recorded so the plan does not re-litigate finished work:

- **Memory core and instruction workflow** — global brain healthy, 1,617 nodes, `brain: ready`.
- **Plugin host** — 34 plugins installed, `required_plugins: ready`, zero contract errors.
- **Card contract** — template model removed and enforced; bespoke faces are the only valid shape.
- **Release mechanics** — `3.40.7` tagged and published; tree level with `origin/main`.
- **Consolidation machinery** — `source-items.json` with per-item disposition, SHA-256 provenance, and an explicit rule that *"a historical checked box is a claim requiring source/runtime evidence."* This plan reuses that machinery rather than inventing a second one.

## 5. Audit limits

- No sanctioned Mac mini gates were run. Every result is local to the MacBook.
- `startup check` describes *this* machine's runtime; it is not a cloud or fleet statement.
- Version numbers are point-in-time at `aee2ad0`.
- The four card-bespoke projects were assessed from their trackers and from the shared card contract; their individual design work was not reviewed face-by-face.
- No plugin UI was rendered in a browser for this audit.
- Claims in predecessor trackers were **not** re-certified. Checked boxes remain historical claims until the owning workstream supplies source and runtime evidence, per the existing register rule.

## 6. Conclusion

Total Recall is closer to launch than the 13-folder sprawl makes it appear. The card architecture — the largest architectural conflict — is already correct and enforced. The genuine launch blockers are operational and narrow:

1. The runtime cannot prove it is healthy (`shared_ready: false`, foreign daemon PID).
2. The published release is not the release that runs (`3.40.7` vs `3.40.4`).
3. Instruction surfaces are out of sync and the capsule overflows its budget.
4. The plugin creator's packaging claim does not match its source.
5. Nothing verifies the whole path end to end for a real user.

The plan in [`TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md`](TOTAL_RECALL_LAUNCH_PLAN_DEVELOPMENT_PLAN.md) reduces these to **six workstreams with one owner each and one decisive end-to-end acceptance journey**, then archives the 13 predecessors with their evidence intact.
