## 3. Headless command contracts

These examples describe vendor syntax. Use the helper's credential-clean environment for subscription execution. Resolve permission flags against installed help; preserve the account's supported configured model unless a verified override was explicitly selected.

```bash
# Codex: analysis in the requested repository; JSONL output; prompt from stdin.
codex exec --sandbox read-only --json --cd /path/to/repo -

# Claude: headless, scoped to reading; final JSON result; prompt from stdin.
claude --output-format json --permission-mode plan --tools Read,Glob,Grep -p

# Antigravity: plan mode, final JSON; inspect installed permission policy.
agy --mode plan --output-format json -p "Read the requested source and report evidence"

# Gemini: separately enabled Google CLI, plan mode and sandbox.
gemini --approval-mode plan --sandbox --output-format json -p "Read the requested source and report evidence"
```

For authorized edits, select the CLI's scoped edit mode: Codex workspace-write, Claude acceptEdits, or the documented equivalent. Use isolated checkout/worktree only where requested or required by repository rules. Assign disjoint files when sharing a working tree; preserve concurrent changes. `--tools ""` disables tools and must not be described as a capable coding agent.

Never default to `bypassPermissions`, `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--yolo`, `--allow-all` or disabled sandboxing. Some agents are permissive by default: inspect and constrain those policies before dispatch. An agent denied a required tool has not completed the task.

