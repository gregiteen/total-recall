---
type: skill
name: ssss
description: "Use this skill to inspect, validate, write, and manage SSSS structured semantic memory nodes and VFS specifications. Do NOT use for raw non-schema memory files."
schema_version: 2
---

# SSSS — Structured Semantic Syntax System Manager

Structured Semantic Syntax System (ssss) is the core operational substrate of the Total Recall Virtual File System (VFS). This skill guides agents in inspecting, reading, and constructing SSSS-compliant memory nodes, conflict models, and derived indices.

## Core Directives

1. **Schema Integrity:** Every SSSS node must strictly adhere to the frontmatter schema definitions (Modality, Category, Sentiment).
2. **Zero-Database Persistence:** Do not look for Postgres or SQLite. Everything lives as a git-versioned Markdown file.
3. **Decay and Drift Monitoring:** Use decay indicators to manage node half-lives dynamically in background ticks.

## Progressive Memory Disclosure

Memory flows through a 3-tier progressive hierarchy:
* **Tier 1 (Hot):** INSTRUCTIONS.md shims (Invariants only).
* **Tier 2 (Warm):** SKILL.md injects (Category-routed warm capsules).
* **Tier 3 (Cold):** Full memory vault (Search index files on demand).

## References

* Core SSSS specification: `references/ssss-spec.md`
