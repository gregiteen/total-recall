---
type: project_document
title: "NETWORK_SAFETY_AND_SECRETS — Product Requirements"
tags: ["project-management", "security", "networking", "stabilization"]
timestamp: 2026-07-15T22:09:00Z
---

# NETWORK_SAFETY_AND_SECRETS — Product Requirements

> **Project Prefix**: `NETWORK_SAFETY_AND_SECRETS`
> **Priority**: P0 — Core blocker per TR PM Prioritization Framework (#1 Data Safety, #2 Daemon Loops)
> **Predecessor**: TR_STABILIZATION (completed)
> **Follow-up**: HEADSCALE_MESH_INTEGRATION (not yet created)

## Problem Statement

### Network Flooding (Daemon Stability)

The Total Recall daemon has zero centralized control over outbound HTTP requests. Each module (`source-adapters.mjs`, `embeddings.mjs`, `parallel-context.mjs`, `vector-field.mjs`, `fact-seeker.mjs`) fires raw `fetch()` calls independently with no concurrency cap, no per-domain throttling, and no request queuing.

**Impact**: When the daemon runs on any machine (laptop, Mac Mini, remote server), it can open hundreds of simultaneous outbound connections, exhausting NAT tables and crashing consumer wifi routers. On 2026-07-15, the Mac Mini daemon ran unchecked for 6 days (198 hours CPU time), flooding the local network continuously.

### Secrets in Plaintext (Data Safety)

Despite the `.enc` extension and documentation describing AES-256-GCM encryption, both `secrets.enc` files in the Total Recall repo are **plain JSON**. The encryption pipeline exists in `crypto.mjs` but is not being applied.

Additionally, live production credentials (Stripe `sk_live_`, SSH private keys, database connection strings) are scattered across `.env` files, plaintext markdown docs, and config files in 6+ repositories with massive duplication and no rotation tracking.

## Scope

### In Scope

1. **Centralized Fetch Gate** (`throttled-fetch.mjs`)
   - Global concurrency cap (max 6 simultaneous outbound HTTP connections)
   - Per-domain concurrency limits (max 3 per hostname)
   - Request queuing with backpressure
   - Per-request timeout with abort controller
   - Observability endpoint (in-flight, queued, peak stats)

2. **Fetch Gate Wiring**
   - Replace all raw `fetch()` calls in: `source-adapters.mjs`, `embeddings.mjs`, `parallel-context.mjs`, `vector-field.mjs`, `inference-engine.mjs`
   - Add gate stats to `/api/health` endpoint

3. **Secrets Encryption**
   - Actually encrypt `secrets.enc` with AES-256-GCM (the existing `crypto.mjs` pipeline)
   - Ensure CLI `secret set/get/list` commands use the encryption pipeline
   - Ensure runtime `loadRuntimeConfig()` decrypts transparently

4. **Secrets Consolidation Audit**
   - Document which `.env` files across repos contain live secrets
   - Create a migration guide for moving repo-specific secrets into the centralized TR keychain
   - Ensure `.gitignore` coverage for all secret-bearing files

5. **Daemon Coordination Guard**
   - Add a PID lockfile to prevent multiple daemon instances on the same machine
   - Log warning if daemon detects another instance

### Out of Scope (deferred to HEADSCALE_MESH_INTEGRATION)

- Headscale/Tailscale mesh networking between devices
- Incoming webhook ingress
- Cross-device daemon coordination
- Remote secrets sync over encrypted mesh
- Multi-machine deployment orchestration

## Success Criteria

1. Daemon can run 24/7 without exceeding 6 concurrent outbound connections at any time
2. `secrets.enc` is AES-256-GCM encrypted at rest; plaintext is never written to disk
3. No live production API keys exist in plaintext `.env` files within the total-recall repo
4. Gate stats are visible via `/api/health` for monitoring
5. Only one daemon instance can run per machine (PID lock)

## Prioritization (per TR PM Framework)

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Fetch Gate | #2 Core daemon loops — prevents network crash |
| P0 | Secrets Encryption | #1 Data safety — live Stripe keys in plaintext |
| P1 | Fetch Gate Wiring | #2 Core daemon loops — all modules must use gate |
| P1 | PID Lockfile | #2 Core daemon loops — prevents duplicate daemons |
| P2 | Secrets Audit/Migration Guide | #1 Data safety — cross-repo credential hygiene |
| P2 | Health Endpoint | #5 Omnichannel UI — observability |
