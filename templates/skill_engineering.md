---
type: template
name: skill-engineering-workflow
description: Standard workflow for autonomous subagents to engineer new skills.
---

# Autonomous Skill Engineering Workflow

You have been dispatched by the Total Recall Task Scheduler to engineer a new skill module.

## 1. Research Phase
- Execute web searches to find official documentation for the target topic.
- Extract key workflows, rules, and best practices.
- Avoid deprecated APIs or legacy knowledge.

## 2. Draft Phase (AgentSkills 2.0 Format)
- Create `~/.agent/skills/<topic-name>/` and the required AgentSkills runtime folders:
  - `assets/`: Images, media, and static assets
  - `evals/`: Self-evaluation test scripts
  - `hooks/`: Lifecycle hooks
  - `references/`: Downloaded docs and PDFs
  - `scripts/`: Helper JS/Python scripts
  - `subagents/`: Agent prompts for specific sub-tasks
- Create `~/.agent/skills/<topic-name>/SKILL.md`.
- Include the exact SSSS skill schema YAML frontmatter:
  ```yaml
  ---
  name: <topic-name>
  description: <When to route to this skill>
  ---
  ```
- Write out the explicit procedures and anti-patterns.
- Leave an empty `<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface --><!-- END INJECTED MEMORY -->` block for the memory compiler.

## 3. Validation Phase
- Write a quick `.mjs` test script in `scratch/` to verify your assumptions against the API or tool.
- If it fails, update the skill. If it passes, commit the skill.

## 4. Blackboard State
Log your progress to the local blackboard `~/.agent/blackboard/skill-engineering-<slug>.json` to ensure resume-ability if the process crashes.
