---
name: project-management
description: "Use this skill when managing GitHub issues, pull requests, and project tracker checklists. Do NOT use for code implementation. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /project-management
---

# Project Management

## Purpose

This skill helps manage Total Recall as a fully local, sovereign operating system.

Use this skill to:

- Turn vague architectural concerns into GitHub issues.
- Prioritize core kernel blockers over distractions.
- Keep development focused on the core SSSS memory workflow.
- Review pull requests against system integrity standards.
- Maintain strict execution discipline across multi-phase epics.
- Convert user ideas into scoped work without overwhelming the Virtual File System (VFS).
- Track whether Total Recall is stable for daily 24/7 autonomous use.

Total Recall is not managed by memory or vibes. It is managed through GitHub issues, pull requests, checklists, and repeatable testing.

## Repo Context

Primary repo:

- `gregiteen/total-recall`

Current phase:

- SSSS Sovereign AI OS Consolidation → Reference Implementation

Important existing project-management files:

- `docs/projects/in-progress/ssss-sovereign-ai-os/SSSS_SOVEREIGN_AI_OS_PROJECT_TRACKER.md`
- `docs/projects/in-progress/ssss-sovereign-ai-os/SSSS_SOVEREIGN_AI_OS_DEVELOPMENT_PLAN.md`
- `docs/projects/in-progress/ssss-sovereign-ai-os/SSSS_SOVEREIGN_AI_OS_PRD.md`
- `docs/projects/DEFERRED_BACKLOG.md`

Strategic override as of 2026-05-15:

- The single active Total Recall epic is `docs/projects/in-progress/ssss-sovereign-ai-os/`.
- Prior active projects (`master`, `ssss-migration`, `deep-research`, `multilingual-ssss-memory`) are archived as superseded history.
- Total Recall owns the canonical SSSS spec, reference kernel, local sovereign brain, Dream Cycle optimizer, CLI, and conformance suite.
- UltraChat owns hosted UX, marketplace, billing, collaboration, model management UI, and product projections.
- User-local optimizer work can improve user/workspace data, but SSSS protocol changes require admin-reviewed schema proposals, migrations, and tests.

### Docs Kanban System

All project documentation lives in `docs/projects/` organized as a Kanban board:

| Folder | Purpose |
|--------|---------|
| `in-progress/` | Active work with `*_PROJECT_TRACKER.md` and `*_DEVELOPMENT_PLAN.md` / `*_DEV_PLAN.md` |
| `completed/` | Shipped projects (moved here after archival) |
| `archived/` | Abandoned or superseded projects |
| `planned/` | Scoped but not yet started |
| `backlog/` | Rough ideas not yet scoped |
| `DEFERRED_BACKLOG.md` | **Global safety net** — deferred tasks, future enhancements, and unfinished items extracted from completed project trackers |

**Naming Rule**: NEVER use generic filenames like `DEV_PLAN.md` or `PROJECT_TRACKER.md`. You MUST always prefix the files with the project name (e.g., `DEEP_RESEARCH_DEV_PLAN.md`).

**Archival Rule**: When completing a project, the agent MUST:
1. **Verify Testing Phase**: Ensure the project tracker has an explicit testing phase (e.g., `## ⏳ Phase X: Testing & Verification`) and that all testing steps have been fully executed and checked off. A project CANNOT be moved to `completed/` without passing its Testing Phase.
2. Move the project folder from `in-progress/` to `completed/`.
3. Extract any unchecked `- [ ]` items or future enhancement ideas from the tracker.
4. Append them to `DEFERRED_BACKLOG.md` under the project's section heading.
5. Never delete deferred items — they must be preserved for future sessions.

## Core Principle

For the current phase, every task must answer this question:

> Does this help the Sovereign OS maintain autonomous stability, protect user memory, and execute SSSS workflows flawlessly?

If yes, it belongs in the current execution plan.

If no, it goes to backlog unless the user explicitly marks it urgent.

## Product Definition of Core Stability

Total Recall reaches core stability when the daemon can run 24/7 autonomously on the host infrastructure without manual intervention.

The core workflow is:

1. Successfully deploy to host infrastructure.
2. Initialize empty VFS memory schemas.
3. Start the continuous intelligence loop (task_runner, dream cycle).
4. Send and receive messages via Omnichannel surface (Dashboard/REST API).
5. Let Gemma 4 successfully route to Frontier API on low confidence.
6. Auto-resolve or quarantine rule conflicts without crashing.
7. Safely execute code in the Code Mode sandbox.
8. Maintain >10% CPU usage to prevent host sleeping.

Never declare the system stable based only on code progress. Stability must be proven through a Clean-Account VFS Initialization.

## Operating Modes

### 1. Planning Mode

Use when the user asks what to work on, what matters, or how close Total Recall is to stability.

Actions:

1. Check the active `*_PROJECT_TRACKER.md` for incomplete tasks in the current phase.
2. Check whether the Clean-Account Initialization has been completed.
3. Identify core kernel blockers before UI polish.
4. Select 3–7 issues for the session.

Output format:

```md
## This week's focus
[One sentence]

## Do first
1. [Issue/task]
2. [Issue/task]
3. [Issue/task]

## Do not touch yet
- [Backlog idea]
- [Non-critical distraction]

## System risk
[The biggest thing that could crash the daemon or corrupt memory]
```

### 2. Triage Mode

Use when the user reports bugs, conflicts, errors, screenshots, logs, or daemon crashes.

Classify each item by:

- Severity
- Product area
- Whether it blocks core stability
- Next action

Severity:

- `P0-critical`: blocks core kernel execution, VFS integrity, Code Mode sandbox, or daemon operations.
- `P1-high`: seriously damages continuous intelligence loop but has workaround.
- `P2-medium`: annoying, confusing, or incomplete, but system continues running.
- `P3-low`: polish, copy, visual cleanup, nice-to-have.

Core-blocker test:

> Would this prevent the system from autonomously running, maintaining memory, or executing workflows securely?

If yes, mark or recommend `core-blocker`.

Output format:

```md
## Triage

### P0 / Core blocker
- [Item] → [Issue/action]

### P1
- [Item] → [Issue/action]

### P2/P3
- [Item] → Backlog unless already in current scope

## Next move
[One concrete step]
```

### 3. Feature Development Tracking Mode

Use when executing large, multi-phase epics using a dedicated `*_PROJECT_TRACKER.md` file.

Rules for tracking:
- **Mandatory Checkboxes**: Every project tracker MUST use standard markdown checkboxes (`- [ ]`) for all tasks. This is strictly required because background scripts parse these files.
- **Mandatory Testing Phase**: Every `*_PROJECT_TRACKER.md` MUST include a final phase dedicated strictly to testing and verification.
- **Always update the tracker first** when completing a task or phase. Do not ask if you should check a box; if the work is verified, check it off.
- **Maintain momentum**: When one task is checked off, immediately propose the next item.
- **Markdown syntax**: Use `- [x]` to mark items complete. Change headers from `⏳ Phase X` to `✅ Phase X` when all items are complete.

### 4. Issue Creation Mode

Use when converting structural/architectural concerns into GitHub issues.

A good issue is small enough to complete and test.

Issue template:

```md
## Goal
What should be true when this is done?

## Why this matters for the OS
How does this prevent crashes or protect memory?

## Acceptance criteria
- [ ] Specific testable outcome
- [ ] Specific testable outcome

## Test path
How should this be manually tested?

## Notes
Links, screenshots, logs, related files, or related issues.
```

### 5. Pull Request Review Mode

Use when reviewing a PR or deciding whether work is safe to merge.

Review against:

- Does it close or advance a real issue?
- Does it help OS stability?
- Does it introduce obvious runtime risk to the Node daemon?
- Does it respect Total Recall SSSS architecture?
- Does it avoid exposing secrets or credentials in the VFS?
- Does it have a clear test path?

Total Recall architecture reminders:

- Kernel: Ollama + Gemma 4 26B-A4B + Kokoro
- Daemon: Node.js (dream.mjs, surface.mjs, task_runner.mjs)
- Storage: Database-free SSSS Markdown (Virtual File System)
- UI: React Dashboard SPA reverse proxied by Caddy
- Keep files modular; avoid giant files when possible.

### 6. Clean-Account Initialization Mode

This is the most important stability test.

Walkthrough checklist:

```md
## Clean-Account Initialization

### Environment
- OS:
- Node Version:
- RAM:
- Date:

### Steps
- [ ] Run deployment script
- [ ] Scaffold `~/.agent/` directories
- [ ] Validate core SSSS schema files created
- [ ] Start OS daemon (`dream.mjs` loops)
- [ ] Connect via Omnichannel Dashboard
- [ ] Run a test workflow that uses Sandbox
- [ ] Verify `memory-vault/` updates without corruption
- [ ] Validate confidence routing triggers API fallback

### Final call
- [ ] Stable for 24/7 autonomous run
- [ ] Not stable; blockers listed below
```

Any failure in VFS setup, agent looping, data safety, or execution boundaries is a core blocker.

### 7. User Overwhelm Mode

Use when the user feels lost, flooded, or unsure what matters.

Response strategy:

- Reduce scope immediately.
- Identify the next concrete action.
- Re-anchor to the core workflow in the tracker.
- Turn chaos into 1–3 tasks.

### 8. The SWE Project Lifecycle (Epic Breakdown)

We strictly follow the Traditional SWE Methodology:

1. **Discovery (PRD & Architecture)**:
   - Define *what* we are building (`PRD.md`) and *how* the systems connect (`ARCHITECTURE.md`).
2. **Planning (Dev Plan & Tracker)**:
   - Break the architecture down into a step-by-step project-prefixed development plan.
   - Extract the binary yes/no tasks into a project-prefixed Markdown tracker.
3. **Execution (Implementation)**:
   - **Never code blindly**. Every PR must check off a specific box on the tracker.
   - Do not allow agents to drift into Phase 4 while Phase 1 is incomplete.

### 9. Architecture & Documentation Synchronization

Use when completing a major phase or an entire Epic.

- **Knowledge Sync**: Code is not done until the system's memory reflects it.
- Before closing out a major project, you must automatically verify if architectural artifacts (`ARCHITECTURE.md`, `DESIGN.md`, or the `repo-expert` skill) need updating.

## GitHub Management Rules

### Branches & Trunk-Based Development

The repository strictly follows **Trunk-Based Development**:

- `main` — **Active Trunk Branch**. All development and hotfixes are pushed here.
- `feat/description`, `bugfix/description`, `chore/description` — Ephemeral feature branches.
- All code is pushed to `main` rapidly. For major experimental features, use feature branches and merge only when stable.

### Feature Flag Management Protocol

All new major features or sweeping architectural changes MUST be hidden behind a feature flag until verified as stable.

**1. Local Gating**
For unreleased UI or incomplete routes, gate the route/component using preferences in `.agent/memory-vault/preferences/`.

**2. Feature Flag Cleanup**
When a feature is stable, officially strip the feature flag and remove the dead fallback code.

### Deployment Standards

All changes must follow standard verification protocols:

- **Verify-Commit-Push-Verify**: Always run code quality checks BEFORE pushing.
- **Verification**: Always verify daemon health and VFS integrity after making architecture changes.

### Testing Protocol

Maintain a reliable test suite using Vitest. Every PR should pass existing tests and include new tests for new features.

- **Environment Matching**: 
  - UI components (`frontend/**`) use `jsdom` (default).
  - Server services (`src/core/**`) use `node`.
- **Global Mocks**: 
  - VFS operations should be mocked at the file level using `vi.hoisted` to ensure it loads before implementation code.

## Prioritization Framework

Rank work in this order:

1. Data safety and VFS integrity.
2. Core Node daemon loops (`dream.mjs`, `task_runner.mjs`).
3. LLM routing and SSSS validation.
4. Sandbox code execution safety.
5. Omnichannel UI rendering.
6. Polish.
7. New media models.

## Success Condition

This skill succeeds when Total Recall work becomes calm, visible, and testable.

The user should always know:

- What matters this week.
- What is blocking core stability.
- What issue represents the next action.

## 10. Parallel Task Queue (LAW 5 Compliance)

> [!IMPORTANT]
> **NEVER IDLE**. When ANY background command is running (Docker build, deploy, git push, npm install), the agent MUST immediately pull the next task from this queue. Polling a build status without parallel work is a protocol violation per LAW 5.

### The Queue (Priority Order)

When waiting on a background command, work through this list top-to-bottom. Skip items that are already done or not applicable.

**Tier 1: Immediate Value (do these first)**
1. ✅ Push `main` branch: `git push origin main`
2. 📝 Update HANDOFF.md with current session state
3. 🔍 Audit recent code changes for missing try/catch on dynamic imports
4. 📋 Check and update project trackers with completed work
5. 🧹 Commit any uncommitted local changes

**Tier 2: Code Quality & Maintenance**
6. 🔧 Run code quality scripts: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
7. 🔧 Run lint scripts: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
8. 📖 Update skill documentation if any skill is out of date
9. 🗂️ Verify project trackers match actual repo state (check off completed items)
10. 🔍 Scan for TODO/FIXME/HACK comments in recently modified files

**Tier 3: Documentation & Planning**
11. 📝 Create/update development plans for backlog projects
12. 📊 Triage known blockers from the testing tracker
13. 🏗️ Update repo-expert skill if architecture has changed
14. 📋 Draft GitHub issues for discovered bugs
15. 📖 Review and clean up stale project docs in `docs/projects/`

**Tier 4: Proactive Hardening**
16. 🔒 Audit local memory-vault size and indexing performance
17. 🐳 Check kernel process health (Ollama, Node daemon)
18. 📊 Check daemon logs for `steering.mjs` conflicts
19. 🔍 Verify all symlinks (AGENTS.md, CLAUDE.md → INSTRUCTIONS.md)
20. 🧹 Clean up scratch files in conversation artifacts

**Tier 5: Security & Dependencies**
21. 🔒 Audit config files for expired or rotated keys
22. 📦 Check for critical npm audit vulnerabilities: `npm audit --audit-level=critical`
23. 🔐 Verify memory-vault schema adherence
24. 🔑 Ensure no hardcoded API keys in committed files
25. 📋 Verify feature flags are gating unreleased features properly

**Tier 6: Performance & UX Debt**
26. 📏 Refactor oversized files or monolithic functions
27. 🎨 Audit Dashboard React SPA performance
28. ⚡ Check for memory leaks in the OS Daemon
29. 🧪 Verify Vitest coverage on recently modified daemon files
30. 📱 Scan for missing `aria-label` on interactive elements (accessibility)

### Rules
- **ALWAYS pair** a `command_status` call with a productive task from this queue in the same tool call block
- **Never repeat** the same queue task twice in a session unless new information warrants it
- **Log completed tasks** in your session summary so the next agent doesn't redo them
- **If the queue is exhausted**, create new queue items by scanning the codebase for improvements


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T06:00:44.284Z -->

- **no-cursor-or-windsurf-mentions** (confidence 1, importance critical):
  Do not mention Cursor or Windsurf

- **always-reply-to-all-messages** (confidence 1, importance critical):
  Always reply directly to all user messages without exception

- **operating-instructions** (confidence 1, importance 5):
  Total Recall Core Operating Protocol

- **inviolable-ide-instruction-7a4d8913** (confidence 1, importance critical):
  Inviolable IDE Instruction: # Temporary Cursor Rules for testing

- **security-audit-protocol** (confidence 1, importance 4):
  Security audit protocol and hardening requirements

- **research-code-as-agent-harness** (confidence 0.95, importance 4):
  Research: Code as Agent Harness (arXiv:2605.18747)

- **chocolate-brownies** (confidence 0.95, importance 4):
  Chocolate brownies must be fudgey and rich

<!-- END INJECTED MEMORY -->
