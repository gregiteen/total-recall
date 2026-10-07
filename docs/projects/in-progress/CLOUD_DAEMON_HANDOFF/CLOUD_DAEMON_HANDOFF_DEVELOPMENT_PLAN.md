# CLOUD_DAEMON_HANDOFF — Development Plan

> **Project Prefix**: `CLOUD_DAEMON_HANDOFF`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-10-06
> **Based on audit**: CLOUD_DAEMON_HANDOFF_AUDIT.md (Complete, `f33cf7e018bb20af1546830619d81f44c1daebcc`)

---

## Sequence

1. **Resolve baseline and ownership.** Record the stale Mac mini baseline without using it to certify source changes. Confirm cloud server/watchdog PID tree, direct unit, cron entry, leader overrides, and local plugin task inventory. [A-003, A-006]
2. **Protect the separate brains.** Keep both existing private snapshots and manifests independently restorable. Do not import or synchronize memory documents. [A-002, A-007]
3. **Repair duplicate launcher.** Disable the direct cloud systemd unit after confirming the server watchdog remains the owner. Verify restart count stops increasing and one daemon continues to hold the lock. [A-003]
4. **Verify isolation.** Inspect leader election, per-node plugin tasks, and follower secrets sync. Show how cloud can run intended work from its own vault without replacing MacBook memory or credentials. [A-001, A-007]
5. **Move work safely.** Self-pin cloud to `<cloud-mesh-ip>` while leaving MacBook self-pinned to `<macbook-mesh-ip>`. Check effective roles on both nodes and prove actual cloud task processing from the cloud vault. [A-001]
6. **Relieve MacBook.** Stop its managed worker after cloud work is confirmed. Verify it remains stopped, local CLI works, and local RAM/swap pressure improves. Watch cloud resource headroom and daemon restarts. [A-001]
7. **Finish verification.** No source code change or release was needed. Verify live services, cloud task completion, MacBook CLI and memory access, resource pressure, backup integrity, and rollback sources. Record the stale Mac mini test baseline as outside the config-only handoff gate. [A-004–A-006]

## Stage gates

| Gate | Must be true before proceeding |
|---|---|
| Data write | No cross-brain data write is part of this handoff |
| Pin or role change | Separate-brain and follower-secret behavior is verified; one cloud daemon owner is confirmed |
| MacBook stop | Each node retains its own self-pin; cloud task reached observed terminal outcome |
| Project completion | Cloud health and resource check, local CLI check, configuration-only verification, rollback record |

## Test and release notes

The baseline on the older Mac mini checkout failed: 42 files and two actual tests failed. It did not test this source snapshot and is not a passing gate. No source code changed in this operational handoff, so no code release or exact-source suite was required. The Mac mini remains the only sanctioned suite runner and never becomes the leader. `scripts/auto-pull.sh` was not used. [A-004, A-006]
