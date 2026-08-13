---
name: total-recall-project-management
description: >-
  Total Recall-specific project management overlay. Use alongside the global
  project-management skill when managing Total Recall GitHub issues, pull
  requests, or project tracker checklists. Defines what stability/readiness
  means for Total Recall, architecture reminders, and prioritization. Do NOT use
  for code implementation. MANDATORY: You MUST read the full SKILL.md file
  before executing.
version: 3.14.1
repo_scoped: true
---

# Total Recall — Project Management Overlay

> This is a **repo-specific overlay**, not a standalone system. It assumes the global `project-management` skill's universal 4-file Kanban mechanics (folder layout, naming, tracker convention, operating modes) — read that skill first. This file only carries the delta: what Total Recall actually is, what "stable" means for it, and Total Recall's own architecture/prioritization/queue specifics. Don't re-derive the Kanban folder structure or naming rules here — they live in the global skill.

## What Total Recall is

Total Recall is a fully local, autonomous operating system. It is managed through GitHub issues, pull requests, checklists, and repeatable testing — not memory or vibes.

Primary repo: `gregiteen/total-recall`

Total Recall owns the canonical SSSS spec, reference kernel, local autonomous brain, Dream Cycle optimizer, CLI, and conformance suite. UltraChat owns hosted UX, marketplace, billing, collaboration, model management UI, and product projections. SSSS protocol changes require admin-reviewed schema proposals, migrations, and tests — user-local optimizer work can improve user/workspace data but must not bypass that review.

## Active project — resolve, don't hardcode

Per the global skill's rule, this file does not track which epic is currently active — that goes stale immediately. Resolve it live from `docs/projects/in-progress/`, `HANDOFF.md`, and the user's latest instruction. As of the last time this overlay was edited, prior major epics (`ssss-autonomous-ai-os`, `layered-brain-architecture`, `vfs-metaskill-consolidation`, `master`, `ssss-migration`, `deep-research`, `multilingual-ssss-memory`) had already shipped and moved to `docs/projects/completed/` or `archived/` — check current folder contents rather than trusting this note.

## Core Principle

For any task, ask:

> Does this help the Autonomous OS maintain autonomous stability, protect user memory, and execute SSSS workflows flawlessly?

If yes, it belongs in the current execution plan. If no, it goes to backlog unless the user explicitly marks it urgent.

## Mandatory Project Document Lifecycle

> **ABSOLUTE RULE.** Every project — no matter how small — MUST produce ALL FIVE of the following documents, in order, before any code is written. No exceptions. Do not skip documents. Do not combine them. Do not start coding until all five exist.

### Required Documents (in order)

All documents live in `docs/projects/in-progress/<PROJECT_PREFIX>/` and are named with the project prefix.

#### 1. `<PREFIX>_AUDIT.md` — Audit

Start every project by auditing the current state. Before proposing solutions, understand what exists:
- What files, modules, and systems are involved?
- What is the current behavior (working or broken)?
- What are the root causes of the problem?
- What existing code, configs, or infrastructure will be affected?
- What are the security, performance, and stability implications?
- Include concrete evidence: file paths, line numbers, command outputs, error logs.

**This is research, not opinion.** Cite what you found, not what you assume.

#### 2. `<PREFIX>_PRD.md` — Product Requirements Document

Define what success looks like:
- Problem statement (referencing audit findings)
- Scope (in-scope vs. out-of-scope)
- Success criteria (measurable, verifiable)
- Prioritization (using the TR Prioritization Framework below)
- Dependencies and risks

#### 3. `<PREFIX>_ARCHITECTURE.md` — Architecture Document

Define how the system will be built:
- High-level system design (components, data flow, interactions)
- SSSS compliance plan (which VFS primitives, which envelopes, which projections)
- API design (endpoints, request/response shapes)
- Data model (frontmatter schemas, event shapes)
- Security considerations
- Integration points with existing systems
- Mermaid diagrams where helpful

#### 4. `<PREFIX>_DEVELOPMENT_PLAN.md` — Development Plan

Define the phased implementation:
- Phases with clear dependency ordering
- Per-phase task checklists with `- [ ]` checkboxes
- "Done When" gates verifiable with shell commands
- Test requirements for each phase
- SSSS compliance checkpoints

#### 5. `<PREFIX>_PROJECT_TRACKER.md` — Project Tracker

A highly detailed, living checklist that tracks every individual task:
- Every file to create, modify, or delete
- Every test to write
- Every integration to wire
- Every config to update
- Status: `- [ ]` (todo), `- [/]` (in progress), `- [x]` (done)
- Grouped by phase, with subtasks indented
- Updated continuously as work progresses
- Include estimated complexity (S/M/L) per task where useful

### Enforcement

- **Do NOT start coding until all five documents exist.**
- **Do NOT skip the audit.** Jumping straight to solutions without understanding the current state is how bugs and regressions happen.
- **The tracker is a living document.** Update it as you complete work. It is the single source of truth for project progress.
- **If a project is trivial** (e.g., fixing a typo), you may create abbreviated versions, but all five files MUST still exist.

## Definition of Core Stability (the readiness walkthrough, Total Recall-specific)

Total Recall reaches core stability when the daemon can run 24/7 autonomously on the host infrastructure without manual intervention. Never declare it stable based only on code progress — prove it via a Clean-Account VFS Initialization.

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
- [ ] Successfully deploy to host infrastructure
- [ ] Initialize empty VFS memory schemas
- [ ] Start the continuous intelligence loop (task_runner, dream cycle)
- [ ] Send and receive messages via Omnichannel surface (Dashboard/REST API)
- [ ] Confirm Gemma 4 successfully routes to Frontier API on low confidence
- [ ] Auto-resolve or quarantine rule conflicts without crashing
- [ ] Safely execute code in the Code Mode sandbox
- [ ] Maintain >10% CPU usage to prevent host sleeping

### Final call
- [ ] Stable for 24/7 autonomous run
- [ ] Not stable; blockers listed below
```

Any failure in VFS setup, agent looping, data safety, or execution boundaries is a core blocker (maps to the global skill's Triage Mode P0).

## Total Recall Core-Blocker Test

> Would this prevent the system from autonomously running, maintaining memory, or executing workflows securely?

If yes, mark or recommend `core-blocker` in Triage Mode.

## Architecture Reminders (for PR Review Mode)

- Kernel: Ollama + Gemma 4 26B-A4B + Kokoro
- Daemon: Node.js (`dream.mjs`, `surface.mjs`, `task_runner.mjs`)
- Storage: Database-free SSSS Markdown (Virtual File System) — never a traditional DB
- UI: React Dashboard SPA reverse proxied by Caddy
- Keep files modular; avoid giant files when possible

## Branches

Trunk-based development: `main` is the active trunk, all development/hotfixes push there directly. `feat/`, `bugfix/`, `chore/` branches are ephemeral, merged fast.

## Feature Flags

Gate unreleased UI/routes using preferences in `.agent/memory-vault/preferences/`. Strip the flag and dead fallback code once a feature is stable.

## Testing Protocol

Vitest, environment-matched:
- UI components (`frontend/**`) use `jsdom` (default).
- Server services (`src/core/**`) use `node`.
- Mock VFS operations at the file level using `vi.hoisted` so mocks load before implementation code.

## Deployment Standards

Verify-Commit-Push-Verify, always running code quality checks before pushing. Always verify daemon health and VFS integrity after architecture changes.

## Prioritization Framework (overrides the global default)

1. Data safety and VFS integrity.
2. Core Node daemon loops (`dream.mjs`, `task_runner.mjs`).
3. LLM routing and SSSS validation.
4. Sandbox code execution safety.
5. Omnichannel UI rendering.
6. Polish.
7. New media models.

## SSSS Compliance (Mandatory for ALL work)

> **This is non-negotiable.** Every feature, fix, or integration in Total Recall MUST follow these rules. Do not wait for the user to remind you.

### VFS-First State Management

All persistent application state — configuration, policies, user preferences, audit logs, integration settings, network rules, feature flags, anything — MUST be stored as SSSS VFS document primitives in `memory-vault/`. Never store application state in loose `.yml`, `.json`, or `.env` files outside the VFS.

Every VFS document MUST include OKF-compatible universal frontmatter:
- `type` — the SSSS primitive type (e.g., `network_policy`, `integration_config`, `user_preference`)
- `title` — human-readable title
- `description` — what this document represents
- `timestamp` — ISO 8601 creation/update time

### Mutations via Core Contract

All state mutations MUST flow through the SSSS Core Contract (`POST /api/v1/ssss`). Supported envelopes:
- `operation` — full file write
- `patch` — partial frontmatter/body merge
- `event` — append-only event payload
- `delete` — remove a VFS file

**Never use raw `fs.writeFileSync()`, `atomicWrite()`, or direct file manipulation for application state.** The Core Contract handles validation, idempotency, authorization, lease checks, and audit trails.

### Audit Logs as Events

Any system that produces audit data (network requests, secret access, daemon actions, research queries) MUST emit append-only SSSS `event` envelopes to `ssss_events`. Dashboard views of audit data are projections from these events.

### API Design

REST API endpoints that read state should read from VFS (or projections). Endpoints that mutate state should internally submit SSSS envelopes through the Core Contract — never write files directly.

### When in Doubt

If you're about to write a config file, store a setting, save a policy, or persist any application data: **use SSSS**. If you think it doesn't apply, you're probably wrong. Ask the user.

## Parallel Task Queue — Total Recall-specific tiers

Use the global skill's "Parallel Task Queue" structure; these are Total Recall's concrete Tier 4 hardening checks (in addition to the generic tiers):

- Audit local memory-vault size and indexing performance
- Check kernel process health (Ollama, Node daemon)
- Check daemon logs for `steering.mjs` conflicts
- Verify all symlinks (AGENTS.md, CLAUDE.md → INSTRUCTIONS.md)
- Verify memory-vault schema adherence
- Refactor oversized files/monolithic functions
- Audit Dashboard React SPA performance
- Check for memory leaks in the OS Daemon
- Verify Vitest coverage on recently modified daemon files

## Success Condition

This overlay succeeds when Total Recall work becomes calm, visible, and testable, and the user always knows: what matters this week, what's blocking core stability, and what issue represents the next action.

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
