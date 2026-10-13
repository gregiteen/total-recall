### Archival rule

When completing a project, the agent MUST:

1. Verify the testing phase is fully checked off and every audit finding has a final disposition — a project cannot move to `completed/` without it.
   After reviewing the actual evidence, record `Readiness Status: Verified` and `Readiness Evidence: <durable log/artifact and environment>` above the final Action Log. These declarations support conservative local triage; their existence alone is not proof the evidence is valid. Pending `[/]` work blocks archival just like `[ ]` work.
2. Move the project folder from `in-progress/` to `completed/`.
3. Extract any unchecked `- [ ]` items or future-enhancement ideas from the tracker.
4. Append them to `DEFERRED_BACKLOG.md` under the project's section heading.
5. Never delete deferred items — preserve them for future sessions.

