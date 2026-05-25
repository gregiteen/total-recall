# SSSS Sovereign AI OS — Development Plan

> **Status**: Active / In-Progress  
> **Date**: May 24, 2026  
> **Target Version**: v1.2.0-pivot  

This document outlines the sequential engineering phases required to execute, stabilize, and expand the Structured Semantic Syntax System (SSSS) Sovereign AI OS following the massive architectural pivot on May 24, 2026.

---

## Phase 1: Core Pivot Migration & Cleanup (Completed)

The objective of this phase was to strip away heavy, slow, and unreliable local processing dependencies and replace them with high-fidelity, high-speed remote API and headless CLI agent systems.

### Completed Tasks
- [x] **Local LLM & Ollama Decoupling**: Completely removed the dependency on local Gemma 4 instances running via Ollama.
- [x] **Headless CLI Agent Dispatch Engine**: Engineered a unified dispatch framework (`dispatch.mjs`) targeting `Antigravity`, `Claude Code`, and `Codex CLI` headlessly using a structured registry (`agents.yml`).
- [x] **Google & OpenAI Embeddings**: Replaced `nomic-embed-text` with Google's `text-embedding-004` API with a seamless OpenAI fallback, authenticated securely via `GOOGLE_API_KEY`.
- [x] **Progressive Disclosure Pointer Shims**: Deprecated the monolithic 106KB instruction files. Replaced them with a **5-line pointer shim** that references the meta-skill `SKILL.md` system, dynamically routing granular context only when a specific skill is triggered.
- [x] **Codebase Hygiene Purge**: Completely deleted the old `scaffold/` directory (91 files) and the `scratch/` directory (3 files) to optimize workspace size and load speeds.
- [x] **Runtime Config Reduction**: Compressed `runtime.yml` into a minimal stub.

---

## Phase 2: Runtime Usage Limits & Token Tracking (Completed)

Moving to high-performance commercial models requires robust cost control mechanisms. This phase introduced an automated budget supervisor to monitor, track, and throttle API usage across all dispatched CLI subagents.

### Target Architecture
```
┌────────────────────────┐
│  Headless CLI Dispatch  │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐      Read Stats      ┌─────────────────────────┐
│ Usage Watchdog / Limit │ ◄─────────────────── │ ~/.claude/stats-cache.json
│ Supervisor             │                      │ .agent/sessions/*.jsonl │
└───────────┬────────────┘                      └─────────────────────────┘
            │
            ├──► If budget okay  ──► Spawn Agent Process
            └──► If budget exceeded ──► Terminate Loop & Send macOS Notification
```

### Completed Tasks
- [x] **Unified Stats Scraper**: Developed a robust scraper (`src/core/usage-tracker.mjs`) parsing Claude Code's native `stats-cache.json`, Gemini's JSONL transcripts, and Codex session logs.
- [x] **Daily & Weekly Budget Caps**: Configured hard daily ($5.00) and weekly ($25.00) dollar budget limits in `config/budget.yml` and unified their loading.
- [x] **Pre-Flight Dispatch Gate**: Integrated budget check safety natively into pre-flight runtime loops (`callLocalRuntime` in `src/core/runtime.mjs`) to block runs once limits are breached.
- [x] **Hard Kill Watchdog**: Configured spawnSync execution limits and timeouts to preempt runaway subagent processes.

---

## Phase 3: Sandbox Hardening & Security (Completed)

Because the system headlessly executes subagents with `bypassPermissions` or `--yolo` enabled to achieve autonomy, we implemented a hardened sandbox layer to prevent catastrophic commands and isolate execution.

### Completed Tasks
- [x] **Namespace Isolation**: Configured system sandboxing using macOS `sandbox-exec` default-allow Scheme with targeted denies, and fallback to Linux namespace (`unshare`) isolation.
- [x] **File System Write Restrictor**: Restricted subagent writes exclusively to `/tmp` and active workspace directories, blocking system-wide path modifications.
- [x] **Network Egress Guarding**: Enforced network exfiltration blocks natively in the spawned processes by denying network outbound.
- [x] **Command Execution Whitelist**: Built a central command validation engine (`validateCommand`) that parses, sanitizes, and blocks dangerous deletes, reverse shells, and download pipelines before spawning shell calls.

---

## Phase 4: UI Memory Browser & Constellation Graph (Completed)

Following the deletion of the old visualizers, the frontend was upgraded to support the SSSS v2 node standard and provide clear insight into the agent's semantic memory graph.

### Completed Tasks
- [x] **Constellation Visualizer Migration**: Rebuilt the 3D interactive constellation graph using Three.js / React-Force-Graph logic to visualize semantic connections between SSSS v2 memory nodes.
- [x] **Glassmorphic Vault Browser**: Created a modern, dark-mode, glassmorphic UI under `frontend/` allowing users to search, filter, and read memory nodes directly.
- [x] **Conflict Resolution Interface**: Built an SSE-driven visual panel that highlights quarantined conflict records (`.agent/memory-inbox/conflicts/`) and allows users to manually trigger promotions/supersedes.
- [x] **Live Monitor Integration**: Connected the memory browser to the Live Agent Monitor server (running on port 9111) to show live semantic ingestion updates.

---

## Phase 5: Verification & Integration Testing (Active)

- [ ] **Core Test Suite Re-alignment**: Re-align the Total Recall Test Suite (`.agent/skills/test/SKILL.md`) to verify that `semantic-index.mjs` and `surface.mjs` work perfectly with the new `text-embedding-004` model.
- [ ] **Dry-Run Validation**: Implement automated integration tests simulating parallel subagent dispatch and verifying that progressive disclosure shims correctly route memory capsules.
- [ ] **Performance Benchmarks**: Log semantic search latency, ensuring local cache hits stay under 50ms.

---

## Phase 6: Automatic Backup-on-Uninstall & Full Wiping (Active)

Provide a fully automated uninstaller subsystem that pushes code/memory to GitHub before executing a clean environment teardown.

### Target Architecture
```
[npx total-recall uninstall]
       │
       ▼
[Detect Backup Remotes]
 (Git "backup" remote or config)
       │
  ┌────┴──────────────────────────┐
  ▼ (if remote exists)            ▼ (if no remote)
[Auto-Commit & Push]      [Prompt User / Warn]
       │                          │
  ┌────┴──────────────────────────┘
  ▼
[Execute Complete Teardown]
 - Unload LaunchAgents / plists
 - Kill background daemons
 - Purge ~/.agent (Global VFS)
 - Purge local .agent completely (including memory-vault and skills)
```

### Tasks
- [x] **Backup Remote Auto-Discovery**: Update `uninstall.mjs` to check for configured git backup remotes (`backup` or `origin`) in `.agent/skills/total-recall/`.
- [x] **Automatic Commit and Push Sequence**: Wire the `pushGitBackup` routine into the uninstaller pre-teardown step.
- [x] **Secure Hard Purging**: Wipes the entire local `.agent` folder (including `skills/` and `memory-vault/`) once a successful backup to the cloud has been established, or if the user forces it.
- [x] **Test Coverage**: Write unit and integration tests in `uninstall.spec.mjs` targeting these safety gates, backup sequences, and hard purging behaviors.

---

## Phase 7: Radically Useful UI & Cloudflare Quick Tunnel (Active)

Upgrade the SSSS initialization sequence and frontend dashboard to offer a highly secure, interactive workspace.

### Target Architecture
```
[npx total-recall init]
       │ (Auto-detect cloudflared)
       ▼
[Spawn cloudflared Background Quick Tunnel]
       │
       ▼ (Poll cloudflared.log)
[Capture dynamic trycloudflare.com URL]
       │
       ▼
[Register URL inside wizard-config.json]
       │
       ▼
[Auto-open walkthrough URL in system browser]
```

### Tasks
- [x] **Dynamic Quick Tunnel Spawner**: Update `src/cli/init.mjs` to auto-detect `cloudflared`, spawn a background tunnel redirecting stdout to `logs/cloudflared.log`, capture the generated domain, and write it to `~/.agent/config/wizard-config.json`.
- [x] **Modality Border & Confidence Aesthetics**: Restructure Memory list cards and detail cards to dynamically present border states reflecting modalities (`must` -> emerald, `must_not` -> ruby, `should` -> violet) and sleek HSL progress bars for confidence.
- [x] **Split-Screen HTML Markdown Editor**: Refactor `MemoryPage.tsx` detail panel to enable full frontmatter property editing alongside a side-by-side split screen raw textarea editor and live HTML rendering container.
- [x] **Interactive Scripts Console & Runner**: Engineer a `"Scripts"` tab in `FilesPage.tsx` featuring inline script files editing, saving, and an execution terminal emulator displaying dynamic process streams.

