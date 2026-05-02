# Total Recall Cloud — Hosted Memory Engine

> **Status**: Planning
> **Created**: 2026-05-01
> **Priority**: High — Product expansion from CLI tool to hosted SaaS

## Vision

Total Recall evolves from a local-only CLI tool into a **dual-mode memory engine**:

1. **Local Mode** (existing) — filesystem-based, zero-dependency, fully offline
2. **Cloud Mode** (new) — hosted API, subscription billing, cross-device sync, native notifications

The cloud version lets **any developer** use persistent AI memory without installing CLI tools. It also enables **cross-machine continuity** — your memory graph follows you between workstations, CI/CD pipelines, and team environments.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Total Recall Cloud               │
├─────────────────────────────────────────────────┤
│  API Layer (REST + WebSocket)                    │
│  ├── /auth          OAuth 2.1 + API keys        │
│  ├── /memory        CRUD wiki, episodes, search │
│  ├── /pipeline      Trigger extraction pipeline  │
│  ├── /coprocessor   Real-time analysis stream    │
│  ├── /notify        Push notification delivery   │
│  └── /billing       Stripe subscription mgmt    │
├─────────────────────────────────────────────────┤
│  Core Engine (shared with local mode)            │
│  ├── FTS5 search                                 │
│  ├── Wiki graph                                  │
│  ├── Ranking/decay                               │
│  ├── Surface compiler                            │
│  └── Steering queue                              │
├─────────────────────────────────────────────────┤
│  Storage                                         │
│  ├── SQLite (local) | Supabase PostgreSQL (cloud)│
│  ├── S3/R2 for episode archives                  │
│  └── Redis for real-time pub/sub                 │
├─────────────────────────────────────────────────┤
│  Notifications                                   │
│  ├── Web Push (browser)                          │
│  ├── macOS native (local daemon)                 │
│  ├── Email digest (daily/weekly)                 │
│  ├── Slack/Discord webhooks                      │
│  └── Mobile push (PWA + FCM)                     │
└─────────────────────────────────────────────────┘
```

## Subscription Tiers

| Tier | Price | Limits | Features |
|------|-------|--------|----------|
| **Free** | $0 | 100 wiki nodes, 1 project, local only | Core engine, FTS5, steering |
| **Pro** | $12/mo | 10K nodes, 10 projects, cloud sync | + API access, notifications, cross-device |
| **Team** | $29/mo/seat | Unlimited, shared team memory | + Team graphs, shared knowledge, SSO |
| **Enterprise** | Custom | Self-hosted option | + On-prem, audit logs, SLA |

## Implementation Phases

### Phase C1: Auth & API Foundation
- [ ] `.env` / `.env.example` with documented environment variables
- [ ] API key generation and management (`TOTAL_RECALL_API_KEY`)
- [ ] OAuth 2.1 flow for cloud login (GitHub, Google providers)
- [ ] JWT session tokens with refresh rotation
- [ ] Rate limiting per tier
- [ ] `total-recall login` CLI command
- [ ] `total-recall whoami` — show current auth state

### Phase C2: Cloud Storage Backend
- [ ] Abstract storage layer: `StorageAdapter` interface
- [ ] `LocalStorageAdapter` — existing SQLite/filesystem (default)
- [ ] `CloudStorageAdapter` — Supabase PostgreSQL + S3
- [ ] Bidirectional sync: local ↔ cloud with conflict resolution
- [ ] Encryption at rest for cloud-stored memories
- [ ] `total-recall sync` CLI command (push/pull/auto)

### Phase C3: Hosted API Server
- [ ] Express/Hono API server with OpenAPI spec
- [ ] REST endpoints: `/memory/search`, `/memory/steer`, `/memory/wiki`, `/memory/surface`
- [ ] WebSocket endpoint for real-time co-processor streaming
- [ ] API key auth middleware
- [ ] CORS configuration for browser clients
- [ ] Deploy: DigitalOcean App Platform or Fly.io

### Phase C4: Native Notification Integrations
- [ ] Unified notification dispatcher (replaces macOS-only osascript)
- [ ] **Web Push**: VAPID keys, service worker registration, browser subscription
- [ ] **Email**: Transactional (Resend/Postmark) for critical alerts
- [ ] **Email Digest**: Daily/weekly memory summary (cron job)
- [ ] **Slack**: Incoming webhook integration
- [ ] **Discord**: Webhook integration
- [ ] **Mobile Push**: PWA + Firebase Cloud Messaging (FCM)
- [ ] **macOS Native**: Existing osascript (local mode)
- [ ] Notification preferences: per-channel enable/disable, quiet hours
- [ ] `total-recall notify --channel slack "Title" "Message"`

### Phase C5: Billing & Subscription
- [ ] Stripe integration: products, prices, subscriptions
- [ ] Usage tracking: node count, search queries, pipeline runs
- [ ] Tier enforcement: limits checked at API layer
- [ ] Customer portal: manage subscription, invoices
- [ ] Webhook handlers: `invoice.paid`, `subscription.deleted`, etc.
- [ ] Grace period for downgrade (30 days to reduce node count)

### Phase C6: Direct LLM API Support
- [ ] Provider adapters: OpenAI, Anthropic, Google AI, OpenRouter
- [ ] API key config in `.env`: `TOTAL_RECALL_OPENAI_KEY`, etc.
- [ ] `total-recall config set openai.api_key sk-...`
- [ ] Pipeline runs without CLI agents — direct HTTP to LLM APIs
- [ ] Token usage tracking and cost estimation
- [ ] Model selection per pipeline role in config

### Phase C7: SDK & Integrations
- [ ] `@total-recall/sdk` npm package — JS/TS client for the API
- [ ] Python client: `pip install total-recall`
- [ ] VS Code extension: sidebar panel with memory browser
- [ ] GitHub Action: run memory pipeline on PR merge
- [ ] IDE plugins: JetBrains, Neovim (LSP-based)

## Portability Checklist
- [ ] `.env.example` with all configurable vars documented
- [ ] `total-recall setup` interactive wizard (API keys, storage, notifications)
- [ ] Platform detection: macOS, Linux, Windows, Docker
- [ ] Config file resolution: `totalrecall.config.mjs` → `~/.total-recall/config.mjs` → env vars
- [ ] Zero-config local mode preserved (no env file required for basic use)
- [ ] Docker image: `docker run -v ~/.total-recall:/data total-recall`
- [ ] Cross-platform notification fallbacks (libnotify on Linux, toast on Windows)

## Open Questions

> [!IMPORTANT]
> **Deployment target**: DigitalOcean (existing infra) or separate platform (Fly.io, Railway, Vercel)?

> [!IMPORTANT]  
> **Database**: Supabase (existing relationship) or standalone PostgreSQL?

> [!IMPORTANT]
> **Pricing validation**: $12/mo Pro tier — competitive with Mem.ai ($10), Notion AI ($10), but unique in being developer-memory-specific. Need market validation.

> [!WARNING]
> **Data sensitivity**: Agent memory contains code context, user preferences, and behavioral patterns. Must have strong encryption, clear data retention policies, and GDPR compliance from day one.

## Execution Order

> [!TIP]
> Recommended: **C1 → C2 → C4 → C3 → C6 → C5 → C7**
> Auth and storage first, then notifications (high user value), then API server, then LLM support, billing last (validate with free tier first), SDK after core is stable.
