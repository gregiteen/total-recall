# SSSS Sovereign AI OS — Product Requirements Document (PRD)

> **Status**: Active / Revised  
> **Date**: May 24, 2026  
> **Author**: Antigravity (Advanced Agentic Coding Subagent)  
> **Target Version**: v1.2.0-pivot  

---

## 1. Executive Summary & Vision

The **Structured Semantic Syntax System (SSSS) Sovereign AI OS** is a localized, filesystem-native, database-free memory and reasoning kernel designed for autonomous AI agents. It operates under the core mandate that **history is provenance and the filesystem is the brain**.

Traditionally, AI context management suffers from massive prompt bloat, high compute overhead from local hardware limitations, and high volatility in cloud API pricing/availability. SSSS solves this by establishing a **Three-Tier Memory Hierarchy** and orchestrating highly specialized commercial and local CLI agents headlessly to process background cognitive cycles.

### Today's Architectural Pivot (May 24, 2026)
To achieve ultimate performance, reliability, and precision, the core architecture has undergone a radical simplification:
1. **Ollama & Local LLM Elimination**: Replaced the local Gemma 4 26B model (via Ollama) with a high-speed, headless **CLI Agent Dispatch Engine** (dispatching Antigravity, Claude Code, and Codex CLI via `spawnSync` from the `.agent/skills/total-recall/skills/cli-agents/agents.yml` registry).
2. **Enterprise-Grade Embeddings**: Replaced local `nomic-embed-text` with Google's state-of-the-art `text-embedding-004` (featuring an OpenAI fallback) driven by `GOOGLE_API_KEY`, achieving unparalleled semantic search precision.
3. **Progressive Disclosure Shims**: Replaced bloated 106KB instruction blocks with a **5-line pointer shim** that dynamically links to the meta-skill `SKILL.md` system. This keeps immediate prompt contexts under 1,000 tokens while allowing subagents to progressively disclose deep domain rules only when needed.
4. **Codebase Purge**: Completely deleted the old `scaffold/` folder (91 files) and the `scratch/` folder (3 files) to reach absolute codebase elegance.
5. **Minimalist Runtime Configuration**: Condensed the complex, redundant `runtime.yml` file into a minimal stub.

---

## 2. Key Product Dimensions & Requirements

### 2.1 The Headless CLI Agent Dispatch Engine
- **Requirement 1**: The daemon loop must run background cognitive tasks (Dream Cycles, post-mortems, conflict resolution, steering, and fact-seeking) using headlessly spawned CLI agents.
- **Requirement 2**: Agent binaries (Antigravity/Gemini CLI, Claude Code, Codex CLI) must be registered in `.agent/skills/total-recall/skills/cli-agents/agents.yml` with precise paths, default models, and permission bypass arguments.
- **Requirement 3**: Dispatches must utilize `spawnSync` (or async equivalents) executing headlessly with stdout/stderr piped directly to temporary log files in `/tmp/*-dispatch-*.log`.
- **Requirement 4**: The system must trigger rich macOS native notifications upon dispatch completion (via `.agent/skills/notifications/scripts/notify.mjs`).

### 2.2 Enterprise-Grade Semantic Search
- **Requirement 1**: High-fidelity vector generation utilizing Google's `text-embedding-004` model.
- **Requirement 2**: Robust fallback to OpenAI's `text-embedding-3-small` or `text-embedding-3-large` in the event of rate limits or service interruptions.
- **Requirement 3**: Flat JSONL-based local semantic indices (`embeddings.json` and `session-embeddings.json` under `.agent/memory-derived/`) to maintain a fully zero-database, serverless posture.
- **Requirement 4**: Cache queries locally (`embeddings-cache.json`) to minimize API roundtrips and ensure blistering-fast local retrieval times (<50ms).

### 2.3 Progressive Disclosure & The 5-Line Pointer Shim
- **Requirement 1**: Prevent prompt bloat by maintaining Tier 1 hot instructions below 1,000 tokens.
- **Requirement 2**: Standard IDE rules must be replaced by a 5-line instruction pointer:
  ```markdown
  # Hot Memory Shim
  You are operating within the Total Recall Sovereign OS.
  Read the meta-skill file (.agent/skills/total-recall/SKILL.md) for full context.
  Search (.agent/memory-vault/) for relevant historical decisions before acting.
  ```
- **Requirement 3**: The surface compiler (`surface.mjs`) must dynamically inject the top-7 relevant memory nodes into the specific domain `SKILL.md` files (Tier 2) based on active topic-to-skill routing tables.

### 2.4 Codebase Hygiene and Footprint Reduction
- **Requirement 1**: Eliminate all vestigial scaffolding and temporary files.
- **Requirement 2**: The old `scaffold/` directory (91 files) and `scratch/` directory (3 files) must be fully expunged.
- **Requirement 3**: Minimalize `runtime.yml` to prevent configuration drift between local and cloud runtimes.

---

## 3. High-Priority Product Enhancements (Post-Pivot Roadmap)

### 3.1 Runtime Usage Limits & Token Tracking (P1)
- **Problem**: Moving from local hardware (Ollama) to cloud APIs (Gemini/Claude) introduces direct financial risks. A runaway subagent loop could consume hundreds of dollars in minutes.
- **Solution**: Implement a unified **Usage Watchdog & Token Tracker**. The daemon must read usage metadata files (such as `~/.claude/stats-cache.json` or Gemini session JSONL files) and block dispatches if daily/weekly budget caps are breached.

### 3.2 Hardened Environment Sandbox (P1)
- **Problem**: Subagents running with `--yolo` or `bypassPermissions` could execute destructive terminal commands (e.g., recursive deletes, unauthorized pushes).
- **Solution**: Harden the sandboxing layer (`src/core/sandbox.mjs`). Implement restrictive POSIX namespaces, enforce CPU/RAM limits, restrict write directories, and block unvetted network domains.

### 3.3 UI Memory Browser & Constellation Graph Updates (P2)
- **Problem**: Deleting local visualizers leaves users blind to the state of their semantic graph.
- **Solution**: Upgrade the SSSS web dashboard. Feed the React-based Constellation Graph with real-time vector relations from `embeddings.json` and `graph-index.jsonl`. Allow the user to browse, edit, and resolve conflicts in their memory nodes directly from a premium glassmorphic UI.

### 3.4 Automatic Backup-on-Uninstall & Secure Purge (P1)
- **Problem**: Running `uninstall` without backing up can lead to permanent data loss if memories were not previously committed. Alternatively, leaving raw, git-tracked memory files behind violates the core "completely clean uninstallation" expectations of users.
- **Solution**: Enhance the uninstaller. The `uninstall` command must automatically detect if a backup remote (Obsidian or Git) is configured. If found, it must push all active memories to GitHub automatically before purging. Once successfully backed up, the uninstaller will execute a complete hard purge, removing all local `.agent/` folders entirely.

---

## 4. Key Performance Indicators (KPIs)

| Metric | Target | Measurement |
|---|---|---|
| **Semantic Fetch Latency** | < 50ms | Time to retrieve top-k nodes from local cosine-cache |
| **Hot Prompt Size** | < 1,200 tokens | Checked on compile by `surface.mjs` |
| **Co-dispatch Success Rate** | > 98% | Completed runs with exit code `0` |
| **Budget Safety Overhead** | 0% overages | Watchdog stops loop exactly at daily cap |
| **Backup-on-Uninstall Success** | 100% | Memory pushed to remote before full VFS purge |
