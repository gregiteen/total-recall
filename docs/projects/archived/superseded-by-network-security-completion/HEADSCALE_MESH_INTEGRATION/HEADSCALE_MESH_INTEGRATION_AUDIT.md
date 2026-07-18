---
type: project_document
title: "HEADSCALE_MESH_INTEGRATION — Audit"
description: "Pre-implementation audit of current device networking, cross-machine coordination, and webhook ingress for Total Recall"
tags: ["project-management", "audit", "networking", "headscale", "mesh"]
timestamp: 2026-07-15T22:19:00Z
---

# HEADSCALE_MESH_INTEGRATION — Audit

> **Date**: 2026-07-15
> **Auditor**: Agent (automated)
> **Trigger**: User requested Headscale mesh networking + incoming webhooks for Total Recall
> **Depends on**: NETWORK_SAFETY_AND_SECRETS (must complete first — fetch gate + secrets encryption)

---

## 1. Current Device Inventory

| Device | Role | IP | OS | Total Recall Components | Status |
|--------|------|----|----|------------------------|--------|
| MacBook Pro (laptop) | Primary development | DHCP / wifi | macOS | CLI, Dashboard, REST API, Agent integrations | Active |
| Mac Mini | Background compute | `10.0.0.132` (LAN static) | macOS | Daemon, REST API, Dream cycle | Active (daemon disabled after incident) |
| DigitalOcean (production) | Cloud hosting | Public IP | Ubuntu | UltraChat backend, Total Recall brain remote | Active |

### How Devices Communicate Today

- **Laptop ↔ Mac Mini**: Direct SSH over LAN (`ssh mac-mini` via `~/.ssh/config`). No encrypted tunnel. REST API calls go to `http://10.0.0.132:3100` — **plaintext HTTP over local network**.
- **Laptop ↔ DigitalOcean**: SSH over public internet. Cloudflare tunnel for `total-recall-brain` (`config/brain.json` has tunnel URL + TR auth token).
- **Mac Mini ↔ DigitalOcean**: No direct connection configured.
- **No mesh**: Each device is an island. No shared authentication, no automatic peer discovery, no encrypted inter-device communication.

### Evidence: Coordination Gaps

1. **Duplicate daemons**: Laptop and Mac Mini both ran daemon-loop.mjs independently for 6 days. No mechanism to detect or prevent this.
2. **Secrets out of sync**: Mac Mini has its own copy of secrets/config. No automatic sync with laptop's `secrets.enc`.
3. **No remote management**: Cannot stop/start the Mac Mini daemon from the laptop without SSH.
4. **No webhook ingress**: GitHub, npm, Stripe, and other services cannot send webhooks to the daemon. No public endpoint, no tunnel for inbound traffic.

---

## 2. Current Networking Infrastructure

### Ports in Use

| Port | Service | Binding | Auth |
|------|---------|---------|------|
| 3100 | Total Recall REST API | `0.0.0.0` (all interfaces) | PAT token in header |
| 3200 | Total Recall Dashboard | `0.0.0.0` | Session cookie / password |
| 22 | SSH | `0.0.0.0` | Key-based |

### Firewall / NAT

- **Router**: Consumer wifi router, no port forwarding configured
- **macOS firewall**: Default (application-level prompts)
- **No VPN or mesh**: All inter-device traffic is unencrypted LAN or public SSH
- **Cloudflare tunnel**: Only for `total-recall-brain` remote access — not for general daemon coordination

### DNS

- `mac-mini` resolves via `~/.ssh/config` Host alias to `10.0.0.132`
- No MagicDNS or service discovery
- No hostnames for devices — just raw IPs

---

## 3. Headscale Assessment

### What Headscale Provides

| Feature | Relevance to Total Recall |
|---------|--------------------------|
| WireGuard mesh VPN | Encrypted tunnel between all devices — replaces plaintext LAN HTTP |
| MagicDNS | `laptop.mesh`, `macmini.mesh`, `cloud.mesh` — no more raw IPs |
| ACLs | Control which devices can talk to which services |
| Pre-auth keys | Automated node registration for new devices |
| Subnet routes | Mac Mini can expose its LAN services through the mesh |
| Exit nodes | Route traffic through specific devices |
| OIDC auth | Integrate with existing auth if needed |
| Single binary / Docker | Easy to deploy on the cloud server |

### Where to Host the Headscale Server

The Headscale control server needs a stable, always-on host with a public IP for initial peer coordination. Options:

| Option | Pros | Cons |
|--------|------|------|
| **DigitalOcean (recommended)** | Already have infrastructure, public IP, always-on | Adds load to existing server |
| Mac Mini | On-premises, no cloud cost | Behind NAT, not always accessible from outside |
| Dedicated small VPS | Isolated, cheap ($5/mo) | Another thing to manage |

**Recommendation**: Deploy on the existing DigitalOcean server alongside the Total Recall brain.

### Version & Compatibility

- Headscale v0.28.0+ (latest stable as of 2026)
- Compatible with official Tailscale clients on macOS, Linux, iOS, Android
- SQLite backend (recommended for our scale)
- No built-in web UI — community options: Headplane, headscale-ui
- Does NOT support: Tailscale Funnel, Tailscale Serve (proprietary)

---

## 4. Incoming Webhooks — Current State

### Services That Could Send Webhooks

| Service | Webhook Capability | What We'd Get |
|---------|-------------------|---------------|
| GitHub | Push, PR, Issue, Release events | Auto-deploy triggers, issue sync, PR notifications |
| npm | Package publish events | Auto-update skill distribution |
| Stripe | Payment, subscription events | UltraChat billing integration |
| DigitalOcean | Droplet status, monitoring alerts | Infrastructure monitoring |
| Cloudflare | Tunnel status | Connectivity monitoring |

### Current Webhook Setup

**None.** There is no public endpoint for receiving webhooks. The daemon runs behind NAT with no port forwarding. Cloudflare tunnel exists but is only configured for outbound brain access, not inbound webhook ingress.

### Options for Webhook Ingress

| Option | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **Headscale Funnel** | N/A — proprietary Tailscale feature | — | Not available in Headscale |
| **Cloudflare Tunnel (recommended)** | `cloudflared` tunnel to daemon webhook endpoint | Already have CF account, zero exposed ports | Depends on Cloudflare uptime |
| **Ngrok / similar** | Tunnel service | Easy setup | Paid for stable URLs, another dependency |
| **Cloud relay** | Webhook → DigitalOcean → mesh → daemon | Full control | More infrastructure |
| **Direct port forward** | Router NAT to daemon | Simplest | Exposes home IP, security risk |

**Recommendation**: Cloudflare Tunnel for webhook ingress (we already use it for the brain), with Headscale mesh for internal device-to-device traffic.

---

## 5. SSSS Integration Points

| Concern | SSSS Primitive | Notes |
|---------|---------------|-------|
| Mesh node registry | VFS `type: mesh_node` | Each device as a document with Headscale node ID, hostname, IP, status |
| Webhook subscriptions | VFS `type: webhook_config` | Which webhooks are registered, their URLs, secrets, status |
| Incoming webhook events | SSSS `event` envelope | Append-only audit trail of received webhooks |
| Mesh policy / ACLs | VFS `type: mesh_policy` | Access control rules as VFS document, mutations via Core Contract |
| Device health | SSSS `event` envelope | Heartbeat events from each mesh node |

---

## 6. Summary of Findings

| Finding | Severity | Category |
|---------|----------|----------|
| All inter-device traffic is unencrypted | **P1** | Security |
| No device coordination (duplicate daemons) | **P1** | Stability |
| No webhook ingress capability | **P2** | Functionality |
| Raw IP addresses instead of hostnames | **P3** | Usability |
| No remote daemon management | **P2** | Operations |
| Secrets not synced across devices | **P1** | Security |
| Cloudflare tunnel only for brain, not general use | **P2** | Infrastructure |
