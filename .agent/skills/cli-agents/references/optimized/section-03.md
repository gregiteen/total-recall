## 2. Verify subscription authentication

- **Codex:** `codex login status` must report ChatGPT sign-in for subscription work. `codex login` is the user-facing sign-in flow when absent. Do not print `auth.json`, tokens or model-cache account details.
- **Claude Code:** inspect only login/method fields from `claude auth status`. The vendor's `claude auth login` supports Claude subscription authentication; Console/API authentication is a separate route. Missing CLI login is a real prerequisite even when an app is authenticated.
- **Antigravity/Gemini:** verify the selected vendor account route and a bounded authorized prompt. Version/help or an OAuth selection setting is insufficient proof of working entitlement. Do not declare plan use unlimited.
- **Other agents:** follow their own documented login/provider path. A ChatGPT or Claude subscription does not cover arbitrary provider clients; supported bridges require their own verified adapter.

Use the credential-clean [subscription helper](../../scripts/subscription-cli.mjs) for the supported local subscription lane. Read its `--help` for the exact invocation. It strips provider/API overrides, checks supported auth metadata, delegates with an argv array and stdin, and detects process/payload failures. It never performs login or changes vendor settings.

```bash
# Helper adds verified read-only/JSON defaults; prompt stays off the helper argv.
node /resolved/cli-agents/scripts/subscription-cli.mjs codex --cwd /path/to/repo -- --ephemeral - < /path/to/task.txt
node /resolved/cli-agents/scripts/subscription-cli.mjs claude --cwd /path/to/repo -- < /path/to/task.txt
```

Use `--sandbox workspace-write` or `--permission-mode acceptEdits` after the helper separator only for authorized edits. Verify an actual final result; an empty stdout is a failed probe, even with exit zero. Its optional unknown-auth consent is not proof of an authenticated or unmetered account.

Do not resolve and inject provider keys into subscription children. For an explicitly requested API workflow, use the encrypted secret store and the provider's separate adapter. Never expose credentials through args, stdout, keychain dumps, logs, compiled instructions or prompts.

