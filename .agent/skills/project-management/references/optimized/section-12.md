### Tracker convention

The tracker uses standard markdown checkboxes — this is strictly required because tooling and background scripts parse these files:

```markdown
## ⏳ Phase N: <Phase Name>

Goal: <one-line goal>

- [x] Completed task with [linked file](/absolute/path/to/file)
- [ ] Pending task
- [/] In-progress task

## Verification Log

- YYYY-MM-DD: `command` — result

## Action Log

| Timestamp (UTC) | Agent | Action / files or commands | Result | Evidence |
| --- | --- | --- | --- | --- |
| ISO-8601 time | Acting agent | Meaningful action and scoped paths/command | Observed outcome or uncertainty | Durable evidence or tool result |
```

- Use `- [x]` for complete, `- [/]` for in-progress, `- [ ]` for pending. Never plain bullets or numbered lists for tasks.
- Every tracker's **Phase 0 is "Audit"** and is checked off only when `<PROJECT_PREFIX>_AUDIT.md` is `Complete`; its Phase 1 is the fixes for the audit's P0/P1 findings.
- Every tracker MUST include a final phase dedicated to testing and verification. A project cannot move to `completed/` without that phase fully checked off.
- Change the phase header emoji from `⏳` to `✅` when all items in that phase are complete.
- Always update the tracker first when completing a task — don't ask permission to check a box; if the work is verified, check it off, then propose the next item.

