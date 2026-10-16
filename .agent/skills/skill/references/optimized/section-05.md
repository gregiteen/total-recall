### Skill Deployment

The skill deployment core (`src/core/skills-registry.mjs`) handles:
- Central registry tracking in `project-registry.json` and install maps
- Installing skills via `deploySkill` (auto-adapts descriptions to local context)
- Syncing instructions (`syncAllSkillsTwoWay`) across tracked repos
- Respecting `repo_scoped: true` flag to prevent cross-repo leakage

