## 🎯 Architectural Concept

Total Recall connects to every major IDE, CLI harness, and local neural runtime:
- **Google Antigravity (`agy`)**: Frontier multi-step reasoning, web grounding, and deep research on AI Ultra. Instruction surfaces: `AGENTS.md`, `GEMINI.md`, and `.agents/rules/`.
- **Claude Code (`claude`)**: Direct terminal codebase refactoring, bash tool execution, and complex Unix tasks. Native instruction surface: `CLAUDE.md`; auto-memory bridge: `~/.claude/projects/<project>/memory/MEMORY.md`.
- **OpenAI Codex (`codex`)**: Autonomous program synthesis, sandboxed workspace mutations, and isolated code generation (`codex exec`). Reads `AGENTS.md` and `.agents/skills`.
- **xAI Grok Build (`grok`)**: Autonomous coding, repository inspection, and shell execution via xAI Grok (`grok -p`). Reads `AGENTS.md` and `~/.grok/`.
- **Google Gemini CLI (`gemini`)**: Fast utility completions and lightweight tool chaining.
- **Ollama Local LLM (`ollama`)**: Zero-token-cost local neural reasoning (e.g. `gemma4:latest`) running non-interactively via standard input piping (`pipe_stdin`).
- **IDE Surfaces**: Cursor (`.cursor/rules/*.mdc`, `AGENTS.md`), Devin Desktop / Windsurf (`.devin/rules/`), Replit (`replit.md`), Lovable (`AGENTS.md`), DeepSeek Harness (`dsh`), OpenClaw, Hermes Agent, Cline (`.clinerules`), VS Code (`copilot-instructions.md`).

### 📊 Harness Quota Monitoring & Version Currency
On session start (`brief`, `startup check`, and `harness usage`), Total Recall queries each integrated harness:
- **Version currency**: compares installed executable versions against upstream package registries and release tags, flagging pending updates.
- **Account authentication**: verifies active tokens, refresh validity, and plan tier identities.
- **5-Hour rolling window**: reports percentage remaining for short-term session windows (`anthropic-ratelimit-unified-5h`, ChatGPT 5h reasoning allowances, Google compute windows).
- **Weekly quota**: reports percentage remaining for weekly caps and cumulative account limits.
