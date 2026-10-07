> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.

# CLOUD_DAEMON_HANDOFF — PRD

> **Project Prefix**: `CLOUD_DAEMON_HANDOFF`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-10-06
> **Based on audit**: CLOUD_DAEMON_HANDOFF_AUDIT.md (Complete, `f33cf7e018bb20af1546830619d81f44c1daebcc`)

---

## Problem and outcome

Greg's MacBook remains Total Recall's pinned leader, consuming local memory and CPU. The cloud already runs its own Total Recall server, daemon, and intentionally separate brain; a second systemd unit repeatedly failed on the live daemon's PID lock until it was disabled. Move the intended background work to cloud at `<cloud-mesh-ip>` while preserving each brain's independence and local CLI access. The Mac mini at `<test-mesh-ip>` is solely the test host. [A-001–A-003, A-007]

## Requirements

1. Keep the MacBook and cloud vaults separate. Retain the independent backups already made, and make no cross-brain memory import, copy, merge, or secret replacement. [A-002, A-007]
2. Identify the current cloud daemon lock owner and stop the redundant direct systemd unit's restart loop. Retain one documented supervisor path and verify sustained health. [A-003]
3. Inspect how election and follower secrets sync behave for separate brains. Change the cloud leader setting only after proving the change will not alter the MacBook brain or its credentials. Verify that each node retains its own effective leader pin. [A-001, A-007]
4. Prove cloud processing with a reversible, observed task or equivalent real daemon work, plus logs, task outcome, and health checks. Keep the MacBook self-pinned while disabling its worker; retain CLI and memory access. [A-001]
5. Measure cloud memory, CPU, swap, and restart behavior after the switch; compare the MacBook daemon and host pressure with the pre-switch state. A successful pin alone is insufficient. [A-001, A-003]
6. Preserve a tested rollback: independently restorable brain copies and the previous leader settings. Do not use the cloud auto-pull restart path for a code deployment; any required production release must follow a staged, health-checked switch. [A-002, A-004]
7. Run source tests on the Mac mini if this handoff changes code. For a configuration-only handoff, record the unrelated, stale baseline honestly and use live operational checks for acceptance. [A-006]

## Acceptance criteria

- Both brains remain independent, with no cross-brain vault or secret writes; their backups remain independently restorable.
- One cloud daemon owns the live PID; the redundant unit no longer retries.
- Cloud performs intended work from its own brain; role checks show no unintended MacBook data or credential sync.
- A real cloud task reaches a verified terminal outcome while cloud health remains ready.
- The MacBook worker is stopped, stays stopped, and local CLI use remains functional.
- Post-switch resource and restart observations, applicable verification, and rollback evidence are recorded in the tracker.

## Scope boundaries

- No Mac mini leadership or production workload.
- No copying or merging of memory documents, secrets, indexes, PID files, logs, or node-specific config between the brains.
- No production code deployment merely to change the leader pin.

## Dependencies and risks

- Cloud 3.37.0 and local 3.38.0 differ; keep each brain on its own runtime path and verify role behavior before changing either daemon. [A-001]
- The failed Mac mini baseline and older checkout cannot certify this source tree. No source code was changed or deployed for this handoff; live service and task checks establish its operational outcome. [A-006]
- Cloud memory is finite; check sustained headroom after its leader duties begin. [A-001]
