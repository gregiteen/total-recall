# IDE & Agentic Platform Integrations Report (July 2026)

This report details how all 10 supported market-leading AI coding clients consume project-level custom instructions. Total Recall acts as the central brain that projects these rules down into the specific syntax required by each active client.

---

### 1. Antigravity (Google / DeepMind)
- **Target File**: `.agents/rules/AGENTS.md` (via symlink)
- **Format**: Markdown.
- **Consumption Strategy**: Antigravity is the premier autonomous coding agent system. It natively consumes `AGENTS.md` to load skills, global rules, and project-specific contexts at the start of every session. It natively reads project workspace skills from `<project>/.agents/skills/` and turns them into `/name` slash commands.
- **Total Recall Support**: Native symlink support via `npx total-recall connect antigravity`. Write Slash Commands is enabled. Project-scoped skills projection to `.agents/skills`.
*(Note: Total Recall uses `.agent/` singular for its own internal sovereign storage (vault, scheduler, secrets), but projects out to `.agents/` plural to match the universal Antigravity/Agent ecosystem standard).*

### 2. Gemini
- **Target File**: `.agents/rules/GEMINI.md` (via symlink)
- **Format**: Markdown.
- **Consumption Strategy**: The Gemini CLI reads `.agents/rules/GEMINI.md` for prompt context. Similar to Antigravity, it reads project workspace skills from `<project>/.agents/skills/`.
- **Total Recall Support**: Native symlink support via `npx total-recall connect gemini`. Write Slash Commands is enabled. Project-scoped skills projection to `.agents/skills`.

### 3. Cursor
- **Target File**: `.cursor/rules/total-recall.mdc`
- **Format**: MDC (Markdown with Frontmatter).
- **Consumption Strategy**: Included in the LLM's system prompt context window for every request within the workspace using the `alwaysApply: true` MDC frontmatter.
- **Total Recall Support**: Total Recall auto-generates the MDC file including the frontmatter via `npx total-recall connect cursor`.

### 4. Claude Code (Anthropic)
- **Target File**: `CLAUDE.md` (via symlink)
- **Format**: Markdown.
- **Consumption Strategy**: Claude Code reads `CLAUDE.md` at the beginning of every session. It acts as a permanent, project-specific instruction manual to avoid repeating workflows and architectural rules. It discovers native skills/slash commands under `<project>/.claude/skills/`.
- **Total Recall Support**: Native symlink support via `npx total-recall connect claude-code`. Write Slash Commands is enabled. Project-scoped skills projection to `.claude/skills`.

### 5. VS Code Copilot
- **Target File**: `.github/copilot-instructions.md`
- **Format**: Markdown.
- **Consumption Strategy**: Consumed by the GitHub Copilot extension in VS Code to shape autocomplete and chat behavior across the repository.
- **Total Recall Support**: Writes explicitly to `.github/copilot-instructions.md` via `npx total-recall connect vscode`.

### 6. Codex
- **Target File**: `AGENTS.md` (via symlink)
- **Format**: Markdown.
- **Consumption Strategy**: Codex-backed enterprise environments rely on `AGENTS.md` at the repository root. Codex only discovers skills globally under `$CODEX_HOME/skills` (`~/.codex/skills`).
- **Total Recall Support**: Native symlink support via `npx total-recall connect codex`. Global-scoped (home) skills projection to `.codex/skills`.

### 7. Pi Coding Agent
- **Target File**: `AGENTS.md` (local target) and `~/.pi/agent/AGENTS.md` (global target)
- **Format**: Markdown.
- **Consumption Strategy**: Pi consumes instructions through a global `AGENTS.md` symlinked in the user's home directory pointing to the local context.
- **Total Recall Support**: Global symlink mode via `npx total-recall connect pi`.

### 8. Hermes Agent
- **Target File**: `~/.hermes/memories/MEMORY.md` and `~/.hermes/memories/USER.md`
- **Format**: Markdown.
- **Consumption Strategy**: Hermes isolates memories and user preferences into distinct memory files in its global app directory.
- **Total Recall Support**: Special hermes mode mapping via `npx total-recall connect hermes`.

### 9. OpenClaw
- **Target File**: `MEMORY.md` and `AGENTS.md`
- **Format**: Markdown.
- **Consumption Strategy**: OpenClaw uses a split-file architecture requiring both a `MEMORY.md` context file and an `AGENTS.md` instruction file.
- **Total Recall Support**: Special openclaw mode mapping via `npx total-recall connect openclaw`.

### 10. Aider
- **Target File**: `.aider.rules.md`
- **Format**: Markdown.
- **Consumption Strategy**: Aider requires explicit configuration mapping in `.aider.conf.yml` pointing to the generated rules file.
- **Total Recall Support**: Writes the rules payload via `npx total-recall connect aider` and instructs the user to append the target to `.aider.conf.yml`.

---

## Skill Directory Integrations (Updated July 2026)

As of July 2026, the AI agent ecosystem has largely converged on a standardized format for "skills"—reusable, folder-based instruction sets containing a `SKILL.md` file with YAML frontmatter. However, different IDEs and agents look for these skills in different proprietary directories, while increasingly falling back to the universal `.agents/skills/` standard.

Here is a breakdown of how each major IDE and tool integrates skills:

### 1. Claude Code (Anthropic)
- **Primary Path**: `.claude/skills/` (Project) or `~/.claude/skills/` (Global)
- **Universal Fallback**: `.agents/skills/`
- **Format**: Folder containing `SKILL.md`
- **Integration**: Claude Code loads these folders on-demand based on context. Skills are distinct from MCP Tools (which are for external APIs and databases).
- **CLI Management**: `claude plugin add /path/to/skill`

### 2. Cursor IDE
- **Primary Path**: `.cursor/rules/` (Project)
- **Universal Fallback**: `.agents/skills/` (for cross-tool folder compatibility)
- **Format**: Cursor recently migrated away from the monolithic `.cursorrules` file to `.mdc` (Markdown Context) files inside `.cursor/rules/`. While it natively prefers flat `.mdc` files for rules, it supports standard folder-based skills placed in `.agents/skills/` for cross-compatibility with other CLI agents.

### 3. GitHub Copilot Workspace
- **Primary Path**: `.github/skills/` (Project) or `~/.copilot/skills/` (Global)
- **Universal Fallback**: `.claude/skills/` and `.agents/skills/`
- **Integration**: Copilot Workspace uses these folder-based skills for task-specific workflows (e.g., pipelines, boilerplate). Users can manage them via the Skills panel in VS Code / Visual Studio 2026.

### 4. Grok Build (xAI)
- **Primary Path**: `.grok/skills/` (Project) or `~/.grok/skills/` (Global)
- **Format**: Standard folder containing `SKILL.md`.
- **Integration**: Grok Build automatically traverses up the directory tree to find these skills. You can verify loaded skills via `grok inspect` or manage them via the `/skills` TUI modal. Highly cross-compatible, it automatically reads `.claude/` directories as well.

### 5. Codex (OpenAI)
- **Primary Path**: `~/.codex/skills/` (Global)
- **Universal Fallback**: `.agents/skills/` (Project)
- **Integration**: Uses "progressive disclosure" to read only the frontmatter of skills at startup to save context, loading the full `SKILL.md` only when triggered. Managed via the `/skills` command in the composer.

### 6. Windsurf 2.0 (Cognition)
- **Primary Path**: `.windsurf/skills/` (Project) or `~/.codeium/windsurf/skills/` (Global)
- **Universal Fallback**: `.agents/skills/`
- **Integration**: Windsurf 2.0 (released April 2026) uses these folders to teach its Devin-powered Cascade agent multi-step workflows.

### 7. The `skills.sh` Ecosystem
- **What it is**: An open-source registry ("app store") by Vercel Labs for AI agent skills.
- **Integration Strategy**: It provides a CLI (`npx skills add [skill-name]`) that downloads community skills into the universal `.agents/skills/` directory. Total Recall treats `skills.sh` as an upstream provider rather than a downstream consumer.

---

### Action Plan for Total Recall

To ensure Total Recall is perfectly aligned with the 2026 ecosystem, we have updated the discovery and routing logic to scan all these standard directories. However, we also need to implement deeper interoperability:

#### 1. Directory Scanning & Syncing
We have updated `skills-registry.mjs` to actively scan the following roots to discover newly added skills from any tool:
- **Universal Standard**: `.agents/skills/`
- **Proprietary Project Roots**: `.claude/skills/`, `.github/skills/`, `.grok/skills/`, `.windsurf/skills/`, `.cursor/skills/`, `.gemini/skills/`, `.codex/skills/`, `.agent/skills/` (Total Recall internal)

By scanning all of these, Total Recall is now able to synchronize and manage skills seamlessly, regardless of which IDE the user initially installed them for.

#### 2. `skills.sh` Integration Plan (Agent-Driven Architecture)
We will build a native bridge between Total Recall and the open `skills.sh` registry that is explicitly designed for **Agentic Autonomous Operations**, not manual user intervention. Agents, not users, download skills. Total Recall acts as the central orchestrator and safety gatekeeper:

- **Autonomous Agent Discovery**: When an agent (e.g., Antigravity, Windsurf) encounters a novel task, it uses a CLI hook (`npx total-recall skill search <intent>`) to query the `skills.sh` registry. The agent autonomously selects the most relevant skill and requests installation.
- **Trust, Ratings, & Verification**: The search mechanism prioritizes skills based on strict telemetry: community ratings, download counts, and verified publisher badges. Agents are restricted to downloading skills that meet a high trust threshold to prevent hallucinated or malicious packages.
- **Safety Gatekeeper (Quarantine Mode)**: When an agent executes `npx skills add [skill]`, Total Recall intercepts the download and places it in a quarantine zone (`.agent/.quarantine/`). Total Recall performs static analysis on the `SKILL.md` and any attached scripts, ensuring the skill does not request unauthorized network access or dangerous system permissions outside the agent's sandbox.
- **Instant VFS Projection**: Only after the skill passes the safety audit does Total Recall auto-compile it and instantly project it to the universal `.agents/skills/` directory (and all proprietary IDE directories). This allows the requesting agent—and all parallel agents across the ecosystem—to securely execute the workflow milliseconds after discovery.
