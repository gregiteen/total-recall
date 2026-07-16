---
type: project_document
title: "MESH_DASHBOARD_UI — Product Requirements Document"
description: "PRD for the Mesh Operations Center — a premium unified dashboard for mesh networking, network firewall, webhooks, secrets, skills, notifications, and automated configuration"
tags: ["project-management", "prd", "mesh", "network", "webhooks", "secrets", "skills", "notifications", "dashboard"]
timestamp: 2026-07-16T04:50:00Z
---

# MESH_DASHBOARD_UI — Product Requirements Document

> **Status:** Draft — awaiting user review
> **Companion:** [Audit](./MESH_DASHBOARD_UI_AUDIT.md)

---

## Problem Statement

The Headscale Mesh Integration project shipped a complete backend (mesh networking, leader election, webhook ingress, secrets sync, network firewall, notifications) but delivered a broken, unstyled, half-stubbed frontend UI. The previous tracker was falsely marked 100% complete. Users currently see:

1. **NetworkPage** — raw unstyled HTML (Tailwind classes with no Tailwind installed), backed by a non-existent VFS document
2. **MeshPage** — recently fixed but minimal — a simple table with no topology visualization, no health history, no actionable controls
3. **WebhooksPage** — recently fixed but the Add form only collects a provider name — no secret, URL, or event type configuration
4. **Chat** — broken due to deprecated `--full-auto` codex flag in `agents.yml`
5. **No Secrets Management UI** — secrets sync exists in the backend but is completely invisible to users
6. **No Notifications Management UI** — `notifications.mjs` exists but users can't configure alert rules, channels, or preferences
7. **No Skills Management UI** — skill sync triggers exist in webhook handlers but users can't view, deploy, or manage skills from the dashboard
8. **No Automated Configuration** — mesh node enrollment, webhook registration, and policy setup are all manual VFS file edits

---

## Vision: The Mesh Operations Center

Transform the existing scattered pages into a **unified Mesh Operations Center** — a premium, real-time command center that makes Total Recall's distributed infrastructure visible, configurable, and autonomous. This is the nerve center for a self-managing AI operating system.

---

## Scope

### In-Scope

#### P0 — Critical Fixes (must ship first)
1. Fix Chat: update `agents.yml` codex flag from `--full-auto` to `--sandbox workspace-write`
2. Create missing `network-policy.md` VFS document
3. Fix `network.ts` API client to use `_base.ts` helpers (auth, brain header, API_BASE)
4. Add missing global CSS classes (`alert`, `alert-error`, `input`, `data-table`)
5. Fix empty chat response fallback (`??` → `||`)

#### P1 — Network Firewall Page (complete rewrite)
1. Rewrite `NetworkPage.tsx` from scratch using vanilla CSS design system
2. **Live Traffic Dashboard** — real-time connection count, queue depth, error rate with animated counters
3. **Firewall Blocklist** — add/remove domains with inline editing, bulk import/export, pattern matching (wildcard `*.tracking.com`)
4. **Domain Analytics** — per-domain stats table: request count, avg latency, error rate, last seen
5. **Global Limits Editor** — editable form for `max_global_concurrency`, `max_per_domain_concurrency`, `default_timeout_ms`
6. **Per-Domain Rate Limits** — add custom limits per domain (max concurrent, min interval)
7. **Whitelist Mode Toggle** — switch between blocklist (default) and whitelist mode
8. **Audit Log Viewer** — filterable, searchable table with domain/status/method filters, relative timestamps, expandable error details
9. **Auto-refresh** — configurable poll interval with pause/resume
10. **Network Health Indicator** — colored dot in sidebar/topbar showing gate status

#### P2 — Mesh Network Page (major upgrade)
1. **Mesh Topology Visualization** — interactive node graph showing connections, roles, and health (using canvas or SVG, not a heavy 3D library)
2. **Node Detail Cards** — click a node to see: hostname, mesh IP, role, uptime, last heartbeat, latency history, daemon version, OS info
3. **Leader Election Controls** — force re-election with confirmation dialog, election history log
4. **Health History** — sparkline charts showing node online/offline transitions over time
5. **Latency Matrix** — grid showing ping times between all node pairs
6. **Node Enrollment** — form to add new mesh nodes (generates enrollment command)
7. **Alert Rules** — configure alerts for: node went offline, leader changed, latency exceeded threshold

#### P3 — Webhooks Page (major upgrade)
1. **Provider Configuration Wizard** — step-by-step setup: select provider → enter webhook URL + secret → choose events → test → save
2. **Full Webhook Config Form** — provider name, endpoint URL, secret (masked input with copy/reveal), event type filters, enabled/disabled toggle
3. **Event Log** — rich scrollable log with: provider icon, event type badge, timestamp, payload preview (expandable JSON viewer), delivery status (success/failed/retried)
4. **Webhook Testing** — send test payloads per provider, see real-time delivery result
5. **Delivery Stats** — per-provider: total received, success rate, avg processing time, last 24h chart
6. **Secret Rotation** — regenerate webhook secret with one click, auto-update VFS config
7. **Event Replay** — re-deliver a past webhook event for debugging

#### P3.5 — Headscale Administration (NEW)
1. **Headscale API Config** — Configure Headscale API URL and Bearer token (via ApiKeysPage)
2. **Node Management** — View all registered nodes in Headscale, delete nodes, rename nodes, expire nodes
3. **Pre-Auth Keys** — Generate pre-auth keys for automated node enrollment (reusable, expiration, tags)
4. **Users** — View and create Headscale users (namespaces)

#### P4 — Secrets Management Page (NEW)
1. **Secrets Inventory** — table of all encrypted secrets: key name, last modified, sync status across nodes
2. **Add/Edit/Delete Secrets** — form to manage secrets (value masked by default, reveal on click)
3. **Sync Status Dashboard** — show checksum comparison across all mesh nodes, last sync time, sync health
4. **Sync History** — log of secret sync events: which node pulled, when, checksum before/after
5. **Manual Sync Trigger** — button to force immediate secrets sync to all followers
6. **Access Audit** — log of which processes/agents accessed which secrets and when

#### P5 — Notifications Management Page (NEW)
1. **Notification Channels** — configure delivery channels: desktop (macOS), webhook (Slack/Discord URL), email (SMTP config)
2. **Alert Rules Engine** — create rules: "When [event] happens, notify via [channel] with [priority]"
   - Events: node offline, leader change, webhook delivery failed, secret sync failed, daemon error, research complete, high memory usage
3. **Notification History** — scrollable log of all sent notifications: title, message, channel, delivery status, timestamp
4. **Quiet Hours** — configure do-not-disturb schedule (e.g., no desktop notifications 11pm-7am)
5. **Priority Levels** — critical (always notify), high (respect quiet hours), low (batch digest)
6. **Test Notification** — send a test through any configured channel

#### P6 — Skills Management Page (NEW)
1. **Installed Skills Inventory** — table of all skills in `.agent/skills/`: name, version, description, last synced, sync source
2. **Skill Detail View** — click a skill to see its full SKILL.md rendered as markdown, file tree, resource count
3. **Sync Controls** — trigger `npx total-recall skill sync` across mesh nodes
4. **Skill Health** — verify skill integrity: check for missing SKILL.md, broken references, version mismatches across nodes
5. **Deployment Log** — history of skill deployments: which skill, which node, when, triggered by (manual/webhook/auto)

#### P7 — Automated Configuration
1. **Setup Wizard** — first-run experience that guides through: mesh enrollment → webhook registration → secrets setup → notification config
2. **Auto-Discovery** — detect mesh nodes via tailscale, pre-populate enrollment forms
3. **Configuration Export/Import** — export all configs (network policy, webhook configs, notification rules) as a single SSSS-compliant bundle, import on another node
4. **Health Check Dashboard** — single page showing green/yellow/red status for every subsystem: mesh, webhooks, secrets, notifications, skills, network gate

### Out-of-Scope
- Cloudflare Tunnel configuration — that's deployment ops
- LLM model management — that's Chat/UltraChat territory
- VFS schema changes — this project only adds UI for existing backend capabilities
- New backend API routes (except where the audit identified missing endpoints for new UI features)

---

## Success Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Chat works end-to-end | Send a message → receive a response without errors |
| 2 | NetworkPage renders with full styling | Visual inspection — matches design system, no unstyled elements |
| 3 | Network Firewall fully functional | Add/remove blocked domains, edit global limits, view audit log |
| 4 | MeshPage shows live topology | Nodes render in graph view with real-time status updates |
| 5 | WebhooksPage supports full CRUD | Add webhook with provider/URL/secret/events, edit, delete, test |
| 6 | Secrets Management visible | View all secrets, see sync status, trigger manual sync |
| 7 | Notifications configurable | Create alert rules, configure channels, see notification history |
| 8 | Skills visible and manageable | View installed skills, trigger sync, see deployment history |
| 9 | All pages use vanilla CSS design system | Zero Tailwind classes anywhere in the frontend |
| 10 | All API clients use `_base.ts` helpers | Auth, brain header, API_BASE on every request |
| 11 | All pages have spec files with meaningful tests | At minimum: renders, CRUD operations, error states |
| 12 | `npm test` passes 100% clean | All existing + new tests pass |
| 13 | Zero TODOs, stubs, or placeholder click handlers | grep confirms no `TODO`, `FIXME`, `/* open ... modal */` |

---

## Prioritization (using TR Framework)

| Priority | Category | Items |
|----------|----------|-------|
| 1 | Data safety & VFS integrity | Create `network-policy.md`, fix webhook secrets |
| 2 | Core daemon | Fix `agents.yml` codex flag (Chat) |
| 3 | SSSS compliance | Fix `network.ts` to use `_base.ts`, fix mock req/res patterns |
| 4 | Dashboard rendering | P0 CSS fixes, then P1 NetworkPage rewrite |
| 5 | Feature completeness | P2-P6 new pages/upgrades in order |
| 6 | Polish | P7 automated configuration, setup wizard |

---

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| Tailscale must be running for mesh features | Mesh pages show "no nodes" on dev machines | Graceful degradation with clear messaging |
| Backend server must be running on port 3100 | API calls fail if server down | Error boundaries with retry + clear error messages |
| Webhook secrets must be in `secrets.enc` | Signature verification bypassed if missing | Setup wizard guides users through secret registration |
| `terminal-notifier` required for macOS notifications | Notifications silently fail on Linux | Add browser Notification API as universal fallback |
| New pages add ~6 new route handlers | Could slow server if done naively | Lazy-load routes, paginate large datasets |

---

## Design Principles

1. **Premium, not placeholder** — every page must look like it belongs in a production SaaS product. Use the existing design system tokens (`--bg-primary`, `--accent`, `--glass`, etc.) consistently.
2. **Real-time, not refresh** — auto-polling with configurable intervals, animated transitions for data changes, skeleton loading states.
3. **Actionable, not informational** — every data display should have associated actions. Don't just show status — let users act on it.
4. **Progressive disclosure** — show summary cards first, expand to detailed views on click. Don't overwhelm with data.
5. **Defensive** — every API call has error handling, loading states, empty states, and retry logic. Never show a blank page.
