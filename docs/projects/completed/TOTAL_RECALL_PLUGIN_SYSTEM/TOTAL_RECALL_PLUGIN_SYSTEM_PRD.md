# TOTAL_RECALL_PLUGIN_SYSTEM — PRD

> **Project Prefix**: `TOTAL_RECALL_PLUGIN_SYSTEM`
> **Kanban State**: ✅ Completed
> **Author**: Antigravity & User
> **Date**: 2026-09-05 (Enhanced v2: Core Compatibility Alignment)

---

## 1. Problem Statement & Motivation

As verified in [TOTAL_RECALL_PLUGIN_SYSTEM_AUDIT.md](file:///Users/greg/Github/total-recall/docs/projects/in-progress/TOTAL_RECALL_PLUGIN_SYSTEM/TOTAL_RECALL_PLUGIN_SYSTEM_AUDIT.md), Total Recall requires a standardized **Plugin System** (`plugin.json`) to allow domain extensions (like the Scientific Frontiers Engine) to operate seamlessly alongside core memory and graph routines.

To guarantee zero regression and 100% native interoperability with Total Recall's existing kernel:
1. All plugin knowledge nodes must conform to the canonical `type: memory` standard so `loadNodes()` and the hybrid search engine index them natively.
2. Graph relationships must use Total Recall's native `[[wikilink]]` and frontmatter reference formats to automatically populate Obsidian Canvas and `graph-index.jsonl`.
3. Curiosity-driven research investigations must route directly through Total Recall’s established `POST /api/research` queue and maintain the single living scratchpad standard (`.agent/scratch/research.md`).
4. Connected frontier models must be supplied with **evolving context blocks up to 500,000 tokens** without hitting artificial limits.
5. When external VPS providers (e.g. DigitalOcean) experience downtime, the system must utilize a local **Headscale Virtual Brain mesh** with **Activity Monitoring** to route context, tasks, and notifications directly to the device the user is actively working on.

---

## 2. Scope & Boundaries

### In-Scope
* **Plugin Manifest Standard:** Formal JSON Schema for `plugin.json` declaring metadata, SSSS categories, task envelopes, CLI subcommands, lifecycle hooks, and UI routes (100% terminal-native, zero-MCP).
* **CLI Plugin Subcommands:** `npx total-recall plugin <list|install|remove|enable|disable>`.
* **SSSS Dynamic Category Mounting:** Kernel loader and linter support for custom plugin SSSS categories (`research/`, `benchmarks/`, `user-projects/`), all strictly maintaining `type: memory`.
* **Curiosity Research Queue Hook:** Seamless integration with `POST /api/research` and `.agent/research-queue.jsonl`.
* **Section-Cached Evolving 500k-Token Context Compiler:** Assembling multi-domain capability subgraphs, benchmarks, and active user project state into `memory-derived/evolving-context.md` using SHA-256 section caching and sliding window history.
* **OpenWiki Living Hub:** Automatic generation of domain portals and chronological timelines in `openwiki/` rendered via `OpenWikiPage.tsx`.
* **Headscale Virtual Brain Mesh & "Follow the User" Presence:**
  - Build directly upon the verified `mesh exec`, `mesh doctor`, `harness dispatch`, and `agent spawn` infrastructure.
  - Node presence heartbeats tracking active user interaction timestamps (terminal/GUI activity).
  - Dynamic routing of alerts and active context surfaces to the device the user is actively working on, with heavy compute pinned to dedicated nodes.

### Out-of-Scope
* MCP protocol servers (Total Recall operates entirely via native Unix CLI, filesystem VFS, and standard terminal streams).
* Centralized commercial plugin stores (plugins remain decentralized Git repositories or local folders).
* Arbitrary binary execution outside declared capability sandboxes.

---

## 3. Success Criteria (Measurable & Verifiable)

1. **Vault Cache Visibility:** All plugin capability nodes load cleanly into `getNodes()` and pass `npx total-recall lint` with 0 warnings.
2. **Graph Visualization:** Inspecting `memory-vault/graph.canvas` or visiting `localhost:3000/graph` shows active capability nodes interconnected with native wikilinks.
3. **Research Queue Interop:** Ingestion curiosity loops successfully enqueue tasks via `POST /api/research` and update `.agent/scratch/research.md`.
4. **OpenWiki Zero-Code Rendering:** Visiting `http://localhost:3000/openwiki` renders the plugin's frontiers hub cleanly in the existing dashboard.
5. **Context Block Scaling & Section Caching:** The surface compiler outputs structured evolving context blocks up to 500,000 tokens with incremental section cache hits (<50ms incremental updates).
6. **Activity-Driven Dispatch:** Simulating an activity shift from Node A to Node B redirects test notifications within 5 seconds across the Headscale mesh.

---

## 4. Prioritization & Phasing

* **P0 (Critical):** `plugin.json` manifest specification, SSSS category mounting (`type: memory`), CLI `plugin` commands.
* **P1 (High):** Section-cached evolving 500k context compiler (`src/core/context-cache.mjs`, `evolving-context.mjs`), Curiosity research queue integration (`POST /api/research`).
* **P1 (High):** "Follow the User" presence monitoring and dynamic dispatch routing over Headscale WireGuard mesh.
* **P2 (Medium):** Pluggable dashboard route `/plugins/:id` and native CLI hook runner.
