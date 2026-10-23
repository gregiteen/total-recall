# STRIPE_CARD_BESPOKE — Architecture

> **Project Prefix**: `STRIPE_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: STRIPE_CARD_BESPOKE_AUDIT.md (Complete, `f9e1906`)

---

## 1. Structure: a wide surface with screens the operator flips through

The face is **wide, not tall**. A plugin face is never a narrow column: a column forces vertical stacking, and vertical stacking is what made 34 plugins look alike, because a DNS table or a payments ledger cannot be expressed in a 360 px slot. DNS, ledgers and consoles all need horizontal room.

Because a payments plugin owns seven commands and six distinct jobs, one screen cannot carry them without degrading into a command palette. The face therefore presents **screens the operator flips through**, and the plugin itself defines them. The host provides only the frame and the flipper; it never derives a screen from the command list.

### Screen order is task frequency, not domain taxonomy

| # | Screen | How often it is used | Why it holds this position |
| --- | --- | --- | --- |
| 1 | **Charge** | Constant | The reason the card is opened. Gateway state as one line, then a ready-to-type form. |
| 2 | **Refund** | Common | The second real task, and it targets a charge, so it sits beside it. |
| 3 | **Payments** | Common | Recent activity, so the operator is not working blind. |
| 4 | **Events** | Occasional | Diagnostic: webhook verification, consulted when something looks wrong. |
| 5 | **Keys** | Once | Setup. Read-only, because credentials belong to auth. |
| 6 | **About** | Rare | Reference. |

### Screen one in detail

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ● Live · checked 14:02                    [Check gateway]                 │
├───────────────────────────────────────────────────────────────────────────┤
│ CHARGE                                                                    │
│                                                                           │
│  [ Checkout session │ Payment intent ]                                    │
│                                                                           │
│  Amount                                Currency                            │
│  ┌──────────────────┐ USD              [USD] [EUR] [CAD] [GBP]            │
│  │ 0.00             │                                                    │
│  └──────────────────┘                                                    │
│                                                                           │
│  Customer email                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [ Create checkout session ]                                              │
├───────────────────────────────────────────────────────────────────────────┤
│ THIS SESSION                          │  cs_live_…          [copy]        │
│                                       │  25.00 USD                        │
│                                       │  pay.stripe.com/…   [copy]        │
└───────────────────────────────────────────────────────────────────────────┘
```

Screen one answers the operator's actual opening question — *can I take money, and let me take it* — in one view. The gateway line is compact because it is context, not the job; it only becomes loud when a key is **missing**, which is the one case where the operator cannot proceed. The amount field is focused on arrival so the first keystroke is the amount.

### Refund, Payments, Events

- **Refund** targets an existing payment intent, so its first field is the intent id. It is destructive: it states the amount and the target, then requires an explicit confirmation step. It never looks like the primary action (audit S-03).
- **Payments** lists charges created this session with their id, amount, currency and status, so an operator can copy a payment link again without re-charging.
- **Events** verifies a webhook signature from a payload and its signature header, and reports the verdict.

### Keys is read-only, and that is the point

Credentials are owned solely by the auth plugin, which keeps one store, one rotation path and one audit trail. A per-plugin key screen violates that even when it writes to the same store, because it makes the plugin the place an operator thinks of when a key must change.

The card is therefore a **consumer** of credentials and never an editor. It reports a key as *present* or *missing* and hands over the auth command to run. This also means the face has no code path that can receive a key value, so it cannot leak one.

## 2. Why this arrangement and not another

- **Charge first.** The most common task and the most urgent information are the same thing for a payments operator: they cannot charge until they know the gateway is live, and they opened the card in order to charge. Those belong on one screen, not two.
- **Amount and currency sit together and dominate.** In Stripe's model an amount is minor units *plus* a currency, so separating them invites the `25.00`-versus-`2500` error from audit S-04. The currency renders beside the amount at all times.
- **Checkout and Intent are two modes of one form.** They take the same three inputs and differ only in what Stripe returns, so the operator picks the mechanism and keeps their typing (SR-3).
- **Refund is its own screen, not a peer button.** It targets an existing intent, is destructive, and needs confirmation. Grouping it with the send actions is the failure audit S-03 records.
- **Events is a screen, not a button beside Checkout.** Webhook verification is diagnostic and must never sit next to the primary money action.
- **Setup is last, not third.** The original screen order put Keys third — a once-ever task occupying the position of the second-most-common action.
- **No metrics deck.** The deleted "Merchant API / Live Secret" and "Webhook Enclave / HMAC-SHA256 Verified" tiles become gateway rows that report only what `status` returned.

## 3. Data flow

```
connectedCallback()
  ├─ render()            structure, all values empty/"—"
  └─ refresh()           host.run('status')  → gateway rows

[Create checkout]        host.run('checkout', ['--amount',…,'--currency',…,'--email',…])
                         → parse JSON → result panel (id, amount, url)
[Create intent]          host.run('payment-intent', ['--amount',…,'--currency',…])
                         → parse JSON → result panel (id, status, amount)
[Refund]  (confirmed)    host.run('refund', ['--payment-intent',…,'--amount',…,'--reason',…])
                         → parse JSON → result panel (refund id, state)
[Verify signature]       host.run('webhook', [...]) → event row verdict
```

Rules:

- **`refresh()` is the only writer of gateway state.** It sets present/missing, answered/failed, and the attempt timestamp.
- **Every result panel is populated only from parsed command output.** No branch fabricates a value (SR-2).
- **A rejected `host.run` sets the failure state with the real message** and leaves the previous result visible but marked stale.

## 4. Parsing

The commands emit JSON, but the card must tolerate a text reply without inventing structure:

```js
function readFields(payload, spec) {
  // spec: { field: ['json.path', …alternatives] }
  // Returns only values actually present; a missing field renders "—".
}
```

Accepted shapes are looked up across plausible keys (e.g. an id from `id`, `session.id`, `sessionId`); when no candidate exists the field shows `—`, never a guess. Raw output is retained behind a "Raw output" disclosure in the same panel.

Amounts are rendered from Stripe's minor units when the payload provides an integer plus a currency, and otherwise shown as returned. Currency formatting follows the selected currency's symbol/placement; the card never reinterprets an amount it did not compute.

## 5. State model

| State | Meaning | Rendering |
| --- | --- | --- |
| `idle` | nothing attempted yet | empty result panel with a neutral prompt |
| `checking` | `status` in flight | gateway rows show "checking…" |
| `ready` | `status` returned, keys present | gateway live, actions enabled |
| `degraded` | `status` returned, a key missing | gateway warns which key, send actions disabled |
| `unreachable` | `status` failed | failure + last-attempt time, actions disabled |
| `running` | a send/destructive call in flight | that action's button shows progress, others disabled |
| `stale` | a later call failed after a success | previous result retained, marked stale with the error |

`unreachable` and `degraded` must be reachable states of the card, and are the states audit S-09 found entirely missing.

## 6. Styling

- All colour from host tokens: `--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`, `--border`, `--accent`. No literal hex in the face (SR-9).
- `branding.color` `#6366f1` is available as the accent for primary/send affordances; destructive uses a distinct, contrast-checked colour.
- Numerals in a tabular monospace face so amounts align.
- **Wide, never a column.** Each screen is a two-region horizontal layout: the working area on the left, the live result or reference on the right. It collapses to one column only below 760 px, where width genuinely does not exist, and that collapse is a responsive fallback rather than the design.
- Screens are reached through the host's horizontal scene track and a tab strip; the face also listens for `plugin-show-screen` so the host can open a screen by name.
- `prefers-reduced-motion` honoured; focus visible on every control; targets ≥ 44 px.

## 7. Manifest change

Remove the `card_layout` block entirely. The face is already declared:

```json
"ui": { "elements": [
  { "id": "panel", "kind": "panel", "tag": "stripe-panel", "module": "ui/panel.js" },
  { "id": "card",  "kind": "card",  "tag": "tr-stripe-card", "module": "ui/card.js" }
] }
```

`ui/panel.js` is evaluated against SR-1…SR-12: if it duplicates the face's function it is removed so there is exactly one interface per plugin.
