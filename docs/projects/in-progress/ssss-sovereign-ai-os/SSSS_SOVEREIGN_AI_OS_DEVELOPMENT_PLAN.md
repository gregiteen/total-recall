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

## Phase 2: Runtime Usage Limits & Token Tracking (P1 Priority)

Moving to high-performance commercial models requires robust cost control mechanisms. This phase introduces an automated budget supervisor to monitor, track, and throttle API usage across all dispatched CLI subagents.

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

### Planned Tasks
- [ ] **Unified Stats Scraper**: Write a core service (`src/core/usage-tracker.mjs`) capable of parsing Claude Code's native JSON stats (`~/.claude/stats-cache.json`) and reading tokens from Gemini's JSONL session log transcripts.
- [ ] **Daily & Weekly Budget Caps**: Define hard dollar caps (e.g., $5.00/day or $25.00/week) in `config/frontier.yml` or a new `usage.yml`.
- [ ] **Pre-Flight Dispatch Gate**: Integrate the watchdog directly into the `dispatch()` flow in `dispatch.mjs` to block execution if limits have been breached.
- [ ] **Hard Kill Watchdog**: Monitor active processes and immediately send a `SIGKILL` if a single agent session runs in an infinite loop and exceeds its per-task spending threshold.

---

## Phase 3: Sandbox Hardening & Security (P1 Priority)

Because the system headlessly executes subagents with `bypassPermissions` or `--yolo` enabled to achieve autonomy, we must implement a hardened sandbox layer to prevent catastrophic commands and isolate execution.

### Planned Tasks
- [ ] **Namespace Isolation**: Configure system sandboxing using isolated POSIX namespaces or Docker containers when available.
- [ ] **File System Write Restrictor**: Modify `src/core/sandbox.mjs` to strictly isolate file modifications to git worktrees or predefined workspace directories, blocking writes to system files or global configs.
- [ ] **Network Egress Guarding**: Implement a firewall script to restrict subagent network calls to whitelisted developer domains and API endpoints, preventing unauthorized data exfiltration.
- [ ] **Command Execution Whitelist**: Intercept bash commands requested by subagents and block high-risk commands (e.g. `rm -rf /`, `curl | bash`) before they reach the OS.

---

## Phase 4: UI Memory Browser & Constellation Graph (P2 Priority)

Following the deletion of the old visualizers, the frontend must be upgraded to support the new SSSS v2 node standard and provide clear insight into the agent's semantic memory graph.

### Planned Tasks
- [ ] **Constellation Visualizer Migration**: Rebuild the 3D interactive constellation graph using Three.js / React-Force-Graph to visualize semantic connections between SSSS v2 memory nodes.
- [ ] **Glassmorphic Vault Browser**: Create a modern, dark-mode, glassmorphic UI under `frontend/` allowing users to search, filter, and read memory nodes directly.
- [ ] **Conflict Resolution Interface**: Build an SSE-driven visual panel that highlights quarantined conflict records (`.agent/memory-inbox/conflicts/`) and allows users to manually trigger promotions/supersedes.
- [ ] **Live Monitor Integration**: Connect the memory browser to the Live Agent Monitor server (running on port 9111) to show live semantic ingestion updates.

---

## Phase 5: Verification & Integration Testing

- [ ] **Core Test Suite Re-alignment**: Re-align the Total Recall Test Suite (`.agent/skills/test/SKILL.md`) to verify that `semantic-index.mjs` and `surface.mjs` work perfectly with the new `text-embedding-004` model.
- [ ] **Dry-Run Validation**: Implement automated integration tests simulating parallel subagent dispatch and verifying that progressive disclosure shims correctly route memory capsules.
- [ ] **Performance Benchmarks**: Log semantic search latency, ensuring local cache hits stay under 50ms.
