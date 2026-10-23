# PLUGIN_CARDS_BESPOKE — Development Plan

> **Project Prefix**: `PLUGIN_CARDS_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## Phase 0 — Audit ✅

- [x] Measure the real state of all 34 cards (templates, widgets, signatures) — see AUDIT FINDING-03
- [x] Identify the rendering path and prove the bespoke faces were unreachable — FINDING-04
- [x] Write `PLUGIN_CARDS_BESPOKE_AUDIT.md`, status Complete

## Phase 1 — Remove the ability to template

- [x] Delete `CARD_TEMPLATES`, `CARD_WIDGETS`, `WIDGETS_NEEDING_SOURCE`, `CELL_FORMATS` from `src/core/plugin-contracts/card.mjs`
- [x] Replace `validateLayout` with `validateCardFace`; make `card_layout` an explicit error
- [x] Remove `Template`, `WidgetKind`, `CardRegion`, `CardColumn` from `frontend/src/components/plugins/card/contract.ts`
- [x] Remove the `Region` widget switch and region grid from `CardEngine.tsx`
- [x] Delete per-template CSS from `card.css`
- [x] Rewrite `src/core/plugin-contracts/card.spec.mjs` to assert templating is rejected
- [x] Rewrite `CardEngine.spec.tsx` to assert the owner face is mounted and no host arrangement is substituted
- [x] `npx tsc --noEmit -p frontend/tsconfig.json` clean; contract + engine specs 25/25 green

## Phase 2 — Remove sharing between plugins

- [x] Delete `fixtures/bundled-plugins/` (three stub copies of real plugin manifests)
- [x] Remove `_TR_TEST_BUNDLED_PLUGINS_DIR` from `plugin-loader.mjs` and `vitest.config.ts`
- [x] Make `listBundledPlugins` read only the real plugin directories
- [x] Fix each spec to build its own manifest inline (loader, catalog)
- [x] Turn the `listBundledPlugins` validity assertion into the migration gauge, naming each plugin that still declares a template

## Phase 3 — Close the instruction surface

- [x] Rewrite `.agents/skills/plugin/references/card-design.md`: no templates, design from the function, verification by looking
- [x] Sync the rewritten reference into `scaffold/.agent/skills/plugins/references/card-design.md`
- [x] Update both `SKILL.md` build orders: author the face by hand, no template, no generator
- [x] Update `manifest-contract.md`: the card face and branding, with no `card_layout`
- [x] Record as durable memory: no templates; no shared fixtures; no generators for plugin UI

## Phase 4 — Per-plugin projects (34)

Each plugin gets its own project folder and its own reasoned design. Sequenced individually.

- [x] Establish the umbrella project documents (this set)
- [ ] Create `docs/projects/in-progress/<PLUGIN_PREFIX>/` for all 34 plugins, each with its own AUDIT
- [ ] For each plugin: audit what its card is today and what its domain actually needs
- [ ] For each plugin: write that plugin's PRD from its own functions and its own operators
- [ ] For each plugin: write its ARCHITECTURE, DEVELOPMENT_PLAN and PROJECT_TRACKER
- [ ] For each plugin: author `ui/card.js` and `ui/DESIGN.md` **by hand**
- [ ] For each plugin: remove `card_layout` from its `plugin.json` and declare its single card face
- [ ] For each plugin: verify the rendered face at 360/768/1280 px, light and dark

## Phase 5 — Verification

- [ ] `listBundledPlugins` validity assertion passes for all 34
- [ ] No manifest declares `card_layout`; no core file references a template or widget vocabulary
- [ ] Two plugins with different functions are distinguishable from layout alone
- [ ] No card face seeds a metric; every displayed value traces to a returned command or the host
- [ ] No script in the repository generates or bulk-edits plugin UI
- [ ] Full suite green on the sanctioned test node

## Sequencing note

Phases 1–3 are complete and make the wrong thing impossible: a templated plugin is now invalid, a shared fixture is gone, and the instruction surface no longer teaches templates. Phase 4 is the real work — 34 independent design problems — and it cannot be batched, templated or generated without reproducing exactly the failure this project removes.
