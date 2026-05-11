---
name: project-management
description: "Use this skill when managing GitHub issues, pull requests, sprint planning, and beta readiness checklists. Do NOT use for code implementation. MANDATORY: You MUST read the full SKILL.md file before executing."
command: /project-management
---

# Project Management

## Purpose

This skill helps manage Total Recall as a real software product moving from active development into private beta, public beta, and launch.

Use this skill to:

- Turn vague product concerns into GitHub issues.
- Prioritize beta blockers over distractions.
- Keep development focused on the core user workflow.
- Review pull requests against beta-readiness standards.
- Maintain weekly execution discipline.
- Convert founder ideas into scoped work without overwhelming the project.
- Track whether Total Recall is actually ready for testers.

Total Recall is not managed by memory or vibes. It is managed through GitHub issues, pull requests, checklists, and repeatable testing.

## Repo Context

Primary repo:

- `gregiteen/total-recall`

Current phase:

- Internal Stabilization → Hardening

Important existing project-management files:

- `docs/projects/in-progress/master/PROJECT_TRACKER.md`
- `docs/projects/in-progress/master/DEV_PLAN.md`
- `docs/projects/in-progress/master/ARCHITECTURE.md`
- `docs/projects/DEFERRED_BACKLOG.md`

### Docs Kanban System

All project documentation lives in `docs/projects/` organized as a Kanban board:

| Folder | Purpose |
|--------|---------|
| `in-progress/` | Active work with `*_PROJECT_TRACKER.md` and `*_DEVELOPMENT_PLAN.md` |
| `completed/` | Shipped projects (moved here after archival) |
| `archived/` | Abandoned or superseded projects |
| `planned/` | Scoped but not yet started |
| `backlog/` | Rough ideas not yet scoped |
| `DEFERRED_BACKLOG.md` | **Global safety net** — deferred tasks, future enhancements, and unfinished items extracted from completed project trackers |

**Archival Rule**: When completing a project, the agent MUST:
1. **Verify Testing Phase**: Ensure the project tracker has an explicit testing phase (e.g., `## ⏳ Phase X: Testing & Verification`) and that all testing steps have been fully executed and checked off. A project CANNOT be moved to `completed/` without passing its Testing Phase.
2. Move the project folder from `in-progress/` to `completed/`.
3. Extract any unchecked `- [ ]` items or future enhancement ideas from the tracker.
4. Append them to `DEFERRED_BACKLOG.md` under the project's section heading.
5. Never delete deferred items — they must be preserved for future sessions.

## Core Principle

For the current phase, every task must answer this question:

> Does this help a beta tester successfully understand, use, or trust Total Recall?

If yes, it may belong in the current beta plan.

If no, it goes to backlog unless the founder explicitly marks it urgent.

## Product Definition of Private Beta

Total Recall is ready for private beta when 5–20 trusted testers can complete the core workflow without the founder manually explaining every step.

The core workflow is:

1. Sign up or log in.
2. Create or enter a workspace.
3. Create or use an assistant.
4. Send chat messages successfully.
5. Use at least one assistant-accessible tool or integration.
6. Understand usage limits, credits, or cost boundaries.
7. Report bugs easily.
8. Return later without losing context or breaking state.

Never declare beta ready based only on code progress. Beta readiness must be proven through a clean-account walkthrough.

## Operating Modes

### 1. Planning Mode

Use when the founder asks what to work on, what matters, or how close Total Recall is to beta.

Actions:

1. Start from issue `#116` Private Beta Readiness.
2. Check whether the clean-account walkthrough in `#118` has been completed.
3. Identify beta blockers before polish work.
4. Select 3–7 issues for the week, not 20.
5. Update or reference `#117` Beta Board: This Week.

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
- [Non-beta distraction]

## Beta risk
[The biggest thing that could block testers]
```

### 2. Triage Mode

Use when the founder reports bugs, confusion, errors, screenshots, logs, or anxiety about the project.

Classify each item by:

- Severity
- Product area
- Whether it blocks beta
- Next action

Severity:

- `P0-critical`: blocks login, workspace access, assistant chat, data safety, or production operation.
- `P1-high`: seriously damages beta workflow but has workaround.
- `P2-medium`: annoying, confusing, or incomplete, but testers can continue.
- `P3-low`: polish, copy, visual cleanup, nice-to-have.

Beta-blocker test:

> Would this prevent a tester from understanding, using, trusting, or safely completing the core workflow?

If yes, mark or recommend `beta-blocker`.

Output format:

```md
## Triage

### P0 / Beta blocker
- [Item] → [Issue/action]

### P1
- [Item] → [Issue/action]

### P2/P3
- [Item] → Backlog unless already in current scope

## Next move
[One concrete step]
```

### 3. Feature Development Tracking Mode

Use when executing large, multi-phase epics like the AI Media Editor Suite using a dedicated `*_PROJECT_TRACKER.md` file.

Rules for tracking:
- **Mandatory Checkboxes**: Every project tracker MUST use standard markdown checkboxes (`- [ ]`) for all tasks. This is strictly required because background scripts parse these files to categorize projects as finished based on checkbox states. Do not use plain bullet points (`-`) or numbers without a checkbox.
- **Mandatory Testing Phase**: Every `*_PROJECT_TRACKER.md` MUST include a final phase dedicated strictly to testing and verification (e.g., `## ⏳ Phase X: Testing & Verification`). This phase MUST include building an automated test suite using `vitest` to verify zero regression, alongside specific test paths, edge cases, and pass/fail criteria that are fully checked off before the project can be considered complete.
- **Always update the tracker first** when completing a task or phase. Do not ask the founder if you should check a box; if the work is verified, check it off.
- **Maintain momentum**: When one task is checked off, immediately identify and propose the very next item on the tracker.
- **Strict adherence**: Do not drift from the tracker's defined phases unless explicitly instructed.
- **Markdown syntax**: Use `- [x]` to mark items complete. Change headers from `⏳ Phase X` to `✅ Phase X` when all items are complete.

Output format when completing a tracked item:
```md
## Tracker Update
Checked off: [Task name]

## Next Up (Phase X)
1. [Next task from tracker]

Shall we proceed with this next task?
```

### 4. Issue Creation Mode

Use when converting product concerns into GitHub issues.

A good issue is small enough to complete and test.

Do not create vague issues like:

- Fix app
- Improve UI
- Make beta ready
- Clean up codebase

Create specific issues like:

- Verify workspace creation from a clean account
- Fix assistant first-message failure when no model is selected
- Add readable error state for failed integration call
- Confirm user A cannot access user B workspace data

Issue template:

```md
## Goal
What should be true when this is done?

## Why this matters for beta
How does this help a tester understand, use, or trust Total Recall?

## Acceptance criteria
- [ ] Specific testable outcome
- [ ] Specific testable outcome
- [ ] Specific testable outcome

## Test path
How should this be manually tested?

## Notes
Links, screenshots, logs, related files, or related issues.
```

Every issue should have acceptance criteria. If acceptance criteria are unclear, rewrite the issue before implementation.

### 5. Pull Request Review Mode

Use when reviewing a PR or deciding whether work is safe to merge.

Review against:

- Does it close or advance a real issue?
- Does it help the beta workflow?
- Does it introduce obvious runtime risk?
- Does it respect Total Recall architecture?
- Does it avoid exposing secrets or credentials?
- Does it preserve mobile usability?
- Does it have a clear test path?

Total Recall architecture reminders:

- Kernel: Ollama + Gemma 4 26B-A4B + Kokoro
- Daemon: Node.js (dream.mjs, surface.mjs, task_runner.mjs)
- Storage: Database-free SSSS Markdown (Virtual File System)
- UI: React Dashboard SPA reverse proxied by Caddy
- Keep files modular; avoid giant files when possible.
- Do not expose API keys, provider secrets, keychain internals, or raw credentials.
- User-facing UI should avoid infrastructure jargon when talking to customers.

PR review output:

```md
## Review

### Summary
[What this PR changes]

### Beta impact
[How it helps or risks beta]

### Must fix before merge
- [ ] [Blocking concern]

### Should fix soon
- [ ] [Non-blocking concern]

### Test before merge
- [ ] [Manual test]
- [ ] [Manual test]

### Decision
Approve / Request changes / Comment only
```

### 5. Weekly Execution Mode

Use once per week or whenever the founder asks what to do next.

Rules:

- Pick 5–10 issues maximum.
- Prefer beta blockers over new features.
- Avoid starting new shiny systems unless they unblock beta.
- Friday is stabilization, testing, and notes day.
- Every week should produce visible progress: fixed bugs, clearer docs, better onboarding, or completed test paths.

Weekly update format:

```md
## Total Recall weekly plan

### Objective
[One sentence]

### Selected issues
1. #[number] — [title]
2. #[number] — [title]
3. #[number] — [title]

### Definition of done this week
- [ ] [Concrete result]
- [ ] [Concrete result]
- [ ] [Concrete result]

### Parking lot
- [Idea to defer]
- [Idea to defer]
```

End-of-week format:

```md
## Weekly progress note

### Shipped / completed
- [Thing]

### Still blocked
- [Thing]

### New beta blockers found
- [Thing]

### Next week's focus
[One sentence]
```

### 6. Clean-Account Walkthrough Mode

This is the most important beta-readiness test.

Use a fresh test user and test without founder shortcuts.

Walkthrough checklist:

```md
## Clean-account walkthrough

### Environment
- Browser:
- Device:
- Account:
- Date:

### Steps
- [ ] Open app from production/beta URL
- [ ] Sign up or log in
- [ ] Reach first meaningful screen
- [ ] Create or enter workspace
- [ ] Create or select assistant
- [ ] Send first message
- [ ] Receive assistant response
- [ ] Use one integration/tool
- [ ] Check usage/credits/limits visibility
- [ ] Refresh page and confirm state persists
- [ ] Log out and back in
- [ ] Report a bug through intended flow

### Findings
| Step | Result | Issue created? |
|---|---|---|
| Auth | Pass/Fail | # |
| Workspace | Pass/Fail | # |
| Assistant | Pass/Fail | # |
| Tool/integration | Pass/Fail | # |
| Usage/credits | Pass/Fail | # |
| Mobile | Pass/Fail | # |

### Final call
- [ ] Ready for private beta
- [ ] Not ready; blockers listed below
```

Any failure in auth, workspace entry, assistant chat, data safety, or cost boundaries is a beta blocker.

### 7. Founder Overwhelm Mode

Use when the founder feels lost, flooded, discouraged, or unsure what matters.

Response strategy:

- Reduce scope immediately.
- Identify the next concrete action.
- Avoid dumping a giant plan unless requested.
- Re-anchor to the beta workflow.
- Turn chaos into 1–3 tasks.

Preferred response:

```md
You do not need to solve the whole app today.

Do this next:

1. Run the clean-account walkthrough.
2. Write down every place it breaks.
3. Turn only the real blockers into issues.

Everything else can wait.
```

Do not tell the founder to research project management theory. Convert the situation into execution.

### 8. The SWE Project Lifecycle (Epic Breakdown)

Use when the user introduces a massive new feature, overhaul, or "Epic" (e.g., "AI Media Editor Suite"). We strictly follow the Traditional SWE Methodology:

1. **Discovery (PRD & Architecture)**:
   - Define *what* we are building (`PRD.md`) and *how* the systems connect (`ARCHITECTURE.md`).
2. **Planning (Dev Plan & Tracker)**:
   - Break the architecture down into a step-by-step `DEVELOPMENT_PLAN.md`.
   - Extract the binary yes/no tasks into a Markdown `PROJECT_TRACKER.md` (MUST use `- [ ]` checkable boxes).
3. **Execution (Implementation)**:
   - **Never code blindly**. Every PR must check off a specific box on the tracker.
   - Do not allow agents to drift into Phase 4 while Phase 1 is incomplete.

All project documentation MUST live inside its specific project folder in the Docs Kanban system (e.g., `/docs/projects/in-progress/media-suite/`). Do not clutter the root directory.

### 9. Architecture & Documentation Synchronization

Use when completing a major phase or an entire Epic.

- **Knowledge Sync**: Code is not done until the system's memory reflects it.
- Before closing out a major project, you must automatically verify if architectural artifacts (`ARCHITECTURE.md`, `DESIGN.md`, or the `repo-expert` skill) need updating.
- Remind the user: "We've completed the phase. Before moving on, I should update the `repo-expert` reference documentation to reflect these new structural changes so future agents don't hallucinate. Shall I proceed?"

## GitHub Management Rules

### Issues

Use issues for:

- Bugs
- Beta tasks
- Security reviews
- UX problems
- Documentation gaps
- Product decisions
- Technical debt that affects beta

Each issue should have:

- Goal
- Why it matters for beta
- Acceptance criteria
- Test path

### Pull Requests

Use PRs for meaningful code or doc changes.

Every PR should include:

- Summary
- Related issue
- Beta impact
- Test checklist
- Screenshots/notes when relevant

Do not merge PRs that make the beta path worse unless they fix a larger blocker.

### Branches & Trunk-Based Development

The repository strictly follows **Trunk-Based Development** (also known as Dark Launching):

- `production` — **Active Trunk Branch**. All development and hotfixes are pushed here. Triggers auto-deploy watcher immediately.
- `main` — **Stable Backup Branch**. Auto-synced by the server watcher at the end of every successful deploy. Never push here directly unless fixing a sync split.
- `feat/description`, `bugfix/description`, `chore/description` — Ephemeral feature branches.
- We do NOT maintain a heavy, long-running staging site. All code is pushed to `production` rapidly but hidden behind Feature Flags.

### Feature Flag Management Protocol

All new major features or sweeping architectural changes MUST be hidden behind a feature flag until verified as stable.

**1. Local Gating**
For unreleased UI or incomplete routes, gate the route/component using preferences in `.agent/memory-vault/preferences/`. Do not expose half-finished routes.

**2. Feature Flag Cleanup**
Every feature flag introduces technical debt. When a feature reaches 100% rollout and is stable, officially strip the feature flag and remove the dead fallback code.

### Deployment Standards

All changes must follow the `/push` and `/deploy` protocols:

- **Verify-Commit-Push-Verify**: Always run code quality checks BEFORE pushing.
- **Verification**: Always verify container health after push.

### Testing Protocol

Maintain a reliable test suite using Vitest. Every PR should pass existing tests and include new tests for new features.

- **Environment Matching**: 
  - UI components (`src/**`) use `jsdom` (default).
  - Server services (`server/**`) use `node`.
  - Enforce this in `vitest.config.ts` using `environmentMatchGlobs`.
- **Global Mocks**: 
  - Common dependencies like `useAuth` are mocked globally in `vitest.setup.ts` to prevent "AuthProvider" errors.
  - VFS operations should be mocked at the file level using `vi.hoisted` to ensure it loads before implementation code.
- **Accessibility & Testability**:
  - Use semantic HTML (e.g., `<button>` instead of clickable `<div>`) to ensure tests can query by role.
  - Add `data-testid` only when semantic queries are insufficient.
- **Common Troubleshooting**:
  - `document is not defined`: Fix by moving the test file to a `jsdom` environment or fixing the `environmentMatchGlobs`.
  - `Module not found` (MCP SDK): Ensure imports do not use manual `.js` extensions which can break ESM resolution in Vitest.
  - `AuthContext` error: Ensure the global `useAuth` mock is active in `vitest.setup.ts`.

### Labels

Suggested labels:

Type:

- `bug`
- `feature`
- `cleanup`
- `docs`
- `security`
- `beta-blocker`

Priority:

- `P0-critical`
- `P1-high`
- `P2-medium`
- `P3-low`

Area:

- `frontend`
- `backend`
- `vfs`
- `auth`
- `mcp`
- `billing`
- `voice`
- `mobile`
- `onboarding`
- `marketplace`

## Prioritization Framework

Rank work in this order:

1. Data safety and security.
2. Login/auth access.
3. Workspace access.
4. Assistant chat reliability.
5. Tool/integration proof path.
6. Usage/cost controls.
7. Mobile usability for core path.
8. Onboarding clarity.
9. Bug reporting and feedback loop.
10. Polish.
11. New features.

When in doubt, choose the task that gets a real tester through the product with less help.

## Decision Rules

### When a new idea appears

Ask:

1. Does it help private beta?
2. Is it required for the clean-account workflow?
3. Does it reduce risk?
4. Can it be tested this week?

If not, add to backlog or parking lot.

### When a bug appears

Ask:

1. Does it block the core workflow?
2. Does it affect data safety?
3. Does it create cost risk?
4. Does it make the product look broken to a tester?

If yes, make it a beta blocker.

### When the founder asks “are we close?”

Answer based on evidence:

- Have we completed the clean-account walkthrough?
- How many beta blockers remain?
- Can a tester use the product without explanation?
- Are data and cost boundaries safe enough?

Never answer based only on percentage vibes.

## Standard Outputs

### Next-step output

```md
## Next move
[One sentence]

## Why
[One sentence]

## Do this now
- [ ] [Task]
- [ ] [Task]
- [ ] [Task]
```

### Beta readiness output

```md
## Beta readiness
Status: Ready / Not ready / Unknown pending walkthrough

## Evidence
- [Pass/fail item]
- [Pass/fail item]
- [Pass/fail item]

## Blockers
- #[number] — [title]

## Next action
[One concrete action]
```

### Issue-writing output

```md
# [Issue title]

## Goal

## Why this matters for beta

## Acceptance criteria
- [ ]
- [ ]
- [ ]

## Test path

## Notes
```

## What Not To Do

Do not:

- Create huge vague tasks.
- Treat new features as more important than beta blockers.
- Let the founder hold the roadmap in their head.
- Merge untested changes into the beta path casually.
- Ignore mobile usability.
- Ignore cost controls.
- Ignore VFS file permissions.
- Let docs, onboarding, and bug reporting wait until after testers arrive.
- Confuse active development with beta readiness.

## Success Condition

This skill succeeds when Total Recall work becomes calm, visible, and testable.

The founder should always know:

- What matters this week.
- What is blocking beta.
- What can wait.
- What issue represents the next action.
- What must be true before inviting testers.

The product reaches private beta when the clean-account walkthrough passes and remaining issues are acceptable known limitations, not blockers.

## 10. Parallel Task Queue (LAW 5 Compliance)

> [!IMPORTANT]
> **NEVER IDLE**. When ANY background command is running (Docker build, deploy, git push, npm install), the agent MUST immediately pull the next task from this queue. Polling a build status without parallel work is a protocol violation per LAW 5.

### The Queue (Priority Order)

When waiting on a background command, work through this list top-to-bottom. Skip items that are already done or not applicable.

**Tier 1: Immediate Value (do these first)**
1. ✅ Sync `main` branch: `git push origin production:main && git fetch origin main && git branch -f main origin/main`
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
12. 📊 Triage known blockers from the browser testing tracker
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
21. 🔒 Audit `.env.development.local` for expired or rotated keys
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


> **CODE MODE MANDATE**: You MUST use the `execute_api` tool for all API interaction, and `search_api` to discover endpoints/schemas.
