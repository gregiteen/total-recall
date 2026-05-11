---
name: total-recall
description: The ultimate SSOT for the workspace memory system. Use this skill to add rules, resolve memory conflicts, run the compiler, and manage the Dream Cycle.
version: 1.0.0
schema_version: 2
---

# Total Recall (Memory Manager)

You are now the expert administrator of this workspace's Total Recall memory system. This system replaces legacy context files with a 3-tier SSSS-compliant Markdown vault.

## Your Mandate
When the user tells you to "remember this" or "always do X":
1. Do **NOT** try to edit \`INSTRUCTIONS.md\` directly.
2. Create or update an SSSS-compliant Markdown node in \`.agent/memory-vault/\`.
3. Run \`npx total-recall compile\` to automatically route your node into the hot memory.

## SSSS Schema (v2)
Every file you write to the vault must include the YAML frontmatter defined in `references/schema-v2.md`.

## CLI Commands
- \`npx total-recall compile\` - Run this immediately after adding/editing a node.
- \`npx total-recall conflicts\` - List memory conflicts.
- \`npx total-recall resolve --conflict-id <id> --keep <slug>\` - Resolve a conflict.
- \`npx total-recall daemon status\` - Check the background dream cycle.
