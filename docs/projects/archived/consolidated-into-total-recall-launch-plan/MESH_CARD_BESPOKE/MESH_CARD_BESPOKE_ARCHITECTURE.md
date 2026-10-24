# MESH_CARD_BESPOKE — Architecture

> **Project Prefix**: `MESH_CARD_BESPOKE`
> **Kanban State**: 🏗️ In Progress
> **Author**: Claude Sonnet 5.5 agent
> **Date**: 2026-10-23
> **Based on audit**: MESH_CARD_BESPOKE_AUDIT.md (Complete)

## Data

On mount and on refresh the card calls three read commands through `host.run`: `status --json`, `doctor --json`, `leader --json`. They are independent: a failure of `doctor` (slow, SSH to each node) must not blank the fleet figures from `status`. Each result is parsed to an object, and a payload that is not an object is an error, not a zero.

## Verdict (first match wins)

1. `status` unreadable → **Cannot verify the mesh.**
2. `state` is not `connected` → **Mesh is not connected.** (danger)
3. `control.verified` is not true → **Control server is not verified.** (danger)
4. any node with `reachable === false` among those with `sshConfigured` → **N nodes unreachable.** (danger)
5. any node offline → **N nodes offline.** (warn)
6. any node with `access_state` not `configured` → **N nodes have no login recorded.** (warn)
7. `doctor` or `leader` unreadable → **Partly verified.** (warn)
8. otherwise → **Every node reachable.** (ok)

Consequence ordering inside the Fleet screen: unreachable, offline, no login, healthy.

## Screens

- **Fleet** — verdict, four figures (nodes, online, reachable, without login), then a node list ordered by consequence. Each row: hostname, address, OS, three state words, and the reason from `doctor.error` when present. A ping button per row.
- **Control** — control server URL host and verification, this machine's enrollment state and backend state, leader and its strategy, enrollment `checked_at`.
- **Capability** — per node, the runtimes and agent harnesses `doctor` found; an empty list reads "none found", an unprobed node reads "not probed".

## Rendering

Shadow DOM, one `:host` token block, no external requests. Screen flipper uses the `plugin-show-screen` event the host dispatches. Text content is set with `textContent`; payload strings are never interpolated into HTML.
