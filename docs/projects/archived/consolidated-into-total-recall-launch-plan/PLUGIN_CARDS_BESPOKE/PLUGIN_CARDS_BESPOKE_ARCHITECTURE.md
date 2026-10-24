# PLUGIN_CARDS_BESPOKE — Architecture

> **Project Prefix**: `PLUGIN_CARDS_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## 1. The inversion

Before, the host owned the arrangement and the plugin supplied data into a vocabulary the host understood. That makes templating structural: a finite vocabulary can only produce permutations of itself.

Now **the plugin owns the arrangement**. The host supplies a frame, a session and plumbing, and mounts the plugin's own component inside it.

```
BEFORE                                  AFTER
──────                                  ─────
CardEngine                              CardEngine
 └── section.card.card-ledger            └── section.card.card-bespoke
      ├── Header (host chrome)                ├── Header (identity only)
      ├── Region(StatusWidget)  ← host        ├── PluginPanel
      ├── Region(DataWidget)    ← host        │    └── iframe (sandboxed, opaque origin)
      ├── Region(CommandsWidget)← host        │         └── <stripe-card>  ← PLUGIN OWNS ALL LAYOUT
      └── Region(ActivityWidget)← host        └── Drawer (settings, credentials, usage)
                                                 (same seam as before)
```

## 2. Contract

### 2.1 Manifest

A face is declared once. `card_layout` is an error, not a fallback.

```json
"ui": { "elements": [
  { "id": "card", "kind": "card", "tag": "stripe-card", "module": "ui/card.js" }
] }
```

### 2.2 Core validation — `src/core/plugin-contracts/card.mjs`

Removed: `CARD_TEMPLATES`, `CARD_WIDGETS`, `WIDGETS_NEEDING_SOURCE`, `CELL_FORMATS`, `validateLayout`.

Added:

```js
function validateCardFace(manifest, errors) {
  if (manifest.card_layout !== undefined) {
    errors.push("'card_layout' is not supported: a card face is bespoke owner code in ui.elements[], never a shared template");
  }
  const elements = manifest.ui?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push("'ui.elements' must declare at least the plugin's card face");
    return;
  }
  const faces = elements.filter((el) => plain(el) && (el.kind === 'card' || el.kind === 'panel'));
  if (faces.length === 0) errors.push("'ui.elements' must declare an element of kind 'card'");
  if (faces.length > 1) errors.push("'ui.elements' must declare exactly one card face");
}
```

The remaining contract is unchanged and still enforced: command effects, typed arguments, secret-stdin rules, `status.command` binding, distribution tiers, branding validation, workspace permissions.

### 2.3 Frontend model — `card/contract.ts`

`Template`, `WidgetKind`, `CardRegion`, `CardColumn` are gone. `normalizeCard` no longer synthesises regions; it resolves the declared face:

```ts
export interface CardFace { id: string; tag: string; module: string; description?: string }
export interface Card {
  id: string; title: string; description: string; face?: CardFace
  commands: Map<string, CardCommand>; branding: CardBranding
  status?: { command: string; refreshSeconds: number }
  distribution?: { tier: string; license: string }
  workspace?: CardWorkspace
}
```

### 2.4 Rendering — `card/CardEngine.tsx`

The `Region` widget switch and the region grid are removed. The engine mounts exactly one thing:

```tsx
<CardScenes plugin={plugin}>
  {card.face
    ? <PluginPanel plugin={plugin} elementId={card.face.id} readOnly />
    : <p className="card-error" role="alert">{plugin.name} has not supplied its card face.</p>}
</CardScenes>
```

A missing face is a loud error, never a substituted host layout.

### 2.5 Styling — `card/card.css`

Per-template rules (`.card-console`, `.card-ledger`, `.card-monitor`, `.card-inbox`, `.card-dashboard`, `.card-workbench`, `.card-vault`, `.card-regions`, `.card-region`) are deleted. What remains for the face is a surface and nothing more:

```css
.card-bespoke .card-face{display:block;min-width:0}
```

The host keeps header, badge, footer, drawer, scene track and the shared primitives (`.card-table`, `.card-pill`, `.card-gauge`, `.card-form`) as an **optional** palette a face may use — no face is required to, and using them does not arrange anything.

## 3. The seam that does not change

The sandbox is the reason bespoke faces are safe, and it is untouched:

- `plugin-frame.ts` builds a document with CSP `default-src 'none'; connect-src 'none'`, an opaque origin, and no dashboard DOM or storage.
- The plugin module is imported from a blob URL and must register its declared tag.
- `host` is frozen; `host.run(subcommand, args, { stdin })` posts to the parent, which validates the command against the manifest via `allowedFrameCommand`, enforces the read/write effect for read-only mounting, and serialises concurrent calls.
- A secret never travels in argv: a single-secret string command is passed over `stdin`, and the frame receives only `{ ok: true }`.
- Height is reported from a `ResizeObserver` inside the frame and clamped by the host.

A bespoke face therefore has exactly the same privileges as before. Nothing about "bespoke" widens the attack surface — which is what makes R1 and R4 safe to demand absolutely.

## 4. Why no shared abstraction

The failure mode this project exists to remove was caused by a shared abstraction optimising for authoring convenience. Any new "card kit", "layout helper" or "region primitive" that core provides for plugin authors recreates the vocabulary, and the vocabulary recreates the homogeneity.

What is shared is therefore deliberately minimal and non-structural:

| Shared | Why it is safe |
| --- | --- |
| The sandbox frame + `host.run` | A capability boundary, not a layout decision |
| Brand tokens (`color`, `accent`, `font`, `density`, `radius`, `header`) | Values differ per plugin; they express identity, not arrangement |
| The drawer (settings, credentials, usage) | Separates configuration from the face so faces stay focused |
| Optional CSS primitives | Available, never imposed; choosing them arranges nothing by itself |
| Per-plugin `ui/DESIGN.md` | A document per plugin, not a template shared across them |

## 5. Per-plugin project structure

Because each face is a distinct design problem, each plugin gets its own project:

```
docs/projects/in-progress/<PLUGIN_PREFIX>/
  <PLUGIN_PREFIX>_AUDIT.md              ← what this plugin's card actually is today
  <PLUGIN_PREFIX>_PRD.md                ← the design requirements for this domain
  <PLUGIN_PREFIX>_ARCHITECTURE.md       ← how this face is structured
  <PLUGIN_PREFIX>_DEVELOPMENT_PLAN.md   ← the build order
  <PLUGIN_PREFIX>_PROJECT_TRACKER.md    ← phases, verification, action log
```

and the design itself lives with the code it describes, in `<plugin>/ui/DESIGN.md`.

## 6. Migration order

1. **Core** — remove the vocabulary, require a face. *Done.*
2. **Enforcement** — every templated plugin now fails validation; the `listBundledPlugins` assertion is the gauge. *Done.*
3. **Instruction surface** — skill and references rewritten so no agent re-templates. *Done.*
4. **Per plugin** — for each of the 34: audit its real function, design the face, author `ui/card.js` by hand, remove `card_layout`, verify by rendering. Sequenced individually, never generated.
5. **Verification** — re-run the gauge until all 34 are valid; confirm no two different-function cards share an information architecture.

Steps 1–3 remove the ability to do the wrong thing. Step 4 is the actual design work, and it is 34 separate pieces of it.
