# CLOUD_DAEMON_HANDOFF — Audit

> **Project Prefix**: `CLOUD_DAEMON_HANDOFF`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex
> **Date**: 2026-10-06
> **Audit Status**: Complete
> **Audited commit**: f33cf7e018bb20af1546830619d81f44c1daebcc (working tree has unrelated changes)

---

## Process note

The operational handoff was discussed and initial inspection was reported in chat before this project record was requested. This audit records the pre-handoff state; the verified final state appears in the tracker. Preserve both brain copies and all unrelated working-tree changes.

## 1. Scope and method

- Request: move background work to the cloud while preserving the MacBook and cloud as intentionally separate brains, repair the competing cloud launcher, verify cloud task processing, then stop the MacBook worker if its local duties can safely stop.
- Repository: `<macbook-checkout>`; project ID `8c613070-caac-4796-b962-2a4928aaad1e`.
- Method: read the election and daemon CLI source, inspected the daemon loop and restart script at cited lines, checked the CLI mesh inventory and leader on both nodes, inspected cloud processes and service state, and counted Markdown files in each global vault. The full vault comparison and backups belong to execution after this planning audit.

## 2. Inventory

- CLI entry: `bin/total-recall.mjs`; daemon loop: `src/core/daemon-loop.mjs`; mesh CLI: `src/cli/mesh.mjs`; leader election: `src/core/leader-election.mjs`.
- The working tree contains pre-existing edits in `src/core/daemon-loop.mjs`, its spec, `src/core/vault-watcher.mjs`, CLI rules files, and scaffold memory files. These are not attributed to this project.
- Touched source sizes: `leader-election.mjs` 112 lines; `daemon-loop.mjs` 785; `daemon-control.mjs` 182; `daemon.mjs` 230; `auto-pull.sh` 249 (`wc -l`).
- Global vaults are outside Git. The tracked scaffold includes selected template memory documents; no global vault document is tracked (`git ls-files`).
- Deployment excludes and backup retention require inspection before operational changes; this plan does not authorize an unverified bulk sync.

## 3. Runtime surface

- `total-recall mesh nodes` currently lists the cloud node as `cloud-node` at `<cloud-mesh-ip>`, the Mac mini at `<test-mesh-ip>`, and this MacBook at `<macbook-mesh-ip>`.
- `total-recall mesh leader --json` reports pinned leader `<macbook-mesh-ip>` and `is_current_node_leader:true` locally; the same command reports `false` on cloud.
- Local `daemon status` reports PID 795. Local `startup check --json` reports shared runtime ready, daemon running, server version 3.38.0, and no declared app readiness.
- Cloud process tree: `bin/total-recall.mjs start` → `src/server/index.mjs` → `src/core/daemon-loop.mjs` (PID 2716008 at audit). Cloud `/health` reports version 3.37.0 and daemon running. Its listener binds mesh and loopback port 3900.
- Cloud `cron.service` runs `scripts/auto-pull.sh` every five minutes. The script kills and restarts checkout processes (`scripts/auto-pull.sh:95-170`). The server starts and watches the daemon (`src/server/index.mjs:960-982`). A second enabled `total-recall-daemon.service` directly starts `daemon-loop.mjs` and restarts on failure; its counter reached 7,771. Journal output identifies the occupied PID lock as its failure reason.
- Election reads `TR_LEADER_IP`, then global brain `config/leader.json`; a pin wins over lowest mesh IP (`src/core/leader-election.mjs:36-90`). Plugin tasks are scheduled per node even when the main loop follows another leader (`src/core/daemon-loop.mjs:380-450`).
- The touched runtime uses `TR_LEADER_IP`, `TR_IDLE_TASKS`, `AGENT_DIR` and mesh authentication; sensitive values must be inspected through their owning CLI, not copied into project documents.

## 4. Data and state

- Current `find` counts are 1,450 Markdown files in `<macbook-brain>/memory-vault` and 490 in `<cloud-brain>/memory-vault`. The numbers differ from the prior chat counts because state changed; file counts alone do not establish recency or uniqueness.
- Archive-derived manifests exclude `index.md`, `log.md`, and macOS AppleDouble metadata: 1,448 MacBook memory documents and 488 cloud memory documents. Only two paths overlap, and both differ. Greg confirmed these are intentionally separate brains; the counts do not call for reconciliation.
- Each node's global brain also holds `config/leader.json`, encrypted secrets, a daemon PID lock, logs, and derived indexes. Preserve each node's vault and configuration independently. Never copy memory documents, credentials, indexes, PID files, logs, or machine-specific config between the brains as part of this handoff.
- Before the handoff, cloud and MacBook global `config/leader.json` both pinned `<macbook-mesh-ip>`; the cloud file was dated 2026-09-20. The MacBook `com.totalrecall.brain.plist` also contained a `TR_LEADER_IP` setting, which overrides the file. The final configuration self-pins each node separately; the MacBook was never repinned to cloud.

## 5. Integrations

- Mesh access is available through `total-recall mesh exec cloud` with recorded access. The CLI resolves cloud to `<cloud-login>`; the Mac mini is only the test host.
- Cloud supervisor is systemd for the redundant unit and cron for the server's auto-pull. The server's watchdog owns the current daemon process.
- Mesh secrets sync uses authorized mesh requests and atomically replaces the follower's encrypted store (`src/core/secrets-sync.mjs:6-64`). Determine whether the proposed pin change would cross the separate-brain boundary before changing it; do not let cloud secrets replace MacBook secrets.

## 6. Security and privacy

- Mesh operations rely on the CLI's recorded SSH access. Do not print private keys, tokens, or encrypted store contents.
- The secrets sync path uses `getMeshSyncAuthorization` (`src/core/secrets-sync.mjs:8,34`). Check both nodes' auth status after the pin change; no credential value belongs in this audit.
- Preserve each node's backup with private permissions. The cloud's smaller vault is intentional, not evidence that it needs MacBook memory.

## 7. Standing-rule conflicts

| Rule | Current question | Evidence | Finding |
|---|---|---|---|
| Background work belongs on the cloud mesh node | MacBook still leads | `mesh leader --json` on both nodes | A-001 |
| Keep node brains separate | Proposed merge contradicted Greg's correction | Greg's explicit correction, 2026-10-06 | A-002, A-007 |
| One managed daemon owner | Redundant systemd service repeatedly fails beside the server watchdog | Cloud process tree, unit and journal | A-003 |

## 8. Quality baseline

- Host and command: sanctioned Mac mini, `npm test` in `<test-checkout>`, started 2026-10-07 04:29 UTC and finished after 205.47 seconds. Raw log `/tmp/tr-cloud-handoff-baseline.log`; status file `.rc` contains `1`.
- Snapshot: mini checkout `cff8686b8d6407f3031884425cffb6105f640d8c` with dirty `knowledge-catalog` submodule. It is older than local audited commit `f33cf7e...`; this baseline cannot certify the local dirty files or current source. No scoped code edit has been made.
- Result: 371 test files passed and 42 failed; 2,321 tests passed and 2 failed. Forty failure files are discovered `knowledge-catalog` Bun tests that Vitest cannot bundle because they import `bun:test`. The other failed tests are `src/cli/doctor.spec.mjs` (expected port conflict, observed verified Total Recall listener) and `src/core/repo-hygiene.spec.mjs` (scaffold skill allowlist mismatch). This is an unclean baseline on the stale mini checkout, not evidence that the current local tree passes.
- Package scripts are `npm test` (Vitest), `check:dist`, and `check:ssss-registry` (`package.json:44-49`). There is no configured TypeScript or ESLint gate for this repo (`.agent/skills/code-quality/config.json`).
- Coverage gaps: live two-node handoff, separate-brain isolation, supervisor ownership, and sustained memory/CPU observations cannot be proved by unit tests.

## 9. Debt and dead code

- The duplicate cloud unit is confirmed, not hypothetical: `NRestarts=7771` at inspection, with journal output naming PID 2716008 as lock owner. The current server is the parent of that PID. The unit is a separate owner and should be disabled after its ownership is documented.
- Source comments in `leader-election.mjs:29-33` and `daemon-loop.mjs:394-397` still assert that the cloud does not run Total Recall. Current cloud process and health evidence contradict those comments; update them only as part of authorized source work and after the audit baseline.

## 10. Deploy and operations

- The cloud server is supervised by cron-driven `scripts/auto-pull.sh`; its watchdog owns the current daemon. The extra systemd unit must not be allowed to take ownership during a restart.
- The current auto-pull script stops checkout processes before restarting the sole server (`scripts/auto-pull.sh:140-170`). That is incompatible with the required zero downtime process for production deployments. Treat any needed cloud code update as a separate staged, health-checked switch with immediate rollback; changing the leader configuration does not itself require replacing the serving server.
- Rollback requires immutable snapshots of both vaults and node configs, an unchanged running cloud server until ready, and the ability to restore the previous leader pin before stopping either daemon.

## 11. Content and product fit

- N/A: this project concerns daemon operations, not user-facing copy.

## 12. Findings register

| ID | Severity | Finding | Evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|---|
| A-001 | P1-high | MacBook remains the pinned leader | Local and cloud `mesh leader --json`; cloud `config/leader.json` | Local memory and CPU pressure | Determine whether leader election can move cloud work without cross-brain data or secrets sync; then transfer safely | Fix in this project |
| A-002 | P1-high | Earlier plan treated the two vaults as copies requiring a merge | Earlier audit text; Greg's explicit correction | A merge would violate intentional brain separation | Remove merge work and preserve each vault independently | Fix in this project |
| A-003 | P1-high | Cloud has two daemon launchers | `systemctl show` restart counter and journal; cloud process tree | Repeated failed starts and ambiguous ownership | Disable the redundant direct systemd unit; retain server watchdog | Fix in this project |
| A-004 | P1-high | Existing auto-pull restarts the sole cloud server | `scripts/auto-pull.sh:140-170` | Potential downtime during a code deployment | Do not use this path for the handoff; stage any future code release separately | Not exercised: configuration-only handoff |
| A-005 | P2-medium | Source comments claim the cloud runs no daemon | `src/core/leader-election.mjs:29-33`; current cloud process tree | Misleading operational diagnosis | Correct comments with a separately tested source change | Documented source debt; no source release in this handoff |
| A-006 | P1-high | Test host checkout is older, has a dirty submodule, and its full suite fails | Mini `git rev-parse HEAD`, `git status --short`, `/tmp/tr-cloud-handoff-baseline.log` and `.rc` | Stale, failed baseline cannot certify current source | Do not claim a clean source gate from it; live-check this configuration-only operation | Not a code-change gate for this handoff |
| A-007 | P1-high | The prior recommendation inferred a missing sync from nearly disjoint vaults | Backup manifests and Greg's explicit correction | False migration requirement and risk of mixing separate brains | Keep both sets separate; verify election and secrets behavior instead | Fix in this project |

## 13. Impact on the requested change

| Requested change | Blocked or shaped by | Findings |
|---|---|---|
| Cloud leadership and local worker shutdown | Separate-brain isolation, launcher ownership, live processing proof, rollback | A-001–A-003, A-007 |
| Any code release or daemon lifecycle change | Zero downtime and exact test snapshot | A-004–A-006 |

## 14. Decisions

| Question | Recommended default | Answer |
|---|---|---|
| Target host | Cloud mesh node at `<cloud-mesh-ip>` | Greg selected cloud in chat |
| Test host | Mac mini at `<test-mesh-ip>` | Standing project instruction; it is not a leadership candidate |

## Completion checklist

- [x] Sections 1–14 supported by live and source evidence, with operational comparisons named as execution tasks
- [x] Baseline tests run on the sanctioned host before scoped code changes; failures and snapshot limits recorded
- [x] Every finding has a severity and disposition
- [x] Audit marked Complete before creating the other four project documents

## Action recording handoff

When the tracker is created, capture the context overflow and successful budget retry, instruction reads, inventory, this audit creation, and all subsequent actions in its final append-only Action Log.

## Final operational finding — 2026-10-07

Cloud self-pins `<cloud-mesh-ip>`, runs one server-owned daemon, and completed task `task-maintenance-fbae68484e` from its own brain. The MacBook retains its `<macbook-mesh-ip>` self-pin and local server, while `DISABLE_DAEMON=true` keeps its worker stopped. Both independent encrypted stores and vaults remained separate; the MacBook encrypted store matched its pre-handoff archive by hash. Eleven hours later, the local worker remained stopped and cloud health was healthy. No source code was changed or deployed for this handoff. The stale Mac mini baseline cannot certify current source, and A-004/A-005 remain observations about existing source outside this operational change.
