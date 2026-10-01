# Project documents

Use docs/projects/<state>/<PREFIX>/; states are backlog, planned, in-progress, completed or archived. Continue an existing project in its existing five files. New work starts with a complete audit before the other four documents or code changes.

## Audit

Use audit-template.md. Record audited commit, timestamp, scope, method, source inventory, runtime surface, data/state, integrations, security/privacy, standing-rule conflicts, baseline, debt/dead code, deploy/operations, content/product fit, findings register, impact and decisions. Findings use stable A-nnn IDs with severity, source evidence, consequence and disposition. Verify applicable current baseline commands and record their actual results.

## Requirements and architecture

Create <PREFIX>_PRD.md from audit findings: requested outcome, scope, acceptance criteria and risks. Create <PREFIX>_ARCHITECTURE.md from observed ownership, interfaces, mutation paths, state and constraints. Separate current behavior from proposed changes. Cite finding IDs.

## Plan and tracker

Create <PREFIX>_DEVELOPMENT_PLAN.md from requirements/architecture with implementable phases, dependencies, validation and delivery. Create <PREFIX>_PROJECT_TRACKER.md last; include every P0/P1 finding and requested action. Use [ ] incomplete and [x] verified complete. Each document records prefix, state, author and date.

## Action Log

Keep the final tracker section append-only. Table columns: timestamp, actor, action, outcome and evidence. Record meaningful reads, edits, failures, tests, decisions and verification. Preserve earlier entries; append corrections rather than rewriting history. Verification evidence identifies source snapshot, environment, actor, command, actual result and limitations.

## Delivery and archival

Use verified repo-specific tests and release/deploy workflows. Distinguish synthetic, native, provider and production evidence. Move the entire folder to completed only after all requested work, verification and authorized delivery are complete. Keep incomplete work in-progress unless the user explicitly defers it. Update architecture documentation when behavior changes.
