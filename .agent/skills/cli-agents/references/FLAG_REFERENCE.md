# CLI Agent Flag Reference

> Extracted from `--help` output of each installed CLI agent. Updated 2026-04-29.

---

## Gemini CLI v0.40.0

### Subcommands
| Command | Description |
|---|---|
| `gemini mcp` | Manage MCP servers |
| `gemini extensions` | Manage Gemini CLI extensions |
| `gemini skills` | Manage agent skills |
| `gemini hooks` | Manage Gemini CLI hooks |
| `gemini gemma` | Manage local Gemma model routing |

### Flags
| Flag | Type | Description |
|---|---|---|
| `-p, --prompt` | string | Non-interactive headless mode with the given prompt |
| `-i, --prompt-interactive` | string | Execute prompt then continue interactive |
| `-m, --model` | string | Override model |
| `-s, --sandbox` | boolean | Run in sandbox |
| `-y, --yolo` | boolean | Auto-approve all actions |
| `--approval-mode` | choices | `default`, `auto_edit`, `yolo`, `plan` |
| `-w, --worktree` | string | Run in a new git worktree |
| `-o, --output-format` | choices | `text`, `json`, `stream-json` |
| `-r, --resume` | string | Resume a previous session |
| `--list-sessions` | boolean | List available sessions |
| `--skip-trust` | boolean | Trust current workspace for session |
| `--policy` | array | Additional policy files to load |
| `--allowed-tools` | array | **DEPRECATED** — use Policy Engine |
| `--allowed-mcp-server-names` | array | Allowed MCP server names |
| `-e, --extensions` | array | Specific extensions to use |
| `--include-directories` | array | Additional workspace directories |
| `--raw-output` | boolean | Disable output sanitization |
| `-d, --debug` | boolean | Debug mode |

---

## Claude Code v2.1.9

### Subcommands
| Command | Description |
|---|---|
| `claude doctor` | Health check for auto-updater |
| `claude install` | Install native build |
| `claude mcp` | Configure MCP servers |
| `claude plugin` | Manage plugins |
| `claude setup-token` | Set up long-lived auth token |
| `claude update` | Check/install updates |

### Flags
| Flag | Type | Description |
|---|---|---|
| `-p, --print` | boolean | Non-interactive headless mode |
| `--allowedTools` | array | Whitelist tools (e.g., `Edit,Write,Bash`) |
| `--disallowedTools` | array | Blacklist tools |
| `--permission-mode` | choices | `acceptEdits`, `bypassPermissions`, `default`, `delegate`, `dontAsk`, `plan` |
| `--model` | string | Override model |
| `--output-format` | choices | `text`, `json`, `stream-json` |
| `--bare` | boolean | Skip loading hooks/plugins (faster) |
| `-c, --continue` | boolean | Resume most recent conversation |
| `-r, --resume` | string | Resume by session ID |
| `--system-prompt` | string | Custom system prompt |
| `--append-system-prompt` | string | Append to default system prompt |
| `--max-budget-usd` | number | Spending cap |
| `--add-dir` | array | Additional directories for tool access |
| `--mcp-config` | array | Load MCP servers from JSON |
| `--json-schema` | string | JSON Schema for structured output |
| `--fallback-model` | string | Auto-fallback when overloaded (headless only) |
| `--agents` | JSON | Define custom agents |
| `--no-session-persistence` | boolean | Don't save session (headless only) |
| `--dangerously-skip-permissions` | boolean | Bypass ALL permission checks |
| `-d, --debug` | string | Debug mode with category filtering |

---

## Codex CLI v0.125.0

### Subcommands
| Command | Description |
|---|---|
| `codex exec` (alias: `e`) | Non-interactive execution |
| `codex review` | Non-interactive code review |
| `codex apply` (alias: `a`) | Apply last diff as `git apply` |
| `codex resume` | Resume previous session |
| `codex fork` | Fork a previous session |
| `codex mcp` | Manage external MCP servers |
| `codex plugin` | Manage plugins |
| `codex sandbox` | Run commands within sandbox |
| `codex cloud` | **EXPERIMENTAL** — browse Codex Cloud tasks |
| `codex login/logout` | Auth management |
| `codex features` | Inspect/toggle feature flags |

### Flags (Interactive Mode)
| Flag | Type | Description |
|---|---|---|
| `-c, --config key=value` | string | Override config from `~/.codex/config.toml` |
| `-a, --ask-for-approval` | choices | `untrusted`, `on-failure`, `on-request`, `never` |
| `--search` | boolean | Enable live web search |
| `--enable/--disable FEATURE` | string | Toggle feature flags |

### Flags (`codex exec` Mode)
| Flag | Type | Description |
|---|---|---|
| `--full-auto` | boolean | Low-friction sandboxed auto-execution |
| `-m, --model` | string | Override model |
| `-s, --sandbox` | choices | `read-only`, `workspace-write`, `danger-full-access` |
| `--json` | boolean | Output JSONL events to stdout |
| `-o, --output-last-message FILE` | string | Write last message to file |
| `-C, --cd DIR` | string | Working directory |
| `--add-dir DIR` | string | Additional writable directories |
| `--ephemeral` | boolean | Don't persist session |
| `--ignore-rules` | boolean | Skip `.rules` files |
| `--ignore-user-config` | boolean | Skip `config.toml` |
| `--output-schema FILE` | string | JSON Schema for response shape |
| `--dangerously-bypass-approvals-and-sandbox` | boolean | **DANGEROUS** — no sandbox, no prompts |
| `-i, --image FILE` | array | Attach images to prompt |
| `-p, --profile` | string | Config profile from `config.toml` |
| `--skip-git-repo-check` | boolean | Allow outside git repos |
