# TOTAL_RECALL_PLUGIN_SYSTEM — Audit

> **Project Prefix**: `TOTAL_RECALL_PLUGIN_SYSTEM`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity & User
> **Date**: 2026-09-05 (Enhanced v2: Core Compatibility Audit)

---

## 1. Executive Summary & Purpose

This audit evaluates Total Recall's canonical codebase (`gregiteen/total-recall`) to guarantee 100% native compatibility and seamlessness for the **Total Recall Plugin System** (`plugin.json`).

Rather than introducing foreign abstraction layers, this audit aligns the plugin system directly with Total Recall's proven core patterns:
* Canonical `type: memory` node loading (`src/core/vault-cache.mjs`).
* Native `[[wikilink]]` graph compilation and Obsidian Canvas generation (`src/core/surface.mjs`).
* Native research queue task processing (`src/core/research-queue.mjs`, `POST /api/research`).
* OpenWiki frontend rendering (`frontend/src/pages/OpenWikiPage.tsx`).
* Headscale WireGuard overlay mesh and presence routing (`src/server/routes/headscale.mjs`, `src/core/mesh.mjs`).

---

## 2. Current State Analysis & Codebase Findings

### 2.1 The `type: memory` Vault Cache Gate (`src/core/vault-cache.mjs:loadNodes`)
* **Finding**: Line 47 in `CLAUDE.md` and `vault-cache.mjs` explicitly enforce:
  ```javascript
  if (data.type !== 'memory') continue;
  ```
  Non-`memory` types in the vault are invisible to `getNodes()`, `recall`, the Dream Cycle, and the surface compiler.
* **Compatibility Requirement**: All plugin-generated entities (scientific capabilities, benchmarks, user project links) MUST strictly maintain `type: memory`. Specialization occurs via categories (`research/`, `benchmarks/`, `user-projects/`).

### 2.2 Native Wikilink Graph Traversal (`src/core/surface.mjs:extractWikilinks`)
* **Finding**: Total Recall already extracts bidirectional edges from:
  1. `[[slug]]` inline wikilinks.
  2. `[title](slug.md)` relative markdown links.
  3. `related: [slug1, slug2]` and `supersedes: [slug]` frontmatter arrays.
  From these, `generateCanvas()` automatically produces `memory-vault/graph.canvas` and `graph-index.jsonl`.
* **Compatibility Requirement**: The plugin graph weaver must write native `[[slug]]` wikilinks and standard frontmatter relations. This gives immediate zero-code graph visualization in Obsidian and the dashboard graph viewer.

### 2.3 Autonomous Research Queue (`src/core/research-queue.mjs`)
* **Finding**: Background long-horizon research is canonically managed via:
  * File: `.agent/research-queue.jsonl`.
  * Endpoint: `POST /api/research` (`{ topic, priority, notes }`).
  * Invariant: Single living scratchpad under `.agent/scratch/research.md`.
* **Compatibility Requirement**: Plugin-initiated curiosity loops must enqueue directly to `POST /api/research` rather than creating disconnected custom queue formats.

### 2.4 Single-Identity Deduplication Invariant (`CLAUDE.md:40`)
* **Finding**: Memory nodes must never be grouped as duplicates by `predicate:object` alone; the `subject` must always be included. Multiple research projects legitimately share predicate/object pairs (e.g. `tracked_research_project:knowledge_vault`).
* **Compatibility Requirement**: The plugin deduplication engine and SSSS capability generator must strictly enforce unique `subject` entity naming.

### 2.5 OpenWiki Native Rendering (`frontend/src/pages/OpenWikiPage.tsx`)
* **Finding**: `OpenWikiPage.tsx` already renders all files in `openwiki/` with category color coding, badges, and search.
* **Compatibility Requirement**: The plugin's Wiki Scribe outputs standard Markdown files into `openwiki/frontiers/`, `openwiki/timelines/`, and `openwiki/benchmarks/`, rendering instantly in the UI with zero frontend modifications.

### 2.6 Headscale Mesh & DigitalOcean Fallback (`src/server/routes/headscale.mjs`)
* **Finding**: Total Recall has working Headscale REST routes and SSH policy generation.
* **Compatibility Requirement**: Running Headscale locally (via SQLite `headscale.db` + Cloudflare Tunnel) provides an indestructible peer-to-peer mesh when cloud VPS servers are offline. Presence heartbeats (`src/core/mesh-activity.mjs`) route alerts to the user's active device.

---

## 3. Root Cause & Solution Synthesis

| Subsystem | Potential Friction | Seamless Total Recall Alignment |
|:---|:---|:---|
| **Node Types** | Custom `type: capability` gets ignored by loader | Use `type: memory` with `category: research` |
| **Graph Edges** | Custom edge schema breaks Obsidian/GraphPage | Use native `[[slug]]` wikilinks and `related[]` |
| **Curiosity Loops** | Custom scraper bypasses Total Recall scheduler | Enqueue via `POST /api/research` |
| **UI Integration** | Hardcoded `App.tsx` requires manual edits | OpenWiki hub in `openwiki/` + dynamic `/plugins/:id` route |
| **Cloud Downtime** | VPS downtime breaks mesh sync | Local Headscale + P2P WireGuard + Cloudflare Tunnel |
