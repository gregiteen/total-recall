# The card face

Every plugin has a card face. It is the plugin's interface in the Total Recall dashboard, and it is **bespoke owner code**: written by hand, for that one plugin, from that plugin's own function and brand.

There is no template, no layout vocabulary, no widget set, no region list. Core rejects `card_layout` outright. A face that could be dropped onto a different plugin is a failed face.

---

## What the host provides, and nothing more

- a **sandboxed frame** — opaque origin, `default-src 'none'`, `connect-src 'none'`, no dashboard DOM and no storage
- a frozen **`host`** object whose `run(subcommand, args, options)` is the only channel out
- the **design tokens** it injects into the frame
- the **drawer**, which carries settings and credentials so the face stays focused

Everything else — structure, vocabulary, hierarchy, controls, visual language — is yours to design for this plugin and no other.

## The design process

Work in this order, and write the reasoning into `ui/DESIGN.md` **before** writing component code.

1. **Who uses it, and what are they in the middle of doing?** Name the two or three real tasks. A payments operator reconciling a payout is not the same as one hunting a suspicious charge.
2. **What must be visible without a single click?** That decides the hierarchy. A DNS plugin shows the zone and its records; a telephony plugin shows line state and the active call; a telemetry plugin shows which machine is struggling.
3. **What is the one primary action, and what is destructive?** A destructive action gets confirmation, and never the visual weight of the obvious next step.
4. **What is the domain's own vocabulary?** Use it. Amounts, dates and states in the arrangement an accountant expects; peers, routes and reachability for a mesh. Never render a domain as "a list of commands".
5. **Then choose the arrangement**, and justify it in the plugin's own terms.

`ui/DESIGN.md` carries a real `tokens:` block matching the manifest, and the reasoning above. See the surfaces reference for the token fields.

## Screens

A plugin with several jobs carries them across **screens the operator flips through**. The plugin defines them.

- A plugin has **exactly one card face and as many screens as it needs**. There is no limit and no required count; use the number the plugin's own tasks call for. Declare each additional screen as a `kind: 'panel'` element in `ui.elements[]`.
- Order them by the plugin's own tasks, **most-used first**.
- The first screen answers what the operator opened the card to do.
- **Never one screen per subcommand.** That is the host's command list wearing a costume, and it is what makes unrelated plugins look alike.
- Never a screen set the host derives or imposes.

## Rules that make a face real

- **Real data only.** A value appears only if a command or the host returned it. Never a seeded reading, a placeholder, an example default or an `ONLINE` badge. If a source fails, show the failure and when it was last attempted.
- **Unknown is an em dash with a reason**, never a zero and never a reassuring word. `0 unpushed commits` and `unknown, no upstream configured` are different facts.
- **Failures are states**, first-class and rendered like any other. Missing credential, unreachable provider, rejected call, stale reading.
- **A value's driver is named.** If severity combines several measures, say which one drove it, or a red tile beside a green figure reads as a contradiction.
- **Every declared operation is reachable**, and its effect is visible — a `read` must not look like a `send`.
- **Destructive actions state their target and require confirmation.**
- **The card consumes credentials, never collects them.** Report present or missing; never render a value; never render an input that accepts one. Hand over the auth command to run instead.
- **Tokens only.** No hard-coded hex outside the single `:host` token block. The dashboard is **dark**, so the injected `--text-*`, `--bg-*`, `--border` and `--accent` values are light-on-dark; tune your state colours for that surface and keep them legible.
- **Wide, not a column.** A narrow column forces vertical stacking, which is what makes different plugins look alike.
- **Severity never by colour alone** — pair every colour with a word.
- **Accessible.** Controls at least 44 px, keyboard reachable, visible focus, contrast-checked state colours, `prefers-reduced-motion` respected.
- **No decoration.** No ambient animation, no emoji as icons, no hardware-skin imitation, no fake equaliser on a plugin that has no audio. Motion only when it reports a state change.
- **Copy.** No filler words, and no sentence ends with a preposition.

## Shape of the component

```js
export class ExampleCard extends HTMLElement {
  get screens() { return [ { id: 'charge', label: 'Charge' }, /* … most-used first */ ] }
  connectedCallback() { /* attach shadow, render frames with em dashes, then read */ }
  disconnectedCallback() { /* clear timers; never leave one running */ }
  async read() { /* host.run(...) → paint; a rejection clears figures and shows the error */ }
}
if (!customElements.get('tr-example-card')) customElements.define('tr-example-card', ExampleCard)
```

- Values are painted **after** a command returns. Before the first read, the frames show em dashes.
- A failed read **clears** every figure rather than retaining the previous one as though current.
- Timers are cleared on disconnect.

## Verifying a face

Run `scripts/record.mjs --card` for the mechanical checks, then look at it:

1. Render at **360, 768 and 1280 px**. No horizontal overflow at any width.
2. Render on the **real dashboard tokens** (dark), not on a white test page. A face that only reads on white is broken in production.
3. Exercise every state: credential present, credential missing, provider unreachable, call rejected, empty, stale.
4. Put it beside another plugin's face. If you cannot tell which is which from the layout alone, it is not finished.
5. Confirm no secret value can reach the DOM in any state.

## What a face must never do

- Never seed a value, a hostname, a reading or a status word.
- Never show a reassuring default in place of an unknown.
- Never render a secret, in any state, for any reason.
- Never collect a credential.
- Never present a command name as the primary structure.
- Never derive its screens from the command list.
- Never style a destructive action as the obvious next step.
- Never render as a narrow column when width is available.
