---
name: cli-agents
description: "Use this skill when coordinating multiple terminal subagents (Gemini, Claude, Codex) for parallel code generation or project orchestration. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# CLI Agents Skill

Coordinate three CLI-based AI coding agents as parallel subagents from Antigravity. Decompose tasks into independent units and execute them simultaneously across agents.

---

## Agent Registry

| Agent | Version | Binary | Context File | Docs |
|---|---|---|---|---|
| **Gemini CLI** | 0.40.0 | `/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini` | `.gemini/` dir, `AGENTS.md` | [GitHub](https://github.com/google-gemini/gemini-cli) · [Docs](https://geminicli.com/docs) |
| **Claude Code** | 2.1.9 | `/Users/greg/.local/bin/claude` | `CLAUDE.md` | [GitHub](https://github.com/anthropics/claude-code) · [Docs](https://docs.anthropic.com/en/docs/claude-code/overview) |
| **Codex CLI** | 0.125.0 | `/Users/greg/.nvm/versions/node/v24.12.0/bin/codex` | `AGENTS.md`, `.codex/` | [GitHub](https://github.com/openai/codex) · [Docs](https://platform.openai.com/docs/codex) |

### Frontier Models (MANDATORY)

> [!CAUTION]
> **NEVER run a CLI agent on an old model.** Always pass the current frontier model explicitly. Do not rely on CLI defaults — they lag. Verify the string is still current before a major run; model lineups change fast.

| Agent | Frontier model string | Banned (do NOT use) |
|---|---|---|
| Gemini | `gemini-3.5-flash` | `gemini-2.5-*`, `gemini-1.5-*`, anything older |
| Claude | `claude-opus-4-7` | `claude-sonnet-4-*`, `claude-3-*`, anything older |
| Codex | `gpt-5.5` | `gpt-5.4`, `o3`, `o4-mini`, anything older |

### Rate Limits & Priority

| Agent | Limits | Priority | Best For |
|---|---|---|---|
| Gemini | **High** (1000 req/day free, higher on paid plans) | 🥇 Primary — use for heavy lifting | Large context (1M tokens), multi-file refactors, bulk analysis |
| Claude | Included usage (moderate limits) | 🥈 Secondary — complex reasoning | Hard logic, SWE-bench-level tasks, code review |
| Codex | Included usage (moderate limits) | 🥉 Tertiary — sandboxed tasks | Test-driven work, isolated execution, code review |

---

## Headless Dispatch Commands

### Gemini CLI

```bash
# One-shot headless execution (reads .gemini/ and AGENTS.md automatically)
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "YOUR PROMPT" --sandbox=false --yolo 2>&1

# With structured JSON output (for scripted parsing)
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "YOUR PROMPT" --sandbox=false --yolo -o json 2>&1

# With specific model
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "YOUR PROMPT" -m gemini-3.1-pro-preview --sandbox=false --yolo 2>&1

# In a git worktree (isolated branch)
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "YOUR PROMPT" -w my-feature --sandbox=false --yolo 2>&1

# Approval modes: default | auto_edit | yolo | plan (read-only)
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "YOUR PROMPT" --approval-mode yolo 2>&1
```

**Key Flags:**
| Flag | Purpose |
|---|---|
| `-p "prompt"` | Non-interactive headless mode |
| `--sandbox=false` | Allow file writes (default is sandboxed) |
| `-y` / `--yolo` | Auto-approve all tool actions |
| `--approval-mode yolo` | Same as `--yolo` but explicit |
| `--approval-mode plan` | Read-only mode — analysis without edits |
| `-o json` / `--output-format json` | Structured JSON output |
| `-o stream-json` | Real-time streaming JSONL |
| `-m MODEL` | Override model (default `gemini-3.5-flash` — the current frontier; NEVER use `gemini-2.5-*` or older) |
| `-w NAME` | Run in isolated git worktree |
| `-r` / `--resume` | Resume previous session |
| `--policy FILE` | Load custom policy files |

### Claude Code

```bash
# One-shot headless execution (reads CLAUDE.md automatically)
claude -p "YOUR PROMPT" --allowedTools Edit,Write,Bash 2>&1

# Full autonomy (bypass all permission prompts)
claude -p "YOUR PROMPT" --permission-mode bypassPermissions 2>&1

# With specific model
claude -p "YOUR PROMPT" --model claude-opus-4-7 --allowedTools Edit,Write,Bash 2>&1

# Bare mode (skip loading hooks/plugins — faster, deterministic)
claude -p "YOUR PROMPT" --bare --allowedTools Edit,Write,Bash 2>&1

# In a git worktree
claude -p "YOUR PROMPT" --worktree my-feature --allowedTools Edit,Write,Bash 2>&1

# With budget cap (safety net)
claude -p "YOUR PROMPT" --max-budget-usd 5.00 --allowedTools Edit,Write,Bash 2>&1

# JSON output for scripted parsing
claude -p "YOUR PROMPT" --output-format json --allowedTools Edit,Write,Bash 2>&1
```

**Key Flags:**
| Flag | Purpose |
|---|---|
| `-p` / `--print` | Non-interactive headless mode |
| `--allowedTools "Edit,Write,Bash"` | Whitelist specific tools |
| `--disallowedTools "Bash"` | Blacklist specific tools |
| `--permission-mode bypassPermissions` | Full autonomy (no prompts) |
| `--permission-mode plan` | Read-only analysis mode |
| `--bare` | Skip hooks/plugins for speed |
| `--model MODEL` | Override model (default `claude-opus-4-7` — the current frontier; NEVER use `claude-sonnet-4-*` or older) |
| `--worktree NAME` | Isolated git worktree |
| `--max-budget-usd N` | Spending cap |
| `--output-format json` | Structured JSON output |
| `--output-format stream-json` | Real-time streaming JSONL |
| `-c` / `--continue` | Resume most recent conversation |
| `--system-prompt "..."` | Custom system prompt |
| `--append-system-prompt "..."` | Add to default system prompt |

### Codex CLI

```bash
# Non-interactive execution (the "exec" subcommand is key)
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex exec "YOUR PROMPT" --full-auto 2>&1

# With specific model
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex exec "YOUR PROMPT" --full-auto -m gpt-5.5 2>&1

# With JSON output
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex exec "YOUR PROMPT" --full-auto --json 2>&1

# Sandbox modes: read-only | workspace-write | danger-full-access
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex exec "YOUR PROMPT" -s workspace-write 2>&1

# Code review mode
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex review 2>&1

# Apply the last diff produced
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex apply 2>&1
```

**Key Flags:**
| Flag | Purpose |
|---|---|
| `exec "prompt"` | Non-interactive execution mode |
| `--full-auto` | Low-friction sandboxed auto-execution |
| `-a never` | Never ask for approval (headless) |
| `-s workspace-write` | Sandbox: allow writes to workspace only |
| `-s danger-full-access` | Sandbox: unrestricted (dangerous) |
| `-m MODEL` | Override model (default `gpt-5.5` — the current frontier; NEVER use `o3`, `o4-mini`, `gpt-5.4` or older) |
| `--json` | Output JSONL events to stdout |
| `-o FILE` | Write last agent message to file |
| `--search` | Enable live web search |
| `-C DIR` | Set working directory |
| `--add-dir DIR` | Additional writable directories |
| `--ephemeral` | Don't persist session to disk |

---

## Autonomous Orchestrator (MANDATORY FOR PROJECT WORK)

> **ALWAYS use the orchestrator for multi-phase project work.** Do NOT manually dispatch agents one at a time. The orchestrator reads the tracker + plan, decomposes phases, dispatches agents in parallel, monitors completion, marks phases done, and writes batch reports — all autonomously.

### Usage

```bash
# Run against any project folder (finds *_PROJECT_TRACKER.md and *_DEVELOPMENT_PLAN.md automatically)
node .agent/skills/cli-agents/scripts/orchestrator.mjs <project-folder>

# Examples:
node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/standards-enforcement
node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/media-suite

# Options:
#   --agent <name>       Agent to use (gemini|claude|codex). Default: gemini
#   --max-parallel <n>   Max concurrent agents. Default: 2
#   --dry-run            Preview what would be dispatched
#   --phase <n>          Only run a specific phase

# Dry run first, then execute:
node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/my-project --dry-run
node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/my-project

# Run in background so you can work on other things:
nohup node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/my-project > /tmp/orchestrator.log 2>&1 &
```

### How It Works

1. **Scans** the project folder for `*_PROJECT_TRACKER.md` and `*_DEVELOPMENT_PLAN.md`
2. **Parses** all pending phases (⏳) with unchecked items (`- [ ]`)
3. **Dispatches** agents in parallel batches (default 2 at a time)
4. **Waits** for batch completion (max 10 min per batch)
5. **Marks** completed phases ✅ in the tracker
6. **Writes** batch reports (`ORCHESTRATOR_BATCH_*_REPORT.md`) to the project folder
7. **Advances** to next batch until all phases are done

### When to Use

- **YES**: Any project in `docs/projects/in-progress/` with a tracker
- **YES**: Large audits, scans, or multi-phase development work
- **NO**: One-off tasks (use `dispatch.mjs` directly)
- **NO**: Tasks requiring real-time human feedback

---

## Coordination Protocol

### 1. Task Decomposition Rules

Before dispatching subagents, Antigravity (the coordinator) MUST:

**Step 1 — Decompose**:
- Break work into **independent, non-overlapping file sets**
- Each subagent gets **explicit file boundaries** — what it CAN and CANNOT touch
- **NO two agents may edit the same file simultaneously**
- Use git worktrees (`--worktree` / `-w`) for maximum isolation when available

*Note: The live UI monitor will automatically start and open in your editor when using `dispatch.mjs` or when background agents are launched.*

### 2. Standard Subagent Prompt Template

Every subagent prompt MUST include this structure:

```
CONTEXT: You are working in the UltraChat repository at /Users/greg/Github/ultrachat-ai-powered.
Read INSTRUCTIONS.md for repo conventions.

TASK: [Specific extraction/refactor/generation task with clear deliverable]

FILES YOU OWN (read + write):
- server/services/asterisk/AsteriskCallService.ts (create)
- server/routes/api/v1/asterisk.ts (modify lines 477-595 only)

FILES FOR REFERENCE ONLY (read, do NOT modify):
- server/services/asterisk/AsteriskService.ts
- server/services/workspaceSharingService.ts

CONSTRAINTS:
- Do NOT modify any files outside your assigned set
- Do NOT run tsc, npm run lint, or npm run build
- Do NOT start the dev server
- Run: node .agent/skills/code-quality/scripts/start-here-ts.mjs after edits
- Commit changes with message: "refactor(asterisk): extract AsteriskCallService"

DELIVERABLE: The new service file must compile cleanly and the route file must delegate to it.
```

### 3. Background Dispatch with Notification

```bash
# Gemini subagent with completion notification
(/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini -p "PROMPT" --sandbox=false --yolo 2>&1; \
 node .agent/skills/notifications/scripts/notify.mjs "✅ Gemini Done" "AsteriskCallService extracted") &

# Claude subagent with completion notification
(claude -p "PROMPT" --permission-mode bypassPermissions 2>&1; \
 node .agent/skills/notifications/scripts/notify.mjs "✅ Claude Done" "AsteriskVoiceService extracted") &

# Codex subagent with completion notification
(/Users/greg/.nvm/versions/node/v24.12.0/bin/codex exec "PROMPT" --full-auto 2>&1; \
 node .agent/skills/notifications/scripts/notify.mjs "✅ Codex Done" "AsteriskWebhookHandler extracted") &
```

### 4. Parallel Refactoring Pattern (Example)

For a 2,000+ line file with 5 service extractions:

| Subagent | Task | Files Owned |
|---|---|---|
| **Gemini** (primary) | Extract `AsteriskVoiceControlService` (largest, ~1100 lines) | `server/services/asterisk/AsteriskVoiceControlService.ts` |
| **Claude** | Extract `AsteriskProvisionService` (~400 lines) | `server/services/asterisk/AsteriskProvisionService.ts` |
| **Codex** | Extract `AsteriskWebhookHandler` (~200 lines) | `server/services/asterisk/AsteriskWebhookHandler.ts` |
| **Antigravity** | Orchestrate, extract remaining services, wire imports | `server/routes/api/v1/asterisk.ts` (final wiring) |

### 5. Conflict Resolution

If agents accidentally touch the same file:
1. Check `git diff` per agent's commit
2. Use `git merge` or manual resolution
3. Antigravity (coordinator) is the **final authority**
4. Prefer worktrees to avoid conflicts entirely

---

## When to Use Subagents vs. Direct Work

| Scenario | Approach |
|---|---|
| Single file edit < 100 lines | Direct (Antigravity) |
| Multi-file refactor with independent services | **Subagents** — one per service |
| Research + implementation | **Subagent** for research, Antigravity for implementation |
| Build/deploy while coding | Background command + notification |
| Code review / audit | **Subagent** (`codex review` or `claude -p --permission-mode plan`) |
| Large codebase analysis | **Gemini** (1M token context) |

---

## Authentication Setup

Each agent needs one-time authentication:

```bash
# Gemini — run interactively once, sign in with Google
/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini

# Claude — run interactively once, sign in with Anthropic
claude

# Codex — run interactively once, sign in with ChatGPT
/Users/greg/.nvm/versions/node/v24.12.0/bin/codex
```

For headless/CI use, set environment variables:
- **Gemini**: `GOOGLE_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`
- **Claude**: `ANTHROPIC_API_KEY` or use `claude setup-token`
- **Codex**: `OPENAI_API_KEY` or ChatGPT session

---

## Live Monitor

The Live Agent Monitor is a web-based dashboard that automatically tracks all background agents.

**Automation:**
You do NOT need to start the monitor manually. Whenever `dispatch.mjs` is executed, it automatically:
1. Cleans up old orphaned zombie logs (`rm -f /tmp/*-dispatch-*.log`) so the monitor starts with a clean slate.
2. Spawns `monitor-server.mjs` in the background (port 9111). If it's already running (EADDRINUSE), it safely connects to the existing instance.
3. Uses macOS UI automation to natively trigger `Cmd+Shift+P -> Simple Browser: Show` in Antigravity
4. Opens the dashboard panel directly in your editor

*Manual Start Procedure & Zombie Cleanup Fallback*: 
If the monitor gets stuck showing "RUNNING" for agents that have already finished or crashed (zombie logs), you must manually run:
```bash
rm -f /tmp/*-dispatch-*.log
```
Then, you can manually open the monitor in Antigravity by running the command `Simple Browser: Show` and entering `http://localhost:9111`.

The monitor shows a color-coded dashboard with:
- 🟦 Gemini / 🟧 Claude / 🟩 Codex agent cards
- ⏳ RUNNING / 🟣 ORCHESTRATING / ✅ DONE / ❌ ERROR status
- Real-time tail of the output logs
- Completed agent history list (persists after agents finish)
- Dynamic status line showing last meaningful output
- Project name extracted from dispatch prompt
- Auto-refreshes every 3 seconds

### Monitor Architecture

**Log Files** (source of truth for the dashboard):
- Subagent logs: `/tmp/{gemini|claude|codex}-dispatch-{timestamp}.log`
- Orchestrator logs: `/tmp/orchestrator-{timestamp}.log` (separate prefix to avoid cleanup)
- **NEVER delete logs** — the dashboard done list reads from them

**Status Detection** (`getStatus()` in monitor-server.mjs):
- Orchestrator logs: check if process is still alive via `ps aux` → show as ORCHESTRATING (purple)
- Completion keywords: `exit code: 0`, `committed`, `done.`, `has been completed`, `skills used`, `audit summary`
- Error keywords: `exit code:` (non-zero), `fatal`, `permission denied`
- Default: RUNNING

**Caching**:
- Provider stats (token usage) are cached for 30 seconds to avoid hammering filesystem on every poll
- SQLite database tracks agent runs persistently across server restarts

### Critical Monitor Rules

> **⚠️ NEVER restart port 9111 during a session.** Each restart kills the Jetski iframe connection and crashes the Electron chat. If you must test changes:
> 1. Start a test instance on port 9112: `node monitor-server.mjs 9112`
> 2. Verify JS syntax and API data
> 3. Kill test: `kill $(lsof -ti :9112)`
> 4. Do ONE swap of 9111 only when everything is verified
> 5. Tell the user to refresh the Jetski panel

---

## Usage Data Sources

Each CLI agent stores usage data natively. The monitor reads these for real stats:

### Claude Code
- **File**: `~/.claude/stats-cache.json`
- **Data**: Per-model token breakdown (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`), daily activity (`messageCount`, `sessionCount`, `toolCallCount`)
- **Command**: `claude usage` (interactive only)

### Gemini CLI
- **Files**: `~/.gemini/tmp/*/chats/session-*.jsonl`
- **Format**: JSONL — each line is a JSON object with `usageMetadata` containing `promptTokenCount` and `candidatesTokenCount`
- **Note**: No `gemini usage` subcommand exists; must parse session files directly

### Codex CLI
- **Files**: Session data in `~/.codex/` directory
- **Command**: Usage tracked per-session in JSONL output (`--json` flag)

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/dispatch.mjs` | Unified agent dispatcher with log files, notification chaining, and auto-monitor |
| `scripts/orchestrator.mjs` | Launches a real AI agent as autonomous project orchestrator |
| `scripts/health.mjs` | Verify all 3 agents are installed and returning versions |
| `scripts/monitor-server.mjs` | Live web dashboard (port 9111) for agent cards, stats, and history |
| `scripts/monitor.mjs` | Legacy terminal-based monitor |

---

## Best Practices

1. **Gemini for bulk**: Use Gemini for the largest extraction tasks — 1M token context means it can read entire files without truncation.
2. **Claude for logic**: Use Claude for tasks requiring complex reasoning (e.g., untangling deeply coupled state).
3. **Codex for review**: `codex review` is excellent for automated code review before merging subagent output.
4. **Always use `--worktree`**: When available, isolate each agent in its own git worktree to prevent file conflicts entirely.
5. **Budget caps on Claude**: Use `--max-budget-usd` to prevent runaway API costs on complex tasks.
6. **Plan mode first**: Before any destructive refactor, run in plan/read-only mode to get a proposal:
   - Gemini: `--approval-mode plan`
   - Claude: `--permission-mode plan`
7. **Notification chain**: Always chain `notify.mjs` to background dispatches so you know when agents finish.
8. **Verify after merge**: After merging subagent output, always run `node .agent/skills/code-quality/scripts/start-here-ts.mjs` to catch any integration issues.
9. **Orchestrator for projects**: ALWAYS use `orchestrator.mjs` for multi-phase project work. Never manually dispatch agents one at a time.
10. **Never restart monitor mid-session**: Test on port 9112 first, swap once when verified.
11. **Never delete dispatch logs**: The monitor done list depends on them persisting.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-22T06:35:37.991Z -->

- **auto-pull-self-healing-deployment** (confidence 1, importance 5):
  Use auto-pull self-healing cron script on cloud VPS in place of GitHub Actions

<!-- END INJECTED MEMORY -->
