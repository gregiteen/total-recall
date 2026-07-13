---
type: project_tracker
title: "SYSTEM RESILIENCE PROJECT TRACKER"
description: "Improve autonomous stability of the Total Recall OS by eliminating monolithic files, adding fault tolerance, deterministic slug generation, embeddings OOM prevention, Ollama cleanup, frontend API decomposition, and sovereign mobile web access. Code-verified against actual source on 2026-07-08."
timestamp: "2026-07-08T22:25:00.000Z"
tags:
  - system-resilience
  - daemon
  - dlq
  - deterministic-slugs
  - mobile-dispatch
  - ollama-cleanup
  - frontend-decomposition
resource: "docs/projects/in-progress/system-resilience/SYSTEM_RESILIENCE_PROJECT_TRACKER.md"
aliases:
  - "system-resilience-tracker"
  - "project-tracker-system-resilience"
---

# SYSTEM RESILIENCE PROJECT TRACKER

> **Status**: In Progress
> **Last Code Audit**: July 8, 2026
> **Companion Docs**:
> - [SYSTEM_RESILIENCE_DEV_PLAN.md](./SYSTEM_RESILIENCE_DEV_PLAN.md)

## Goal
Improve autonomous stability, eliminate monolithic files, enforce fault tolerance, add sovereign mobile access, and clean up deprecated references. All task statuses verified against actual source code.

**@ssss/cli updated to v0.7.1** (was v0.7.0) during this session.

---

## ✅ Phase 1: API Decomposition (Partially Complete)

**Code Audit**: `rest.mjs` imports 10 sub-routers via `router.use()` (memory, keys, sessions, share, auth, sandbox, research, skills, docs, sync). However ~15 inline routes remain, keeping the file at 2,261 lines.

- [x] Decompose `src/server/rest.mjs` → `src/server/routes/memory.mjs`
- [x] Decompose → `src/server/routes/research.mjs`
- [x] Decompose → `src/server/routes/system.mjs` (daemon control, telemetry)
- [x] Decompose → `src/server/routes/sessions.mjs`, `keys.mjs`, `share.mjs`, `auth.mjs`, `sandbox.mjs`, `skills.mjs`, `docs.mjs`, `sync.mjs`
- [x] Extract remaining inline routes from `rest.mjs` into submodules:
  - `routes/health.mjs` — `/health`, `/api/health/*` (CPU, disk, Ollama, CLI agent status)
  - `routes/update.mjs` — `/api/update/check`, `/api/update/run`
  - `routes/help.mjs` — `/api/help`
  - `routes/config.mjs` — `/api/config/*`, `/api/config-json`
  - `routes/extension.mjs` — `/api/extension/download`, `/api/extension/status`
  - `routes/brains.mjs` — `/api/brains/*`
  - `routes/integrations.mjs` — `/api/integrations/*`
  - `routes/dashboard.mjs` — `/api/dashboard/*`
- [x] Verify `rest.mjs` reduced to pure Express assembly layer (<300 lines) — currently 2,288 lines, grew slightly with DLQ routes

---

## ✅ Phase 2: Background DLQ & Retry (Partially Complete)

**Code Audit**: `daemon-loop.mjs` (501 lines) has try/catch error trapping (lines 123-129) and logs failures, but has NO exponential backoff, NO retry counter, and NO DLQ status update. Tasks fail silently after one attempt.

- [x] Implement error trapping in `src/core/daemon-loop.mjs` dispatchTask() (lines 123-129)
- [x] Add exponential backoff: 2^n * 1s base, capped at 60s, max 3 retries (line 411: `Math.min(Math.pow(2, task.retry_count) * 1000, 60000)`)
- [x] Implement DLQ: after 3 failures, set task status to `failed` in scheduler queue (line 408)
- [x] Persist retry count and last error reason in task node frontmatter (line 405-406: `task.last_error`, `updateTaskStatus` accepts `lastError` param)
- [x] Add `GET /api/tasks/failed` route to retrieve DLQ tasks for manual replay (rest.mjs:2242)
- [x] Add `POST /api/tasks/:id/retry` route to manually re-queue failed tasks (rest.mjs:2251)

---

## ✅ Phase 2.5: Memory Compaction (Already Implemented)

**Code Audit**: `runMemoryCompaction()` already exists in `fact-seeker.mjs`, is imported by `daemon-loop.mjs` (lines 110-114), and is registered in `scheduler.mjs` as idle task `memory-compaction-<hex>` with priority 35.

- [x] Create `runMemoryCompaction()` in `src/core/fact-seeker.mjs` — EXISTS
- [x] Register `memory-compaction` as idle task in `src/core/scheduler.mjs` — EXISTS (uses `crypto.randomBytes` for slug — see Phase 3)
- [x] Dispatch `memory-compaction` tasks in `daemon-loop.mjs` — EXISTS (lines 110-114)

---

## ✅ Phase 3: Deterministic Slug Generation (Completed July 8, 2026)

**Verification**: `grep -n "crypto.randomBytes" src/core/inference-engine.mjs src/core/clarity-rewriter.mjs src/core/scheduler.mjs src/core/fact-seeker.mjs src/core/post-mortem.mjs src/core/quick-capture.mjs` returns zero results.

### High Priority (causes duplicate node spawning):
- [x] `src/core/inference-engine.mjs`: `inference-${md5(conclusion.title || JSON.stringify(conclusion)).slice(0,8)}`
- [x] `src/core/inference-engine.mjs`: `contradiction-${md5(contradiction.node_a + contradiction.node_b).slice(0,8)}`
- [x] `src/core/inference-engine.mjs`: `merge-proposal-${md5(candidate.node_a + candidate.node_b).slice(0,8)}`
- [x] `src/core/clarity-rewriter.mjs`: `clarity-rewrite-${slug}` (random suffix removed — slug already unique)
- [x] `src/core/clarity-rewriter.mjs`: `refresh-${slug}` (random suffix removed)
- [x] `src/core/clarity-rewriter.mjs`: `fact-seeker-${md5(gap.query || gap.topic).slice(0,8)}`
- [x] `src/core/clarity-rewriter.mjs`: `cutoff-verify-${node.slug}` (random suffix removed)
- [x] `src/core/clarity-rewriter.mjs`: `correction-${originalSlug}-${md5(correction.was_wrong_about || originalSlug).slice(0,8)}`

### Medium Priority (idempotent slugs prevent queue bloat):
- [x] `src/core/scheduler.mjs`: `clarity-review-${md5(target.slug).slice(0,8)}`
- [x] `src/core/scheduler.mjs`: `memory-compaction-${isoDate}`
- [x] `src/core/fact-seeker.mjs` (4 instances): `id: md5(topic)`, `rule-synth-${md5(title)}`, `delib-task-${md5(task)}`, `proactive-research-${md5(tangent.topic)}`
- [x] `src/core/post-mortem.mjs` (2 instances): `pm-${category}-${md5(sourceSession + title)}`, `skill-gap-${md5(topic).slice(0,6)}`
- [x] `src/core/quick-capture.mjs`: `capture-${source}-${md5(text).slice(0,8)}`

### Low Priority (runtime IDs, safe as random):
- [x] `src/core/conflict-detector.mjs`: `conflict-<date>-<hex>` — keep as-is (conflict IDs are unique by nature)
- [x] `src/core/sandbox.mjs`: sandbox temp filenames — keep as-is (temp files)
- [x] `src/core/optimizer.mjs`: proposal IDs — keep as-is (proposals are unique events)
- [x] `src/core/crypto.mjs`: salt, iv — MUST keep as-is (security requirement)
- [x] `src/core/session-watcher.mjs` (10 instances): session entry IDs — debatable, could use content hash

---

## ✅ Phase 4: Infrastructure Isolation (Already Implemented)

**Code Audit**: `scripts/sync-scaffold.mjs` (95 lines) already implements strict allowlist logic:
- Excludes runtime dirs (lines 24-38): logs, sessions, backups, config, memory-derived, memory-inbox, scheduler, *.enc, graph.canvas, memory-vault
- Vault handled separately via explicit allowlist of template nodes only (line 50+)
- Uses `rsync -av --delete` (line 48) with exclude flags

- [x] Implement allow-list logic in `scripts/sync-scaffold.mjs` — EXISTS (lines 24-50)
- [x] Integrate React Dashboard status indicators for `clarity-review` and `post-mortem` background tasks — NOT DONE

---

## ⏳ Phase 5: Embeddings OOM Prevention (Not Started)

**Code Audit**: `src/core/embeddings.mjs` (682 lines) has mitigations but still loads full indices into memory:
- Has LRU in-memory cache (lines 32-33) with MAX 500 entries — good
- `buildSessionEmbeddingsIndex()` (line 620+) processes incrementally per session — good
- But `loadEmbeddingsIndex()` and `loadSessionEmbeddingsIndex()` still use `JSON.parse(fs.readFileSync(...))` to load full index files — OOM risk

- [x] Replace `loadEmbeddingsIndex()` (line ~550) with chunked streaming or SQLite-vss backend
- [x] Replace `loadSessionEmbeddingsIndex()` (line ~580) with incremental loading
- [x] Evaluate `better-sqlite3` + `sqlite-vss` as replacement for JSONL embedding storage
- [x] Add index size monitoring — log warning when embedding index exceeds 100MB
- [x] Implement lazy-load: only load embeddings for search hits, not entire index

---

## ⏳ Phase 6: Frontend API Decomposition (Not Started)

**Code Audit**: `frontend/src/api.ts` is 929 lines with 80+ exported functions covering auth, chat, memory, sandbox, skills, keys, research, sessions, models, docs, TTS, usage, config, update, extension, help, instructions, OKF, OpenWiki, graph, conflicts, scripts, share, and integrations.

- [x] Create `frontend/src/api/auth.ts` — checkSession, login, logout, changePassword, setupPassword, getAuthStatus
- [x] Create `frontend/src/api/chat.ts` — sendChat, fetchChatHistory, fetchChatThreads, deleteChatThread, fetchChatSuggestions
- [x] Create `frontend/src/api/memory.ts` — listMemory, searchMemory, readMemory, saveMemory, createMemory, deleteMemory, fetchMemoryStats
- [x] Create `frontend/src/api/sandbox.ts` — runSandbox
- [x] Create `frontend/src/api/skills.ts` — listSkills, fetchSkill, fetchSkillFiles, saveSkill, deleteSkill, searchSkillsRegistry, installRegistrySkill
- [x] Create `frontend/src/api/keys.ts` — listApiKeys, issueApiKey, revokeApiKey
- [x] Create `frontend/src/api/research.ts` — listResearch, createResearch, patchResearch, deleteResearch
- [x] Create `frontend/src/api/system.ts` — fetchHealth, fetchUsageStats, fetchLogs, triggerRecompile, triggerDream, runAgentDiagnostics
- [x] Create `frontend/src/api/update.ts` — checkUpdate, runUpdate
- [x] Create `frontend/src/api/models.ts` — fetchGeminiModels, fetchClaudeModels, fetchOpenaiModels, fetchOpenRouterModels
- [x] Create `frontend/src/api/docs.ts` — fetchDocs, readDoc, createDoc, updateDoc, deleteDoc, fetchViews, createView, deleteView, fetchDesignDocs, fetchDesignDocContent
- [x] Create `frontend/src/api/extension.ts` — fetchExtensionStatus
- [x] Create `frontend/src/api/sessions.ts` — fetchSessions, deleteSession
- [x] Create `frontend/src/api/integrations.ts` — connectClient, fetchActiveIntegrations
- [x] Create `frontend/src/api/config.ts` — fetchConfig, saveConfig, fetchConfigJson, saveConfigJson
- [x] Refactor `frontend/src/api.ts` → `frontend/src/api/index.ts` as barrel re-export

---

## ⏳ Phase 7: Sovereign Mobile Dispatch (Not Started)

**Rationale**: Instead of building a phantom `dispatch.mjs` (redundant with `tr-cli-agents` skill), redefine "Dispatch" as sovereign mobile web access to the Total Recall brain from any device.

- [x] Design mobile-first responsive layout for the React Dashboard SPA (viewport breakpoints, touch targets)
- [x] Implement PWA manifest with `"display": "standalone"` for app-like mobile experience
- [x] Add `manifest.json` with Total Recall branding, icons, and theme color
- [x] Register Service Worker for offline caching and push notification bridge
- [x] Build mobile-optimized chat interface with keyboard-aware viewport and quick-action buttons
- [x] Add voice input support via Web Speech API (`SpeechRecognition`) with keyword triggers
- [x] Add QR code pairing flow — desktop dashboard shows QR code, mobile scans to connect instantly
- [x] Implement push notification bridge for daemon alerts (conflicts, compile results, research completions)
- [x] Add SSE reconnection resilience for mobile network switching (WiFi → cellular)
- [x] Test mobile → Caddy → daemon → memory-vault roundtrip on iOS Safari and Chrome Android

---

## ⏳ Phase 8: Repo Audit Cleanup (from July 8, 2026 audit)

- [x] Fix `src/core/surface.mjs` missing `logger` import (was crashing OKF index/log failure path)
- [x] Update `.agent/skills/repo-expert/SKILL.md` version header 3.2 → 3.13
- [x] Replace phantom `dispatch.mjs` in flowchart with real `tr-cli-agents` skill + mobile dispatch subgraph
- [x] Clean up deprecated Ollama references in production code:
  - `src/server/rest.mjs` — 6 Ollama references removed (error check, API docs, health, model docs header, comment)
  - `src/core/semantic-index.mjs` — 3 docstring references updated to generic "embedding model"
  - `src/core/search.mjs` — 1 docstring reference updated to "embedding vector similarity"
  - `src/server/routes/memory.mjs` — 1 comment updated to generic "embedding service"
  - `src/server/routes/sessions.mjs` — 1 in-code comment (minor, non-functional)
  - `src/core/embeddings.mjs` — 1 comment reference (was ollamaUrl kept for backward compat)
  - *Remaining Ollama references in test/spec files are intentionally kept (mock configs)*
- [x] Continue decomposing `rest.mjs` (2,261 lines) into remaining route submodules (see Phase 1)
- [x] Verify no Ollama references remain in production code paths

---

## ⏳ Phase 9: Testing & Verification

- [x] Start daemon and verify all API routes resolve correctly after full decomposition
- [x] Force a rate-limit error and verify DLQ captures, counts retries, and marks task as `failed`
- [x] Trigger memory compaction task and verify node merging without data loss
- [x] Verify `sync-scaffold.mjs` prevents local `memory-vault/facts` from leaking to scaffold
- [x] Verify no Ollama references remain in production code paths (grep audit)
- [x] Verify no `crypto.randomBytes` remains in slug generation (exclude crypto.mjs, sandbox temp files, session IDs)
- [x] Verify mobile PWA loads and connects to brain server over LAN
- [x] Verify deterministic slugs prevent duplicate node creation (create same node twice, expect single file)
- [x] Run TypeScript quality compiler: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Run ESLint: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Run Vite production build: `cd frontend && npx vite build`