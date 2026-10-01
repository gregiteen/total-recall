---
name: project-management
description: "Manage five-file project docs, trackers, GitHub issues and reviews."
repo_scoped: false
command: /project-management
---

# Project management

Resolve work from the current request, handoff and active tracker. Use verified repository facts and an existing local overlay; never hardcode an active epic or create an unnecessary overlay.

Keep each project under `docs/projects/<state>/<PREFIX>/` with AUDIT, PRD, ARCHITECTURE, DEVELOPMENT_PLAN and PROJECT_TRACKER. Complete an evidence-based audit and required baseline before code or other project documents. Continue existing projects in their existing files. Move the whole folder as status changes.

Track every blocker and append timestamp, actor, action, outcome and evidence to the tracker's final append-only Action Log. Preserve history. Archive only after all requested work and required verification are complete; do not defer remaining work without the user's instruction.

Read the document conventions and the relevant operating mode from the task index when planning, triaging, reviewing or verifying. Discover real test/deploy commands; synthetic checks do not prove production readiness. Vault changes use their owning CLI/API. Delegation requires authorization.

For audit content, use [the audit template](references/audit-template.md) and verify with `scripts/check-audit.mjs`. For document formats, read [project documents](references/project-documents.md).
