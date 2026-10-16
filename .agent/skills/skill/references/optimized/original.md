---
name: skill
description: >-
  Use this skill when managing the Total Recall Skill Ecosystem — creating,
  deploying, syncing, or auditing agent skills across repositories.
  MANDATORY: You MUST read the full SKILL.md file before executing.
repo_scoped: true
---

## Total Recall — Skill Management

### What Are Skills?

Skills are structured instruction folders that extend AI agent capabilities. Each skill contains:
- `SKILL.md` — Main instruction file with YAML frontmatter
- `references/` — Additional documentation
- `scripts/` — Helper scripts
- `subagents/` — Subagent definitions
- `evals/` — Evaluation criteria

### Skill Locations

1. **Global skills**: `~/.agent/skills/` — Available to all repos
2. **Project skills**: `.agent/skills/` (repo root) — Repo-specific

### Skill Deployment

The skill deployment core (`src/core/skills-registry.mjs`) handles:
- Central registry tracking in `project-registry.json` and install maps
- Installing skills via `deploySkill` (auto-adapts descriptions to local context)
- Syncing instructions (`syncAllSkillsTwoWay`) across tracked repos
- Respecting `repo_scoped: true` flag to prevent cross-repo leakage

### Key Rules

1. **`repo_scoped: true`**: Skills with this flag MUST NOT be synced to other repos. Use for repo-specific skills like `push`, `security`, `test`.
2. **No blind sync**: Never automatically push ALL skills to all repos. Only explicitly marked global skills should be synced.
3. **Skill audit**: Before syncing, verify the skill content is appropriate for the target repo.

### CLI Commands

```bash
npx total-recall skill status          # List skills and install map status
npx total-recall skill discover        # Scan repos for skills and update registry
npx total-recall skill track <repo>    # Track a new repository for skill sync
npx total-recall skill deploy <name>   # Install/Deploy a skill to a repo
npx total-recall skill sync            # Two-way sync across all known repos
npx total-recall skill push            # Push catalog source to all installs
npx total-recall skill pull            # Pull newest installs back to catalog
```

### Contamination Prevention

A previous cron job blindly pushed skills across all repos, causing cross-contamination (UltraChat skills leaked into Total Recall and vice versa). This has been fixed:
- Cron job removed from `crons.mjs`
- `repo_scoped: true` enforced on repo-specific skills
- Future: Skills Management Upgrade (Phase 12) will add proper global templates with per-repo customization
