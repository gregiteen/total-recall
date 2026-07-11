---
title: Total Recall CLI inventory
tags: [cli, TR_CORE_FOCUS]
---

# CLI inventory (core | optional | legacy)

Classification for the portable-memory product focus. Commands remain available unless noted; **core** is what default docs and onboarding emphasize.

## Core

| Command | Role |
|---------|------|
| `init` | Bootstrap global or project brain + openwiki |
| `connect <client>` | Wire IDE / Obsidian / generic HTTP host |
| `remember` / `forget` | Write-path memory |
| `recall` / `search` | Read-path hybrid search |
| `compile` / `rebuild` | Surfaces + indexes |
| `dream` | Sleep-path consolidation |
| `task` | Open daemon task envelope |
| `daemon` | Background worker (ingest, tasks, system dream) |
| `skill` | Registry, deploy, track, multi-repo sync |
| `secret` / `secrets` | Secrets store + usage (not vault) |
| `brain` | List / register / ensure / unregister project brains |
| `status` | Health / brain connection summary |
| `doctor` | Environment diagnostics |
| `help` | Offline help topics |

## Optional

| Command | Role |
|---------|------|
| `research` | Long-horizon research queue (user-enqueued) |
| `share` | Quick capture to remember/research |
| `ingest` | IDE log / takeout ingest (also runs in dream/daemon) |
| `import` | Import existing rule files into vault |
| `export` | OKF bundle export |
| `relay` | Ship local sessions to remote brain |
| `setup` | Interactive provision wizard |
| `deploy` | Host provision (Caddy, tunnels, services) |
| `start` | Foreground brain server |
| `backup` / `restore` | Encrypted VFS backup |
| `config` | security.yml / budget.yml style settings |
| `map` | Vault category visualization |
| `generate-pat` | Dashboard/API PATs |
| `hash-password` / `reset-password` | Dashboard auth helpers |
| `lint` | SSSS schema validation |
| `sync` | Pull remote brain instructions / vault git helpers |

## Legacy / niche

| Command | Role |
|---------|------|
| `chat` | Terminal chat against local server |
| `collab` | Collab sandbox dev server |
| `friction` | Watchdog latency analysis |
| `upgrade` | Kernel model swap helpers |
| `migrate` | Schema migrations |
| `snapshot` | VFS snapshots |
| `command` | Project-local custom CLI commands |

## Not product surface (repo hygiene)

Root one-off scripts (`fix-*.mjs`, `patch-*.mjs`) are **not** CLI entrypoints. Prefer deleting or moving them out of the package root in a follow-up hygiene PR; they are not part of the published command surface.

## Env flags (power)

| Env | Effect |
|-----|--------|
| `TR_IDLE_TASKS=1` | Allow daemon idle task invent |
| `TR_POWER_EXECUTORS=1` | Enable system2 / cutoff / self-diagnosis style jobs |
| `TR_REMOTE_VAULT_SYNC=1` | Optional remote vault content sync |
| `TR_SECRETS_PASSWORD` | AES-encrypt secrets.enc |
| `TR_SYNC_REPOS` | Extra multi-repo roots (`:` / `,` separated) |
