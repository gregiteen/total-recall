# CLI Agents Hooks

## pre-dispatch

Before dispatching any subagent, the coordinator MUST:

1. **Run health check**: `node .agent/skills/cli-agents/scripts/health.mjs`
2. **Verify file isolation**: Ensure no two agents share write access to the same file
3. **Check git status**: Ensure working tree is clean (`git status --porcelain` should be empty or committed)
4. **Verify authentication**: Each agent must have valid auth (health check covers version, not auth)

## post-dispatch

After all subagents complete:

1. **Check for conflicts**: `git diff --check` must show 0 conflicts
2. **Run TS check**: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
3. **Verify file sizes**: Extracted services must be under 500 lines each
4. **Commit and push**: Only after all checks pass
