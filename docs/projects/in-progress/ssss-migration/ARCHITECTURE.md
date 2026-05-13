# SSSS Migration Architecture Addendum

## The "Why" (The Zero-Parser Kernel Philosophy)
Total Recall was designed to be an autonomous OS governed entirely by its SSSS memory vault ("Markdown is Law"). However, operations like `sync`, `backup`, and `compile` were implemented as hardcoded Javascript files (`src/cli/*.mjs`). This violated the core philosophy for three reasons:
1. **Inflexibility**: The agent cannot natively edit or improve its own JS files without high risk of breaking the core server loop.
2. **Opacity**: Background tasks run via JS scripts bypass the cognitive agent loop, meaning the agent has no memory or reasoning over *how* a sync or backup failed.
3. **Redundancy**: Why write complex JS to parse file directories and push to remote servers when a tool-equipped LLM can simply run `rsync` or `git` natively?

## The "What" (Triggers and Agents Architecture)
The architecture must be stripped down to a minimal **Cognitive Event Loop** entirely devoid of custom JavaScript daemons. 

1. **Triggers:** Standard OS-level triggers (e.g., `cron` jobs, filesystem watchers, webhooks) detect a condition and drop an SSSS markdown task node (`type: task`) into `.agent/scheduler/queue/`.
2. **Agents:** The trigger invokes an intelligent AI agent CLI (e.g., Antigravity, Claude Code, Cursor) with a single starting prompt: "Process the queue."
3. **Autonomous Execution:** The agent boots up, reads its `INSTRUCTIONS.md`, reads the markdown task file, and uses its native tools (running terminal commands, reading files) to execute the objective. 
4. **Result Logging:** The agent writes the success or failure back into its session JSONL log, deletes or archives the task markdown file, and spins back down.

By transitioning to this architecture, Total Recall achieves true Sovereign OS status: its operations are governed by language, memory, triggers, and agents—not hardcoded software logic.
