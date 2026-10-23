# PLUGIN_CARDS_BESPOKE — Project Tracker

> **Project Prefix**: `PLUGIN_CARDS_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## ✅ Phase 0: Audit

Goal: establish, with measurements, what the plugin cards actually were.

- [x] Enumerate all 34 installed plugins and their manifests
- [x] Aggregate templates and widget sequences across all 34
- [x] Prove 24/34 shared an identical card signature
- [x] Prove 30 bespoke `ui/card.js` files were unreachable from the card face
- [x] Write `PLUGIN_CARDS_BESPOKE_AUDIT.md` (status Complete)

## ✅ Phase 1: Remove the ability to template

Goal: core cannot express, accept or render a shared layout.

- [x] Delete the template/widget vocabulary from `src/core/plugin-contracts/card.mjs`
- [x] Make `card_layout` an explicit validation error; require exactly one bespoke face
- [x] Remove `Template`, `WidgetKind`, `CardRegion`, `CardColumn` from `card/contract.ts`
- [x] Remove the `Region` switch and region grid from `CardEngine.tsx`
- [x] Delete per-template CSS from `card.css`
- [x] Rewrite both spec files against the new contract

## ✅ Phase 2: Remove sharing between plugins

Goal: no second copy of any plugin definition exists anywhere.

- [x] Delete `fixtures/bundled-plugins/`
- [x] Remove `_TR_TEST_BUNDLED_PLUGINS_DIR` from the loader and vitest config
- [x] Point `listBundledPlugins` at the real plugin directories only
- [x] Make specs build their own manifests inline

## ✅ Phase 3: Close the instruction surface

Goal: no agent is taught to template a plugin again.

- [x] Rewrite `card-design.md` (no templates; design from the function)
- [x] Sync it into the scaffold copy
- [x] Update both `SKILL.md` build orders
- [x] Update `manifest-contract.md`
- [x] Record the three durable invariants

## ⏳ Phase 4: Per-plugin projects (34)

Goal: each plugin has its own project and its own hand-authored face.

- [ ] Create the 34 per-plugin project folders, each starting with its own AUDIT
- [ ] Complete each plugin's design reasoning (operators, tasks, vocabulary, hierarchy)
- [ ] Author each `ui/card.js` and `ui/DESIGN.md` by hand
- [ ] Remove `card_layout` and declare the single card face per manifest

## ⏳ Phase 5: Testing and verification

Goal: prove the result, and prove it by looking.

- [ ] `listBundledPlugins` validity assertion green for all 34
- [ ] No `card_layout` anywhere; no template or widget vocabulary in core
- [ ] Rendered faces inspected at 360/768/1280 px, light and dark, per plugin
- [ ] Two different-function cards distinguishable by layout alone
- [ ] No seeded metrics in any face
- [ ] No generator script produces plugin UI
- [ ] Full suite green on the sanctioned test node

## Verification Log

- 2026-10-23: `npx tsc --noEmit -p frontend/tsconfig.json` — exit 0, no errors
- 2026-10-23: `npx vitest run src/core/plugin-contracts/ frontend/src/components/plugins/card/` — 4 files, 25 tests passed
- 2026-10-23: `node -e "listBundledPlugins()"` — 34/34 invalid, 3 of them for declaring no face at all (correct gauge reading)
- 2026-10-23: `npx vitest run src/core/plugin-loader.spec.mjs` — 17/18 passed; the one failure is the migration gauge naming `auth` as still templated

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-10-23T08:29Z | DSH agent | Ran `total-recall --help`, read `.agent/skills/total-recall/SKILL.md`, ran `total-recall context "visually inspect plugin cards…"` | Capsule `ready:true`; surfaced invariants `1933916a`, `4f742f48`, `ec0c0d95` requiring bespoke functional card faces | context capsule output |
| 2026-10-23T08:30Z | DSH agent | Built `scratch/plugin-visual/collect.mjs`, collected 34 manifests + real read-command output | 34 plugins, 30 with card modules 6.6–31 KB | `scratch/plugin-visual/fixtures/plugins.json` |
| 2026-10-23T08:31Z | DSH agent | Aggregated card signatures across all 34 manifests | 24/34 in 9 groups of identical signature; Stripe=Domains=Tickets | `TEMPLATES: dashboard 10, workbench 8, vault 3, ledger 3, monitor 3, inbox 3, none 4` |
| 2026-10-23T08:32Z | DSH agent | Read `CardEngine.tsx`, `contract.ts`, `plugin-contracts/card.mjs` | Confirmed templating is structural: `CARD_TEMPLATES` allowlist + `Region` widget switch | source read |
| 2026-10-23T08:33Z | DSH agent | Read `tr-plugin-system-monitor/ui/card.js` | Constructor seeds hostname, uptime, load average, memory before any command — fabricated fallback telemetry | source read, FINDING-07 |
| 2026-10-23T08:34Z | DSH agent | Deleted `CARD_TEMPLATES`/`CARD_WIDGETS`/`WIDGETS_NEEDING_SOURCE`/`CELL_FORMATS`; replaced `validateLayout` with `validateCardFace` (rejects `card_layout`) | `card_layout` now an explicit error | `src/core/plugin-contracts/card.mjs` |
| 2026-10-23T08:34Z | DSH agent | Removed `Template`/`WidgetKind`/`CardRegion`/`CardColumn` and region synthesis from `contract.ts` | Card model carries `face`, not `template`/`regions` | `frontend/src/components/plugins/card/contract.ts` |
| 2026-10-23T08:34Z | DSH agent | Removed the `Region` widget switch and region grid from `CardEngine.tsx`; engine now mounts only `PluginPanel` for the declared face | No host arrangement is possible | `CardEngine.tsx` |
| 2026-10-23T08:34Z | DSH agent | Deleted `.card-console`/`.card-ledger`/`.card-monitor`/`.card-inbox`/`.card-dashboard`/`.card-workbench`/`.card-vault`/`.card-regions`/`.card-region` CSS | No per-template styling remains | `card.css` |
| 2026-10-23T08:35Z | DSH agent | Rewrote `card.spec.mjs` and `CardEngine.spec.tsx` | Contract rejects templates; engine mounts owner face and says so plainly when absent | 25/25 tests pass |
| 2026-10-23T08:35Z | DSH agent | `npx tsc --noEmit -p frontend/tsconfig.json` | exit 0 | typecheck output |
| 2026-10-23T08:36Z | DSH agent | Recorded invariant: no templates ever; every card bespoke from its own brand and function | Memory node `invariants-297721bb` | `total-recall remember` output |
| 2026-10-23T08:36Z | DSH agent | Deleted `fixtures/bundled-plugins/` (3 stub plugin manifests); removed `_TR_TEST_BUNDLED_PLUGINS_DIR` from `plugin-loader.mjs`, `vitest.config.ts`, `plugin-catalog.spec.mjs` | No second copy of a plugin definition exists | `ls fixtures/` shows no `bundled-plugins` |
| 2026-10-23T08:36Z | DSH agent | Recorded invariants: no shared plugin fixtures; no generators for plugin UI | Memory nodes `invariants-4de4aab1`, `invariants-b6e8fcac` | `total-recall remember` output |
| 2026-10-23T08:37Z | DSH agent | Rewrote `.agents/skills/plugin/references/card-design.md`; synced to `scaffold/.agent/skills/plugins/references/card-design.md`; updated both `SKILL.md` and `manifest-contract.md` | Instruction surface no longer teaches templates | `diff` reports files identical |
| 2026-10-23T08:37Z | DSH agent | Ran `listBundledPlugins()` after the change | 34/34 invalid — 31 declaring `card_layout`, 3 declaring no face | gauge reading recorded |
| 2026-10-23T08:38Z | DSH agent | Turned the `listBundledPlugins` assertion into the migration gauge with a per-plugin message | Failure now names `auth` and the remaining plugins explicitly | `npx vitest run src/core/plugin-loader.spec.mjs` |
| 2026-10-23T08:38Z | DSH agent | Wrote umbrella project documents: AUDIT, PRD, ARCHITECTURE, DEVELOPMENT_PLAN, this tracker | Project established under `docs/projects/in-progress/PLUGIN_CARDS_BESPOKE/` | this file set |
| 2026-10-23T08:39Z | DSH agent | Phase 4 not started. Attempted a visual render harness in `scratch/plugin-visual/` (playwright + esbuild) for inspection only; it never wrote to any plugin source and was abandoned when the user directed all effort to removing templates | Harness incomplete; **no plugin source was generated or modified by any script** | `scratch/plugin-visual/` |
