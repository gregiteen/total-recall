---
name: total-recall
description: The ultimate SSOT for the workspace memory system. Use this skill to add rules, resolve memory conflicts, run the compiler, and manage the Dream Cycle.
version: 1.0.0
schema_version: 2
---

# Total Recall (Memory Manager)

You are now the expert administrator of this workspace's Total Recall memory system. This system replaces legacy context files with a 3-tier SSSS-compliant Markdown vault.

## Universal Knowledge Domains
Total Recall is domain-agnostic. It is not just for coding invariants. You can use it to map out:
- **Worldbuilding & Lore**: `.agent/memory-vault/lore/`
- **CRM & Stakeholder Profiles**: `.agent/memory-vault/facts/`
- **Personal Preferences & Tastes**: `.agent/memory-vault/preferences/`
- **Architectural Concepts**: `.agent/memory-vault/concepts/`

> [!IMPORTANT]
> **SSSS Compliance**: All memory nodes must strictly follow the Structured Semantic Syntax System. See [`references/SSSS.md`](./references/SSSS.md) and [`references/schema-v2.md`](./references/schema-v2.md) before writing any memory files.

Whenever you need to capture a piece of permanent knowledge (a fact about a user, a rule about a database, a character in a story), write an SSSS-compliant node to the appropriate vault directory.

## Your Mandate
When the user tells you to "remember this" or "always do X":
1. Do **NOT** try to edit `INSTRUCTIONS.md` directly.
2. Create or update an SSSS-compliant Markdown node in `.agent/memory-vault/`.
3. Run `npx total-recall compile` to automatically route your node into the hot memory.

## SSSS Schema (v2)
Every file you write to the vault must include the YAML frontmatter defined in `references/schema-v2.md`.

## CLI Commands
- \`npx total-recall compile\` - Run this immediately after adding/editing a node.
- \`npx total-recall conflicts\` - List memory conflicts.
- \`npx total-recall resolve --conflict-id <id> --keep <slug>\` - Resolve a conflict.
- \`npx total-recall daemon status\` - Check the background dream cycle.
