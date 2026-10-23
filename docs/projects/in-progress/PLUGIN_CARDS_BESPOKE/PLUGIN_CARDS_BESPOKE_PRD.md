# PLUGIN_CARDS_BESPOKE — Product Requirements

> **Project Prefix**: `PLUGIN_CARDS_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## 1. Problem

Every plugin card in the ecosystem was rendered by one host engine from a declared template and a region list (AUDIT FINDING-01, FINDING-02). Measured consequence: **24 of 34 plugins shared a byte-identical card signature**, and Stripe, Domains and Tickets — three unrelated commercial domains — were the same layout (FINDING-03). Meanwhile 30 plugins shipped a real bespoke `ui/card.js` that the card face never mounted (FINDING-04). The user's verdict: "THEY ARE SUPPOSED TO HAVE BESPOKE LAYOUTS BASED ON THEIR FUNCTIONALITY BUT THEY ARE TEMPLATED".

## 2. Goal

A user looking at a grid of plugin cards can identify each plugin's purpose and act on it **from the layout alone**, with no reliance on the logo, the title or the brand colour. No two plugins with different functions present the same information architecture.

## 3. Requirements

### R1 — Zero templates (P0)
Core must contain no layout vocabulary: no template allowlist, no widget kinds, no region model, no per-template CSS. A manifest that declares a layout is **invalid**.

**Acceptance**: `validateCardContract` returns an error for any manifest containing `card_layout`, and the strings `CARD_TEMPLATES`, `CARD_WIDGETS`, `WidgetKind`, `CardRegion` and `Template` do not exist in the codebase.

### R2 — A bespoke face is mandatory (P0)
Every plugin must declare exactly one UI element of kind `card`, resolving to a real module on disk. A plugin with no face, or with two, is invalid.

**Acceptance**: `validateCardContract` errors on zero faces and on more than one; the loader resolves the declared module.

### R3 — The host mounts the plugin's face, never its own arrangement (P0)
The card face must be the plugin's own Web Component, mounted in the existing sandboxed frame. The host draws no wrapper chrome around the face and lays out nothing inside it.

**Acceptance**: `CardEngine` renders `<PluginPanel>` for the declared face and emits no `.card-regions`, no `.card-region`, and no `card-<template>` class.

### R4 — Design is reasoned per plugin, from the domain (P0)
Before any face is authored, that plugin must have its own written design covering: the people who use it, the two or three real tasks, what must be visible without a click, the domain's own vocabulary, and the primary versus destructive actions. This belongs in the plugin's own `ui/DESIGN.md` and its own project documents.

**Acceptance**: each rebuilt plugin has a `ui/DESIGN.md` and per-plugin project documents; no two read as generic.

### R5 — No generator ever produces plugin UI (P0)
No script, loop, template literal or codegen step may write or bulk-edit a plugin's `plugin.json`, `ui/card.js` or `ui/DESIGN.md`. Authoring is manual and per plugin.

**Acceptance**: no such script exists in any plugin or in core; plugin sources are not produced by a tool.

### R6 — Nothing shared between plugins (P0)
No shared fixture set, no shared manifest copy, no shared card scaffold. Each plugin repository owns its own definition, tests and face. A second copy of a plugin definition is prohibited.

**Acceptance**: `fixtures/bundled-plugins/` is gone; `_TR_TEST_BUNDLED_PLUGINS_DIR` no longer exists; specs build their own manifests inline.

### R7 — Real data only (P1)
No fallback or seed telemetry. A value appears only if a command or the host returned it; a failure is shown as a failure with its last attempt time.

**Acceptance**: no card face seeds a metric in its constructor (AUDIT FINDING-07 resolved).

### R8 — Verifiable by looking (P1)
A rendered face must be inspectable at 360, 768 and 1280 px in light and dark, and two plugins' cards must be distinguishable by layout alone.

**Acceptance**: each rebuilt plugin has verification evidence in its tracker showing the rendered face.

## 4. Non-goals

- No redesign of the sandbox frame, the CSP, the `host.run` contract or the drawer. These were audited as sound (AUDIT §3) and stay as they are.
- No change to brand token semantics; token *values* are already genuinely per-plugin.
- No new shared abstraction to make bespoke faces "easier". Every such abstraction regenerates this exact failure.

## 5. Success condition

All 34 installed plugins are valid under the new contract, each with a hand-authored face designed from its own function, and no two cards with different functions share an information architecture. At that point the `listBundledPlugins` validity assertion passes again — it is currently failing and reporting each plugin that remains templated.
