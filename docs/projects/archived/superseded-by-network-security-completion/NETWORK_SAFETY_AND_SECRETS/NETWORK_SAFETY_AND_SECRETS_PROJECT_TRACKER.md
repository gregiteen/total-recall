---
type: project_document
title: "NETWORK_SAFETY_AND_SECRETS — Project Tracker"
description: "Detailed task tracker for fetch gate, firewall, secrets encryption, and network dashboard"
tags: ["project-management", "tracker", "security", "networking"]
timestamp: 2026-07-15T22:19:00Z
---

# NETWORK_SAFETY_AND_SECRETS — Project Tracker

> **Status**: Reopened on 2026-07-16. The prior completed classification was false. The security and integration recovery is tracked by `../RECENT_SYSTEM_INTEGRATION_RECOVERY/RECENT_SYSTEM_INTEGRATION_RECOVERY_PROJECT_TRACKER.md`; unchecked original acceptance work remains open here.
> **Companion**: [Audit](./NETWORK_SAFETY_AND_SECRETS_AUDIT.md) · [PRD](./NETWORK_SAFETY_AND_SECRETS_PRD.md) · [Architecture](./NETWORK_SAFETY_AND_SECRETS_ARCHITECTURE.md) · [Dev Plan](./NETWORK_SAFETY_AND_SECRETS_DEVELOPMENT_PLAN.md)

---

## Phase 0: Fetch Gate Core

### 0A. Create `src/core/throttled-fetch.mjs` (M)
- [x] Implement global concurrency cap (MAX_GLOBAL_CONCURRENCY = 6)
- [x] Implement per-domain concurrency limits (MAX_PER_DOMAIN = 3)
- [x] Implement FIFO request queue with domain-aware draining
- [x] Implement per-request AbortController timeout (default 15s)
- [x] Export `throttledFetch(url, options, timeoutMs)` as drop-in fetch replacement
- [x] Export `safeFetch()` convenience wrapper
- [x] Export `getGateStats()` for observability

### 0B. Wire into Source Adapters (M)
- [x] Add `import { throttledFetch } from './throttled-fetch.mjs'` to `src/core/source-adapters.mjs`
- [x] Replace `braveSearch()` raw fetch → throttledFetch
- [x] Replace `tavilySearch()` raw fetch → throttledFetch
- [x] Replace `exaSearch()` raw fetch → throttledFetch
- [x] Replace `serperSearch()` raw fetch → throttledFetch
- [x] Replace `webFetch()` raw fetch → throttledFetch
- [x] Replace `githubSearch()` raw fetch → throttledFetch
- [x] Replace `npmSearch()` raw fetch → throttledFetch
- [x] Replace `arxivSearch()` raw fetch → throttledFetch
- [x] Replace `wikipediaSearch()` raw fetch → throttledFetch
- [x] Verify: `grep -c "await fetch(" src/core/source-adapters.mjs` returns 0

### 0C. Wire into Embeddings (S)
- [x] Add `import { throttledFetch } from './throttled-fetch.mjs'` to `src/core/embeddings.mjs`
- [x] Replace `resolveEmbeddingModel()` fetch → throttledFetch
- [x] Replace `getGoogleEmbedding()` fetch → throttledFetch
- [x] Replace `getOpenAIEmbedding()` fetch → throttledFetch
- [x] Verify: `grep -c "await fetch(" src/core/embeddings.mjs` returns 0

### 0D. Wire into Parallel Context (S)
- [x] Add `import { throttledFetch } from './throttled-fetch.mjs'` to `src/core/parallel-context.mjs`
- [x] Replace all raw fetch calls → throttledFetch
- [x] Verify: `grep -c "await fetch(" src/core/parallel-context.mjs` returns 0

### 0E. Wire into Vector Field (S)
- [x] Check if `src/core/vector-field.mjs` uses direct fetch or goes through embeddings.mjs
- [x] ~~If direct: replace with throttledFetch~~ (goes through embeddings — already gated)
- [x] Verify: `grep -c "await fetch(" src/core/vector-field.mjs` returns 0

### 0F. Wire into Inference Engine (S)
- [x] ~~Add `import { throttledFetch } from './throttled-fetch.mjs'` to `src/core/inference-engine.mjs`~~ (no direct fetch calls)
- [x] ~~Replace all raw fetch calls → throttledFetch~~ (no direct fetch calls)
- [x] Verify: `grep -c "await fetch(" src/core/inference-engine.mjs` returns 0

### 0F-extra. Wire into TTS (S)
- [x] Add `import { throttledFetch } from './throttled-fetch.mjs'` to `src/core/tts.mjs`
- [x] Replace Kokoro endpoint raw fetch → throttledFetch
- [x] Verify: `grep -c "await fetch(" src/core/tts.mjs` returns 0

### 0G. Gate Stats Health Endpoint (S)
- [x] Import `getGateStats` in `src/server/index.mjs` (health endpoint)
- [x] Add `fetch_gate` field to `/api/health` response
- [x] Verify: `curl /api/health` includes fetch_gate object

### 0H. Application-Level Firewall (L)
- [x] Add `blockedDomains: Set<string>` to throttled-fetch.mjs
- [x] Add `allowedDomains: Set<string>` to throttled-fetch.mjs (whitelist mode)
- [x] Implement `checkFirewall(domain)` — reject blocked, reject non-whitelisted
- [x] Add `domainLimits: Map<string, DomainConfig>` for per-domain rate overrides
- [x] Add circular buffer audit log (last 200 requests): timestamp, domain, status, duration_ms, queue_wait_ms
- [x] Implement `getAuditLog(filter?)` export
- [x] Emit SSSS `event` envelope per completed request (append-only to ssss_events)
- [x] Create VFS document `memory-vault/system/network-policy.md` with `type: network_policy` frontmatter
- [x] Implement `loadPolicy(doc)` — parse VFS frontmatter into runtime config
- [x] Implement hot-reload: `fs.watch()` on policy file → re-apply on change
- [x] Implement `blockDomain(domain)` / `unblockDomain(domain)` — submit SSSS `patch` envelope
- [x] Verify: blocking a domain causes fetch to throw with clear error message

### 0I. Fetch Gate Tests (M)
- [ ] Create `src/core/throttled-fetch.spec.mjs`
- [ ] Test: concurrent requests capped at MAX_GLOBAL_CONCURRENCY
- [ ] Test: per-domain requests capped at MAX_PER_DOMAIN
- [ ] Test: queue drains correctly when slots free up
- [ ] Test: timeout fires AbortController
- [ ] Test: blocked domain throws error
- [ ] Test: whitelist mode rejects non-whitelisted domains
- [ ] Test: per-domain rate override respected
- [ ] Test: audit log records entries
- [ ] Test: getGateStats() returns correct counts

---

## Phase 1: Daemon Safety

### 1A. PID Lockfile (S)
- [x] Write PID to `<brainDir>/daemon.pid` on startup in `src/core/daemon-loop.mjs`
- [x] On startup: check if PID file exists
- [x] On startup: if PID exists, check if process alive (`kill(pid, 0)`)
- [x] If alive: exit with "Daemon already running (PID: XXXX)" error
- [x] If stale PID file: log warning, overwrite with current PID
- [x] On SIGTERM: remove PID file
- [x] On SIGINT: remove PID file
- [ ] On uncaughtException: remove PID file (intentionally skipped — daemon suppresses uncaught exceptions to stay alive)
- [x] Write test for PID lockfile logic

### 1B. Disable Mac Mini Launchd (S)
- [x] SSH to Mac Mini: `launchctl unload ~/Library/LaunchAgents/com.totalrecall.daemon.plist` (done earlier this session)
- [x] SSH to Mac Mini: `launchctl unload ~/Library/LaunchAgents/com.totalrecall.server.plist` (done earlier this session)
- [x] SSH to Mac Mini: Remove plist files from `~/Library/LaunchAgents/`
- [x] Verify: `ls ~/Library/LaunchAgents/com.totalrecall.*` returns "No such file"
- [x] Document proper daemon auto-start setup in `docs/infra/daemon-auto-start.md`

---

## Phase 2: Secrets Encryption

### 2A. Audit Encryption Pipeline (S)
- [x] Read `src/core/crypto.mjs` — confirm AES-256-GCM functions
- [x] Read `src/core/secrets-store.mjs` — confirm read/write API
- [x] Identify all code paths that write to `secrets.enc` (grep for writeFile + secrets)
- [x] Document which paths bypass encryption (expected: setup.mjs, deploy-ui.mjs, keys.mjs)

### 2B. Enforce Encryption on Write (M)
- [x] Modify `src/cli/secret.mjs` `set` command → encrypt via crypto.mjs before writing
- [x] Modify `src/cli/setup.mjs` → encrypt initial secrets file
- [x] Modify `src/cli/deploy-ui.mjs` → encrypt when persisting keys
- [x] Modify `src/server/routes/keys.mjs` → encrypt when saving API keys via dashboard
- [x] Verify: after `set-secret`, file is NOT valid JSON

### 2C. Ensure Transparent Decryption on Read (M)
- [x] Verify `loadRuntimeConfig()` in `src/core/runtime.mjs` can decrypt
- [x] Verify `loadResearchConfig()` in `src/core/source-adapters.mjs` can decrypt
- [x] Verify `findSecretsFile()` in `src/core/config.mjs` returns decrypted content
- [x] Add try/catch with fallback: if file is plain JSON, read it + log deprecation warning
- [x] This fallback enables smooth migration (read old plaintext, write encrypted)

### 2D. Migrate Existing Plaintext (S)
- [x] Backup `.agent/secrets.enc` → `.agent/secrets.enc.backup.2026-07-15`
- [x] Encrypt `.agent/secrets.enc` (669 bytes, 10 keys)
- [x] Backup `.agent/skills/total-recall/config/secrets.enc`
- [x] Encrypt `.agent/skills/total-recall/config/secrets.enc` (29KB, 80+ keys)
- [x] Verify: daemon starts successfully with encrypted files
- [x] Verify: API keys load correctly in runtime config
- [x] Verify: dashboard can read/write keys

### 2E. Secrets Encryption Tests (M)
- [x] Create `src/core/secrets-store.spec.mjs`
- [x] Test: roundtrip encrypt → decrypt produces identical JSON
- [x] Test: encrypted file is NOT valid JSON
- [x] Test: wrong password throws clear error
- [x] Test: corrupted file throws clear error
- [x] Test: migration from plaintext to encrypted works

---

## Phase 3: Secrets Consolidation

### 3A. Audit Report (M)
- [x] Create `docs/security/SECRETS_AUDIT_2026-07-15.md`
- [x] List every live credential file across all 17 repos (from subagent findings)
- [x] Flag SSH key in moogie_crm/.env
- [x] Flag Stripe live keys in 4 repos
- [x] Flag git-committed secrets in festech
- [x] Flag plaintext markdown secret docs (.developer_secrets.local.md, SECRETS.md)

### 3B. Gitignore Enforcement (S)
- [x] Verify `secrets.enc` in total-recall `.gitignore`
- [x] Verify `.env`, `.env.local`, `.env.*.local` in total-recall `.gitignore`
- [x] Add `.developer_secrets.local.md` to festech.live `.gitignore`
- [x] Audit all 17 repos for `.gitignore` coverage of secret files
- [x] Fix any gaps found

### 3C. Migration Guide (M)
- [x] Create `docs/security/SECRETS_MIGRATION_GUIDE.md`
- [x] Document: how to move `.env` secrets into TR keychain
- [x] Document: `npx total-recall config --set-secret` workflow per provider
- [x] Document: how to verify secrets are encrypted
- [x] Document: rotation guide for compromised keys (festech git history)

---

## Phase 4: Network API Routes

### 4A. Network REST API (M)
- [x] Create `src/server/routes/network.mjs`
- [x] Implement `GET /api/network/stats` — read from getGateStats() + getAuditLog()
- [x] Implement `GET /api/network/policy` — read VFS `network-policy.md` frontmatter
- [x] Implement `PUT /api/network/policy` — submit SSSS `patch` envelope
- [x] Implement `POST /api/network/block` — submit SSSS `patch` appending to blocked_domains
- [x] Implement `DELETE /api/network/block/:domain` — submit SSSS `patch` removing from blocked_domains
- [x] Implement `GET /api/network/audit` — filter audit events by domain/status/time
- [x] All mutations route through `POST /api/v1/ssss` internally
- [x] Register routes in `src/server/rest.mjs`
- [x] Write `src/server/routes/network.spec.mjs`

---

## Phase 5: Network Dashboard UI

### 5A. NetworkPage Component (L)
- [x] Create `frontend/src/pages/NetworkPage.tsx`
- [x] Create `frontend/src/api/network.ts` — API client for `/api/network/*`

### 5B. Live Stats Panel (M)
- [x] Current in-flight connections counter (animated)
- [x] Current queue depth counter
- [x] Completed / errors / timeouts rolling counters
- [x] Peak in-flight / peak queue depth session highs
- [x] Global concurrency bar (6 slots showing occupancy)
- [x] Poll every 2s via `GET /api/network/stats`

### 5C. Per-Domain Traffic Breakdown (M)
- [x] Table showing each domain: name, active connections, total today, avg response time, error rate
- [x] Sortable columns
- [x] Click domain → expanded audit log for that domain

### 5D. Audit Log View (M)
- [x] Scrollable table: timestamp, domain, method, status code, duration, queue wait
- [x] Filterable by domain, status (success/error/timeout), time range
- [x] Color-coded rows: green (success), amber (slow >5s), red (error/timeout)

### 5E. Firewall Config Panel (M)
- [x] Blocklist: text input + chip display for blocked domains
- [x] Whitelist toggle + allowed domains management
- [x] Per-domain rate limits table: domain → maxConcurrent, minIntervalMs
- [x] Global settings: MAX_GLOBAL_CONCURRENCY slider (1-20), MAX_PER_DOMAIN slider (1-10), timeout slider
- [x] Save button → `PUT /api/network/policy`
- [x] Toast notification on save

### 5F. Navigation Integration (S)
- [x] Add "Network" to dashboard sidebar (network/shield icon)
- [x] Add network status indicator to top bar (green/amber/red dot)
- [x] Update `frontend/src/components/Sidebar.tsx` (Handled in App.tsx)
- [x] Update `frontend/src/components/TopBar.tsx` (Skipped, using App.tsx)
- [x] Add route in `frontend/src/App.tsx`

### 5G. Tests (M)
- [x] Write `frontend/src/pages/NetworkPage.spec.tsx`
- [x] Write `frontend/src/api/network.spec.ts`

---

## Final Verification

### Automated Tests
- [ ] `npm test -- --grep "throttled-fetch"` passes
- [ ] `npm test -- --grep "secrets-store"` passes
- [ ] `npm test -- --grep "network"` passes

### Manual Verification
- [ ] Start daemon → gate stats show max 6 concurrent via `/api/health`
- [ ] Run research task → `lsof -i | wc -l` stays under 20
- [ ] Open Network page → live stats update every 2s
- [ ] Block a domain via UI → requests to it fail with clear error
- [ ] `secrets.enc` is NOT valid JSON after migration
- [ ] All API integrations still work through the gate
- [ ] Top bar network indicator reflects actual gate health

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 0A: Fetch Gate Core | 7 | ✅ Done |
| 0B: Source Adapters | 11 | ⬜ Not started |
| 0C: Embeddings | 5 | ⬜ Not started |
| 0D: Parallel Context | 3 | ⬜ Not started |
| 0E: Vector Field | 3 | ⬜ Not started |
| 0F: Inference Engine | 3 | ⬜ Not started |
| 0G: Health Endpoint | 3 | ⬜ Not started |
| 0H: Firewall | 12 | ⬜ Not started |
| 0I: Tests | 10 | ⬜ Not started |
| 1A: PID Lockfile | 9 | ⬜ Not started |
| 1B: Launchd | 5 | ⬜ Not started |
| 2A: Audit Pipeline | 4 | ⬜ Not started |
| 2B: Encryption Write | 5 | ⬜ Not started |
| 2C: Decryption Read | 5 | ⬜ Not started |
| 2D: Migrate Plaintext | 7 | ⬜ Not started |
| 2E: Encryption Tests | 6 | ⬜ Not started |
| 3A: Audit Report | 6 | ⬜ Not started |
| 3B: Gitignore | 5 | ⬜ Not started |
| 3C: Migration Guide | 5 | ⬜ Not started |
| 4A: Network API | 10 | ⬜ Not started |
| 5A-G: Dashboard UI | 20 | ⬜ Not started |
| **Total** | **~142 tasks** | **7 done, 135 remaining** |
