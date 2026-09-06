# TOTAL_RECALL_PLUGIN_SYSTEM — Architecture

> **Project Prefix**: `TOTAL_RECALL_PLUGIN_SYSTEM`
> **Kanban State**: ✅ Completed
> **Author**: Antigravity & User
> **Date**: 2026-09-05 (Enhanced v2: Core Compatibility Alignment)

---

## 1. Architectural Overview & Design Principles

The Total Recall Plugin System transforms Total Recall into an extensible, decentralized personal operating system while strictly preserving its original architectural invariants:
1. **Zero Database / Pure Filesystem Brain:** All persistent knowledge resides in Markdown VFS documents with YAML frontmatter under Git.
2. **Canonical Memory Invariant:** All plugin knowledge nodes strictly enforce `type: memory` so `loadNodes()`, `getNodes()`, and hybrid search index them natively.
3. **Native Wikilink Graph Weaving:** Uses `[[slug]]` wikilinks, relative markdown links, and `related: []` frontmatter, allowing Total Recall's `surface.mjs` to automatically generate `memory-vault/graph.canvas` and Obsidian edges.
4. **Native Research Queue Loop:** Plugin curiosity loops enqueue investigations directly to `POST /api/research` (`.agent/research-queue.jsonl`) and maintain the single living scratchpad in `.agent/scratch/research.md`.
5. **Evolving 500k Context Surfaces:** The compiler generates multi-domain, deep context blocks up to 500,000 tokens for modern frontier models.
6. **Virtual Brain Mesh with Activity Monitoring:** Self-hosted Headscale with Cloudflare Tunnel fallback connecting devices peer-to-peer over WireGuard (`100.64.0.0/10`), dynamically routing context and alerts to the user's active device.

---

## 2. Component Topology & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLUGIN MANIFEST: plugin.json                    │
│   Metadata • SSSS Categories • Tasks • MCP Tools • OpenWiki & UI Maps  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     TOTAL RECALL KERNEL HOST                           │
│                                                                        │
│   ├── Plugin Registry (`src/core/plugin-loader.mjs`)                   │
│   │   ├── Mounts custom categories into `loader.mjs` & `lint.mjs`      │
│   │   ├── Enqueues tasks via `scheduler.mjs`                           │
│   │   └── Exposes `/api/plugins` to Dashboard & CLI                    │
│   │                                                                    │
│   ├── Research Queue Engine (`src/core/research-queue.mjs`)            │
│   │   ├── Receives curiosity tasks from `POST /api/research`           │
│   │   ├── Single living scratchpad: `.agent/scratch/research.md`       │
│   │   └── Commits validated nodes to `memory-vault/`                   │
│   │                                                                    │
│   ├── Virtual Brain Mesh & Presence (`src/core/mesh-activity.mjs`)     │
│   │   ├── Headscale WireGuard overlay (`100.64.0.0/10`)                │
│   │   ├── Cloudflare Tunnel resilient control plane                    │
│   │   └── "Follow the User" dynamic dispatch router                    │
│   │                                                                    │
│   └── Canonical SSSS VFS Vault (`memory-vault/`)                       │
│       ├── core categories (facts, invariants, patterns, etc.)          │
│       ├── research/        (atomic capability breakthroughs)           │
│       ├── benchmarks/      (world records & Pareto trade-offs)         │
│       └── user-projects/   (user's local codebases & lab data)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  EVOLVING 500K   │      │  UNIX CLI TOOLS  │      │  LIVING OPENWIKI │
│  CONTEXT BLOCK   │      │ Native Subshells │      │ `openwiki/` hub  │
│  `evolving-      │      │ & Lifecycle Hook │      │ rendered in      │
│  context.md`     │      │ Execution        │      │ `OpenWikiPage`   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## 3. Plugin Specification Schema (`plugin.json`)

```json
{
  "$schema": "https://total-recall.ai/schemas/plugin-v1.json",
  "id": "scientific-frontiers",
  "name": "Scientific Frontiers Engine",
  "version": "1.0.0",
  "description": "Continuous capability and breakthrough ledger across hard sciences",
  "license": "MIT",
  "entrypoint": "./crates/frontier-daemon/target/release/frontier-daemon",
  "ssss_schemas": {
    "categories": [
      {
        "name": "research",
        "description": "Atomic capability breakthroughs",
        "node_type": "memory",
        "template": "./schemas/capability-node.template.md"
      },
      {
        "name": "benchmarks",
        "description": "Current world record metrics",
        "node_type": "memory",
        "template": "./schemas/benchmark-node.template.md"
      },
      {
        "name": "user-projects",
        "description": "User local science, codebases, and experimental findings",
        "node_type": "memory",
        "template": "./schemas/user-project-node.template.md"
      }
    ]
  },
  "tasks": [
    {
      "intent": "Ingest daily frontier preprints (arXiv, OpenAlex, bioRxiv)",
      "schedule": "0 */4 * * *",
      "capability": "vault:write"
    }
  ],
  "cli": {
    "command": "frontier",
    "binary": "./crates/frontier-daemon/target/release/frontier-cli",
    "subcommands": [
      { "name": "search", "description": "Search frontier capabilities" },
      { "name": "graph", "description": "Traverse capability dependency graph" },
      { "name": "blockers", "description": "Query user project blockers" },
      { "name": "records", "description": "Display benchmark Pareto frontiers" }
    ]
  },
  "hooks": {
    "on_compile": "node ./scripts/compile-hook.mjs",
    "on_ingest": "node ./scripts/ingest-hook.mjs"
  },
  "ui": {
    "route": "/frontiers",
    "label": "Frontiers",
    "icon": "Atom",
    "openwiki_hub": "openwiki/frontiers/index.md"
  },
  "notifications": {
    "channels": ["local_desktop", "ntfy_webhook"],
    "min_tier": "peer_reviewed"
  }
}
```

---

## 4. Virtual Brains & "Follow the User" Activity Monitoring

### 4.1 Cloud-Free Headscale + Cloudflare Tunnel
* Headscale runs locally (e.g. on home Mac Mini or workstation) with SQLite persistence (`headscale.db`).
* A persistent Cloudflare Tunnel (`cloudflared`) maps an HTTPS URL to the local Headscale control port.
* When cloud VPS servers (e.g. DigitalOcean) are down, all devices maintain seamless connectivity worldwide with zero open router ports.

### 4.2 Presence Sensor & Dynamic Dispatch (`src/core/mesh-activity.mjs`)
* Each connected node monitors user activity (keyboard, active IDE window, terminal focus).
* Active node emits presence heartbeat over Headscale (`100.64.0.0/10`):
  ```json
  {
    "node_id": "macbook-pro",
    "mesh_ip": "100.64.0.5",
    "user_active": true,
    "last_interaction": 1788502400000,
    "active_surface": "antigravity"
  }
  ```
* **Dynamic Routing:**
  * Real-time notifications and newly compiled instruction surfaces route to the currently active device.
  * Heavy computational tasks (crawling, Rust ingestion, vector embeddings) remain anchored on idle compute nodes (e.g. Mac Mini).

---

## 5. Section-Cached Sliding Evolving Context Compiler

Total Recall’s surface compiler continuously maintains an evolving **100k–500k token context block** under `.agent/skills/total-recall/memory-derived/evolving-context.md`. Rather than recomputing massive context blocks from scratch on every turn, the engine uses **Section-Cached Sliding Context Assembly** ([src/core/context-cache.mjs](src/core/context-cache.mjs)):

### 5.1 Content-Addressable Section Caching
* **Granular Section Hashes**: The context block is partitioned into distinct semantic sections:
  1. `## Active User Science & Project State` (local git branch, project goals, blocker requirements)
  2. `## SOTA Benchmark Ledger & Pareto Frontiers` (certified records, metric ceilings)
  3. `## Verified Capability Breakthroughs` (empirical papers, unlocked subgraphs)
  4. `## Active Curiosity Vectors` (open research questions, unmapped capability gaps)
* **SHA-256 Section Digests**: The compiler hashes the concatenated frontmatter + content of each section's underlying SSSS nodes.
* **Instant Assembly**: Unchanged sections hit the in-memory cache instantly (<1ms), avoiding costly string concatenation, token counting, and formatting overhead.

### 5.2 Sliding Context Window & Chronological Integrity
* **No Lossy Compaction**: Emulates Antigravity's non-compacting transcript architecture. Rather than lossy LLM summarization that erases subtle technical constraints, history rolls in a deterministic sliding window.
* **Bi-Directional Graph Weaving**: Nodes declare explicit upstream/downstream relationships (`unlocks_capabilities: []`, `requires_capabilities: []`). The compiler traverses dependency subgraphs up to depth 3 to inject only structurally relevant context.
* **Zero Cutoff Blindness**: Frontier models (Antigravity, Claude, Gemini) receive freshly verified breakthrough facts, world records, and empirical methodology tables directly in their prompt context surface.
