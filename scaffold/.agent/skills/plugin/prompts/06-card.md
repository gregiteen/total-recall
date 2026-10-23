# Prompt 6 — Design the card face by hand

Every plugin has a card face. It is bespoke owner code, written for this plugin and no other.

Full specification: [card](../references/card.md).

## The prompt

Work in this order. Write the reasoning into `ui/DESIGN.md` **before** writing component code.

1. Who uses it, and what are they in the middle of doing? Name the real tasks.
2. What must be visible without a single click? That decides the hierarchy.
3. What is the one primary action, and what is destructive?
4. What is the domain's own vocabulary? Use it. Never render a domain as "a list of commands".
5. Then choose the arrangement, and justify it in the plugin's own terms.

Then author `ui/card.js`:

- **One bespoke Web Component**, declared as the single element of kind `card` in `ui.elements`. No `card_layout`, no template name, no region or widget vocabulary.
- **Screens the plugin defines**, ordered by the plugin's own tasks, most-used first. Never one screen per subcommand.
- **Wide, not a column.**
- **Real data only.** Every value from `host.run(subcommand, args)`. Anything not returned renders an em dash with its reason.
- **Failures are states**, each rendered explicitly with the time of the last attempt.
- **Name a value's driver** when severity combines several measures, or a red tile beside a green figure reads as a contradiction.
- **The host's tokens.** The dashboard is dark: use the injected `--text-*`, `--bg-*`, `--border`, `--accent` and your brand tokens. Declare state colours once in a `:host` block and keep them legible on dark.
- **Accessible**: 44 px controls, keyboard reachable, visible focus, contrast-checked states, `prefers-reduced-motion` respected.
- **Severity never by colour alone** — pair every colour with a word.
- **The card consumes credentials, never collects them.**

## Correct means

1. Render at **360, 768 and 1280 px** — no horizontal overflow anywhere.
2. Render on the **real dashboard tokens** (dark), not on a white page.
3. Exercise every state: credential present, missing, provider unreachable, call rejected, empty, stale.
4. Put it beside another plugin's face. If you cannot tell which is which from the layout alone, it is not finished.
5. No secret value can reach the DOM in any state.

**Then look at it.** Every defect in the anti-patterns catalogue that begins "only looking reveals" was invisible to a schema check.

## Check

```
node <skill>/scripts/record.mjs . --card
```

Then render and inspect it yourself. A passing check is not a design.
