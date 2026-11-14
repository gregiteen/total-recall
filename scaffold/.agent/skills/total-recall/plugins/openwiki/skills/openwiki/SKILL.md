---
name: openwiki
description: "Multi-repo knowledge graph and documentation wiki engine for Total Recall."
version: 0.4.0
repo_scoped: false
---

# OpenWiki

Multi-repo knowledge graph and documentation wiki engine for Total Recall.

## When to Use

Use the `openwiki` Total Recall plugin (`total-recall openwiki`) instead of ad-hoc scripts or raw commands whenever working on openwiki tasks.

## Commands

```bash
total-recall openwiki --help
total-recall openwiki context  # Retrieve task-relevant wiki and explicitly linked source evidence with provenance and freshness
total-recall openwiki search  # Search evidence passages in workspace, registered-vault or mesh documentation hubs
total-recall openwiki graph  # Extract documentation link topology as JSON, Mermaid or DOT
total-recall openwiki generate  # Generate documentation for the selected registered repository or current workspace
total-recall openwiki token  # Inspect provider credential status or save a provider key through the shared auth owner
total-recall openwiki lint  # Inspect documentation links and orphaned hubs without rewriting files
total-recall openwiki status  # Show which OpenWiki subcommands are implemented
total-recall openwiki hubs  # List indexed OpenWiki hubs and page counts
total-recall openwiki ingest  # Ingest markdown documentation into the semantic knowledge graph
total-recall openwiki bootstrap  # Create missing OpenWiki documentation pages in explicit brain and project directories
total-recall openwiki probe  # Run HTTP 200 health verification probe
total-recall openwiki refresh  # Report which registered projects' generated OpenWiki pages are stale; --apply updates existing wikis (openwiki/ only), never creates one, and skips excluded repositories
```
