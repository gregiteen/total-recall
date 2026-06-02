---
type: skill
name: ssss
description: "Use this skill to inspect, validate, write, and manage SSSS structured semantic memory nodes and VFS specifications. Do NOT use for raw non-schema memory files."
schema_version: 2
---

# SSSS — Structured Semantic Syntax System Manager

Structured Semantic Syntax System (ssss) is the core operational substrate of the Total Recall Virtual File System (VFS). This skill guides agents in inspecting, reading, and constructing SSSS-compliant memory nodes, conflict models, and derived indices.

## Spec Version

Current specification: **v0.2 — Draft** (see `references/ssss-spec.md`)

### v0.2 Changes (2026-05-30)
- Expanded `modality` enum: `must|must_not|should|should_not|descriptive|preference`
- Expanded `priority` enum: `absolute|high|normal|low` (OPTIONAL, defaults to `normal`)
- Added §10.1: Projection Manifest requirement with vault-hash staleness detection
- Added §11.3: Single canonical embedding implementation (no dual systems)

## Core Directives

1. **Schema Integrity:** Every SSSS node must strictly adhere to the frontmatter schema definitions (Modality, Category, Sentiment).
2. **Zero-Database Persistence:** Do not look for Postgres or SQLite. Everything lives as a git-versioned Markdown file.
3. **Decay and Drift Monitoring:** Use decay indicators to manage node half-lives dynamically in background ticks.
4. **Cached Reads:** All vault reads MUST go through `vault-cache.mjs` (`getNodes()`) — never call `loadNodes()` directly. The cache supports multi-directory (global + project) with per-directory `fs.watch` invalidation.
5. **Operation Contract:** All agent-generated mutations MUST flow through `processOperation()` (§6). Direct `writeNode()` calls bypass validation, idempotency, authorization, lease protection, and audit logging.

## Progressive Memory Disclosure

Memory flows through a 3-tier progressive hierarchy:
* **Tier 1 (Hot):** INSTRUCTIONS.md shims (Invariants only).
* **Tier 2 (Warm):** SKILL.md injects (Category-routed warm capsules).
* **Tier 3 (Cold):** Full memory vault (Search index files on demand).

## Performance Invariants

* `vault-cache.mjs` is the **single import point** for all node reads. The cache uses `fs.watch` auto-invalidation and supports multiple vault directories simultaneously.
* `walkMd()` uses `{ withFileTypes: true }` to eliminate per-file `stat()` syscalls.
* `deleteNode()` scans category directories directly — O(categories) not O(nodes).
* Surface recompilation (`triggerMutation()`) is debounced with a 2-second quiet period for batch writes.

## References

* Core SSSS specification: `references/ssss-spec.md`
