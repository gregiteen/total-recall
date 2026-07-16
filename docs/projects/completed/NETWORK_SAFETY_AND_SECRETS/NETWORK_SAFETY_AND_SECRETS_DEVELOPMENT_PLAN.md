---
type: project_document
title: "NETWORK_SAFETY_AND_SECRETS — Development Plan"
tags: ["project-management", "security", "networking"]
timestamp: 2026-07-15T22:09:00Z
---

# NETWORK_SAFETY_AND_SECRETS — Development Plan

> **Project Prefix**: `NETWORK_SAFETY_AND_SECRETS`
> **Companion**: [PRD](./NETWORK_SAFETY_AND_SECRETS_PRD.md)

## Principles

1. **Fix the fire first.** Fetch gate before secrets, because the daemon can crash the network again any time it restarts.
2. **Every phase includes its own tests.** No work is "done" unless its spec file exists and passes.
3. **Security skill compliance.** All secrets handling follows `.agent/skills/security/SKILL.md` — AES-256-GCM, never plaintext on disk, `.gitignore` enforced.
4. **"Done When" gates are verifiable with a shell command.**
5. **SSSS compliance.** All persistent state (network policy, firewall config, audit events) is stored as VFS document primitives with OKF-compatible frontmatter (`type`, `title`, `description`, `timestamp`). State mutations flow through the SSSS Core Contract (`POST /api/v1/ssss`). Audit logs use append-only `event` envelopes. No raw file writes for application state.

---

## Phase 0: Fetch Gate Core *(No dependencies — do first)*

### 0A. Create `src/core/throttled-fetch.mjs`

- [x] Implement global concurrency cap (MAX_GLOBAL_CONCURRENCY = 6)
- [x] Implement per-domain concurrency limits (MAX_PER_DOMAIN = 3)
- [x] Implement FIFO request queue with domain-aware draining
- [x] Implement per-request AbortController timeout (default 15s)
- [x] Export `throttledFetch(url, options, timeoutMs)` as drop-in `fetch()` replacement
- [x] Export `safeFetch()` convenience wrapper matching existing source-adapters signature
- [x] Export `getGateStats()` for observability
- [ ] Write `src/core/throttled-fetch.spec.mjs`

**Done when:**
```bash
test -f src/core/throttled-fetch.mjs
test -f src/core/throttled-fetch.spec.mjs
npm test -- --grep "throttled-fetch"  # passes
```

### 0B. Wire Fetch Gate into Source Adapters

- [ ] Replace internal `fetch()` in `src/core/source-adapters.mjs` with `throttledFetch` import
  - `braveSearch()` — raw fetch → throttledFetch
  - `tavilySearch()` — raw fetch → throttledFetch
  - `exaSearch()` — raw fetch → throttledFetch
  - `serperSearch()` — raw fetch → throttledFetch
  - `webFetch()` — raw fetch → throttledFetch
  - `githubSearch()` — raw fetch → throttledFetch
  - `npmSearch()` — raw fetch → throttledFetch
  - `arxivSearch()` — raw fetch → throttledFetch
  - `wikipediaSearch()` — raw fetch → throttledFetch

**Done when:**
```bash
grep -c 'from.*throttled-fetch' src/core/source-adapters.mjs  # >= 1
grep -c "await fetch(" src/core/source-adapters.mjs  # 0 (no raw fetch left)
```

### 0C. Wire Fetch Gate into Embeddings

- [ ] Replace raw `fetch()` in `src/core/embeddings.mjs` with `throttledFetch`
  - `resolveEmbeddingModel()` — model list fetch
  - `getGoogleEmbedding()` — embedding API call
  - `getOpenAIEmbedding()` — embedding API call

**Done when:**
```bash
grep -c 'from.*throttled-fetch' src/core/embeddings.mjs  # >= 1
grep -c "await fetch(" src/core/embeddings.mjs  # 0
```

### 0D. Wire Fetch Gate into Parallel Context

- [ ] Replace raw `fetch()` in `src/core/parallel-context.mjs` with `throttledFetch`

**Done when:**
```bash
grep -c "await fetch(" src/core/parallel-context.mjs  # 0
```

### 0E. Wire Fetch Gate into Vector Field

- [ ] Replace raw `fetch()` in `src/core/vector-field.mjs` with `throttledFetch` (if it uses direct fetch; otherwise verify it goes through embeddings.mjs which is already gated)

**Done when:**
```bash
grep -c "await fetch(" src/core/vector-field.mjs  # 0
```

### 0F. Wire Fetch Gate into Inference Engine

- [ ] Replace raw `fetch()` in `src/core/inference-engine.mjs` with `throttledFetch`

**Done when:**
```bash
grep -c "await fetch(" src/core/inference-engine.mjs  # 0
```

### 0G. Gate Stats Health Endpoint

- [ ] Add `getGateStats()` data to existing `/api/health` response in `src/server/routes/system.mjs`

**Done when:**
```bash
curl -s http://localhost:PORT/api/health | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); assert 'fetch_gate' in d"
```

### 0H. Application-Level Firewall (SSSS-Compliant)

- [ ] Add domain allow/deny list to `throttled-fetch.mjs`
  - `blockedDomains: Set<string>` — requests immediately rejected with descriptive error
  - `allowedDomains: Set<string>` — if non-empty, only these domains are permitted (whitelist mode)
  - Default: no blocklist, no whitelist (open by default, same as current behavior)
- [ ] Add configurable per-domain rate limits
  - `domainLimits: Map<string, { maxConcurrent: number, minIntervalMs: number }>` 
  - Override the global MAX_PER_DOMAIN for specific domains (e.g., googleapis.com → 2, brave → 1)
- [ ] Add request audit log
  - Circular buffer of last 200 requests with: timestamp, domain, status, duration_ms, queue_wait_ms
  - Each completed request emits an SSSS `event` envelope to `ssss_events` (append-only)
  - Export `getAuditLog()` for the dashboard (projection from circular buffer)
- [ ] Store network policy as an SSSS VFS document primitive:
  - Path: `memory-vault/system/network-policy.md`
  - YAML frontmatter: `type: network_policy`, `title`, `description`, `timestamp`, plus `blocked_domains[]`, `allowed_domains[]`, `domain_limits{}`, `global_concurrency`, `per_domain_default`
  - Body: human-readable policy description / changelog
  - Load on startup, hot-reload on VFS change (fs.watch)
- [ ] Policy mutations (block/unblock domain, change limits) go through SSSS Core Contract:
  - `patch` envelope to update frontmatter fields
  - Never raw `fs.writeFileSync` on the policy file
- [ ] Write `src/core/throttled-fetch.spec.mjs` — test blocked domains, whitelisting, per-domain limits, audit log

**Done when:**
```bash
test -f src/core/throttled-fetch.spec.mjs
npm test -- --grep "throttled-fetch"  # passes
# Policy is a valid SSSS document:
head -5 memory-vault/system/network-policy.md  # shows type: network_policy frontmatter
# Verify block works:
node -e "import('./src/core/throttled-fetch.mjs').then(m => { m.blockDomain('evil.com'); m.throttledFetch('https://evil.com').catch(e => console.log(e.message)) })"
# → "Domain evil.com is blocked by network policy"
```

---

## Phase 1: Daemon Safety *(After Phase 0)*

### 1A. PID Lockfile

- [ ] Add PID lockfile at `<brainDir>/daemon.pid` in `src/core/daemon-loop.mjs`
- [ ] On startup: check if PID file exists and process is alive → refuse to start with clear error
- [ ] On shutdown (SIGTERM/SIGINT): remove PID file
- [ ] On crash (uncaughtException): remove PID file

**Done when:**
```bash
# Start daemon, check PID file exists
test -f <brainDir>/daemon.pid
# Try to start second daemon — exits with error code
node src/core/daemon-loop.mjs 2>&1 | grep -i "already running"
```

### 1B. Disable Mac Mini Launchd Auto-Restart

- [ ] Remove or disable `com.totalrecall.daemon.plist` and `com.totalrecall.server.plist` from Mac Mini `~/Library/LaunchAgents/`
- [ ] Document in repo how to properly set up daemon auto-start (with PID lock protection)

**Done when:**
```bash
ssh mac-mini 'ls ~/Library/LaunchAgents/com.totalrecall.* 2>&1' | grep "No such file"
```

---

## Phase 2: Secrets Encryption *(After Phase 0, parallel with Phase 1)*

### 2A. Audit Current Encryption Pipeline

- [ ] Review `src/core/crypto.mjs` — confirm AES-256-GCM encrypt/decrypt functions exist
- [ ] Review `src/core/secrets-store.mjs` — confirm read/write functions exist
- [ ] Identify why encryption is not being applied (likely `setup.mjs` writes plain JSON)

### 2B. Enforce Encryption on Write

- [ ] Ensure `src/cli/secret.mjs` `set` command encrypts via `crypto.mjs` before writing
- [ ] Ensure `src/cli/setup.mjs` encrypts the initial secrets file
- [ ] Ensure `src/cli/deploy-ui.mjs` encrypts when persisting keys
- [ ] Ensure `src/server/routes/keys.mjs` encrypts when saving API keys

**Done when:**
```bash
# After setting a secret, file is NOT valid JSON (it's encrypted binary)
npx total-recall config --set-secret test_key test_value
python3 -c "import json; json.load(open('.agent/secrets.enc'))" 2>&1 | grep -i "error\|decode"
```

### 2C. Ensure Transparent Decryption on Read

- [ ] Verify `loadRuntimeConfig()` in `src/core/runtime.mjs` decrypts secrets.enc before reading
- [ ] Verify `loadResearchConfig()` in `src/core/source-adapters.mjs` decrypts before reading
- [ ] Verify `src/core/config.mjs` `findSecretsFile()` returns decrypted content

**Done when:**
```bash
# Daemon starts successfully with encrypted secrets.enc
# API keys are available in runtime config
```

### 2D. Migrate Existing Plaintext secrets.enc

- [ ] Encrypt `.agent/secrets.enc` (669 bytes, 10 keys)
- [ ] Encrypt `.agent/skills/total-recall/config/secrets.enc` (29KB, 80+ keys)
- [ ] Verify all services still work after migration

### 2E. Write Secrets Encryption Tests

- [ ] Write `src/core/secrets-store.spec.mjs` — roundtrip encrypt/decrypt
- [ ] Test that plaintext JSON is never written to disk by any code path

**Done when:**
```bash
test -f src/core/secrets-store.spec.mjs
npm test -- --grep "secrets-store"  # passes
```

---

## Phase 3: Secrets Consolidation *(After Phase 2)*

### 3A. Cross-Repo Credential Audit Report

- [ ] Create `docs/security/SECRETS_AUDIT_2026-07-15.md` documenting all findings from the subagent audit
- [ ] List every live credential location across all 17 repos
- [ ] Flag highest-risk items (SSH key in moogie_crm, Stripe live keys, git-committed secrets in festech)

### 3B. Gitignore Enforcement

- [ ] Verify `secrets.enc` is in `.gitignore` for total-recall
- [ ] Verify `.env`, `.env.local`, `.env.*.local` patterns are in `.gitignore` for all repos with `.agent/` directories
- [ ] Add `.developer_secrets.local.md` to festech.live `.gitignore`

### 3C. Migration Guide

- [ ] Create `docs/security/SECRETS_MIGRATION_GUIDE.md`
- [ ] Document how to move repo-specific `.env` secrets into the centralized TR keychain
- [ ] Document the `npx total-recall config --set-secret` workflow for each provider

**Done when:**
```bash
test -f docs/security/SECRETS_AUDIT_2026-07-15.md
test -f docs/security/SECRETS_MIGRATION_GUIDE.md
```

---

## Phase 4: Network API Routes *(After Phase 0H)*

### 4A. Network Policy REST API (SSSS-Compliant)

- [ ] Create `src/server/routes/network.mjs` with endpoints:
  - `GET /api/network/stats` — returns `getGateStats()` + `getAuditLog()` (read-only projection)
  - `GET /api/network/policy` — reads VFS `memory-vault/system/network-policy.md` frontmatter
  - `PUT /api/network/policy` — submits SSSS `patch` envelope to update policy frontmatter (not raw file write)
  - `POST /api/network/block` — submits SSSS `patch` envelope appending domain to `blocked_domains[]`
  - `DELETE /api/network/block/:domain` — submits SSSS `patch` envelope removing domain from `blocked_domains[]`
  - `GET /api/network/audit` — returns recent request audit log from `ssss_events` with filtering (by domain, status, time range)
- [ ] All mutation endpoints route through `POST /api/v1/ssss` internally (Core Contract compliance)
- [ ] Write `src/server/routes/network.spec.mjs`
- [ ] Register in `src/server/rest.mjs` router

**Done when:**
```bash
test -f src/server/routes/network.mjs
test -f src/server/routes/network.spec.mjs
curl -s http://localhost:PORT/api/network/stats | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); assert 'current_in_flight' in d"
```

---

## Phase 5: Network Dashboard UI *(After Phase 4)*

### 5A. NetworkPage Component

- [ ] Create `frontend/src/pages/NetworkPage.tsx`
- [ ] Create `frontend/src/api/network.ts` — API client for all `/api/network/*` endpoints

### 5B. Live Stats Panel

- [ ] Real-time display (polling every 2s) of:
  - Current in-flight connections (animated gauge/counter)
  - Current queue depth
  - Requests completed / errors / timeouts (rolling counters)
  - Peak in-flight / peak queue depth (session highs)
- [ ] Global concurrency bar visualization (6 slots, showing which are occupied)

### 5C. Per-Domain Traffic Breakdown

- [ ] Table/card view showing each domain the daemon talks to:
  - Domain name
  - Current active connections
  - Total requests today
  - Average response time
  - Error rate
- [ ] Sortable by any column
- [ ] Click domain → expanded view with recent requests from audit log

### 5D. Audit Log View

- [ ] Scrollable table of recent requests (last 200) showing:
  - Timestamp, domain, HTTP method, status code, duration, queue wait time
- [ ] Filterable by domain, status (success/error/timeout), time range
- [ ] Color-coded rows: green (success), amber (slow > 5s), red (error/timeout)

### 5E. Firewall Configuration Panel

- [ ] Domain blocklist management: add/remove blocked domains with a text input + chip display
- [ ] Domain whitelist toggle: enable/disable whitelist mode, manage allowed domains
- [ ] Per-domain rate limit configuration: table of domain → { maxConcurrent, minIntervalMs }
- [ ] Global settings: MAX_GLOBAL_CONCURRENCY slider (1–20), MAX_PER_DOMAIN slider (1–10), default timeout
- [ ] All changes persist immediately via PUT `/api/network/policy`
- [ ] Visual confirmation toast on save

### 5F. Navigation Integration

- [ ] Add "Network" to dashboard sidebar navigation (with a network/shield icon)
- [ ] Add network status indicator to the top bar (green dot = healthy, amber = queue building, red = errors spiking)

### 5G. Tests

- [ ] Write `frontend/src/pages/NetworkPage.spec.tsx`
- [ ] Write `frontend/src/api/network.spec.ts`

**Done when:**
```bash
test -f frontend/src/pages/NetworkPage.tsx
test -f frontend/src/pages/NetworkPage.spec.tsx
test -f frontend/src/api/network.ts
# Visual: navigate to /network in dashboard, see live stats updating
```

---

## Verification Plan

### Automated Tests
```bash
npm test -- --grep "throttled-fetch"
npm test -- --grep "secrets-store"
npm test -- --grep "network"
```

### Manual Verification
- [ ] Start daemon, confirm gate stats show max 6 concurrent via `/api/health`
- [ ] Run a research task, verify network doesn't flood (check `lsof -i | wc -l` stays under 20)
- [ ] Open Network page in dashboard, verify live stats update in real-time
- [ ] Block a domain via the UI, confirm requests to it are rejected
- [ ] Verify secrets.enc is not readable as plain JSON after migration
- [ ] Verify all API integrations (Brave, embeddings, GitHub) still work through the gate
- [ ] Verify network status indicator in top bar reflects actual gate health
