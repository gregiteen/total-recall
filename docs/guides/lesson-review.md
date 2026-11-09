# Local lesson review

Total Recall queues a review after ten completed user turns and at session end.
The hook only queues work. The daemon runs the post-mortem through the
Metaharness reasoning runtime. No model name or credential is set by this path.

`total-recall lessons tick` reads hook JSON from stdin. Claude and Codex supply
`session_id` and `transcript_path`. Hermes supplies conversation history. The Pi
extension supplies branch messages. Use `lessons session-end` to queue the last
partial range. Use `lessons scan` for locally ingested sessions.

Each task has a fixed transcript snapshot, a session id and a turn range. The
session cursor advances after the task is persisted. A repeated hook does not
queue the range twice. Failed reviews remain visible in the task queue. Local
lesson reviews and their skill requests run on followers as well as leaders.

The existing hook installer adds observers for Claude, Codex, Cursor,
Antigravity, DSH, Hermes and Pi. Native trust or hook approval still applies.
The installer reports unsupported owners. The daemon scans locally ingested
transcripts on every node. OpenClaw uses that path. A quiet transcript receives
a final partial review after five minutes; a later turn can resume the session.
This is an inactivity boundary, not proof that a native session ended.

Patterns, corrections, facts, conventions and violation reports enter the
memory inbox. Explicit rule candidates require an exact user quote from the
range. They use `remember`, including its length, duplicate and validated-write
guards. A model response cannot request a long-rule exception. Skill gaps
become `skill-engineering` tasks with session evidence. Their executor calls
`total-recall skill-manager gap "<topic>" --evidence <ref>`. It fails clearly
until the installed owner declares that operation.

Optional settings live at `<brain>/config/lessons.json`:

```json
{ "enabled": true, "interval": 10, "holdWrites": true }
```

`--interval N` selects a tick interval. `--hold` holds that review's writes.
Held inbox drafts carry `x_review_hold`; dream cannot promote or age-prune
them. Held rules are saved by `remember` with draft status. Review held entries
before promoting them through the memory owner. Skill-manager owns skill
draft review. Dream no longer extracts session lessons with keywords.

# Scheduled leader maintenance

`total-recall task idle --global` is the core entry for an automations manifest
task. The automations owner must expose a handler that calls this entry and
declare its schedule through the existing manifest-task path. Core does not
install a second timer. The operation checks leadership and persists inference,
clarity and cleanup tasks. It does not depend on queue exhaustion. Repeated
runs suppress the same target and day. `TR_IDLE_TASKS` no longer fills a queue.

Compaction generates memory-cleanup proposals. It uses the existing duplicate
suppression and proposal gate. It does not rewrite or archive canonical nodes.
Proposal application remains a separate reviewed operation.
