---
name: skill
description: Manage Total Recall skill registry, deployment and scoped propagation.
repo_scoped: true
repository_id: total-recall-brain
---

<!-- total-recall:skill-router:v1 -->

# Total Recall skills

Inspect `src/core/skills-registry.mjs` and supported CLI contracts for registry/deployment changes. Global methods and repository-specific expertise are separate owners. Declare scope, resolve aliases, verify repository identity and never blindly synchronize all skills.

Use targeted registry/deploy commands, protect `repo_scoped: true`, preserve local overrides and all needed package references/scripts. Never copy vault, credentials or runtime data as templates. Do not promote a foreign repository copy into a global source.

Use `skill optimize` for explicit package/root audits. Default dry-run preserves source; apply only verified lossless candidates. Authored summaries require review of essential constraints. Read deployment/contamination references only for those actions.

Before an operation, read its [task references](references/optimized/index.md), including prerequisites and constraints. If the applicable procedure is unclear, read the preserved original instead of guessing. Commands assume the skill root.
