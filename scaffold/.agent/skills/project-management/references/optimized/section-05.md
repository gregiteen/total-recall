## Rule: Never hardcode the active project or epic in a skill file

Skill files are read at the start of every session and are easy to forget to update — hardcoded "current phase" or "current epic" text goes stale fast and then actively misleads future agents (this is exactly what happened before this skill was standardized: a copy of this file kept claiming an epic was "in progress" long after another copy of the same file had it marked "completed & archived"). Skills describe **process**, not **current state**.

Resolve the actual active work dynamically, in this order, every time:

1. The user's latest explicit instruction in the current conversation.
2. A root `HANDOFF.md`, if the repo has one.
3. The active `*_PROJECT_TRACKER.md` file(s) under `docs/projects/in-progress/`.
4. Current GitHub issues or board items — only after the local project docs are checked.
5. `docs/projects/DEFERRED_BACKLOG.md` — only for deferred or parking-lot work.

If sources disagree, prefer the user's latest instruction, then update whichever source is stale so the next agent doesn't repeat the mistake.

