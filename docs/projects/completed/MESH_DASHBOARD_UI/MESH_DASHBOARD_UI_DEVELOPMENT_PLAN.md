---
type: project_document
title: "MESH_DASHBOARD_UI — Development Plan"
description: "Phased implementation plan for the Mesh Operations Center dashboard"
tags: ["project-management", "development-plan", "mesh", "dashboard"]
timestamp: 2026-07-16T04:56:00Z
---

# MESH_DASHBOARD_UI — Development Plan

> **Companion:** [Audit](./MESH_DASHBOARD_UI_AUDIT.md) · [PRD](./MESH_DASHBOARD_UI_PRD.md) · [Architecture](./MESH_DASHBOARD_UI_ARCHITECTURE.md)

---

## Phase 0: Critical Fixes (blockers that break existing functionality)

### Tasks
- [ ] Fix `agents.yml` codex flag: `--full-auto` → `--sandbox workspace-write`
- [ ] Create `memory-vault/system/network-policy.md` VFS document with proper schema
- [ ] Add missing global CSS classes to `index.css`: `alert`, `alert-error`, `alert-success`, `input`, `select`, `data-table`, `page-container`, `page-header`
- [ ] Refactor `frontend/src/api/network.ts` to use `_base.ts` helpers instead of raw `fetch()`
- [ ] Fix empty chat response fallback in `frontend/src/api/chat.ts`: `??` → `||`
- [ ] Add `requireAuth` middleware to mesh routes in `src/server/routes/mesh.mjs`

### Done When
- `curl localhost:3100/api/network/policy` returns 200 with valid policy JSON
- Chat sends and receives messages without codex errors
- `grep -r "fetch(" frontend/src/api/network.ts` shows zero raw fetch calls
- `grep "requireAuth" src/server/routes/mesh.mjs` shows auth on both routes

---

## Phase 1: NetworkPage Complete Rewrite (L)

### Tasks
- [ ] Delete existing `NetworkPage.tsx` and `NetworkPage.css`
- [ ] Create new `NetworkPage.css` using design system variables
- [ ] Create new `NetworkPage.tsx` with:
  - [ ] Live stats cards (connections, queue depth, errors) with animated counters
  - [ ] Firewall blocklist with add/remove inline editing
  - [ ] Global limits editor form (max concurrency, per-domain, timeout)
  - [ ] Per-domain rate limits table with add/edit/remove
  - [ ] Whitelist mode toggle
  - [ ] Audit log table with domain/status/method filters
  - [ ] Auto-refresh with configurable interval
- [ ] Update `NetworkPage.spec.tsx` with tests for all CRUD operations

### Done When
- NetworkPage renders with full design system styling (visual inspection)
- Add domain to blocklist → appears in list → remove → disappears
- Edit global limits → saved via API → persists on refresh
- Audit log filters work correctly
- All spec tests pass

---

## Phase 2: MeshPage Upgrade (M)

### Tasks
- [ ] Create `MeshTopology` component — SVG-based node graph visualization
- [ ] Add node detail cards (click node → expanded view with hostname, IP, uptime, latency history)
- [ ] Add election history log section
- [ ] Add latency matrix (node-to-node ping grid)
- [ ] Fix latency ping: remove `mode: 'no-cors'`, use proper API endpoint
- [ ] Add alert rule configuration for mesh events (node offline, leader change)
- [ ] Create `MeshPage.css` enhancements for new components
- [ ] Update `MeshPage.spec.tsx` with tests for new features

### Done When
- Topology graph renders nodes with connections and role/status indicators
- Clicking a node shows detail card
- Latency values are accurate (not opaque responses)
- Mesh spec tests pass

---

## Phase 3: WebhooksPage Upgrade (M)

### Tasks
- [ ] Create `WebhooksPage.css` — stop depending on MeshPage.css
- [ ] Build provider configuration wizard component (step-by-step)
- [ ] Upgrade Add Webhook form: provider name, endpoint URL, secret (masked), event types, enabled toggle
- [ ] Add expandable JSON payload viewer to event log entries
- [ ] Add per-provider delivery stats (total, success rate, avg time)
- [ ] Add secret rotation button
- [ ] Make provider filter dropdown dynamic from config data
- [ ] Fix webhook secret storage — ensure VFS configs include secret field
- [ ] Update `WebhooksPage.spec.tsx` with tests for full CRUD + wizard

### Done When
- Add webhook via wizard → config saved with secret → appears in table
- Event log shows expandable JSON payloads
- Delivery stats render per provider
- Secret rotation generates new secret and updates config
- All spec tests pass

---

## Phase 3.5: Headscale Server Administration (L)

### Tasks
- [ ] Update `ApiKeysPage.tsx` to include `headscale` as an API provider (for saving URL & API Key)
- [ ] Create `src/server/routes/headscale.mjs` with Headscale REST API proxy endpoints:
  - [ ] `GET /api/headscale/node` (list nodes)
  - [ ] `DELETE /api/headscale/node/:id` (delete node)
  - [ ] `GET /api/headscale/preauthkey` (list keys)
  - [ ] `POST /api/headscale/preauthkey` (create key)
  - [ ] `GET /api/headscale/user` (list users)
- [ ] Create `frontend/src/api/headscale.ts`
- [ ] Update `MeshPage.tsx` to include Headscale Admin Tabs (Nodes, Pre-Auth Keys, Users)
- [ ] Build Pre-Auth Key Generator form (user, reusable toggle, expiration, tags)

### Architectural Tips / API Specification (from Web Search)
- **API Base URL:** All Headscale REST API calls must go to `/api/v1` (e.g. `http://headscale.example.com:8081/api/v1`).
- **Authentication:** All requests MUST include the header `Authorization: Bearer <API_KEY>`. The key is generated via `headscale apikeys create` on the server.
- **Node Management:** `GET /api/v1/node` (older versions used `/api/v1/machine`). Deletion uses `DELETE /api/v1/node/:id`.
- **Pre-Auth Keys:** Created via `POST /api/v1/preauthkey` and queried via `GET /api/v1/preauthkey?user=<USERNAME>`. A user must exist to associate with keys.
- **Users:** Headscale uses "Users" (formerly Namespaces). Queried via `GET /api/v1/user`.

### Done When
- Headscale API Key can be saved in ApiKeysPage
- MeshPage shows nodes directly from Headscale Server
- User can generate a Pre-Auth Key from the UI

---

## Phase 4: Secrets Management Page (L — new page)

### Tasks
- [ ] Create `frontend/src/api/secrets.ts` using `_base.ts` helpers
- [ ] Create new backend routes in `src/server/routes/secrets.mjs`:
  - [ ] `GET /api/secrets/list` — list key names + metadata
  - [ ] `POST /api/secrets/sync/trigger` — force sync
  - [ ] `GET /api/secrets/sync/status` — per-node sync status
- [ ] Create `SecretsPage.tsx`:
  - [ ] Secrets inventory table (key name, last modified, sync status per node)
  - [ ] Add/edit/delete secret forms (masked values with reveal toggle)
  - [ ] Sync status dashboard with node-by-node checksum comparison
  - [ ] Sync history log
  - [ ] Manual sync trigger button
- [ ] Create `SecretsPage.css`
- [ ] Create `SecretsPage.spec.tsx`
- [ ] Create `frontend/src/api/secrets.spec.ts`
- [ ] Add route + sidebar link in `App.tsx`
- [ ] Add `requireAuth` to secrets sync endpoint

### Done When
- Secrets page shows all keys with sync status
- Add/edit/delete secrets works end-to-end
- Trigger sync → all followers update
- Route accessible from sidebar
- All spec tests pass

---

## Phase 5: Notifications Management Page (L — new page)

### Tasks
- [ ] Create notification rules VFS schema (`memory-vault/system/notification-rules/`)
- [ ] Create new backend routes in notification route module:
  - [ ] `GET /api/notifications/rules` — list rules
  - [ ] `POST /api/notifications/rules` — create rule
  - [ ] `PUT /api/notifications/rules/:id` — update rule
  - [ ] `DELETE /api/notifications/rules/:id` — delete rule
  - [ ] `GET /api/notifications/history` — delivery history
  - [ ] `POST /api/notifications/test` — send test notification
- [ ] Create `frontend/src/api/notifications.ts`
- [ ] Create `NotificationsPage.tsx`:
  - [ ] Channel configuration (desktop, webhook URL, email SMTP)
  - [ ] Alert rules table with create/edit/delete
  - [ ] Rule builder form: event selector → channel → priority → quiet hours toggle
  - [ ] Notification history log with delivery status
  - [ ] Test notification button per channel
- [ ] Create `NotificationsPage.css`
- [ ] Create `NotificationsPage.spec.tsx`
- [ ] Create `frontend/src/api/notifications.spec.ts`
- [ ] Add route + sidebar link in `App.tsx`

### Done When
- Create alert rule → saved to VFS → appears in table
- Test notification → desktop notification fires
- Notification history shows delivery log
- All spec tests pass

---

## Phase 6: Skills Management Page (M — new page)

### Tasks
- [ ] Create new backend routes (or extend existing skills routes):
  - [ ] `GET /api/skills/list` — installed skills with metadata
  - [ ] `GET /api/skills/:name` — skill detail (rendered SKILL.md)
  - [ ] `POST /api/skills/sync` — trigger sync
  - [ ] `GET /api/skills/sync/status` — per-node sync status
- [ ] Create `frontend/src/api/skills.ts`
- [ ] Create `SkillsPage.tsx`:
  - [ ] Installed skills table (name, version, description, last synced)
  - [ ] Skill detail view with rendered markdown
  - [ ] Sync controls (trigger sync, view status)
  - [ ] Skill health checks (missing SKILL.md, version mismatches)
  - [ ] Deployment log
- [ ] Create `SkillsPage.css`
- [ ] Create `SkillsPage.spec.tsx`
- [ ] Create `frontend/src/api/skills.spec.ts`
- [ ] Add route + sidebar link in `App.tsx`

### Done When
- Skills page lists all installed skills with metadata
- Click skill → detail view renders SKILL.md
- Sync trigger → status updates across nodes
- All spec tests pass

---

## Phase 7: Polish & Automated Configuration (S)

### Tasks
- [ ] Health check dashboard widget — green/yellow/red per subsystem
- [ ] Config export/import (SSSS-compliant bundle)
- [ ] Clean up dead code: remove `processOperation` import from `network.mjs`
- [ ] Fix mock req/res SSSS pattern in `webhooks.mjs` and `network.mjs`
- [ ] Add webhook handler for Stripe events
- [ ] Fix deploy.sh webhook trigger to run quality gates first
- [ ] Final visual polish pass on all pages
- [ ] Comprehensive integration test pass

### Done When
- Health dashboard shows all subsystems
- `npm test` passes 100% clean
- `grep -r "TODO\|FIXME\|HACK" frontend/src/pages/` returns nothing
- Zero Tailwind classes anywhere: `grep -r "bg-gray\|px-6\|text-2xl" frontend/src/` returns nothing
