# Plugin monetization & publishing plan

- **Status:** Proposed, awaiting owner confirmation.
- **Owner:** Greg. Drafted by Cline, 2026-10-14.
- **Companion docs:** [PRD PE-01..PE-12](TR_CORE_PLUGIN_SPLIT_PRD.md) · [FC-09..FC-14](TR_CORE_PLUGIN_SPLIT_PRD.md).
- **Scope:** how the 30 installed plugins are branded, licensed, monetized and published. It does not change any implementation yet.

## 1. The two-lane model

The word "plugin" currently collapses two different products, which is the source of the confusion. Every provider-adjacent plugin belongs to **one or both** lanes, declared in its manifest.

| | **Lane A — Open brick (BYO key)** | **Lane B — Managed service (closed)** |
| --- | --- | --- |
| Who holds the provider account | the user | the operator |
| Name / brand | the provider's (FC-09) | the operator's own (FC-11) |
| `distribution` | `{tier:"official", license:"open"}` | `{tier:"official", license:"closed"}` |
| Vendorable as a brick | yes | **no** (PE-05) |
| Runs without the operator | yes | no — thin client + operator service |
| Money | free or one-time | subscription / metered / take-rate |
| npm | public package | thin client only; no service source |

Rules that already exist and drive this split:

- **FC-09** — a plugin that only wraps a third-party API is named for that provider.
- **FC-11** — a closed, service-backed plugin carries the operator's own name and identity.
- **Self-hosted-engine rule** — provider brand when the user calls the provider's API with their own account; the operator's brand when the operator runs the software as a service; software the user runs themselves keeps its own name.

**Refinement (owner, 2026-10-14): service-valued capabilities are managed-only.** A bring-your-own-key twin is only worth shipping when the user's own account is the natural model or the code itself is the value (`stripe`, `maps`, `dsh`, `mesh`/Headscale, `deploy`, the neutral bricks). Where the value is the *operated service* — telephony, mail, metasearch, signing, ticketing — a free BYO twin earns nothing and hands the user the operational burden (carrier compliance, PBX, deliverability) that is the product. Those ship **closed only**. BYO remains available *internally* for enterprise/self-host (the same plugin pointed at a different secret); it is never a marketed free product.

## 2. Manifest contract (already in the schema)

`metadata.plugin.schema.json` already defines both fields; **no plugin declares `distribution` yet, and only `tickets` declares `monetization`.**

- `distribution: { tier: core|official|personal|community, license: open|closed }`
- `monetization: { model: free|one-time|subscription|metered|take-rate, price_cents, currency, period: monthly|yearly|per-use|per-ticket, take_rate_basis_points, recipient: {type: stripe_account|crypto_address|mesh_identity, account_id}, license_key_secret, checkout_url }`

Core already validates them (`plugin-loader.mjs`), exposes `describeMonetization()`, and ships `total-recall plugin license <id> status|activate --stdin|verify`. What is missing is enforcement, a license service, Stripe wiring and metering (section 5).


## 3. Per-plugin disposition

Legend: **A** = open brick, **B** = closed managed service, **private** = keep unpublished until genericized.

| Plugin (repo) | Lane | Brand | Model | What must change |
| --- | --- | --- | --- | --- |
| `phone` + `text` (merged) | **B only** | "Hello Phone" (operator brand) | subscription + usage upcharge (voice + SMS) | merge into one managed plugin; add `tr-plugin-asterisk`; festech provenance; closed, not vendorable; no public BYO twin |
| `domains` (Vercel wrapper) | **B only** (resold) | operator brand | subscription + `markup-percent`; mail hosting fee | decide registrar-transfer vs managed-DNS framing; drop hardcoded `gregiteen.xyz` in `ui/card.js`; declare `distribution` |
| `signing` | **B** | "Signed, gi." | subscription or per-document | remove `100.64.0.1:4330` default; wire to the license service; already npm'd as `@gregiteen/signed-gi-client` |
| `tickets` | **B** | "Velvet Rope" | take-rate 250 bps + $1/ticket | `UNLICENSED`; Stripe Connect + refunds; license gate; metering; replace `gregiteen.xyz/plugins/tickets` checkout |
| `creative-search` | **B only** (managed) | operator brand | subscription + paid-source markup | decide managed instance + which sources are marked up; closed, not vendorable |
| `sticker-generator` (Sticker Studio) | **B** (commerce) + **A** (generation) | operator brand | markup/take-rate on print+materials; metered generation via the AI Gateway | **not implemented** - `submitOrder` writes a local JSON with a fake tracking URL and never calls a partner API; scrub the hardcoded recipient (`name: "Greg"`, Salt Lake City address); real Prodigi integration + payment |
| `deploy` | **A** (first-party, open) | neutral descriptive name | free or one-time | `UNLICENSED` -> MIT; provider adapters (DO/Render/Azure/GCP/VPS); schema-freshness task |
| `phone-companion` | not a product | - | - | extract from Dabber; either fold back into that CRM or genericize `CRM_URL` |
| Neutral open bricks* | **A** | provider/own per FC-09 | free | `files` allowlist + `distribution` + scrub (section 6) |

\* `auth, cli-agents, code-quality, composable-cli, decision, design, dsh, git-sentinel, image-generator, maps, mesh, okf, openwiki, operator-alerts, security, skill-manager, stripe, system-monitor, tr-transcribe, translator, user-automations`. `code-quality` and `decision` need a one-line scrub. `operator-alerts` is dual: this open dispatcher plus a managed delivery tier (§3.1).

### 3.1 Profit centers vs the open moat

Only a handful of plugins are **operator-run services** worth charging for; the rest are the open-source moat that makes the services worth using. A plugin is a service only when the operator holds the upstream account and something costs money per use.

**Profit centers (closed / metered):**

- **Hello Phone** (voice + SMS) - merged `phone`+`text`.
- **Domains & Email** (`domains`) - Vercel resale + Mailcow mail hosting.
- **Signing** (`signing`).
- **Tickets** (`tickets`) - take-rate.
- **Sticker fulfillment** (`sticker-generator`) - print-on-demand markup/take-rate (physical fulfillment; not implemented yet, and generation should route through the AI Gateway).
- **Creative Search** (`creative-search`) - managed SearXNG + paid-source markup.
- **AI Gateway** (**missing**, PE-11) - the keystone: one metered service fronting the model/API plugins (`decision`, `dsh`, `image-generator`, `translator`, and hosted `tr-transcribe`) so all of them are profitable without selling each separately.
- **Operator Alerts delivery** (`operator-alerts`) - as shipped it is BYO-key (os/email/SMTP2GO/sms/Telnyx/webhook); a managed delivery tier where the operator holds the carrier/mail accounts and meters sends per message is a service.

**Open moat (free, publishable):** everything else. First-party utilities: `auth, cli-agents, code-quality, composable-cli, design, git-sentinel, okf, openwiki, security, skill-manager, system-monitor, user-automations, deploy`. BYO provider wrappers (client side, provider brand): `stripe, maps, dsh, image-generator, decision, translator`.

**Explicitly not the operator's service:**

- **`mesh` / Headscale** - the plugin is named for Headscale (FC-09) and *provisions and maintains the user's own control server on a host they deploy to* (`mesh server`, task `server update --if-provisioned`, secret `HEADSCALE_API_KEY`, config `controlUrl`). The self-hosted-engine rule names Headscale exactly. You are not the operator, so there is nothing to bill. A managed Tailscale-style control plane would be a separate, large business.
- **`tr-transcribe`** - a ~63-line wrapper that shells out to an external `phonon` binary (`$PHONON_BIN` -> `which phonon` -> `/opt/phonon-venv/bin/phonon`). It ships **no engine and no model**, does not download one, and does not use Ollama; the user must install the engine themselves. The `/opt/phonon-venv` fallback is an operator-machine path to remove for open publishing. Self-hosted, so free; only a **hosted** transcription service (via the AI Gateway) would be billable.
- **`deploy`** - first-party and provider-agnostic; the PRD deliberately refuses to be the account holder for the user's cloud.

Net: **about 7 real services and about 20 open bricks.** Give away the tools; sell the operations.

### 3.2 Readiness of the open bricks

"Publish all the repos" would currently ship non-working packages. State of the 20 open bricks:

| Plugin | Function | State | Notes |
| --- | --- | --- | --- |
| `auth` | credential/identity owner (secrets, sessions, passkeys, Google OAuth, API keys) | real | every plugin depends on it; stores license keys |
| `cli-agents` | discover CLI agents; run a plugin command on a mesh node | real | wraps the user's own paid agent accounts |
| `code-quality` | fail-closed gate runner + `grep-forbid` invariants | real | scrub `macmini` from README (2 lines) |
| `composable-cli` | compose/register/run custom verbs with risk classes | real, 2 defects | PIC-042 rollback sha; PIC-043 promote unregistered |
| `git-sentinel` | git hygiene report | real, 2 defects | PIC-018 column trim; no-upstream reported as 0 unpushed |
| `design` | on-brand UI/site synthesis from tokens + LLM | **scaffold** | PIC-048 empty IMPLEMENTED; PIC-049 no validator; uses OpenRouter |
| `okf` | Open Knowledge Framework schema validation | **scaffold** | empty IMPLEMENTED, no `src/` |
| `openwiki` | multi-repo knowledge graph / wiki | **scaffold** | empty IMPLEMENTED |
| `skill-manager` | nightly lossless skill optimization on a node | real | optional OpenRouter `decision` |
| `security` | machine/fleet/device assessments + source scanner | real | possible hosted service; `SECURITY_MASTER_KEY` |
| `system-monitor` | host telemetry into context + 15-min samples | real | possible hosted monitoring |
| `user-automations` | read-only inventory of scheduled tasks across nodes | real | 10-line CLI |
| `deploy, mesh, maps, stripe, dsh, decision, image-generator, translator, tr-transcribe, operator-alerts` | tool-valued capabilities | real / see §3.1 | see §3.1 and §6 |

Run the sanctioned gate suite on the Mac mini before publishing any of these; `design`, `okf` and `openwiki` need implementation first.


## 4. Telephony architecture (Asterisk + Telnyx)

The chain, as recorded in the phone plugin architecture doc:

```
sip.js WebRTC UI  ->  Asterisk (PBX/switch)  ->  Telnyx trunk (PSTN)
                       ARI daemon: channels, bridges, recordings,
                       billing on StasisEnd;  per-tenant SIP/RTP ports
```

- **Telnyx is the carrier**, not a brand that is whitelabelled. The managed service runs the operator's own Telnyx account and Asterisk and sells under the operator's brand (PE-12 / FC-11).
- **The Asterisk layer exists only in `festech` today** (`apps/communications`, `packages/asterisk`, 27 `server/services/asterisk/*` services). **There is no `tr-plugin-asterisk`**, so the managed service has no runnable switch inside the plugin model. Building it is the flagship prerequisite.
- Metering hook already exists upstream: `CallBillingService` + `StasisEnd`. Closed-service billing (FC-14) reuses it with one key per project.


## 5. The revenue rail (what is missing behind every paid plugin)

Flow for a closed service:

1. User installs the thin client.
2. `total-recall plugin license <id> status` prints `checkout_url`.
3. User pays (Stripe plugin / hosted checkout); the license service issues a key.
4. `total-recall plugin license <id> activate --stdin` stores the key at `license_key_secret`.
5. The **service** validates the key server-side on every call (PE-05) and meters usage (FC-14); a missing/lapsed license stops the call with a clear message and never silently degrades (PE-06).
6. Take-rate (tickets): the operator's Stripe account takes the buyer's payment, retains the fee, and pays the creator via Connect; `recipient` in the manifest says where.

To build: **(a)** a license service (issue/verify/revoke), **(b)** Stripe Connect wiring inside the stripe plugin, **(c)** a server-side metering ledger. Today `plugin license verify` prints "provider verification is unavailable" and exits 1.

## 6. Publication matrix

- **npm public (Lane A only):** the neutral open bricks plus the open first-party `deploy`. Each needs a `files` allowlist (so `docs/`, `CLAUDE.md`, `.agent/`, `test/`, `vault/`, `openwiki/` never ship), `distribution {tier, license:"open"}`, `publishConfig.access = public`, and a PII/credential scan.
- **Not published as source (Lane B):** `signing`, `domains`, `phone`+`text` (merged Hello Phone), `tickets`, `creative-search`, `sticker-generator`. Ship a thin client only, `license:"closed"`, gated server-side; not vendorable.
- **Keep private:** the plugins that hardcode operator infrastructure until they are genericized or rebranded (`signing`, `domains`, `phone-companion`, `sticker-generator`'s hardcoded recipient) and the `UNLICENSED` ones (`deploy`, `tickets`).

28 of 30 plugins are currently `"private": true` and cannot publish until flipped. Only `auth` and `signing` have a `files` allowlist today; there is no `.npmignore` anywhere.

## 7. Open decisions

1. **Vercel domain resale model** - registrar transfer to the buyer vs a managed-DNS-service framing (a domain in the operator's Vercel account is the operator's).
2. **Telephony branding** - confirm the managed brand name ("Hello Phone") for the merged voice+SMS service.
3. **Tickets processing** - confirm the operator processes payments and refunds via Stripe Connect.
4. **Creative-search managed sources** - which sources are marked up.
5. **Store** (PE-08) - remains unbuilt (no listing service, publisher identity, review, payout).

## 8. Sequencing

1. Lock the model: add `distribution {tier, license}` to all 30 manifests; enforce `closed` in `plugin-vendor` and in the runner (license required).
2. Merge and close the service plugins: `phone`+`text` -> one managed Hello Phone plugin; `domains` and `creative-search` -> managed only, no BYO twins.
3. **Build `tr-plugin-asterisk`** (extract the festech switch/ARI service) - prerequisite for the flagship managed telephony service.
4. Build the revenue rail: license service + Stripe Connect + metering ledger.
5. Build the **AI Gateway** (PE-11): one metered service fronting the model/API plugins (`decision`, `dsh`, `image-generator`, `translator`). Highest-ROI profit lever after the rail.
6. Wire multi-provider `deploy` + provider schema-freshness task; add a managed `operator-alerts` delivery tier.
7. Genericize/rebrand the private six; set licenses.
8. Publish the Lane-A bricks to npm; keep Lane-B as thin clients.
9. Sync machines (git push/pull is already done; npm and the mini/cloud fetches follow).

