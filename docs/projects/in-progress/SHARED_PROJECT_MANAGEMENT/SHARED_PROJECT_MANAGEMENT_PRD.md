# SHARED_PROJECT_MANAGEMENT — PRD

> **Project Prefix**: `SHARED_PROJECT_MANAGEMENT`
> **Kanban State**: 🏗️ In Progress
> **Author**: Codex `/root/showcase_docs`
> **Date**: 2026-09-30
> **Based on audit**: SHARED_PROJECT_MANAGEMENT_AUDIT.md (Complete, e5d9aad0dd7d7372363a7d5d0c97349949330446)

Shared project management governs documentation mechanics in every repository. Optional overlays add verified local differences and are never created merely because they are absent (A-001/A-003). Every meaningful read/inventory, decision, write, command, test, deployment, delegation, failure and verification has an append-only entry in the tracker's final Action Log (A-002).

Acceptance: existing log entries remain unchanged; timestamps/actor/scope/result/evidence are explicit; related repeated read-only actions may be batched; delegated work is reconciled by coordinator before completion. No secrets enter logs. Local documentation hooks perform real checks and do not pretend to validate remote GitHub actions; triage cannot archive unfinished or unverified work (A-004/A-005). Main-suite and helper verification are reported separately. No foreign overlays, deployment or new append helper is in scope.
