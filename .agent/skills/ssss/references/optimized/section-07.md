## Workflow Runtime

Workflow frontmatter owns the schedule. Cron, daemon, webhook, file watcher, and
event-loop processes are wake-up mechanisms, not a second scheduling database.

Use the installed SSSS package's `runtime` export to deterministically derive the
trigger event, task, and run envelopes. Duplicate ticks must replay
idempotently. Queues and task dashboards are disposable projections over
workflow state and events.

