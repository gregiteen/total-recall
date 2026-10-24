# Launch source register

> **Project**: `TOTAL_RECALL_LAUNCH_PLAN`
> **Created**: 2026-10-24
> **Source commit**: `aee2ad0`
> **Purpose**: give every item from the 13 predecessor projects exactly one workstream, so no item is silently dropped and no item is counted twice.

Predecessors are archived under [`archived/consolidated-into-total-recall-launch-plan/`](../../archived/consolidated-into-total-recall-launch-plan/). They are marked **consolidated**, never completed. Their historical checked boxes are **claims**. Per the existing rule preserved from the previous consolidation:

> A historical checked box is a claim requiring source/runtime evidence.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `evidenced` | Verified at `aee2ad0` by this audit, with a command |
| `claim` | Predecessor checked box, not re-certified |
| `open` | Real remaining work, assigned to a workstream |
| `superseded` | Replaced by a decision in PRD §4; the losing requirement is named |
| `retired` | Removed from scope with a reason |
| `external-owner` | Belongs to a plugin repository or another product, not this launch |

## 1. Predecessor disposition

| Predecessor | Checked / open | Primary workstream | Disposition |
| --- | --- | --- | --- |
| `TR_CORE_PLUGIN_SPLIT` | 23 / 44 | LR-1, LR-2, LR-3, LR-5 | Consolidated master; its 549-item register is preserved and its open items are split below |
| `PLUGIN_CARDS_BESPOKE` | 23 / 8 | LR-5 | Consolidated; phases 1–3 verified, phase 4 is design work, not a launch gate |
| `PLUGIN_CREATOR_SKILL` | 31 / 4 | LR-4 | Consolidated; its unpublished security fix is a launch blocker |
| `PLUGIN_BRICK_STANDALONE` | 11 / 33 | LR-5 | Consolidated; supplies the brick requirement set. **Had no tracker**; its development plan carried the checklist |
| `PLUGIN_UI_OVERHAUL` | 43 / 0 (tracker) vs 34 open (plan) | LR-5 | **Superseded on the card model.** Its "Completed" status is rejected. Its genuine scope (catalog, install, permissions, navigation) folds into LR-5 |
| `SURFACE_COMPILATION_FIX` | 78 / 0 | LR-1 | Consolidated; all boxes checked while its own note says acceptance is unmet. Folded into the runtime-truth workstream |
| `UNIFORM_BRAIN_UPDATES` | 3 / 1 | LR-2 | Consolidated; its one open item was executed outside its own project |
| `TR_MARKETING_LAUNCH` | 26 / 1 | LR-6 | Consolidated; public claims follow demonstrated behavior (R23) |
| `TR_LAUNCH_HARNESS_DISCOVERY` | 0 / 0 (**audit only**) | LR-6 | Consolidated; discovery yields no launch dependency. LH-001/LH-004 close or drop |
| `GITSENTINEL_CARD_BESPOKE` | 40 / 0 | LR-5 | Consolidated; **verified complete** (625-line face, `DESIGN.md`, no template) |
| `STRIPE_CARD_BESPOKE` | 40 / 0 | LR-5 | Consolidated; **verified complete** (790-line face) |
| `SYSTEMMONITOR_CARD_BESPOKE` | 46 / 0 | LR-5 | Consolidated; **verified complete** (655-line face) |
| `MESH_CARD_BESPOKE` | 2 / 11 | LR-5 | Consolidated; the only card project with real open work (434-line face present) |

## 2. Contradictions resolved

Each row is a conflict the audit proved, with the decision and the loser. Full reasoning in PRD §4.

| # | Conflict | Decision | Superseded |
| --- | --- | --- | --- |
| C1 | One active project vs 13 | One owner | The 13-folder structure |
| C2 | `PLUGIN_UI_OVERHAUL` "Completed" while prescribing the dead template model | Superseded, not completed | Its `Completed` status and its Recipe Contract templates |
| C3 | Creator claims `tokenPanelSource()` removed; source has it at `create.mjs:76` | Source is correct | The creator tracker's checked removal item |
| C4 | npm `3.40.7` vs installed `3.40.4` | Propagation incomplete | Any "3.40.7 is released" claim |
| C5 | `status` running vs `startup check` foreign-PID conflict | `startup check` authoritative | The `status` health reading |
| C6 | Instructions `In sync: no`, never synced, no targets | Real defect | Any sync-complete claim |
| C7 | Capsule unusable at default budget | Open — decision D2 | Nothing yet; a decision is required |
| C8 | Four projects, one card face each | One card workstream | The four-project structure |
| C9 | `TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176–189` teaches `card_layout` + 7 templates | **Deleted model** | The entire layout-contract section |
| C10 | Bricks need `ui` optional vs plugins need a face | Both, at different levels | The ambiguity that emitted a stub panel |
| C11 | Shared global skill templates vs no templates | No shared templates | `SURFACE_COMPILATION_FIX` Phase 12 / 12A |
| C12 | Plugin counts 29/30/32/33/34 | **34** | Every other count |

## 3. Carry-forward open items

The decisive items, by workstream. Each keeps its original item text and source line.

### LR-1 Runtime truth

| Source | Item | Status |
| --- | --- | --- |
| Audit C5 | `startup check` reports `daemon: conflict / foreign-pid` while `status` reports running | `open` |
| Audit §2.2 | `server: conflict / server-process-unverified`; `shared_ready: false` | `open` |
| `SURFACE_COMPILATION_FIX` | Surface written to a directory no harness reads; success reported anyway | `open` |
| `TR_CORE` TR-003 | Prove the real memory/instruction workflow offline and authenticated; qualify selected-project identity | `claim` |
| `TR_CORE` TR-002 prod | Safe staged rollout / traffic switch / rollback before new cloud source; verify the serving version | `open` |

### LR-2 Release propagation

| Source | Item | Status |
| --- | --- | --- |
| Audit C4 | Installed CLI `3.40.4` vs published `3.40.7` | `open` |
| `UNIFORM_BRAIN_UPDATES` | Apply and verify the authorized local rollout (scope narrowed to Total Recall main) | `open` |
| `TR_CORE` TR-006 | Three-way skill/entrypoint version skew | `open` |

### LR-3 Memory and instruction contract

| Source | Item | Status |
| --- | --- | --- |
| `TR_CORE` TR-003 | Capsule unusable at default budget (12/13 over, ~9,807–9,870 vs 4,000) | `open` — **D2** |
| `TR_CORE` TR-003 | Curate via `rules draft` → narrow `actions` tags → `rules apply` → `rules verify` | `open` — **D2**, rewrites 83 directives |
| `TR_CORE` TR-003 | Decide the 4,000 default and whether the duplicated AGENTS.md block (94% of the surface) stays | `open` — **D2** |
| Audit C6 | Reconcile from scaffold as publish source; re-sync | `open` |

### LR-4 Packaging safety

| Source | Item | Status |
| --- | --- | --- |
| `PLUGIN_CREATOR_SKILL` | Release so the installed package receives the security fix | `open` — **launch blocker** |
| `PLUGIN_CREATOR_SKILL` | Recompute existing registry entries | `open` |
| `PLUGIN_CREATOR_SKILL` | Convert remaining plugins; resolve `auth`'s second face (**verified already done at `aee2ad0`**: single `kind: card` face, 315-line `card.js`, `DESIGN.md`) | `evidenced` — box stale |
| `PLUGIN_CREATOR_SKILL` | Relocate or remove the 46 MB `browser-profile` | `open` |
| Audit C3 | Reconcile `tokenPanelSource()` and the `--from-skill` path | `open` |
| `PLUGIN_BRICK_STANDALONE` | Remove generated `panel.js`, `DESIGN.md` stub, `ui` block from `plugin create` | `open` |
| `PLUGIN_BRICK_STANDALONE` | Remove `--with-ui` or make it report the face is authored later | `open` — `create.mjs:118` still accepts it |
| `PLUGIN_BRICK_STANDALONE` | Emit a valid manifest on the first run | `open` |

### LR-5 Plugin, brick and card contract

| Source | Item | Status |
| --- | --- | --- |
| `TR_CORE` L82/L313, ARCHITECTURE §176–189 | Teaches `card_layout` + 7 templates | **`superseded`** — deleted model |
| `TR_CORE` TR-010 FC-A/FC-C | Shared renderer with specs and screenshots at three widths | **`superseded`** |
| `PLUGIN_UI_OVERHAUL` | Recipe Contract with layout templates; wizard with `template` field | **`superseded`** |
| `PLUGIN_CARDS_BESPOKE` | Create 34 per-plugin folders; author each face by hand | `open` — **design work, not a launch gate** |
| `PLUGIN_CARDS_BESPOKE` | Rendered faces inspected at 360/768/1280, light and dark | `open` — not a launch gate |
| `PLUGIN_CARDS_BESPOKE` | No seeded metrics; no generator produces plugin UI | `open` — policy checks |
| `PLUGIN_BRICK_STANDALONE` | Make `ui` optional for bricks; keep a declared face strictly validated | `open` — **D1** |
| `PLUGIN_BRICK_STANDALONE` | Add `capability {entry, exports}` and `pluginBundleFiles(dir, {audience})` | `open` |
| `PLUGIN_BRICK_STANDALONE` | Extract `capability/index.mjs` for `stripe`; inject transport; drop placeholders | `open` |
| `PLUGIN_BRICK_STANDALONE` | Vendored brick runs with `TOTAL_RECALL_BIN=/nonexistent`; contains no UI, no `total-recall` string | `open` |
| `MESH_CARD_BESPOKE` | Remove seeded telemetry, `|| 4` fallback, regex parsing; three commands as JSON; screens; `DESIGN.md`; suite green | `open` — the only card workstream with real work |
| `GITSENTINEL` / `STRIPE` / `SYSTEMMONITOR` | All items | **`evidenced`** — faces verified at 625/790/655 lines with `DESIGN.md`, 0 `card_layout` |

### LR-6 Launch acceptance

| Source | Item | Status |
| --- | --- | --- |
| This plan | The complete journey (R26) | `open` |
| `TR_MARKETING_LAUNCH` | Verify clean working tree and push all commits | `open` — false on disk at audit time |
| `TR_LAUNCH_HARNESS_DISCOVERY` LH-001 | Public landing implementation/deployment ownership unverified | `open` |
| `TR_LAUNCH_HARNESS_DISCOVERY` LH-004 | DSH source exists but runtime probe fails | `open` |
| `TR_LAUNCH_HARNESS_DISCOVERY` LH-002/LH-003 | Pi/Hermes connection files are not native integration proof | `retired` — discovery only, no launch dependency |

## 4. Retired with reason

Removed from launch scope, each with the reason recorded. Per standing directive, an unnecessary task is deleted rather than parked in a deferred backlog.

| Item | Reason |
| --- | --- |
| TR-007 identity, tenancy, credits, ai-gateway, app-shell, enrichment | Product roadmap, not launch readiness |
| TR-009 service contract, store service, payouts, license verify | Product roadmap |
| TR-009/TR-010 FC-F brand names, trademark check, FC-G provider logos | Product roadmap; naming already resolved (Hello Phone, Mad Domains & Email, Creative Search) |
| TR-011 Hello Phone workspace, contact-store, dialer extraction, WebRTC CLI | Product feature; contact-store and dialer extraction verified done in `tr-plugin-phone` |
| `TR_CORE` L45 | 4 inert tokens in git history; verified unusable and 401; cosmetic only |
| Harness experiments (Pi, Hermes, OpenCode, Goose, OpenHands, Aider) | Discovery only |
| `SURFACE_COMPILATION_FIX` "Audit `moogie_crm`" | Skipped by explicit user instruction |
| `TR_LAUNCH_HARNESS_DISCOVERY` LH-002/LH-003 | Discovery only |

## 5. Duplicate-detection notes

Recorded because the same repair appears in three trackers, which is itself evidence of the drift:

- The bootstrap-token repair (`init --project` writing a token into a store no server reads) is logged in `PLUGIN_UI_OVERHAUL`, `TR_CORE_PLUGIN_SPLIT`, and `PLUGIN_CARDS_BESPOKE`. **One** workstream now owns it (LR-1, since it is a health-reporting defect: the token was accepted by nobody while `init` printed "pre-authorized").
- `PLUGIN_CARDS_BESPOKE` and `PLUGIN_CREATOR_SKILL` both claim to have removed scaffolder UI generation. **Neither is fully true**: `create.mjs:118` still accepts `--with-ui` and `:472` still advertises `ui/panel.js`. LR-4 owns the actual removal.
- `TR_CORE_PLUGIN_SPLIT`'s checked item at L82 claims "seven template grids" while its own unchecked TR-010 FC-C item asks for the shared renderer. The checked claim is superseded, not completed.

## 6. Register integrity

- Every predecessor folder is preserved at its original path under `archived/consolidated-into-total-recall-launch-plan/`; none is deleted and none is marked complete.
- The predecessor's own 549-item machine register (`TR_CORE_PLUGIN_SPLIT/evidence/consolidation/source-items.json`) travels with it inside its archived folder and remains the authoritative per-item provenance record.
- This register is the successor's mapping. Where a predecessor item is not listed above, its disposition is inherited from the predecessor's own register and it is **not** a launch gate.
