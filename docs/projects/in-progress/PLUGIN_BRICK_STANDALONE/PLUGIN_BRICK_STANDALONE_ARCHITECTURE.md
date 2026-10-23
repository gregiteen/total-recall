# PLUGIN_BRICK_STANDALONE — Architecture

> **Project Prefix**: `PLUGIN_BRICK_STANDALONE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: PLUGIN_BRICK_STANDALONE_AUDIT.md (Complete)

---

## 1. One source, two artifacts

The plugin repository holds both, separated by directory, and the manifest declares which is which:

```
tr-plugin-<id>/
  capability/            ← the brick payload: what a builder takes
    index.mjs            ← exported functions, no argv, no host
    <domain>.mjs         ← request construction, signature verification, mapping
  cli.mjs                ← the Total Recall plugin entry; calls capability/, parses argv
  ui/card.js             ← the Total Recall card face; calls host.run
  ui/DESIGN.md
  test/                  ← capability tests (no host) + plugin tests
  plugin.json            ← declares the split
```

| Artifact | Takes | Never contains |
| --- | --- | --- |
| **Plugin install** | everything | — |
| **Brick (`vendor`)** | `capability/`, the capability tests, `LICENSE`, a builder README | `ui/`, `cli.mjs`'s host plumbing, `plugin.json` host fields |

## 2. The capability contract

A capability module is ordinary library code. Its shape is fixed by what a builder needs:

```js
// capability/index.mjs — exported, importable, host-free
export async function createCheckoutSession({
  secretKey,            // supplied by the caller; never read from a store
  amount, currency,
  successUrl, cancelUrl, // caller's URLs; never a placeholder
  productName,
  fetchImpl = fetch,     // injectable, so a test needs no network
}) { … }

export function verifyWebhookSignature({ payload, signatureHeader, secret }) { … }
```

Rules the shape enforces:

- **Explicit parameters.** No `argv`, no `process.env` reads inside the capability, no module-level singletons.
- **No defaults for environment values.** `successUrl` has no fallback; a missing one is the caller's error to fix, not a silent `example.com`.
- **Injected transport.** `fetchImpl` lets an app use its own HTTP client and lets tests run offline.
- **Returned data, not printed text.** The capability returns objects; printing is the CLI's job.
- **Thrown or returned errors, never `process.exitCode`.** An app decides how to fail.

## 3. The plugin CLI as a thin adapter

`cli.mjs` keeps its current behaviour for Total Recall users and shrinks to an adapter:

```
argv  →  parse  →  resolve credentials from auth secret  →  capability({...})  →  format output
```

The credential resolution and the formatting stay in the CLI, because both are Total Recall concerns. The request construction moves out, because it is the capability.

## 4. What vendoring selects

`listPluginFiles` gains a second mode. `pluginBundleFiles(dir, { audience })`:

| `audience` | Includes | Excludes |
| --- | --- | --- |
| `plugin` | everything (unchanged) | — |
| `brick` | `capability/**`, capability tests, `LICENSE`, `README.brick.md` | `ui/**`, `cli.mjs`, plugin manifest host fields, `.plugin-source.json` is rewritten for a builder |

A brick's `plugin.json` is **not** copied: a manifest describing Total Recall commands, secrets and a card is meaningless in an app. The brick instead carries a short `BRICK.md` stating what to import, what to pass, and where credentials come from.

## 5. Manifest declaration

The manifest states the split so tooling never has to guess:

```json
"capability": { "entry": "capability/index.mjs", "exports": ["createCheckoutSession", "verifyWebhookSignature"] },
"ui": { "design_tokens": "ui/DESIGN.md", "elements": [ … ] }
```

- `capability` present → the plugin is vendorable as a capability.
- `capability` absent → `vendor` reports that this plugin has no capability to scaffold, rather than copying a program into the app.

## 6. Standalone verification

The test that proves the contract, and the one the suite must contain:

```
1. Load capability/index.mjs in a process where TOTAL_RECALL_BIN is unset
   and no auth store exists.
2. Call each exported function with caller-supplied arguments and an injected
   fetchImpl.
3. Assert no child process was spawned and no `total-recall` string is reachable.
```

This fails today for all 19 dependent plugins, which is the point.

## 7. Author guidance

Both entry points state the distinction, because the requirements differ from the first line of code written:

- `plugin create` reports: *this scaffolds a Total Recall plugin; if you intend to vendor this capability into an app, put the domain logic in `capability/` with explicit parameters and no host calls.*
- `plugin vendor` reports: *a brick is the capability for your app; it will not contain a card, a CLI, or any dependency on Total Recall.*
