---
type: memory
slug: fix-or-add-to-tracker
category: preferences
title: "When you see something wrong, either fix it inline or add it to the master project tracker"
schema_version: 2
status: active
created: 2026-05-12T23:35:00Z
updated: 2026-05-12T23:35:00Z
last_accessed: 2026-05-12T23:35:00Z
importance: 4
priority: absolute
confidence: 0.99
modality: must
subject: agent
predicate: handle_observed_issue
object: total_recall_repo
sentiment_polarity: directive_must
sentiment_target: "discovered bugs, sharp edges, and inconsistencies"
source:
  type: chat
  session_id: total-recall-session-2026-05-12
  agent: claude
  evidence_count: 1
supersedes: []
superseded_by: null
contradicts: []
tags: [workflow, project-management, tracker, autonomy]
related: [never-run-raw-tsc, premature-phase-completion-pattern]
routes_to_skills: [project-management]
decay:
  half_life_days: 365
  access_count: 1
---

# Fix it, or add it to the master tracker — don't just mention it

## The Rule

When the agent observes something wrong (a bug, a sharp edge, an inconsistent
default, a stale doc, a TODO/FIXME, a flaky test, a security smell) during
any session, exactly one of the following must happen — never a third
"mention it in the response and move on":

1. **Fix it inline** when the fix is small, deterministic, and clearly
   in-scope for the current task. Include the fix in the current change set.
2. **Add it to the master tracker** at
   `docs/projects/in-progress/master/PROJECT_TRACKER.md` under the most
   appropriate phase (or a new "Discovered Issues" section). Use the
   standard `- [ ]` checkbox so background scripts continue to parse the
   file. Include enough detail — file path, symptom, and acceptance
   criterion — that a future session can act on it cold.

If neither path applies, the observation isn't actually actionable and
should be dropped, not narrated to the user.

## Why

- Drive-by mentions ("by the way, X seems off") rot. They leave the user
  carrying the cognitive load instead of the tracker.
- The project-management skill (see `.agent/skills/project-management/`)
  treats `PROJECT_TRACKER.md` as the single source of truth for outstanding
  work. Untracked observations cannot be prioritized or scheduled.
- The anti-pattern `premature-phase-completion-pattern` is the inverse
  failure mode: marking work done that wasn't. This preference is its
  partner — surface real work so the tracker stays honest in both
  directions.

## How to apply

- Trivial in-scope fix? Make the edit, no separate flag.
- Out-of-scope or non-trivial? Append a tracker item with file path,
  symptom, and acceptance criterion. Format: regular `- [ ] **`file/path`**
  — symptom. Acceptance: …`.
- For ambiguous cases, prefer adding to the tracker over staying silent.
- Never spawn an asynchronous task agent for this — the tracker IS the
  durable channel.
