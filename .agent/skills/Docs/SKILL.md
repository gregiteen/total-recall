---
name: docs
description: "Use this skill when managing, searching, or purging project documentation under the Diátaxis architecture. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /docs
---

# Docs & Knowledge Hub (Diátaxis Architecture)

Use this skill to manage, organize, and prune the project's documentation. We strictly enforce the **Diátaxis (4-plane) framework** to ensure docs do not rot or clutter the root repository.

## The 4 Planes (plus Project Management)
All documentation MUST live in one of the following directories within `/docs/`:
1. **`/docs/tutorials/`**: Learning-oriented. Step-by-step onboarding for new developers.
2. **`/docs/how-to/`**: Goal-oriented. Specific recipes for completing tasks (e.g., "How to deploy").
3. **`/docs/reference/`**: Information-oriented. API contracts, database schemas, SSOTs.
4. **`/docs/developer/`**: Understanding-oriented. Global PRDs, Architecture, and system design docs.
5. **`/docs/projects/`**: Trackers, epics, and development plans inside `planned/`, `in-progress/`, or `archived/`.
6. **`/docs/business/`**: Business and marketing plans.

> **CRITICAL RULE**: The root directory (`/`) must NEVER contain random `*.md` files. Only `README.md`, `INSTRUCTIONS.md`, and IDE sync files are allowed in root.

## Automated Garbage Collection

To enforce repo cleanliness, this skill includes a Garbage Collector script. When the user asks you to organize docs, clean the repo, or when you notice root clutter, run:

```bash
node .agent/skills/docs/scripts/audit-docs.mjs
```

This script will:
1. Ensure the directory structure exists.
2. Sweep the root directory for any stray markdown files.
3. Automatically categorize and move them into the correct folder.

## Documentation Standard

When creating new documents, ensure they use the standard header:

```markdown
# [Title]

- **Plane**: [Tutorials | How-To | Reference | Developer | Projects | Business]
- **Last Updated**: [YYYY-MM-DD]
- **Summary**: [1-2 sentence overview]
```

## Maintenance & Lifecycle
- **Never hoard docs**: If a document is out of date, either update it or delete it. Do not let dead documentation linger.
- **Sync Architecture**: When modifying the database or an API, update the corresponding `/docs/reference/` file immediately.
