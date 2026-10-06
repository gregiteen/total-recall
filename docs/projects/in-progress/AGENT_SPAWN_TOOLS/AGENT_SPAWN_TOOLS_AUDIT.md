---
type: project_document
title: AGENT_SPAWN_TOOLS — Audit
description: Why `agent spawn claude` could not run a workflow, why remote spawns failed auth, and the daemon log growth on the test node.
timestamp: 2026-10-06T04:10:00Z
tags: [project-management, meta-harness, agent-manager, logs, secrets]
---

# AGENT_SPAWN_TOOLS — Audit

> **Project Prefix**: `AGENT_SPAWN_TOOLS`
> **Kanban State**: In Progress
> **Date**: 2026-10-05
> **Audit Status**: Complete
> **Audited commit**: 810bda7

## 1. Scope and method

Read `src/core/meta-harness.mjs`, `src/core/agent-manager.mjs`, `src/cli/agent.mjs`, `src/core/mesh.mjs` (`execMeshCommand`), `src/core/cache-prune.mjs`, `src/core/secrets-store.mjs`, `src/core/secrets-keychain.mjs`, `src/cli/secret.mjs` (rekey), `scripts/auto-pull.sh`, and the existing specs. Checked the installed Claude Code CLI (2.1.285) `--help` for `--tools`, `--allowedTools`, `--setting-sources`, `--restricted`. Inspected the sanctioned test node (Mac mini) over recorded mesh access: log sizes, LaunchAgent carriers (values never printed, only compared), Keychain item presence, store decryptability per candidate carrier.

## 2. Inventory

- `HARNESS_SPECS.claude.defaultFlags` = `--output-format json --permission-mode bypassPermissions --setting-sources local --tools '' -p`. Added in ada788b with no recorded rationale.
- `spawnAgent` and `dispatchTask` both use `defaultFlags` verbatim; no caller can choose tools.
- `agent spawn` CLI parses only `--node`, `--name`, `--json`, `--no-detach`; option values (e.g. `--name X`) leak into the task text.
- Remote spawn builds `total-recall agent spawn …` with `JSON.stringify` quoting (double quotes: `$()`/backticks expand on the remote shell) and never forwards a working directory.
- `cache-prune` caps `<brain>/logs/daemon.log` but nothing touches `<agent home>/logs`.

## 3. Runtime surface

CLI `total-recall agent spawn|list|logs|kill`, `total-recall harness dispatch|council`, daemon heartbeat `maybePruneCaches` (6 h throttle), `auto-pull.sh` server restart.

## 4. Data and state

Agent registry `~/.agent/state/active-agents.json`; logs `~/.agent/logs/agents/*.log`. Secrets in AES-GCM `secrets.enc` stores; master password carriers: Keychain (`total-recall-secrets`), LaunchAgent `EnvironmentVariables`, `~/.agent/tr.env`.

## 5. Integrations

Claude Code CLI: `--tools ""` disables all built-in tools; `--tools default` or omission keeps all. Headless auth via `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. Mesh SSH via `execMeshCommand` (login shell PATH prefix, BatchMode).

## 6. Security and privacy

- Remote command quoting allowed shell expansion of prompt text on the remote node (A-004).
- On the Mac mini, `com.totalrecall.daemon.plist` and `com.totalrecall.server.plist` (and two `.bak-20260919` copies) hold `TR_SECRETS_PASSWORD` in plaintext; the value was shown in an agent transcript on 2026-10-05. The same master opens every store on the laptop (Keychain), the Mac mini (14 stores) and the droplet (`/root/.agent/tr.env`, plus a literal export in `/root/.bashrc`). The Mac mini Keychain item holds a stale value that opens nothing.
- Store backups (`secrets.enc.bak-*`) on laptop and droplet are encrypted with the same master.

## 7. Standing-rule conflicts

None with the fix. Rules applied: suites and gates on the Mac mini only; no hardcoded hosts in product code; credentials never printed; rekey runbook (single coordinated replacement via `--stdin`, refresh every carrier, verify old rejected); zero-downtime for droplet production services.

## 8. Quality baseline

Mac mini checkout at cff8686 (3.35.x), installed CLI 3.36.0. Focused specs at 810bda7: `meta-harness.spec.mjs` 3 tests, `agent-manager.spec.mjs` 3 tests, `cli/agent.spec.mjs` 1 test — none cover flags, cwd, quoting or auth. The previous full-suite evidence is in the 3.36.0 release log.

## 9. Debt and dead code

`detectHarnesses` import unused in agent-manager. JSN runner (`portfolio-site/jsn/plugin/commands/workflow.mjs`) bypasses `agent spawn` because of A-001/A-003.

## 10. Deploy and operations

Release through the push skill: gates and full suite on the Mac mini, native isolated boot, `check:dist`, `npm publish --dry-run`, publish, registry confirmation. Hosts pick up `main` via `auto-pull.sh`. Mac mini: `~/.agent/logs/daemon.log` 9.1 GB, `server.log` 138 MB, disk 95% used (12 GiB free). Daemon log content is dominated by a vault-watcher recompile loop (`log.md`/`index.md` change → recompile → change).

## 11. Content and product fit

The help text promised spawning a coding agent for refactors; with zero tools Claude Code can only answer from its prompt, so the product claim was false.

## 12. Findings register

| ID | Severity | Evidence / impact | Disposition |
| --- | --- | --- | --- |
| A-001 | P1-high | `--tools ''` in `defaultFlags` disables every built-in tool for every spawn | Spawns default to all tools; `--tools`/`--allow-tools`/`--no-tools` choose a set; dispatch keeps its tool-less default explicitly |
| A-002 | P1-high | Remote spawn sends no cwd | `--cwd` forwarded; `~` resolved on the target node; missing directory fails fast |
| A-003 | P1-high | SSH/launchd sessions lack the login keychain; Claude auth fails | `CLAUDE_CODE_OAUTH_TOKEN` filled from the secret store when absent |
| A-004 | P1-high | Remote command used double-quote JSON quoting | POSIX single-quote every argument |
| A-005 | P2-medium | CLI leaked option values into the task; unknown flags silently dropped | Real option parser; unknown options rejected |
| A-006 | P1-high | `~/.agent/logs` unbounded (9.1 GB on the test node) | Agent-home size policy, truncate in place; auto-pull appends |
| A-007 | P0-critical | Master password in plaintext LaunchAgents and leaked on 2026-10-05 | Rotate fleet-wide; Mac mini daemon reads the Keychain; plaintext removed from plists |
| A-008 | P2-medium | Vault watcher recompile loop floods the daemon log | Out of scope; tracked as a separate task |

## 13. Impact on the requested change

Touches core harness/agent modules, the agent CLI, cache-prune and auto-pull. No API or schema change; `dispatchTask`/council keep their tool-less default.

## 14. Decisions

- Spawns default to the harness's full tool set and normal settings layers; dispatch stays tool-less and `--setting-sources local` unless the caller overrides.
- Tool selection on a harness without a tools flag is an error, not a silent no-op.
- The OAuth token is read from the global store and never overrides a caller-supplied value; a locked store falls back to the harness's own login.
