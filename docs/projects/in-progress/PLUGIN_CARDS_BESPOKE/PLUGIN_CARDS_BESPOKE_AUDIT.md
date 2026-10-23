# PLUGIN_CARDS_BESPOKE — Audit

> **Project Prefix**: `PLUGIN_CARDS_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `333dd30a67e6152531b0cceb506c2c875412da2d`

---

## 1. Why this audit exists

Greg's standing directives are explicit:

> **Plugin card faces must never be hardcoded into Total Recall core app; they belong exclusively in their respective plugin repositories (`tr-plugin-*/ui/card.js`). Every card must be genuinely functional with zero simulated, fake, or mock state, use space densely and wisely, feature custom vector branding without emojis, and expose real integration controls.** (`invariants-1933916a`)

> **The entire plugin card face must be a bespoke animated JavaScript interface with its single commercial brand identity and zero outer wrapper duplicates.** (`invariants-4f742f48`)

> **Plugin UI must be actual purpose-built, functional interfaces tailored specifically to each plugin's real operational domain (e.g. DNS table, security scanner results, payment checkout sessions, ticket tier inventory, blue/green deployment slots). Never generate fake audio equalizers, spectrum analyzers, or pseudo-Winamp skins on non-audio plugins.** (`anti-patterns-ec0c0d95`)

On 2026-10-23 Greg restated the requirement with no room for interpretation:

> "THEY ARE SUPPOSED TO HAVE BESPOKE LAYOUTS BASED ON THEIR FUNCTIONALITY BUT THEY ARE TEMPLATED!!!!!! THERE SHOULD BE NO TEMPLATES AT ALL EVER"

> "EVERY CARD SHOULD HAVE A DIFFERENT LAYOUT BASED ON ITS BRAND AND ITS FUNCTION NOT TEMPLATES NO TEMPLATES!!!"

> "THE FUNCTIONALITY OF THE PLUGINS NEEDS THOUGHT AND PLANNING BASED ON THE FUNCTION OF THE PLUGIN I DO NOT WANT ANY AUTOMATED SCRIPTS BUILDING ANY PLUGIN EVER EVERYTHING MUST BE BESPOKE."

This audit records what actually existed at the audited commit, with measurements.

---

## 2. Findings

### FINDING-01 — Core enforced a closed allowlist of seven layouts (P0, critical)

`src/core/plugin-contracts/card.mjs` declared:

```js
export const CARD_TEMPLATES = ['console', 'ledger', 'monitor', 'inbox', 'dashboard', 'workbench', 'vault'];
```

`validateLayout()` rejected any manifest whose `card_layout.template` was outside that list:

```js
if (!CARD_TEMPLATES.includes(layout.template)) errors.push(`'card_layout.template' must be one of: ...`);
```

A plugin author could therefore only choose one of seven shapes. This is the definition of templating, and it made a bespoke layout impossible to declare.

### FINDING-02 — Every card rendered through one shared engine (P0, critical)

`frontend/src/components/plugins/card/CardEngine.tsx` carried a single generic `Region` switch:

```tsx
function Region({ region, plugin }) {
  switch (region.widget) {
    case 'status': return <StatusWidget />
    case 'live':   return <PluginPanel ... />
    case 'actions': case 'form': case 'keypad': return <CommandsWidget ... />
    case 'table': case 'detail': case 'list': case 'gauge': case 'log': return <DataWidget ... />
    case 'settings': case 'credentials': return <SettingsWidget />
    case 'activity': return <ActivityWidget />
  }
}
```

`CardEngine` then filtered `card.regions` and emitted one `<section class="card-region card-region-<widget>">` per region. **Every plugin in the ecosystem was this same component tree**, differing only in brand colour and in the order of the same thirteen widget kinds. The card described by `invariants-4f742f48` as "a bespoke animated JavaScript interface" was not mounted at all.

### FINDING-03 — Measured: 24 of 34 plugins shared an identical card signature (P0, critical)

Signature = `template` followed by the ordered widget sequence. Grouped across all 34 installed plugins:

| Plugins | Identical signature |
| --- | --- |
| 4 | *(no template)* — `embeddings`, `hermes`, `marketing`, `openclaw` |
| 3 | `workbench > status > live > list > actions > credentials > activity` — `composable-cli`, `design`, `sticker-generator` |
| 3 | `dashboard > status > live > list > actions > credentials > activity` — `decision`, `maps`, `translator` |
| 3 | `ledger > status > live > list > actions > credentials > activity` — `domains`, `stripe`, `tickets` |
| 3 | `dashboard > status > live > list > actions > activity` — `git-sentinel`, `okf`, `openwiki` |
| 2 | `workbench > status > live > list > actions > activity` — `creative-search`, `skill-manager` |
| 2 | `monitor > status > live > list > actions > activity` — `dsh`, `system-monitor` |
| 2 | `inbox > status > live > list > actions > settings > credentials > activity` — `phone-companion`, `text` |
| 2 | `dashboard > status > live > actions > activity` — `tr-transcribe`, `user-automations` |

**24 of 34 (71%) shared a byte-identical card signature with at least one other plugin.** Stripe (payments), Domains (DNS) and Tickets (ticketing) — three commercially unrelated domains — were the same layout. `design` (a design-system plugin) had the same layout as `sticker-generator`.

Template usage across 34: `dashboard` 10, `workbench` 8, `vault` 3, `ledger` 3, `monitor` 3, `inbox` 3, none 4.

### FINDING-04 — Dead bespoke faces: 30 plugins ship a card face that never renders (P1, high)

30 of 34 plugins declare a `card` element and ship a real `ui/card.js` (4,000–16,000 bytes each, e.g. `tr-plugin-phone/ui/card.js` at 31,323 bytes, `tr-plugin-tickets/ui/card.js` at 20,198 bytes). **Not one of those 34 cards was reachable from the card face.** The only path to a plugin's own UI was the `live` widget nested *inside* the generic engine, which itself sat inside the generic `<section class="card card-<template>">` wrapper.

This is simultaneously the violation `invariants-4f742f48` calls "outer wrapper duplicates": the bespoke face existed, but the engine's borrowed chrome was drawn around it.

### FINDING-05 — Four plugins declare no interface at all (P1, high)

`embeddings`, `marketing`, `openclaw` declare no `ui.elements`, and `user-automations` declares a panel but no card. These render as a command list. They have no bespoke face to mount.

### FINDING-06 — The card-design skill taught the template system (P0, critical)

`.agents/skills/plugin/references/card-design.md` opened with "Pick a template by function" and instructed authors to "Declare `card_layout` and `branding`". `scaffold/.agent/skills/plugins/references/card-design.md` and `manifest-contract.md` did the same, as did `docs/projects/in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_ARCHITECTURE.md:176` ("The engine is shared; the design is not. A plugin declares `card_layout`"). The instruction surface actively directed agents to produce templated cards.

### FINDING-07 — Card faces were authored to a generator, not to a domain (P1, high)

Inspection of `tr-plugin-system-monitor/ui/card.js` shows the constructor seeding `this.sample` with a literal hostname, platform, uptime, load average and memory reading before any command runs. It is labelled "fallback telemetry". This is the pattern Greg's directive prohibits: rather than a face designed around host telemetry, the face was produced to satisfy a shared recipe and padded with placeholder state.

### FINDING-08 — No visual verification existed (P1, high)

`scripts/` contains no screenshot, render or visual-regression tooling, and no plugin repository ships a rendered reference image. Cards were authored, validated for manifest shape, and never looked at. Nothing in the toolchain could have caught FINDING-03.

---

## 3. What was correct and must be preserved

- **The sandbox harness is sound.** `frontend/src/components/plugins/plugin-frame.ts` builds a locked-down document (CSP `default-src 'none'`, opaque origin, `connect-src 'none'`), injects the plugin's module from a blob URL, instantiates the declared tag, and passes a frozen `host` object whose `run()` is the only side channel. Commands are checked against the manifest by `allowedFrameCommand`. This is the correct foundation for bespoke faces and needs no redesign.
- **Secrets stay off the command line.** `PluginPanel` strips the `stdin` path for single-secret string commands; `buildArgs` never emits secret arguments into argv.
- **Brand tokens are already per-plugin.** `branding.color`, `accent`, `font`, `density`, `radius`, `header` vary genuinely across plugins; `brandStyle()` derives `--card-*` custom properties and `inkOn()` picks readable ink. Brand identity is not the problem — layout is.
- **Effect declarations drive read/write safety.** Every command declares `read | write | destructive | send`, and `readOnly` mounting is enforced against that.

---

## 4. Root cause

The card was modelled as **host-rendered data driven by a manifest vocabulary**. That model makes templating structural rather than incidental: if the host owns the arrangement, the arrangement must come from a finite vocabulary the host understands, and the only possible outputs are permutations of that vocabulary. Brand tokens varied, so the cards *looked* different, but the information architecture was identical everywhere.

A bespoke card requires the inverse: **the plugin owns the arrangement, and the host supplies only the frame, the session and the credential plumbing.**

---

## 5. Remediation performed under this audit

| Change | File | Effect |
| --- | --- | --- |
| Deleted `CARD_TEMPLATES`, `CARD_WIDGETS`, `WIDGETS_NEEDING_SOURCE`, `CELL_FORMATS` | `src/core/plugin-contracts/card.mjs` | No layout vocabulary remains in core |
| Replaced `validateLayout` with `validateCardFace` | `src/core/plugin-contracts/card.mjs` | A card face is required; `card_layout` is now an explicit error |
| Removed `Template`, `WidgetKind`, `CardRegion`, `CardColumn` | `frontend/src/components/plugins/card/contract.ts` | Card model carries `face`, not `template`/`regions` |
| Removed the `Region` widget switch and region grid | `frontend/src/components/plugins/card/CardEngine.tsx` | The engine mounts the plugin's own face and nothing else |
| Removed per-template CSS | `frontend/src/components/plugins/card/card.css` | No `.card-ledger`, `.card-workbench` … layout rules |
| Rewrote contract and engine specs | `src/core/plugin-contracts/card.spec.mjs`, `CardEngine.spec.tsx` | Specs assert templating is rejected |

Verified state after remediation: `validateCardContract` rejects `card_layout` outright, and **all 34 installed plugins now fail validation**, which is the correct signal — every one of them is templated and must be rebuilt by hand.

---

## 6. Consequential findings

Rebuilding 34 bespoke card faces is 34 distinct pieces of design work, each requiring an understanding of its own domain. That work cannot be sequenced or specified by this umbrella document, and it must not be produced by a generator. Each plugin therefore gets its own project under `docs/projects/in-progress/<PLUGIN_PREFIX>/` with its own AUDIT, PRD, ARCHITECTURE, DEVELOPMENT_PLAN and PROJECT_TRACKER, so that the functionality is reasoned about per plugin before any card code is written.
