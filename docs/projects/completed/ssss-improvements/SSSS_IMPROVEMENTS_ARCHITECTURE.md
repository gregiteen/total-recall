# SSSS Improvements Architecture (Total Recall)

## Mental Model
Total Recall is the reference kernel for the SSSS portable, event-sourced, VFS-native operating contract.
While UltraChat is one specific implementation, Total Recall enforces the sovereign standard.

## Validation Flow
When an AI agent modifies `.agent/memory-vault/**`:
1. SSSS generic validation is bypassed at the generic gateway.
2. Total Recall intercepts the operation via `TotalRecallMemoryValidator`.
3. Total Recall validates the patch/operation against SSSS Memory Schema v2.
4. Total Recall commits the state and emits an append-only event to the event log.

## Feedback Architecture
Feedback is treated as an append-only event (`type: event`).
Rollups and aggregates are treated as derived caches.

### Scope Model
- `local_thread`
- `workspace`
- `account`
- `system_candidate`
- `system_promoted`

### Promotion Rule
No feedback-derived optimization may move from workspace scope to system scope without explicit promotion, anonymization, and provenance stripping. Workspace feedback optimizes ONLY that workspace by default.
