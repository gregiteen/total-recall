# STRIPE_CARD_BESPOKE — Development Plan

> **Project Prefix**: `STRIPE_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: DSH agent (deepseek-v4.1-flash)
> **Date**: 2026-10-23
> **Based on audit**: STRIPE_CARD_BESPOKE_AUDIT.md (Complete, `f9e1906`)

---

## Phase 0 — Audit ✅
- [x] Read `plugin.json`, all seven commands, both secrets
- [x] Read `ui/card.js` in full (431 lines) and record findings S-01…S-09
- [x] Write `STRIPE_CARD_BESPOKE_AUDIT.md` (Complete)

## Phase 1 — Planning ✅
- [x] Write `STRIPE_CARD_BESPOKE_PRD.md` (SR-1…SR-12)
- [x] Write `STRIPE_CARD_BESPOKE_ARCHITECTURE.md` (three zones, data flow, state model)

## Phase 2 — Remove the fabrication (SR-1, SR-2, SR-4)
- [ ] Delete the literal "Stripe API (Live Secret)" / "HMAC-SHA256 Verified" metric deck
- [ ] Delete the entire mock-`host.run` `else` branch (invented `cs_live_…`, `pi_…`, payment URL, "42ms")
- [ ] Delete seeded `value="25.00"` and `value="customer@example.com"`
- [ ] Delete the opening prose claim from the output box

## Phase 3 — Rebuild the structure (SR-3, SR-5, SR-6, SR-7, SR-8)
- [ ] Replace the `repeat(5, 1fr)` actions grid with the three-zone layout
- [ ] Zone 1 GATEWAY: rows driven only by `status` — key present/missing, webhook present/missing, answered/failed + attempt time
- [ ] Zone 2 TAKE PAYMENT: method toggle (checkout | intent), currency selector, amount, customer
- [ ] Zone 3 RETURN MONEY: intent id, amount, reason, destructive Refund with confirmation
- [ ] Add the EVENTS row with signature verification
- [ ] Implement `readFields()` and parse `status`, `checkout`, `payment-intent`, `refund`
- [ ] Per-field copy for session/intent id and the hosted payment URL
- [ ] Persist the currency selection across re-render

## Phase 4 — States and theming (SR-9, SR-10, SR-12)
- [ ] Implement `idle`, `checking`, `ready`, `degraded`, `unreachable`, `running`, `stale`
- [ ] Replace the hard-coded dark palette with host tokens; verify light and dark
- [ ] Use `branding.color` as accent, keep destructive visually distinct
- [ ] Re-check 44 px targets, focus visibility, `prefers-reduced-motion`

## Phase 5 — Manifest and face declaration (SR-11)
- [ ] Remove `card_layout` from `plugin.json`
- [ ] Confirm exactly one card element is declared and resolves
- [ ] Evaluate `ui/panel.js`: remove it if it duplicates the face
- [ ] Write `ui/DESIGN.md` for this plugin

## Phase 6 — Testing and verification
- [ ] `total-recall plugin info stripe` reports no errors
- [ ] Render the face and look at it at 360, 768 and 1280 px, light and dark
- [ ] Verify each state renders: keys missing, Stripe unreachable, empty, failed
- [ ] Verify a rejected `host.run` shows the real error and invents nothing
- [ ] Verify no secret value can reach the DOM
- [ ] Verify the refund path requires confirmation and reads as destructive
- [ ] Confirm the card is distinguishable from `domains` and `tickets`, which shared its template
- [ ] Plugin tests pass; record actual exit status

## Sequencing note

Phase 2 comes before Phase 3 deliberately: the fabrication must be gone before the structure is rebuilt, so no rebuilt panel can inherit a mock branch. Phases 2–5 are one hand-authored edit to `ui/card.js` plus the manifest change; no script writes any of it.
