---
type: memory
slug: sovereign-cloud-deployment
category: facts
title: "Sovereign OS Cloud Deployment Information"
status: active
confidence: 1.0
importance: 5
created: 2026-05-13T02:38:00Z
updated: 2026-05-13T02:38:00Z
last_accessed: 2026-05-13T02:38:00Z
source:
  type: chat
  session_id: c7a21927-8387-47cd-8230-311262e95021
  agent: antigravity
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [deployment, digitalocean, server, architecture, ssh]
related: [sync-fabric-architecture]
routes_to_skills: []
sentiment_polarity: positive
privacy: local_only
---

# Sovereign OS Cloud Deployment

## Server Details
- **Host Provider**: DigitalOcean
- **IP Address**: `104.131.81.127`
- **SSH Access**: `root@104.131.81.127` (Uses local SSH keys)
- **Deployment Directory**: `/root/total-recall`
- **Agent Vault**: `/root/total-recall/.agent/` (Linked to GitHub repository)

## Live Architecture
- **Web Dashboard**: `http://104.131.81.127`
- **API Endpoint**: `http://104.131.81.127:3000/v1/chat/completions`
- **Memory Explorer API**: `http://104.131.81.127:3000/api/memory`
- **Authentication**: 
  - Dashboard UI: Password-based (Argon2id hash in `.agent/config/security.yml`)
  - API/Agent: Bearer PAT (`local` token defined in `security.yml`)

## Cloud Agent & Cron Operations
- The Cloud Agent runs autonomously without legacy daemons or JS loops.
- **Cron Trigger**: `*/5 * * * * /root/.agent/scripts/agent-trigger.sh`
- **Behavior**: Every 5 minutes, the cron triggers an API call to the agent.
- **Tasks**:
  1. Reads user priorities.
  2. Processes the SSSS task queue (`.agent/scheduler/queue/`).
  3. Reschedules recurring jobs (like `sync-fabric.md` which pushes the vault to GitHub).
  4. Generates idle work (research, pattern recognition).
  5. Sends notifications via Telegram (`scripts/telegram.sh`).

## Deployment Command
To provision a fresh server or apply sweeping architecture changes, run from the local project root:
```bash
npx total-recall deploy --skip-ollama --skip-models --skip-caddy --skip-systemd --domain 104.131.81.127
```
*(Note: Because this is a fallback DigitalOcean droplet, we skip heavy Ollama models and Caddy right now).*
