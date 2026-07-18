---
type: project_document
title: "NETWORK_SAFETY_AND_SECRETS — Audit"
description: "Pre-implementation audit of network concurrency and secrets management in Total Recall"
tags: ["project-management", "audit", "security", "networking"]
timestamp: 2026-07-15T22:16:00Z
---

# NETWORK_SAFETY_AND_SECRETS — Audit

> **Date**: 2026-07-15
> **Auditor**: Agent (automated)
> **Trigger**: Daemon flooding local wifi, crashing router; user reported plaintext secrets

---

## 1. Network Concurrency — Current State

### Root Cause

Total Recall has **zero centralized control** over outbound HTTP requests. Every module that makes network calls uses raw `fetch()` independently. There is no global concurrency cap, no per-domain throttling, and no request queuing.

### Evidence: Modules Using Raw `fetch()`

| Module | File | What it does | Concurrency pattern |
|--------|------|-------------|-------------------|
| Source Adapters | `src/core/source-adapters.mjs` | Brave, Tavily, Exa, Serper, GitHub, npm, arXiv, Wikipedia, web fetch | Each adapter fires raw `fetch()`. Research tasks call multiple adapters via `Promise.all()` — unbounded parallelism |
| Embeddings | `src/core/embeddings.mjs` (L101, L133, L161) | Google/OpenAI embedding API calls | Raw `fetch()` with `AbortSignal.timeout(30000)`. Called in loops during vector field compilation |
| Parallel Context | `src/core/parallel-context.mjs` | Gemini Flash API — 1 call per vault node | `MAX_CONCURRENCY = 4` semaphore exists but fires 4 concurrent LLM calls per context request |
| Vector Field | `src/core/vector-field.mjs` | Embedding compilation | `EMBED_CONCURRENCY = 5` — fires 5 parallel embedding calls during `compileField()` |
| Inference Engine | `src/core/inference-engine.mjs` | LLM inference calls | Raw `fetch()` to Gemini/OpenAI |
| Fact Seeker | `src/core/fact-seeker.mjs` | Knowledge acquisition | Calls source adapters (see above) — multiplies the concurrency |

### Evidence: Incident on 2026-07-15

- **Mac Mini** (`10.0.0.132`): Daemon had been running since Tuesday (~6 days). PID 1192 (`daemon-loop.mjs`) had consumed **198 hours of CPU time**. Dream cycle (`dream.mjs`, PID 1118) had consumed **26 hours**.
- **Laptop**: Daemon was also running (PIDs 510, 432). Both machines hitting the same wifi router simultaneously.
- **Launchd auto-restart**: Both machines had launchd plists (`com.totalrecall.brain`, `com.totalrecall.daemon.plist`, `com.totalrecall.server.plist`) configured to auto-restart the daemon on crash — meaning `kill -9` was insufficient; the services respawned within seconds.
- **Impact**: Router NAT table / conntrack exhaustion causing wifi drops for all devices on the network.

### Evidence: No Coordination Between Machines

There is no PID lockfile, no cross-machine awareness, and no coordination mechanism. Two daemons on the same network both fire the same research tasks, embedding rebuilds, and dream cycles independently — doubling the network load.

---

## 2. Secrets Management — Current State

### secrets.enc Files Found

| Path | Size | Format | Keys |
|------|------|--------|------|
| `.agent/secrets.enc` | 669 B | **Plain JSON** (NOT encrypted) | 10 keys: google_api_key, tavily, brave, exa, serper, github_token, dashboard_password_hash, npm_recovery_code, npm_token, portfolio_admin_token |
| `.agent/skills/total-recall/config/secrets.enc` | 29,705 B | **Plain JSON** (NOT encrypted) | 80+ keys: master global keychain with keys for ALL repos (DigitalOcean, Stripe, Supabase, OpenAI, Anthropic, Telnyx, Twilio, Mailcow, ElevenLabs, fal.ai, Vercel, GitHub, etc.) |

### Encryption Status

- `src/core/crypto.mjs` (L11): Defines `SECRETS_FILE` path and has AES-256-GCM functions
- `src/core/secrets-store.mjs` (L4): "Default format: JSON object at `<brain>/config/secrets.enc` with mode 0o600"
- **Reality**: The encryption pipeline exists in code but is never called. `setup.mjs`, `deploy-ui.mjs`, and `keys.mjs` all write plain JSON directly.

### Cross-Repo Credential Sprawl

| Repo | Credential Files | Risk |
|------|-----------------|------|
| **ultrachat-ai-powered** | `.env` (98 lines), `.env.development.local`, `.env.local`, `.env.stripe-products` | ~40+ live keys: Stripe, Supabase, OpenAI, Anthropic, Telnyx, Twilio, Mailcow |
| **festech.live** | `.env` (58 lines), `.env.local` (63 lines), `.developer_secrets.local.md` (plaintext!), `SECRETS.md` | ~25 live keys; SECRETS.md confirms keys were committed to git history |
| **portfolio-site** | `.env` (18 lines) | SMTP, DO token, Stripe live, Mailcow |
| **moogie_crm** | `.env` (48 lines), `.env.development.local` (57 lines), `.agent/DEVELOPER_SECRETS.md` | Full dev keychain + **SSH private key embedded in .env** |
| **total-recall** | `.env` (4 lines) | DO API token |
| **visualizer** | `.env` (2 lines) | fal.ai key |
| **total-recall-brain** | `config/brain.json` | Cloudflare tunnel URL + TR auth token |

### Highest-Risk Items

1. 🔴 **SSH private key** in `moogie_crm/.env` — full OpenSSH ed25519 private key in plaintext
2. 🔴 **Live Stripe keys** (`sk_live_`, `rk_live_`) in 5+ files across 4 repos
3. 🔴 **festech.live SECRETS.md** confirms keys were committed to git history — rotation required
4. 🟡 **Neither secrets.enc is encrypted** — AES-256-GCM pipeline exists but is dead code
5. 🟡 **`dashboard_password_hash`** duplicated in both `secrets.enc` and `security.yml`
6. 🟡 **No gitignore coverage** for `.developer_secrets.local.md` in festech.live

---

## 3. Existing Infrastructure

### Launchd Services (found and disabled)

| Machine | Plist | Status |
|---------|-------|--------|
| Laptop | `com.totalrecall.brain` | Unloaded and removed |
| Mac Mini | `com.totalrecall.daemon.plist` | Unloaded |
| Mac Mini | `com.totalrecall.server.plist` | Unloaded |

### Dashboard Pages (existing, for UI integration context)

25 existing pages in `frontend/src/pages/`. Relevant: `HealthPage.tsx`, `SettingsPage.tsx`, `ApiKeysPage.tsx`. No existing "Network" page.

### SSSS Integration Points

- Network policy should be a VFS document primitive at `memory-vault/system/network-policy.md`
- Audit events should flow through SSSS `event` envelopes
- Policy mutations must use SSSS Core Contract (`POST /api/v1/ssss`)

---

## 4. Summary of Findings

| Finding | Severity | Category |
|---------|----------|----------|
| No centralized fetch throttling | **P0** | Network stability |
| Daemon ran 6 days unchecked on Mac Mini | **P0** | Daemon safety |
| secrets.enc is plaintext despite .enc extension | **P0** | Data safety |
| No PID lockfile — multiple daemons can run | **P1** | Daemon safety |
| Live Stripe keys in 5+ plaintext files | **P1** | Data safety |
| SSH private key in moogie_crm .env | **P1** | Data safety |
| Keys committed to festech git history | **P1** | Data safety |
| No network visibility in dashboard | **P2** | Observability |
| No firewall / domain control | **P2** | Security |
