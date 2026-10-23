# STRIPE_CARD_BESPOKE — Product Requirements

> **Project Prefix**: `STRIPE_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: STRIPE_CARD_BESPOKE_AUDIT.md (Complete, `f9e1906`)

---

## 1. Who uses this card

One operator running payments for their own storefronts (tickets, ecommerce, signing). They are not a finance team and they do not live in the Stripe dashboard. They come to this card to answer one of three questions:

1. **"Can I take money right now?"** — is the key live, is the webhook secret set, does Stripe answer?
2. **"Charge this person."** — create a checkout session or a payment intent, then hand over the link.
3. **"Give it back."** — refund an intent, and confirm webhooks are verifying.

## 2. What must be true the moment the card appears

No click required:

- Whether `STRIPE_SECRET_KEY` is **present or missing**, and same for `STRIPE_WEBHOOK_SECRET`. Present is not "valid" — the card must not claim more than it knows.
- Whether Stripe answers, and **when it was last checked**. A failed check shows the failure and the time of the last attempt, never a green badge.
- The default currency for new charges.
- That refunds are available and where they live.

## 3. Requirements

### SR-1 — No fabricated gateway state (P0)
The "Merchant API / Stripe API (Live Secret)" and "Webhook Enclave / HMAC-SHA256 Verified" strings are deleted. Every claim on the face traces to a returned command. **Audit S-01.**

### SR-2 — No mock Stripe responses (P0)
The `else` branch in `execute()` that invents `cs_live_…`, `pi_…`, a payment URL and "42ms" is deleted. If `host.run` is unavailable, the card says the host is unavailable and disables its actions. **Audit S-02.**

### SR-3 — Amounts and states, not a command palette (P0)
The five-button grid (Status / Intent / Webhook / Probe / Checkout) is removed. The face is organised around **money in, money back, and what happened**:
- taking a payment is a first-class form: amount, currency, customer, and which mechanism (checkout session vs payment intent);
- returning money is its own surface, reachable and confirmed;
- gateway verification is a status area, not a button beside Checkout.

Command names may appear, but never as the primary structure. **Audit S-03.**

### SR-4 — No seeded charge values (P0)
`25.00` and `customer@example.com` are removed as initial values. The amount field starts empty, validates as a decimal amount in the selected currency's minor units, and cannot be submitted empty or non-numeric. **Audit S-04.**

### SR-5 — Destructive actions are visually and behaviourally distinct (P0)
`refund` is declared `destructive`. It must be reachable, must state the amount and the intent it targets, must require explicit confirmation, and must never look like the primary action. `checkout` and `payment-intent` are `send` actions and are visually distinguished from the `read` commands `status`, `probe` and `webhook`. **Audit S-03.**

### SR-6 — Parse the JSON the commands return (P1)
`status`, `checkout`, `payment-intent` and `refund` emit JSON. The face extracts real fields — session id, amount total, currency, hosted payment url, intent id, intent status, refund state — and presents them as labelled values, not as a text blob. Raw output stays available but is not the primary surface. **Audit S-06.**

### SR-7 — One-click retrieval of the payment link (P1)
The hosted payment URL and the session/intent id each get their own copy affordance. "Copy output" alone is insufficient. **Audit S-07.**

### SR-8 — Currency is a real choice, not a decoration (P1)
Currency selection persists across re-render, is shown as the active default, and applies to both `checkout` and `payment-intent`. The card does not claim the account can settle a currency it has not been told about. **Audit S-05.**

### SR-9 — The face belongs to the dashboard (P2)
The hard-coded dark palette is replaced by the host's injected tokens (`--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`, `--border`, `--accent`), with light and dark both legible. `branding.color` (`#6366f1`) and `branding.font` (`outfit`) are used. **Audit S-08.**

### SR-10 — Real empty, error and unreachable states (P2)
Distinct renderings for: keys missing; Stripe unreachable (with last-attempt time); no payments created yet this session; an operation that failed (with the real error). The opening prose claim is removed. **Audit S-09.**

### SR-11 — Declare the face, drop the template (P0)
Remove `card_layout` from `plugin.json`. The existing `card` element (`tr-stripe-card`, `ui/card.js`) becomes the mounted face. Keep `ui/panel.js` only if it earns its place; otherwise the face is the interface.

### SR-12 — Wide, with screens the plugin defines (P0)
The face is a **wide surface, never a narrow column**, and it carries its functionality across multiple screens the operator flips through. The plugin defines those screens and their order; the host supplies only the frame and the flipper and never derives a screen from the command list.

Screen order follows task frequency, not domain taxonomy: **Charge, Refund, Payments, Events, Keys, About.** Setup comes near the end because it happens once, and the most common task holds the first position.

### SR-13 — First screen is the job, with its precondition inline (P0)
Screen one lets the operator charge immediately: gateway state as one compact line, then a focused amount field. The gateway line stays quiet when the gateway is live and becomes loud only when a credential is **missing**, the single case where charging is impossible. A disabled primary action with no explanation is not acceptable.

### SR-14 — The card consumes credentials, it never collects them (P0)
Credentials are owned solely by the auth plugin. This face must not render an input that accepts a key, must not write a credential to any store, and must not call the plugin's `token` command. It reports each key as *present* or *missing* and shows the auth command to run. Because no code path can receive a key value, the face cannot leak one.

### SR-15 — Accessibility and safety preserved (P2)
Keep 44 px targets, keyboard reachability, visible focus, `prefers-reduced-motion` respect. Never render a secret value, in any state.

## 4. Non-goals

- No Stripe dashboard replica: no customer list, no subscription management, no product catalogue. This card takes money and returns it.
- No stored card data of any kind.
- No new host capability. Everything here runs on `host.run` and the tokens already injected.

## 5. Success condition

An operator can tell at a glance whether they can take money, charge a specific amount in a specific currency, retrieve the payment link in one click, and refund an intent with confirmation — without ever seeing an invented value, and without a command palette standing in for a design.
