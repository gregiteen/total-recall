# Total Recall: SSSS Sovereign AI OS Architecture

> Deep dive into how the Total Recall Sovereign AI System (v3.0) works under the hood.

## Table of Contents

- [Mental Model](#mental-model)
- [The SSSS Memory Architecture](#the-ssss-memory-architecture)
- [Three-Tier Memory Hierarchy](#three-tier-memory-hierarchy)
- [Zero-Parser Kernel & Context](#zero-parser-kernel--context)
- [Continuous Intelligence & Task Scheduler](#continuous-intelligence--task-scheduler)
- [Kernel Tool Suite](#kernel-tool-suite)
- [Tiered Intelligence & Routing](#tiered-intelligence--routing)
- [Omnichannel Interfaces](#omnichannel-interfaces)
- [Workspace Projections](#workspace-projections)
- [Code Mode Sandbox](#code-mode-sandbox)
- [Dream Cycle Coprocessor](#dream-cycle-coprocessor)
- [Security & Disaster Recovery](#security--disaster-recovery)

---

## Mental Model

Total Recall is a **Sovereign AI System** operating as a general-purpose intelligence engine that lives on user-owned infrastructure. It is also the canonical open-source reference implementation for **Structured Semantic Syntax System (SSSS)**, the database-free architecture where memory, logic, agents, models, tasks, workflows, and state are semantically typed files.

UltraChat uses this substrate as the hosted product layer. Total Recall owns the open spec, local brain, validator, CLI, Dream Cycle, and conformance suite. UltraChat owns the product UX, collaboration, model management UI, marketplace, billing, and projection health.

There are no required external databases for canonical operation. The filesystem *is* the database. External stores may exist in downstream products as disposable projections, but the source of truth is SSSS. The system consists of:
1. **The Brain (Host Node):** Runs 24/7 on dedicated infrastructure (e.g., Oracle Cloud ARM VM, minimum 24GB RAM), hosting the SSSS Memory Vault, the local LLM kernel (Gemma 4 26B-A4B), the task scheduler, and API gateways.
2. **The Intelligence:** A combination of a free, 24/7 local workhorse model (Gemma 4) and a pluggable frontier judge (e.g., DeepSeek V4 Pro) for high-stakes evaluations.
3. **The Projections:** Distributed snapshots and generated indexes compiled from SSSS for IDE agents, product UIs, search, embeddings, and compatibility layers.
4. **The Conformance Layer:** Shared fixtures, validators, and migration tests that define what it means to be SSSS-compatible.

## The SSSS Memory Architecture

The core tenet of the architecture is **Markdown is Law**. The state machine, knowledge graph, model catalog, scheduler, and automation engine exist as `.md`, `.yml`, `.jsonl`, and sealed secret artifacts in the Virtual File System (VFS).

### SSSS Primitive Types

- `memory`: Knowledge graph nodes (`slug`, `category`, `status`, `importance`, `modality`).
- `assistant`: System instructions and chat logs.
- `workflow`: Automation pipelines (`[Parallel]`, `[Retry]`, `[Lock]`).
- `model`: Runtime/provider metadata, benchmark notes, costs, and routing policy.
- `task`: Autonomous scheduler work items.
- `proposal`: Staged background optimizer improvements awaiting validation or approval.
- `operation`: Model-emitted SSSS actions to be validated by the deterministic kernel.
- `event`: Append-only ledger/history facts that compile into projections.
- `rule`: Global configurations and logic.

Every file contains semantic YAML frontmatter that is validated at runtime (e.g., via Zod). The kernel reads, writes, and updates these files natively without relying on complex regex parsers or abstract syntax trees. This enables **Recursive Self-Improvement**, where the kernel can identify schema frictions, propose new primitive tags, test them, and autonomously upgrade the SSSS architecture.

## Three-Tier Memory Hierarchy

Memory is stratified to balance context constraints with deep knowledge retrieval:

1. **Tier 1 (Hot Memory):** Injected directly into the system prompt. Contains active behavioral rules and critical invariants (`priority: absolute`, `modality: must`). Latency is 0ms.
2. **Tier 2 (Progressive Disclosure):** Curated knowledge surfaced based on semantic relevance via hybrid BM25 + TF-IDF scoring. Injected into `SKILL.md` files or queried via JSONL indexes.
3. **Tier 3 (Permanent Vault):** The full knowledge graph located in `.agent/memory-vault/`. Contains historical logs, superseded memories, and raw data.

These tiers describe *how memory is surfaced*. Total Recall also tracks *what
cognitive job a memory is doing* with `x_memory_layer`:

- **Conscious (`conscious`)**: immediate working awareness, including absolute invariants, current task context, and active preferences.
- **System 2 (`system2`)**: deliberate reasoning, planning, synthesis, conflict resolution, and eval-backed conclusions.
- **Knowledge Acquisition / Research (`research`)**: externally sourced facts, stale-knowledge refreshes, citations, and draft evidence.

The cooperation loop is Conscious → System 2 → Research → System 2 → Conscious:
active uncertainty opens a deliberation task; deliberation requests evidence when
needed; research writes draft facts; System 2 validates and promotes; the surface
compiler writes `memory-layers.jsonl`, `skill-routes.jsonl`, and Tier 1
instructions from the validated working set.

## Zero-Parser Kernel & Context

The core engine is a locally hosted **Gemma 4 26B-A4B** (released April 2, 2026 by Google DeepMind), running via Ollama. It uses a Mixture-of-Experts (MoE) architecture, with 26 billion total parameters but only ~3.8 billion active during inference, making it highly efficient. It is quantized to Q4_K_M format.

Instead of traditional compilation or database querying, the LLM itself is the parser. The system utilizes **aggressive in-context learning**. The 32K–48K token context window is filled with:
- Hot Memory (Tier 1)
- Semantically retrieved Progressive Disclosure (Tier 2)
- Few-shot examples (curated from past successful executions)
- The current conversation or task

**ARM Ampere A1 KV Cache Optimization:** 
Because the system targets 24GB ARM instances (like Oracle Cloud's Ampere A1), KV cache footprint must be strictly managed. The architecture utilizes `export OLLAMA_KV_CACHE_TYPE=q8_0` (a ~50% reduction in KV cache memory with negligible quality loss) or `q4_0` (an aggressive ~75% reduction), coupled with `export OLLAMA_FLASH_ATTENTION=1`. Managing the context window size (`num_ctx`) ensures the model fits comfortably in the system RAM without triggering OS-level disk swapping.

The system adapts by mutating its memory vault, creating patterns and few-shot examples, rather than requiring frequent fine-tuning. If necessary, cloud-burst LoRA fine-tuning provides an optional upgrade path.

## Continuous Intelligence & Task Scheduler

A background daemon (`dream.mjs`) orchestrates a **priority-driven autonomous task scheduler**, leveraging the fact that local inference has zero marginal cost. 

It dynamically allocates a daily budget of ~1,400–1,900 inference calls across:
- **P0 User-Facing:** Immediate responses and conversations.
- **P1 Memory Maintenance:** Dream cycle, compression, conflict resolution.
- **P2 Skill Engineering:** Proactively building, testing, and refining SSSS skills.
- **P3 Proactive Research:** Web searches to maintain knowledge currency.
- **P4 Self-Evaluation:** Testing capabilities and generating evals.
- **P5 Exploration:** Speculative background work.

## Kernel Tool Suite

The kernel possesses a suite of self-hosted tools to interact with the world:
- **Web Search & Scraping:** Uses an embedded SearXNG container and Mozilla Readability to ingest live data for proactive research and skill-building.
- **VFS Read/Write:** Natively reads and writes to the memory vault.
- **Voice Synthesis:** Real-time speech and narration powered by **Kokoro-82M**, an open-weights (Apache licensed) 82-million parameter Text-to-Speech model. Its lightweight architecture provides incredibly fast, high-quality audio output on edge and low-power CPU systems, often outperforming much larger legacy TTS models.
- **Code Execution:** The Code Mode Sandbox (Node.js/Bash).
- **Task Scheduling & Index Query:** Manages autonomous work queues and searches semantic memory nodes.

## Tiered Intelligence & Routing

The architecture implements a **Confidence-Based Routing** system to balance cost and capability:

- **Local Workhorse (Gemma 4 26B-A4B):** Handles 99% of tasks, including all background processing, memory maintenance, and standard conversations, for free.
- **Frontier Judge (BYOK / Any OpenAI-Compatible API):** Evaluates complex reasoning tasks, quality gates, and self-built skills. Standardized on **DeepSeek-V4-Pro** (released April 24, 2026). DeepSeek-V4-Pro is a 1.6-trillion parameter MoE model (49B active) featuring a hybrid attention architecture (CSA/HCA) that excels at long-horizon reasoning and complex software engineering at a highly competitive cost. (Alternatively, DeepSeek-V4-Flash can be used for a lighter, more economical variant).

The local kernel assesses its confidence; if a task exceeds its capabilities or requires validation, it seamlessly escalates to the frontier model. Corrections from the frontier model are written to the VFS, serving as few-shot examples that continuously improve the local model's future performance.

## Omnichannel Interfaces

The system exposes four interface layers concurrently:

1. **Standalone Dashboard:** A React SPA providing a chat interface, rich-text SSSS editor, task scheduler UI, memory graph explorer, and system management tools. It enforces the *CLI/UI Parity Mandate* (anything doable in CLI has a UI equivalent).
2. **Direct Model API:** An OpenAI-compatible `/v1/chat/completions` endpoint exposed directly by Ollama for webhook integrations, Siri Shortcuts, and custom scripts.
3. **MCP Gateway:** A stateless Streamable HTTP endpoint adhering to the **Model Context Protocol (MCP)**. Originally created by Anthropic and donated to the Linux Foundation's **Agentic AI Foundation (AAIF)** in December 2025, MCP acts as a vendor-neutral standard for AI connectivity. It allows remote agents (Claude Desktop, Cursor) to securely connect to and read the Sovereign Memory Vault live, escaping isolation.
4. **MCP Apps:** Embeds the visual dashboard as an interactive app within compatible MCP clients via `postMessage` JSON-RPC.
5. **CLI (`total-recall`):** The primary automation interface for deploying the brain, syncing workspaces, and compiling memory.

## Workspace Projections

Total Recall operates as a centralized brain with distributed projections. 
Workspaces (e.g., local git repositories) sync read-only compiled memory from the brain via the CLI:
- `total-recall init`: Registers the workspace and scaffolds the local `.agent/` directory.
- `total-recall sync`: Pulls compiled Tier 1 rules (`INSTRUCTIONS.md`) and injects Tier 2 memory blocks directly into local `SKILL.md` files (using HTML comments to preserve human edits).

IDE agents can either connect live via the MCP Gateway or read the synchronized local projections as a fallback offline-capable mode.

## Code Mode Sandbox

The kernel executes generated scripts (Node.js/Bash) in an isolated sandbox to interact with external APIs natively. 
- **Isolation:** Scoped filesystem access (`~/.agent/`), memory caps (512MB), process limitations, and execution timeouts (60s).
- **Credentials:** Injected at runtime via mustache syntax (`{{secrets.*}}`) from an AES-256-GCM encrypted keychain. Secrets are never persisted in plaintext Markdown.
- **Feedback Loop:** `stdout`/`stderr` are piped back to the kernel for self-reflection and error recovery.

## Dream Cycle Coprocessor

The `dream.mjs` daemon performs essential background memory maintenance across distinct phases:

- **Phase 1: Light Sleep (Scan & Ingest):** Scans recently modified VFS files and session logs to extract candidate memory observations.
- **Phase 2: REM (Conflict Detection):** Evaluates new nodes against the active vault using a 2-layer algorithm (O(1) semantic ontology check + fuzzy similarity). Detects contradictions and surfaces them to `memory-inbox/conflicts/` for explicit human resolution.
- **Phase 3: Deep Sleep (Recompile):** Rebuilds memory indexes, computes hybrid BM25 + TF-IDF routing tables, updates skill capsules, and compiles Tier 1 instructions.

## Observability & Automated Triggers

Extensive, structured logging is enforced across all subsystems via immutable JSONL streams. A dedicated `watchdog.mjs` daemon constantly tails these logs in real-time. When `yolo_mode` is enabled for full automation, the watchdog acts as both a deterministic audit trail and an active safety net by executing automated triggers:
- **Sandbox Circuit Breakers:** Automatically quarantines any SSSS workflow that registers consecutive non-zero exit codes in the sandbox to prevent runaway execution loops.
- **Exfiltration Anomalies:** Triggers instant API routing suspensions if abnormal token limits or unauthorized domains are detected in the Frontier Judge logs.
- **Resource Recovery:** Automatically flushes the KV cache or triggers log rotation if inference latency spikes or disk space constraints are breached.

## Security, Privacy & Disaster Recovery

- **Data Sovereignty & Privacy:** A strict "Frontier Firewall" intercepts all outbound requests to cloud models (Frontier Judges). Memory nodes tagged with `privacy: local_only` (default for preferences and invariants) are aggressively redacted. Global settings default to `allow_frontier_export: ask_per_skill` to prevent accidental PII leakage. Users can opt-in to 100% automation by setting `allow_frontier_export: always` (YOLO Mode).
- **Code Isolation:** The Node.js/Bash sandbox defaults to a strictly offline network namespace. Explicit user approval is required for scripts declaring `needs: [network]`. For fully autonomous execution, a global `yolo_mode: true` toggle bypasses these manual safety blocks.
- **Encryption at Rest:** The entire SSSS Virtual File System is encrypted at the block volume layer. Execution secrets are AES-256-GCM encrypted in the keychain.
- **Network:** TLS termination via Caddy, strict IP allowlisting (optional), and token bucket rate limiting on all APIs.
- **Auth:** Session-based auth (bcrypt + TOTP) for the Dashboard; Bearer PATs for the API; OAuth 2.1 for MCP with rigorous scopes.
- **Backup Strategy:** Configurable nightly encrypted tarballs (AES-256 GCM) of the `~/.agent/` directory mapped to local, rsync, or S3-compatible destinations with a ≤24h RPO.
- **Portability:** The entire VFS can be exported via `total-recall export` and imported onto any POSIX-compliant host.
