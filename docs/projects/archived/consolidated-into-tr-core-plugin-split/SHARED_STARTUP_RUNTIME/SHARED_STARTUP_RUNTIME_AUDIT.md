---
type: project_document
title: SHARED_STARTUP_RUNTIME — Audit
description: CLI-first shared startup health and bounded local repair.
timestamp: 2026-09-30
tags: [project-management, startup, runtime]
---
> **Consolidated 2026-10-07:** Historical source record. Active ownership and priorities moved to [TR_CORE_PLUGIN_SPLIT](../../../in-progress/TR_CORE_PLUGIN_SPLIT/TR_CORE_PLUGIN_SPLIT_PROJECT_TRACKER.md). This record is superseded, not certified complete.


# SHARED_STARTUP_RUNTIME — Audit

> **Project Prefix**: `SHARED_STARTUP_RUNTIME`
> **Kanban State**: In Progress
> **Date**: 2026-09-30

> **Audit Status**: Complete
> **Audited commit**: e5d9aad0dd7d7372363a7d5d0c97349949330446 plus current working tree

## 1. Scope and method
Read whole brief/start/daemon/status/daemon-control/agent-dir/pid-lock files; inspect deploy registration and server health source. Current-tree baseline, not clean-commit attribution.
## 2. Inventory
Authored CLI under src/cli, shared control under src/core; global start skill is reusable source, aliases are generated deployment surfaces. No secrets inspected.
## 3. Runtime surface
brief builtin read-only command; start runs server in foreground; daemon start selects managers/direct. Deploy registers com.totalrecall.server/daemon user launchd units or systemd.
## 4. Data and state
Existing brain config, PID locks and authored command declarations supply discovery. This project adds no persistent runtime registry/database or direct vault writes.
## 5. Integrations
Local process manager and configured brain /health; no provider APIs. Credentials inherited only for trusted existing TR commands, never printed.
## 6. Security and privacy
No shell interpolation; bounded argv children; raw command/log/env/HTTP payloads cannot reach reports. No production restart, remote repair or arbitrary repository startup.
## 7. Standing-rule conflicts
CLI-first; SSSS is tooling/engine, not an invented daemon. Core must be generic and scoped to cwd; tests run remotely/background.
## 8. Quality baseline
Mac-mini full suite: 362 files / 2228 tests, exit0, /tmp/tr-cli-agents.k6cVIM/full-suite-3.log (provided root evidence, pre-edit working tree). Focused/final gates pending after implementation.
## 9. Debt and dead code
brief's child spawn has no error handler/bounds; status and daemon readPid can trust recycled PID. Global start incorrectly suggests command update brief despite builtin implementation.
## 10. Deploy and operations
Existing deployed user launchd service only for server ensure. Missing manager/config yields unconfigured. Recheck readiness after start; no release/deployment.
## 11. Content and product fit
Every /start reports actual shared/server/daemon/tool/app readiness and failures; ordinary brief remains read-only.
## 12. Findings register
| ID | Priority | Evidence | Action |
|---|---|---|---|
| A-001 (SSR-001) | P1 | src/cli/brief.mjs, global start skill | Add shared runtime check/ensure and brief status; correct builtin instructions |
| A-002 (SSR-002) | P1 | src/core/daemon-control.mjs readPid; src/core/pid-lock.mjs | Require process identity, unknown fails closed |
| A-003 (SSR-003) | P1 | src/server/index.mjs /health; src/cli/deploy.mjs units | Validate TR response/lock identity and readiness after bounded local manager start |
| A-004 (SSR-004) | P1 | app command/source declarations | Only current-repo registered explicit app check/start; no inferred cross-repo processes |
## 13. Impact on the requested change
Implement generic startup lane and global workflow; preserve per-repo workflow and evidence limits.
## 14. Decisions
Use existing user launchd service; otherwise report unconfigured rather than inventing process manager. SSSS --help probe only, no auto-install. App commands supplied explicitly by owning start skill and must be current-repo registered commands.

### A-005 (SSR-005) — Public health does not prove usable brain access

Parent observed healthy `/health` alongside authenticated instructions HTTP403. Startup now probes `/api/instructions` with the configured project selector and existing token resolution separately. No scope or credential changes are permitted merely to pass readiness. Synthetic regression requires healthy server plus HTTP403 to remain failed.

### Configured access evidence — 2026-09-30T20:00:38Z

CLI `instructions list --json` reports HTTP403, `Insufficient token scope`, required_scopes `[instructions:read]`. This narrows A-005 from an unknown authenticated failure to a configured permission requirement. Source auth middleware denies absent scope as intended. Do not weaken route authorization, silently substitute a more privileged token or claim readiness; owning connection configuration remains an explicit outstanding requirement. The installed CLI in the separately named app repository passes shared runtime checks with its own connection; this does not prove app health or selected project identity.

### Follow-up audit — transient startup and offline help (2026-09-30)
User requests start/TR skill updates, CLI help repair and research queue cleanup. Live installed startup first reported health/instructions unreachable, later verified healthy without restart; source probes use five-second timeouts. This proves transient failure, not its exact network cause. package.json files excludes docs/reference/cli-reference.md although help.mjs requires it. Doctor considers every occupied port3000 a conflict without checking its owner. Existing Mac-mini working-tree baseline is documented above; focused regressions precede edits and final remote checks follow. No credential changes or unrelated restart. Research cleanup targets pending/in_progress/failed in the current project and global queues, retaining completed reports.
