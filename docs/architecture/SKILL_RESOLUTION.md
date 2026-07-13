# Skill Resolution Pipeline

This document defines the resolution paths for skills in the Total Recall ecosystem, detailing how the inference engine maps requested skill identifiers to executable instructions and code.

## 1. Resolution Hierarchy (The Pipeline)

When an agent requests a skill (e.g., `test` or `repo-expert`), the system resolves the skill through a strict three-tier hierarchy to ensure maximum security, encapsulation, and override capability. The engine stops at the *first* matching tier.

### Tier 1: Embedded Skills (Repo-Specific Memory)
- **Path**: `{target_repo}/.agent/skills/<skill-name>/SKILL.md`
- **Definition**: Skills that are physically committed to the local repository the agent is currently operating within.
- **Purpose**: These are "Embedded Skills." They are tied directly to the codebase's specific conventions, build scripts, or deployment targets. They allow a repository to ship with its own localized automation logic.
- **Priority**: Highest. If a repository ships a local `test` skill, it completely shadows any global or project-level `test` skill.

### Tier 2: Project Skills (Context Layer)
- **Path**: `<brain_dir>/projects/<project_slug>/.agent/skills/<skill-name>/SKILL.md`
- **Definition**: Skills bound to a specific Total Recall Project Brain context.
- **Purpose**: Used for managing multi-repo workflows where multiple repositories share the same business logic, but the skill shouldn't pollute the global brain.
- **Priority**: Medium. Overrides global skills but yields to embedded repository skills.

### Tier 3: Global System Skills (Identity Layer)
- **Path**: `<global_brain_dir>/skills-registry/skills/<skill-name>/SKILL.md`
- **Definition**: Standardized, cross-cutting skills maintained globally by the user.
- **Purpose**: "System Skills". These handle universal tasks like fetching API docs, researching the web, or managing Total Recall's own daemon. 
- **Priority**: Lowest. Serves as the ultimate fallback.

## 2. Explicit Pipeline Logic

The explicit pipeline is implemented in the `resolveSkillPipeline()` method within the core registry. It guarantees that any lookup operation follows the strict hierarchy.

```javascript
function resolveSkillPipeline(skillName, currentRepoPath, projectBrainDir) {
  // 1. Embedded
  if (currentRepoPath) {
    const embeddedPath = path.join(currentRepoPath, '.agent/skills', skillName);
    if (exists(embeddedPath)) return { type: 'embedded', path: embeddedPath };
  }
  
  // 2. Project
  if (projectBrainDir) {
    const projectPath = path.join(projectBrainDir, '.agent/skills', skillName);
    if (exists(projectPath)) return { type: 'project', path: projectPath };
  }
  
  // 3. Global System
  const globalPath = path.join(getGlobalBrain(), 'skills-registry/skills', skillName);
  if (exists(globalPath)) return { type: 'global', path: globalPath };

  throw new Error(`Skill ${skillName} could not be resolved in any layer.`);
}
```

## 3. Deployment & Synchronization

When a user runs `total-recall skill deploy <skill> --repo <path>`, the system copies the skill from the Global/Project registry into the target repository, officially converting it from a System Skill into an Embedded Skill. The daemon will monitor this drift to ensure the embedded skill remains synchronized with the registry upstream unless deliberately decoupled.
