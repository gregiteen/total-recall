---
type: project_document
title: "MESH_DASHBOARD_UI — Project Tracker"
description: "Living task tracker for the Mesh Operations Center dashboard project"
tags: ["project-management", "tracker", "mesh", "dashboard"]
timestamp: 2026-07-16T04:57:00Z
---

# MESH_DASHBOARD_UI — Project Tracker

> **Status:** Not started
> **Companion:** [Audit](./MESH_DASHBOARD_UI_AUDIT.md) · [PRD](./MESH_DASHBOARD_UI_PRD.md) · [Architecture](./MESH_DASHBOARD_UI_ARCHITECTURE.md) · [Dev Plan](./MESH_DASHBOARD_UI_DEVELOPMENT_PLAN.md)

---

## Phase 0: Critical Fixes

### 0A. Chat Fix (S)
- [ ] Update `.agent/skills/total-recall/modules/agents/agents.yml` line 25: `--full-auto` → `--sandbox workspace-write`
- [ ] Verify: restart backend → send chat message → receive response

### 0B. Missing VFS Document (S)
- [ ] Create `memory-vault/system/network-policy.md` with full SSSS frontmatter (`type: network_policy`, `id: network-policy`, `blocked_domains: []`, `max_global_concurrency: 20`, `max_per_domain_concurrency: 5`, `default_timeout_ms: 30000`)
- [ ] Verify: `curl localhost:3100/api/network/policy` returns 200

### 0C. Global CSS Classes (S)
- [ ] Add `.alert` base class to `frontend/src/index.css` (padding, border-radius, border, margin)
- [ ] Add `.alert-error` variant (error background, error border, error text)
- [ ] Add `.alert-success` variant (success background, success border, success text)
- [ ] Add `.input` class (background, border, border-radius, padding, color, font, focus state)
- [ ] Add `.select` class (same as input + dropdown arrow)
- [ ] Add `.data-table` to `frontend/src/index.css` (move from MeshPage.css to global)
- [ ] Add `.page-container` class (padding, max-width, margin auto)
- [ ] Add `.page-header` class (flex, align-items, justify-between, margin-bottom)

### 0D. Network API Client Fix (S)
- [ ] Refactor `frontend/src/api/network.ts` — replace all raw `fetch()` with `get()`, `post()`, `del()` from `_base.ts`
- [ ] Remove `networkApi` object pattern — use named exports matching other API modules
- [ ] Verify: network page loads with correct auth headers in dev tools

### 0E. Chat Empty Response Fix (S)
- [ ] In `frontend/src/api/chat.ts` line 40: change `??` to `||` for content fallback
- [ ] Verify: empty agent response shows "(empty response)" not blank

### 0F. Mesh Route Auth (S)
- [ ] Add `requireAuth` middleware to `GET /leader` in `src/server/routes/mesh.mjs`
- [ ] Add `requireAuth` middleware to `GET /nodes` in `src/server/routes/mesh.mjs`
- [ ] Verify: unauthenticated request to `/api/mesh/leader` returns 401

---

## Phase 1: NetworkPage Rewrite

### 1A. Delete Old Files (S)
- [x] Delete `frontend/src/pages/NetworkPage.tsx` (the Tailwind version)
- [x] Delete `frontend/src/pages/NetworkPage.css` (the broken variables version)

### 1B. NetworkPage CSS (M)
All tasks completed
- [x] Create new `frontend/src/pages/NetworkPage.css`
- [x] Style stat cards (3-column grid, glass effect, animated counter)
- [x] Style firewall blocklist (card with domain list items, add form, remove buttons)
- [x] Style global limits form (labeled inputs in 2-column grid)
- [x] Style per-domain rate limits table
- [x] Style whitelist mode toggle switch
- [x] Style audit log table with status badges and filters
- [x] Style refresh interval selector

### 1C. NetworkPage Component (L)
- [x] Create new `frontend/src/pages/NetworkPage.tsx`
- [x] Import `NetworkPage.css`
- [x] Stats section: 3 stat cards (active connections, queue depth, errors+timeouts)
- [x] Firewall Blocklist section:
  - [x] Domain list with remove button per item
  - [x] Add domain form with input + button
  - [x] Bulk import/export (paste domains, one per line)
- [x] Global Limits section:
  - [x] Editable `max_global_concurrency` input
  - [x] Editable `max_per_domain_concurrency` input
  - [x] Editable `default_timeout_ms` input
  - [x] Save button → calls `networkApi.updatePolicy()`
- [x] Per-Domain Rate Limits section:
  - [x] Table of domain-specific limits
  - [x] Add/edit/remove domain limit form
- [x] Whitelist Mode section:
  - [x] Toggle switch for `whitelist_mode`
  - [x] Allowed domains list (shown when whitelist mode active)
- [x] Audit Log section:
  - [x] Filterable table: domain, method, status, wait time, duration
  - [x] Filters: domain text search, status dropdown (success/error/timeout), since date
  - [x] Expandable error details per row
- [x] Auto-refresh with configurable interval (2s/5s/10s/30s/off) dropdown
- [x] Loading skeleton state
- [x] Error boundary with retry

### 1D. NetworkPage Tests (S)
- [x] Update `frontend/src/pages/NetworkPage.spec.tsx`
- [x] Test: renders stat cards with data
- [x] Test: add domain to blocklist
- [x] Test: remove domain from blocklist
- [x] Test: save global limits
- [x] Test: audit log renders with filters
- [x] Test: loading state
- [x] Test: error state

---

## Phase 2: MeshPage Upgrade

### 2A. Mesh Topology Component (L)
- [ ] Create `frontend/src/components/MeshTopology.tsx` — SVG-based node graph
- [ ] Render nodes as circles with hostname labels
- [ ] Color nodes by status (online=green, offline=red)
- [ ] Crown icon on leader node
- [ ] Lines connecting peers with latency labels
- [ ] Click node → callback to show detail

### 2B. Node Detail Cards (M)
- [ ] Add expandable node detail section to MeshPage
- [ ] Show: hostname, mesh IP, role, status, last heartbeat, latency, OS info
- [ ] Add latency history sparkline (last 10 pings)

### 2C. Election History (S)
- [ ] Add election history log section to MeshPage
- [ ] Read from SSSS events for leader election changes
- [ ] Show: timestamp, old leader → new leader, trigger (manual/failover)

### 2D. Latency Matrix (M)
- [ ] Create latency matrix component — grid of node-to-node ping times
- [ ] Color cells by latency (green <50ms, yellow <200ms, red >200ms)

### 2E. Fix Latency Ping (S)
- [ ] Remove `mode: 'no-cors'` from latency fetch
- [ ] Use proper `/api/mesh/ping` endpoint or calculate from API response time

### 2F. MeshPage CSS Updates (S)
- [ ] Add styles for topology graph container
- [ ] Add styles for node detail cards
- [ ] Add styles for latency matrix grid
- [ ] Add styles for election history log

### 2G. MeshPage Tests (S)
- [ ] Update `frontend/src/pages/MeshPage.spec.tsx`
- [ ] Test: topology renders nodes
- [ ] Test: click node shows detail
- [ ] Test: election history renders
- [ ] Test: latency matrix renders

---

## Phase 3: WebhooksPage Upgrade

### 3A. WebhooksPage CSS (S)
- [ ] Create `frontend/src/pages/WebhooksPage.css`
- [ ] Style wizard steps (numbered circles with connecting line)
- [ ] Style masked secret input with reveal toggle
- [ ] Style expandable JSON viewer
- [ ] Style delivery stats cards

### 3B. Provider Configuration Wizard (L)
- [ ] Create `frontend/src/components/WebhookWizard.tsx`
- [ ] Step 1: Select provider (GitHub, npm, Stripe, Custom)
- [ ] Step 2: Enter endpoint URL + webhook secret (masked)
- [ ] Step 3: Select event types to subscribe to
- [ ] Step 4: Test webhook delivery
- [ ] Step 5: Confirm and save
- [ ] Back/Next navigation between steps
- [ ] Progress indicator

### 3C. Enhanced Event Log (M)
- [ ] Add expandable JSON payload viewer per event
- [ ] Add delivery status badge (success/failed/retried)
- [ ] Add "Re-deliver" button per event
- [ ] Make provider filter dynamic from config data (not hardcoded)

### 3D. Delivery Stats (S)
- [ ] Per-provider stat cards: total received, success rate, avg processing time
- [ ] Mini bar chart for last 24h delivery volume

### 3E. Secret Rotation (S)
- [x] Add "Rotate Secret" button per webhook config
- [x] Confirmation dialog with warning
- [x] Generate new secret → update VFS config → display new secret once

### 3F. WebhooksPage Tests (S)
- [x] Update `frontend/src/pages/WebhooksPage.spec.tsx`
- [x] Test: wizard completes end-to-end
- [x] Test: add webhook with full form
- [x] Test: delete webhook with confirm
- [x] Test: event log renders with expandable payloads
- [x] Verify: Event log displays properly, expanding JSON works, tests pass

---

## Phase 3.5: Headscale Server Administration

### 3.5A. API Client & Routes (M)
- [x] Create `frontend/src/api/headscale.ts` with API definitions
- [x] Create `src/server/routes/headscale.mjs` with Headscale API proxy endpoints
- [x] Register route in `rest.mjs`

### 3.5B. ApiKeysPage Integration (S)
- [x] Add `headscale` to `ProviderLogo` component in `ApiKeysPage.tsx`
- [x] Support saving URL and Bearer Token

### 3.5C. MeshPage UI Updates (L)
- [x] Update `MeshPage.tsx` to include tabs: Nodes, Pre-Auth Keys, Users
- [x] Build Nodes list component (delete, rename)
- [x] Build Pre-Auth Key Generator component (reusable toggle, tags, expiration)
- [x] Build Users list component
- [x] Verify: Can list nodes from Headscale server, generate pre-auth key

---

## Phase 4: Secrets Management Page

### 4A. Backend Routes (M)
- [ ] Add `GET /api/secrets/list` to `src/server/routes/secrets.mjs`
- [ ] Add `POST /api/secrets/sync/trigger` to secrets routes
- [ ] Add `GET /api/secrets/sync/status` to secrets routes
- [ ] Add `requireAuth` to `/api/secrets/sync` endpoint
- [ ] Write `src/server/routes/secrets.spec.mjs` tests

### 4B. Frontend API Client (S)
- [ ] Create `frontend/src/api/secrets.ts` using `_base.ts` helpers
- [ ] Functions: `listSecrets`, `addSecret`, `editSecret`, `deleteSecret`, `triggerSync`, `getSyncStatus`
- [ ] Types: `SecretEntry`, `SyncStatus`
- [ ] Write `frontend/src/api/secrets.spec.ts`

### 4C. SecretsPage Component (L)
- [ ] Create `frontend/src/pages/SecretsPage.tsx`
- [ ] Secrets inventory table: key name, last modified, sync status badges per node
- [ ] Add Secret form: key name + value (masked) + save
- [ ] Edit Secret: inline edit with masked value + reveal toggle
- [ ] Delete Secret: confirm dialog
- [ ] Sync Status dashboard: node cards showing checksum, last sync, status
- [ ] Sync History log: scrollable list of sync events
- [ ] Manual Sync Trigger button with loading state

### 4D. SecretsPage Styling (S)
- [ ] Create `frontend/src/pages/SecretsPage.css`
- [ ] Style sync status cards with node-by-node comparison
- [ ] Style masked input with reveal toggle eye icon
- [ ] Style sync history timeline

### 4E. SecretsPage Tests (S)
- [ ] Create `frontend/src/pages/SecretsPage.spec.tsx`
- [ ] Test: renders secrets list
- [ ] Test: add secret
- [ ] Test: delete secret
- [ ] Test: sync status renders
- [ ] Test: trigger sync

### 4F. Routing (S)
- [ ] Add `<Route path="/secrets" element={<SecretsPage />} />` to App.tsx
- [ ] Add sidebar link with lock icon in Security group
- [ ] Import SecretsPage in App.tsx

---

## Phase 5: Notifications Management Page

### 5A. VFS Schema (S)
- [ ] Create `memory-vault/system/notification-rules/` directory
- [ ] Create sample rule: `node-offline.md` with `type: notification_rule` frontmatter

### 5B. Backend Routes (M)
- [ ] Create notification rule CRUD routes (GET/POST/PUT/DELETE `/api/notifications/rules`)
- [ ] Create `GET /api/notifications/history` — reads from SSSS events
- [ ] Create `POST /api/notifications/test` — sends test via `notifications.mjs`
- [ ] Register routes in `rest.mjs`
- [ ] Write route spec tests

### 5C. Frontend API Client (S)
- [ ] Create `frontend/src/api/notifications.ts` using `_base.ts` helpers
- [ ] Functions: `listRules`, `createRule`, `updateRule`, `deleteRule`, `getHistory`, `sendTest`
- [ ] Types: `NotificationRule`, `NotificationEntry`
- [ ] Write `frontend/src/api/notifications.spec.ts`

### 5D. NotificationsPage Component (L)
- [ ] Create `frontend/src/pages/NotificationsPage.tsx`
- [ ] Channel configuration section (desktop toggle, webhook URL, email SMTP)
- [ ] Alert rules table with create/edit/delete
- [ ] Rule builder form: event → channel → priority → quiet hours
- [ ] Notification history log with delivery status
- [ ] Test button per channel

### 5E. NotificationsPage Styling (S)
- [ ] Create `frontend/src/pages/NotificationsPage.css`
- [ ] Style rule builder form with event/channel/priority selectors
- [ ] Style notification history timeline
- [ ] Style channel config cards

### 5F. NotificationsPage Tests (S)
- [ ] Create `frontend/src/pages/NotificationsPage.spec.tsx`
- [ ] Test: renders rules list
- [ ] Test: create rule
- [ ] Test: delete rule
- [ ] Test: history renders

### 5G. Routing (S)
- [ ] Add route + sidebar link in App.tsx (System group)

---

## Phase 6: Skills Management Page

### 6A. Backend Routes (M)
- [ ] Add/extend skills routes: `GET /api/skills/list`, `GET /api/skills/:name`, `POST /api/skills/sync`, `GET /api/skills/sync/status`
- [ ] Register in `rest.mjs` if not already
- [ ] Write route spec tests

### 6B. Frontend API Client (S)
- [ ] Create `frontend/src/api/skills.ts` using `_base.ts` helpers
- [ ] Functions: `listSkills`, `getSkillDetail`, `triggerSync`, `getSyncStatus`
- [ ] Types: `SkillInfo`, `SkillDetail`
- [ ] Write `frontend/src/api/skills.spec.ts`

### 6C. SkillsPage Component (L)
- [ ] Create `frontend/src/pages/SkillsPage.tsx`
- [ ] Installed skills table: name, version, description, last synced, file count
- [ ] Skill detail view: rendered SKILL.md markdown, file tree, resource list
- [ ] Sync controls: trigger sync button, per-node sync status
- [ ] Skill health checks: missing SKILL.md warnings, version mismatches
- [ ] Deployment log

### 6D. SkillsPage Styling (S)
- [ ] Create `frontend/src/pages/SkillsPage.css`
- [ ] Style skill cards with version badges
- [ ] Style markdown renderer container
- [ ] Style sync status indicators

### 6E. SkillsPage Tests (S)
- [ ] Create `frontend/src/pages/SkillsPage.spec.tsx`
- [ ] Test: renders skills list
- [ ] Test: click skill shows detail
- [ ] Test: sync status renders

### 6F. Routing (S)
- [ ] Add route + sidebar link in App.tsx (System group)

---

## Phase 7: Polish & Hardening

### 7A. Dead Code Cleanup (S)
- [ ] Remove `processOperation` dead import from `src/server/routes/network.mjs`
- [ ] Remove "Mock function" misleading comment from `src/server/routes/webhooks.mjs`
- [ ] Remove "Phase 3D" leftover comment from webhooks.mjs

### 7B. SSSS Compliance Fixes (M)
- [ ] Fix `webhooks.mjs` `emitSsssEvent` — replace mock req/res with proper SSSS Core Contract call
- [ ] Fix `network.mjs` `applyPatch` — replace mock req/res with proper SSSS Core Contract call

### 7C. Webhook Handler Fixes (S)
- [ ] Add Stripe event handler to `webhook-handlers.mjs`
- [ ] Fix deploy.sh webhook trigger — must run quality gates before deploying
- [ ] Verify npm event type against actual npm webhook format

### 7D. Security Hardening (S)
- [ ] Reject webhook if no secret configured (don't silently skip verification)
- [ ] Add auth to `/api/secrets/sync` endpoint
- [ ] Add mesh-only IP check to secrets sync

### 7E. Final Verification (M)
- [ ] Run full test suite — `npm test` must pass 100%
- [ ] `grep -rn "bg-gray\|px-6\|text-2xl\|font-semibold" frontend/src/pages/` — zero Tailwind classes
- [ ] `grep -rn "TODO\|FIXME" frontend/src/pages/` — zero leftover markers
- [ ] `grep -rn "open.*modal" frontend/src/pages/` — zero stub comments
- [ ] Visual inspection of every page in browser
- [ ] Test on both localhost and mesh IP

---

## Summary

| Phase | Tasks | Complexity | Depends On |
|-------|-------|------------|------------|
| 0: Critical Fixes | 11 | S | None |
| 1: NetworkPage Rewrite | 24 | L | Phase 0 |
| 2: MeshPage Upgrade | 16 | M | Phase 0 |
| 3: WebhooksPage Upgrade | 16 | M | Phase 0 |
| 4: Secrets Management | 16 | L | Phase 0 |
| 5: Notifications | 16 | L | Phase 0 |
| 6: Skills Management | 14 | M | Phase 0 |
| 7: Polish & Hardening | 14 | M | Phases 1-6 |
| **Total** | **~127 tasks** | | |
