# The scaffold

A plugin's capability may be wanted inside a **different application** — someone else's app, which owns the code and ships without Total Recall. The **scaffold** is that capability, extracted so a builder can put it into their application and use it.

The plugin is the reference implementation. The scaffold is what a builder takes so nobody starts from zero.

---

## A scaffold is not a copy of the plugin

Measured against the current ecosystem, vendoring a plugin copies its whole tree, and the result is unusable in an app:

| What a builder receives | Why it fails |
| --- | --- |
| the card face | its only data channel is `host.run`, a Total Recall host the app does not have |
| an auth client that shells out to `total-recall` | the app breaks the moment Total Recall is absent — `Auth credential read failed` |
| request logic inlined in `argv`-parsing handlers | there is nothing to import; 19 of 34 plugins export only `run` |
| `https://example.com/checkout/success`, a default amount of `2000` | a real app would send paying customers to a placeholder domain |

The test is not "does it run". It is **"can a builder lay this in without rewriting it?"**

## What a scaffold contains

**The capability, as code the application imports:**

```js
// capability/index.mjs — exported, importable, host-free
export async function createCheckoutSession({
  secretKey,                    // supplied by the caller; never read from a store
  amount, currency,
  successUrl, cancelUrl,        // the caller's URLs; never a placeholder
  productName,
  fetchImpl = fetch,            // injectable: the app uses its own client, tests run offline
}) { /* … returns data … */ }

export function verifyWebhookSignature({ payload, signatureHeader, secret }) { /* … */ }
```

The rules the shape enforces:

- **Explicit parameters.** No `argv`, no `process.env`, no module-level singleton, no ambient credential.
- **No defaults for environment values.** A missing `successUrl` is the caller's error to fix, never a silent `example.com`.
- **Injected transport.** The app supplies its own HTTP client; a test needs no network.
- **Returned data, not printed text.** Printing is the CLI's job.
- **Thrown errors, never `process.exitCode`.** The application decides how to fail.
- **No Total Recall.** The capability does not know it exists.
- **No card, no design tokens, no logo.** There is no dashboard to render them.

**Plus a builder entry point** — `BRICK.md`, short and concrete:

```
# Checkout capability

Copy `capability/` into your app.

  import { createCheckoutSession } from './capability/index.mjs'

  await createCheckoutSession({
    secretKey: process.env.STRIPE_SECRET_KEY,   // your own configuration, never ours
    amount: 2500, currency: 'usd',
    successUrl: `${origin}/checkout/success`,
    cancelUrl:  `${origin}/checkout/cancel`,
    productName: 'General admission',
  })
```

It states what to import, what to pass, where credentials come from, and what comes back. Not a description of a CLI.

## What a scaffold never contains

- the card face, `ui/DESIGN.md`, a logo
- the plugin manifest — a manifest of Total Recall commands, secrets and a card means nothing in an app
- any call to `total-recall`, `TOTAL_RECALL_BIN`, or an auth store
- `argv` parsing or `console.log` as its output
- a placeholder URL, an example default, or the author's own values
- a message telling the app's users to install another product

## How the plugin presents it

One source, two artifacts, separated by directory and declared in the manifest:

```
tr-plugin-<id>/
  capability/        ← the scaffold payload
    index.mjs
  cli.mjs            ← the Total Recall entry; parses argv, resolves credentials, calls capability/
  ui/                ← the face; Total Recall only
  test/
```

```json
"capability": { "entry": "capability/index.mjs", "exports": ["createCheckoutSession", "verifyWebhookSignature"] }
```

- `capability` present → the plugin is vendorable as a scaffold.
- `capability` absent → vendoring reports that this plugin has no separable capability, instead of copying a program into the app.

The CLI becomes a **thin adapter**: parse arguments, resolve credentials through auth, call the capability, format the output. The domain logic lives in `capability/` and is exercised by both.

## Verifying a scaffold

- [ ] It runs with `TOTAL_RECALL_BIN` unset and no auth store present.
- [ ] Every exported function is callable with caller-supplied arguments and an injected transport.
- [ ] No `total-recall` string is reachable from the payload.
- [ ] No `example.com`, no author default, no placeholder value.
- [ ] No `ui/`, no `card.js`, no manifest.
- [ ] The suite fails if the capability spawns a process — proving standalone operation rather than assuming it.
- [ ] Vendored into a clean app, its suite passes there.

## Distribution

```json
"distribution": { "tier": "official", "license": "open" }
```

`tier`: `core`, `official`, `personal`, `community`. `license`: `open` (vendorable and shareable) or `closed` (an operated service behind a thin client).

Monetized plugins state their model in `monetization` — `model`, `price_cents` or `take_rate_basis_points`, `period`, `license_key_secret`, `checkout_url`. **Never rely on a local license check for protection**: a closed plugin's value lives on the server, not in the client.

A third party publishes with the same manifest and the same conformance checks. A store lists signed, immutable versions and never runs plugin code.
