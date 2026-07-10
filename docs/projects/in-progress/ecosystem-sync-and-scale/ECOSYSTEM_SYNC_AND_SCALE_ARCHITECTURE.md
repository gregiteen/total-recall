# ECOSYSTEM SYNC AND SCALE: ARCHITECTURE

## 1. The Portable Intelligence Vision
Total Recall is a Universal Intelligence Ecosystem. Its core philosophy is that **intelligence must be portable and instantly accessible**. To achieve this, knowledge is highly granular: **every single idea, spec, or rule is its own isolated `.md` file.**

## 2. The Granular Skill Architecture
Skills are not monolithic files. A skill (e.g., `.agent/skills/ssss/`) is a directory containing dozens of individual `.md` files, each representing a single idea. 

By keeping every idea in its own `.md` file, AI agents (Cursor, Claude Code) can instantly read the exact context they need at lightning speed, without relying on slow CLI lookups.

## 3. Frontmatter-Driven Synchronization
How does the system distinguish between global truths and local quirks? **YAML Frontmatter.**
Total Recall's sync engine parses the frontmatter of every `.md` file to determine its scope:
- **`scope: universal`**: Files like `ssss-spec.md`. The TR daemon actively pushes and updates these files across all registered repositories, guaranteeing they never drift out of sync.
- **`scope: project`**: Files like `local-overrides.md`. The TR daemon strictly ignores these files during sync, preserving the unique context and autonomy of the local project.

This allows universal and repo-specific ideas to live side-by-side in the same directory, driven entirely by metadata rather than rigid folder structures.

## 4. Universal Ecosystem Skills (No TR Prefix)
Core skills like SSSS, OKF, and Project Management are universal standards, not proprietary Total Recall concepts. They exist as top-level, independent skills (`.agent/skills/ssss/`, `.agent/skills/project-management/`) rather than being buried in a `total-recall` namespace. 

The `total-recall` skill exists solely as the gateway instruction manual for how an AI should interact with the TR Daemon and UI.

## 5. The Command Center (UI)
The Total Recall UI provides the human control plane over this granular ecosystem:
- **Cost & Secret Management**: Secure distribution of API keys and ledger tracking for all AI inferences across the ecosystem.
- **OpenWiki**: The critical visualization layer that translates thousands of granular `.md` files (the SSSS memory matrix) into an interconnected, human-readable knowledge graph.
- **Inbox & Tasks**: Observability into the TR daemon's background syncs and autonomous research (`fact-seeker.mjs`).
