## 5. Interpret actual results

- Codex `--json` is JSONL. Collect `item.completed` agent_message text, skip control frames and fail on `turn.failed` or `error`. Require a completed turn, not merely a started thread.
- Claude JSON contains `result`; reject `is_error:true` or an error subtype even when exit is zero.
- Antigravity JSON/stream-json may include agent-specific success/error fields. Tool denial can be a soft failure even with exit zero; verify the requested action and artifacts.
- Other agents have their own contracts: JSON may mean one final object or an event stream. Plain-text tools need an actual final artifact and correct exit semantics; do not invent JSON support.

A successful exit is necessary but insufficient. Verify expected changed files/state, persisted records and actual test evidence. Missing auth, unsupported model, permission denial or exhausted quota is not a successful answer. Do not keep retrying nontransient auth/config failures or switch to an unauthorized billing route. Aggregate each agent's result with its own status and limits.

