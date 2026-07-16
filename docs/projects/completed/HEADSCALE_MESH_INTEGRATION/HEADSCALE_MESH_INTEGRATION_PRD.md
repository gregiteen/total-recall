---
type: project_document
title: "HEADSCALE_MESH_INTEGRATION — Product Requirements"
description: "Product requirements for Headscale mesh VPN, device coordination, and incoming webhook support"
tags: ["project-management", "prd", "networking", "headscale", "webhooks"]
timestamp: 2026-07-15T22:19:00Z
---

# HEADSCALE_MESH_INTEGRATION — Product Requirements

> **Project Prefix**: `HEADSCALE_MESH_INTEGRATION`
> **Priority**: P1 — Security + Daemon Stability
> **Depends on**: NETWORK_SAFETY_AND_SECRETS (fetch gate must exist before mesh traffic flows)
> **Companion**: [Audit](./HEADSCALE_MESH_INTEGRATION_AUDIT.md)

## Problem Statement

Total Recall runs across multiple devices (laptop, Mac Mini, cloud server) with zero encrypted coordination. Devices communicate via plaintext HTTP over LAN, duplicate daemon instances run unknowingly, secrets are manually copied between machines, and there is no mechanism to receive incoming webhooks from external services (GitHub, npm, Stripe).

## Scope

### In Scope

1. **Headscale Server Deployment**
   - Deploy Headscale control server on DigitalOcean (Docker)
   - Configure SQLite backend
   - Set up pre-auth keys for automated node enrollment
   - Configure ACLs for TR device communication

2. **Mesh Client Enrollment**
   - Install and configure Tailscale client on laptop
   - Install and configure Tailscale client on Mac Mini
   - Install and configure Tailscale client on DigitalOcean server
   - Enable MagicDNS: `laptop.mesh`, `macmini.mesh`, `cloud.mesh`

3. **Total Recall Mesh Integration**
   - Daemon binds REST API to Tailscale interface (not `0.0.0.0`)
   - Daemon-to-daemon communication over encrypted mesh
   - Device registry as SSSS VFS primitive (`type: mesh_node`)
   - Single-leader daemon election (only one daemon active at a time across mesh)
   - Remote daemon management (start/stop/status from any mesh node)

4. **Incoming Webhook Ingress**
   - Cloudflare Tunnel → webhook endpoint on daemon
   - Webhook receiver endpoint (`POST /api/webhooks/:provider`)
   - Webhook secret validation (HMAC signatures for GitHub, Stripe, etc.)
   - Incoming events logged as SSSS `event` envelopes
   - Webhook subscription management via VFS (`type: webhook_config`)

5. **Secrets Sync Over Mesh**
   - Encrypted secrets.enc sync between mesh nodes
   - Conflict resolution (latest-write-wins with timestamp)
   - Sync triggered on secret write + periodic heartbeat

6. **Dashboard UI**
   - Mesh status page: connected nodes, latency, health
   - Webhook management: registered hooks, recent events, status
   - Integrated into existing dashboard navigation

### Out of Scope

- Tailscale Funnel / Serve (proprietary, not available in Headscale)
- Multi-tenancy (Headscale is single-tailnet by design)
- Mobile clients (iOS/Android — future consideration)
- Headscale web UI (use CLI or community UI separately)

## Success Criteria

1. All three devices (laptop, Mac Mini, cloud) on encrypted WireGuard mesh
2. Devices addressable by hostname (`macmini.mesh`) instead of raw IPs
3. Only one daemon instance active across the mesh at any time (leader election)
4. GitHub webhooks reach the daemon and are logged as SSSS events
5. `secrets.enc` stays in sync across all mesh nodes
6. REST API only accessible via mesh interface (not exposed to LAN)
7. Dashboard shows mesh node status and webhook activity

## Prioritization (per TR PM Framework)

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Headscale server deploy | Foundation — nothing else works without this |
| P0 | Client enrollment (3 devices) | Foundation |
| P1 | Daemon binds to mesh interface | #1 Data safety — stops exposing API on LAN |
| P1 | Single-leader daemon election | #2 Core daemon loops — prevents duplicate daemons |
| P1 | Secrets sync | #1 Data safety |
| P2 | Webhook ingress | #5 Omnichannel UI |
| P2 | Mesh dashboard UI | #5 Omnichannel UI |
| P3 | Remote daemon management | #6 Polish |

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Headscale server downtime → mesh nodes can't coordinate | WireGuard connections persist after establishment; only new nodes affected |
| NAT traversal failure (Mac Mini behind consumer router) | Headscale DERP relay as fallback |
| DigitalOcean server runs out of resources | Headscale is lightweight (~30MB RAM) |
| Tailscale client updates break Headscale compat | Pin client versions, test before upgrading |
| Webhook secret compromise | Rotate secrets via SSSS, HMAC validation on all incoming hooks |
