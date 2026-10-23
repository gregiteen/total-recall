# PLUGIN_BRICK_STANDALONE — Audit

> **Project Prefix**: `PLUGIN_BRICK_STANDALONE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `333dd30a` (total-recall) + plugin repos at `HEAD`
> **Umbrella**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete)

---

## 1. Why this audit exists

A plugin is used in two distinct ways, and the audit found that the codebase conflates them:

| Path | Command | What the consumer is |
| --- | --- | --- |
| **Plugin** | `plugin install <id>` | Total Recall itself, on a machine the operator owns. A card face is rendered in the dashboard. |
| **Brick** | `plugin vendor <id> bricks/<id>` | **A separate application**, which owns the code and ships without Total Recall. |

The distinction matters because the two have different runtimes, different audiences and different contracts. This audit measured what each path actually produces.

## 2. Findings

### BS-01 — A vendored brick hard-depends on the Total Recall binary (P0, critical)

The vendoring contract, stated in the skill and in the command's own help text, is:

> "The project then owns the code and does not depend on the plugin or Total Recall at runtime."

Measured against a fresh app:

```
$ cd /tmp/app-probe && total-recall plugin vendor /Users/…/tr-plugin-stripe bricks/stripe
✅ Added brick 'stripe' v0.1.3 (16 files)

$ cd bricks/stripe && TOTAL_RECALL_BIN=/nonexistent/total-recall node -e "…('status')"
THREW: Auth credential read failed

$ node -e "…('status')"       # with Total Recall present
API Key        : Configured
```

The brick is a **thin client for the Total Recall CLI**, not standalone code. `auth-client.mjs` spawns the `total-recall` binary for every credential read, and the brick's own user-facing copy instructs the *app's* operators to run Total Recall commands:

```
Error: STRIPE_SECRET_KEY is not configured in Total Recall secrets store.
       Set it with: total-recall secret set STRIPE_SECRET_KEY
```

An application shipping this brick tells its users to install a different product.

### BS-02 — 19 of 34 plugins share this dependency (P1, high)

`TOTAL_RECALL_BIN` or `total-recall auth` appears in the runtime code of 19 plugin repositories: auth, decision, deploy, design, domains, hermes, image-generator, maps, openwiki, operator-alerts, phone, phone-companion, signing, skill-manager, sticker-generator, stripe, system-monitor, tickets, translator.

Every one of them is vendorable, and every one produces a brick that breaks without Total Recall installed.

### BS-03 — A brick carries a card face, which is dead code in an app (P0, critical)

`plugin vendor` copies `ui/` wholesale. A vendored stripe brick contains:

```
bricks/stripe/ui/DESIGN.md
bricks/stripe/ui/LOGO.md
bricks/stripe/ui/card.js     ← 3 references to `host.run` / `this.host`
bricks/stripe/ui/logo.svg
```

`ui/card.js` is a Web Component whose entire data contract is `host.run(subcommand, args)` — an object **only the Total Recall dashboard provides**. In a vendored app there is no host, no frame and no dashboard, so the card can never run. `DESIGN.md`, `LOGO.md` and `logo.svg` exist solely to serve that card.

**Bricks do not have cards.** A brick is a capability: a CLI, its library code and its tests. The card is a Total Recall presentation concern.

### BS-04 — The vendored tests only pass because they bypass the real credential path (P1, high)

The stripe brick's 11 tests pass inside a bare app, but they inject a fake auth runner. They therefore prove the CLI's logic, not that the brick works where it was vendored. Nothing in the vendored test suite would have caught BS-01.

### BS-05 — Nothing tells the author which path they are building for (P1, high)

`plugin create` scaffolds a plugin. `plugin vendor` copies one. There is no point at which an author is asked *will this be vendored into an app that does not have Total Recall?* — and the answer changes the design of the CLI, the credential handling and the UI. The skill documents both paths but does not separate their requirements.

### BS-06 — The scaffolder generates the old card model (P1, high)

`plugin create --with-ui` still emits:

- `ui.elements` with `kind: 'panel'` and no `card` element — invalid under the current contract
- a `panel.js` that collects an API key in `type="password"` and dispatches `save-token` with the raw value — the credential-ownership violation removed from stripe
- a `DESIGN.md` with a hand-rolled `colors:` block, not the `tokens:` schema the host reads
- placeholder copy: *"panel scaffold. Add the actual capability before sharing"*

This is the mechanism that produced 34 templated cards. It should generate **no UI at all**, because a face cannot be written before the plugin's function is known.

### BS-07 — The bundler has no notion of path-specific content (P2, medium)

`listPluginFiles` excludes dotfiles, `.git`, `node_modules` and symlinks. It has no concept of "this file is for the Total Recall host" versus "this file is the capability". A brick and a plugin install currently receive byte-identical trees.

### BS-08 — The capability is not reusable library code (P0, critical)

This is the finding that explains the rest. A builder receives a **CLI script**, not a capability. Measured on the vendored stripe brick:

- Every operation is an `async function …Command(args)` that parses `argv` — `checkoutCommand` reads `--amount`, `--name` and `--currency` out of the argument vector. An application cannot call that.
- The Stripe API request is **inlined inside the CLI handler**: `URLSearchParams` construction, `fetch`, header assembly and `res.json()` all live in `checkoutCommand`. There is nothing to import.
- `cli.mjs` exports **one** symbol across the whole ecosystem — `export default run`. No capability function is exported anywhere: stripe 1, tickets 1, domains 1, maps 1.
- Three of the four plugins checked have **no capability module at all**; tickets and domains have a `src/` directory but the CLI still holds the request logic.

A builder who vendors this gets a program, not a library. To scaffold the capability into their app they must read the CLI, copy the request construction out of it, and rewrite it — which is exactly the "starting from zero" that bricks exist to prevent.

### BS-09 — Hard-coded placeholder values break the capability in an app (P0, critical)

The vendored stripe brick contains:

```js
const successUrl = "https://example.com/checkout/success";
const cancelUrl = "https://example.com/checkout/cancel";
```

An application that scaffolds this brick would send paying customers to `example.com` after checkout. `domains/cli.mjs` carries a comparable literal default (`clean[1] || 'example.com'`). A capability destined for someone else's app must take these from its caller or its configuration, never ship a placeholder.

### BS-10 — The plugin's own examples are the app's defaults (P1, high)

`checkoutCommand` defaults `amount` to `2000`, `name` to `"General Admission Ticket"` and `currency` to `"usd"`. These are Total Recall's internal examples, not values any real application would want as defaults, and they travel into every vendored copy.

## 3. What is correct and must be kept

- **The brick idea is sound.** `vendor` copies files, records provenance in `.plugin-source.json`, hashes the source, refuses destinations outside the project, detects circular requires and resolves missing bricks. The mechanics work; the *payload* is wrong.
- **The provenance record is genuinely useful** — `vendored_from`, `version`, `source`, `sha256`, `vendored_at`, and an explicit note that the project owns the copy.
- **Credential handling is right for the plugin path.** Reading secrets through `auth secret` with no ambient fallback is exactly correct when Total Recall *is* the host.
- **`--with-requires` chaining and version-range satisfaction** are implemented and enforce a real constraint.

## 4. Root cause

The plugin and the brick were treated as **the same artifact in two places**. They are not, and the difference is the whole point of a brick:

A **plugin** is a Total Recall capability: it runs in Total Recall, reads the Total Recall secrets store, and renders a bespoke card in the Total Recall dashboard.

A **brick** is **the capability itself, extracted so a builder can scaffold it into their own application.** The plugin is the reference implementation; the brick is what a builder takes so nobody starts from zero. The builder's app has no Total Recall, no dashboard and no secrets store — and the builder does not want a program, they want the capability as code they can wire into whatever their app already is.

Because that distinction was never made, three things followed automatically:

1. The vendoring path inherited the plugin's **runtime** (a shell-out to `total-recall`) and shipped it to apps that cannot satisfy it — BS-01.
2. It inherited the plugin's **presentation** (the card, the design tokens, the logo) into apps with no dashboard to render them — BS-03.
3. It inherited the plugin's **shape** (a CLI with inlined requests, argv parsing and placeholder URLs) instead of exposing the capability as importable functions with caller-supplied configuration — BS-08 through BS-10.

The third is the most serious, because it defeats the purpose: a builder who receives a CLI must still rewrite it to use it, which is precisely the work bricks exist to remove.

## 5. Remediation scope

**Define the brick as a capability artifact**, not as a relocated plugin:

- **A capability module** — the real domain logic (request construction, signature verification, payload building, response mapping) as exported functions with explicit parameters, importable by an application.
- **No host assumptions** — no Total Recall binary, no secrets store, no `argv` parsing in the capability.
- **Caller-supplied configuration** — credentials and every environment-specific value (success/cancel URLs, amounts, currencies) come from the caller. No placeholders, no example defaults.
- **No UI** — no card, no design tokens, no logo, no host-only files.
- **A builder-facing entry point** — how the app obtains and calls the capability, plus the tests that prove it works without Total Recall.

Then make the tooling express the distinction: the scaffolder emits no UI and a valid manifest; vendoring takes only capability files; the author is told which path they are building for; and `plugin info` reports whether a capability is standalone.


## 6. Verification performed

- Vendored `tr-plugin-stripe` into a clean `/tmp/app-probe` project; 16 files landed.
- Ran the brick with `TOTAL_RECALL_BIN=/nonexistent` → `Auth credential read failed`.
- Ran the same command with Total Recall present → succeeded, proving the dependency.
- Ran the brick's suite in the bare app → 11/11 pass, but only via an injected fake auth runner.
- Inspected the vendored `ui/` tree and confirmed `card.js` requires `host.run`.
- Counted `TOTAL_RECALL_BIN` / `total-recall auth` across all plugin repositories → 19 of 34.
- Inspected `plugin create --with-ui` output and confirmed it emits `kind: 'panel'`, a password input, a `save-token` dispatch and a `colors:` DESIGN.md.
