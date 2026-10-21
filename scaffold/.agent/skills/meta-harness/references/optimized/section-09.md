### 1. Spawn a Background Agent
```bash
# Local background agent
npx total-recall agent spawn claude "Refactor error handling in src/cli/harness.mjs" --name "Refactor Worker"

# Remote background agent on a mesh node
npx total-recall agent spawn agy --node build-box "Crawl recent preprints on quantum shuttling" --name "Quantum Scout"

# Workflow in a repo on another node: --cwd is resolved there ('~' is that node's home)
npx total-recall agent spawn claude --node build-box --cwd '~/code/app' "Run the nightly workflow"

# Narrow the tool set (spawns default to every built-in tool; dispatch defaults to none)
npx total-recall agent spawn claude "Summarise the diff" --tools Read,Grep
npx total-recall agent spawn claude "Answer from memory only" --no-tools
```

Claude Code authenticates headlessly with `CLAUDE_CODE_OAUTH_TOKEN` (create it with
`claude setup-token`, store it with `total-recall auth secret set CLAUDE_CODE_OAUTH_TOKEN --stdin`).
A spawn reads it from the secret store when the environment lacks it, so SSH and
launchd sessions that cannot reach a login keychain still authenticate.
