# STRIPE_CARD_BESPOKE — Audit

> **Project Prefix**: `STRIPE_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Audit Status**: Complete
> **Audited commit**: `f9e1906` (tr-plugin-stripe)
> **Umbrella audit**: PLUGIN_CARDS_BESPOKE_AUDIT.md (Complete, `333dd30a`)

---

## 1. What this plugin is

`tr-plugin-stripe` wraps the Stripe payments API. Its manifest declares seven commands:

| Command | Effect | What it is actually for |
| --- | --- | --- |
| `status` | read | Gateway connection and credential state |
| `checkout` | **send** | Create a checkout session for tickets or ecommerce items |
| `payment-intent` | **send** | Create a direct payment intent with automatic payment methods |
| `webhook` | read | Verify a webhook signature for incoming payment events |
| `refund` | **destructive** | Issue a refund for a payment intent or transaction |
| `probe` | read | HTTP 200 health verification probe |
| `token` | write | Manage API keys and secrets-store credentials |

Two secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Branding: `#6366f1`, font `outfit`, shipped `ui/logo.svg`, provider Stripe. Declared template: **`ledger`** — the same template as `domains` and `tickets`.

## 2. Findings

### S-01 — The card hard-codes the very facts it exists to report (P0, critical)

The header renders a "gateway-deck" containing two literal strings:

```js
<span class="metric-lbl">Merchant API</span>
<span class="metric-val">Stripe API (Live Secret)</span>
<span class="metric-lbl">Webhook Enclave</span>
<span class="metric-val">HMAC-SHA256 Verified</span>
```

Neither is read from anywhere. The card asserts that a live secret is configured and that webhook signatures are verified **without calling `status` or `webhook`**. A merchant with no API key and no webhook secret sees an identical card. This is precisely the fabricated-state violation in `anti-patterns-ec0c0d95` and the umbrella audit's R7.

### S-02 — A parallel universe of fake Stripe responses ships in the card (P0, critical)

When `host.run` is unavailable, `execute()` fabricates gateway results:

```js
resultText = `Checkout Session Created:\n  Session ID: cs_live_${Math.random()...}\n  Amount: $...\n  Payment URL: https://checkout.stripe.com/c/pay/cs_live_...`;
resultText = `Payment Intent: pi_${Math.random()...} created with status: requires_payment_method.`;
resultText = 'HTTP 200 health probe successful. Stripe API latency: 42ms.';
```

These are invented session IDs, an invented payment URL, an invented intent status and an invented 42 ms latency. The `else` branch is not a degraded mode — it is a mock payment terminal. Under the umbrella's R7 this must be deleted outright: if `host.run` is unavailable, the card must say so.

### S-03 — The card is a five-button command palette (P0, critical)

The `actions-grid` is `repeat(5, 1fr)` holding Status, Intent, Webhook, Probe, Checkout. These are the CLI subcommand names laid out as a keypad. Nothing about this arrangement reflects payment work: the buttons are in manifest order, they carry no amounts, and the operator cannot tell a read (`status`, `probe`, `webhook`) from a **send** (`checkout`, `payment-intent`) or from the **destructive** `refund`.

`refund` is declared `destructive` in the manifest and is **not reachable from the card at all**. The single most dangerous operation the plugin owns is invisible on the face, while `probe` — the least consequential — gets equal billing.

### S-04 — The primary input pair is a leftover default, not a payment (P1, high)

Two inputs sit above the grid with literal initial values:

```js
const amount = amountInput ? amountInput.value.trim() : '25.00';
const email = emailInput ? emailInput.value.trim() : 'customer@example.com';
...
<input id="amount-input" ... value="25.00" />
<input id="email-input" type="email" value="customer@example.com" />
```

`25.00` and `customer@example.com` are seeded values in a payments form. An operator who clicks Checkout without editing charges a real $25 to a real (or invalid) address. Amount is also a bare text input with no currency formatting, no minor-unit handling and no validation, so `25.00` and `2500` are indistinguishable in intent while meaning different amounts to Stripe.

### S-05 — Currency selection is cosmetic (P1, high)

Four currency buttons toggle a local `this.currency` and a CSS class. The choice reaches `checkout` and `payment-intent` as `--currency`, but it is never checked against what the Stripe account can actually settle, and it silently resets on re-render. Two of the seven declared commands cannot use it at all.

### S-06 — Output is an undifferentiated text well (P1, high)

`#card-out` is `white-space: pre-wrap` holding whatever came back, capped at `max-height: 90px`. A JSON checkout session, a webhook verification verdict and a probe result all land in the same 90-pixel scrolling box. The card never parses the JSON it receives from these JSON-emitting commands, so the session ID, amount and payment URL — the three things an operator actually needs from a checkout — are buried in raw text.

### S-07 — Copy output is the only affordance for the one value that matters (P2, medium)

The only structured action on the output is "Copy output", which copies the whole blob. There is no way to copy just the payment URL or just the session ID.

### S-08 — Markup contradicts the theme and the host tokens (P2, medium)

The face hard-codes a dark palette (`#090c1a`, `#e0e7ff`, `#6366f1`, `#050711`, `#030409`) inside `:host`, ignoring the `--text-*`, `--bg-*`, `--border-*`, `--accent` tokens the host injects into the frame. In a light dashboard it renders as a dark slab. `branding.color` is `#6366f1` and `branding.font` is `outfit`, but the card sets its own font stack and never uses the token.

### S-09 — No empty, error or unreachable states (P2, medium)

The output box opens with prose: "Merchant gateway ready. Create checkout session or query payment intents." That is a claim, not a state. There is no representation of "no API key configured", "Stripe unreachable", or "webhook secret missing" — the three conditions an operator must be able to see at a glance.

## 3. What is correct and should be kept

- **Secret handling is right.** `token` is declared with a secret stdin argument, and the card never renders a key. Nothing in the face can leak `STRIPE_SECRET_KEY`.
- **Effects are declared correctly** in the manifest (`checkout`/`payment-intent` = `send`, `refund` = `destructive`), so the host already enforces read-only mounting. The card simply fails to respect that distinction visually.
- **The 44 px touch target rule is met** (`.touch-btn { min-height: 44px; min-width: 44px }`).
- **The error path exists**: `execute()` catches and shows `[STRIPE ERROR]` with a `FAULT` badge. It is under-used but it is real, and the redesign should keep a real failure state this prominent.

## 4. What the domain actually requires

Stripe's own objects give the vocabulary: **payment intents** carry an amount, a currency and a status (`requires_payment_method`, `processing`, `succeeded`, `canceled`); **checkout sessions** carry a session id, an amount total and a hosted `url`; **refunds** carry an amount, a reason and a state; **webhook events** carry a type, a signature verdict and a timestamp. A payments surface is therefore an **amount-and-state** surface: money in, money back, and what happened in between.

The three tasks a Stripe operator actually performs:

1. **Confirm the gateway is live** — are the secret key and webhook secret present, and does Stripe answer? Without this, nothing else is trustworthy.
2. **Take a payment** — create a checkout session or a payment intent for a specific amount, currency and customer, then retrieve the payment link to hand over.
3. **Return money and verify events** — issue a refund against an intent, and check that incoming webhooks verify.

## 5. Root cause

The face was written to a shared recipe's shape: a status badge, a metrics deck, a form, a row of command buttons, and an output well. The recipe determined the arrangement, so the arrangement says nothing about payments — and because the recipe needed the card to look "full", it was padded with invented gateway facts and a mock payment terminal.

## 6. Remediation scope

Delete the fabricated metrics and the mock `host.run` fallback; drop the five-button palette; make secrets, gateway reachability, taking money and returning money the structure of the face; parse the JSON that `status`, `checkout`, `payment-intent` and `refund` return into amounts, currencies, ids and states; treat `refund` as destructive with confirmation; use the host's theme tokens so the face belongs in both light and dark. Remove `card_layout` from `plugin.json` and declare the existing single `card` element as the face.
