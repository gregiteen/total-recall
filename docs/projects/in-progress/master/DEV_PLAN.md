# Total Recall 3.0 — Development Plan

> Phased execution plan derived from PRD v3.0, transitioning the Sovereign OS to a Gemma 4 26B zero-parser kernel with continuous and tiered intelligence.

## ⏳ Phase 0: Kernel & Infrastructure
**Objective**: Establish the bedrock host infrastructure (Local/Cloud) and inference engine.

1. **Deploy Script**: Build `npx total-recall deploy` to automate the host provisioning (targeting Ubuntu/Linux with >=24GB RAM).
2. **Inference Stack**: Install ARM-optimized Ollama, pull `Gemma-4-26B-A4B` (Q4_K_M) and `Kokoro-82M`. Set Q4_0 KV cache limits for 32K-48K context window.
3. **Sandbox Module**: Implement `src/core/sandbox.mjs` providing the Node.js/Bash isolated VM environment with runtime secret injection.
4. **Tool Interfaces**: Connect SearXNG (via lightweight Docker) and simple Readability-based web scraper to local kernel tools.

## ⏳ Phase 1: SSSS Memory Architecture
**Objective**: Solidify the database-free memory vault and daemon layers.

1. **Vault Scaffolding**: Create the `.agent/memory-vault/`, `memory-derived/`, `skills/`, and `memory-inbox/` schema definitions.
2. **Schema v2 Enforcer**: Implement Zod validators inside `vault.mjs` for all Markdown YAML reads/writes.
3. **The Router (`surface.mjs`)**: Implement the Hybrid BM25/TF-IDF algorithm routing memory nodes to `SKILL.md` enclosures and compiling `priority: absolute` rules to `INSTRUCTIONS.md`.
4. **The Conflict Engine (`steering.mjs`)**: Implement Layer 1 (Ontology SPO) and Layer 2 (Fuzzy Jaccard/Trigram) detection, with UI quarantine pathways.
5. **The Dream Cycle (`dream.mjs`)**: Tie it together into the background Light/REM/Deep Sleep loops running via cron and chokidar.

## ⏳ Phase 2: Task Scheduler & Proactive Intelligence
**Objective**: Utilize 100% of local compute by automating the LLM in the background.

1. **Scheduler Daemon (`task_runner.mjs`)**: Implement the P0-P5 priority queue system acting on `type: task` Markdown nodes in `scheduler/queue/`.
2. **Skill Engineering Loop**: Programmatic pipeline where the kernel notices missing context -> web searches -> drafts skill -> tests in sandbox.
3. **State Management**: Introduce blackboard/scratchpad files (`runs/data_${run_id}.json`) to let workflows maintain state across parallel fanouts and background operations.

## ⏳ Phase 3: Tiered Intelligence & Recursive Evals
**Objective**: Integrate the "Frontier Judge" layer to continuously improve the local model.

1. **BYOK Gateway**: Read API keys from encrypted `config/frontier.yml`. Establish proxy calls to DeepSeek/OpenAI.
2. **Confidence Routing**: Add kernel reflection prompt logic. If confidence < threshold on a sandbox generation or reasoning step, route execution to Frontier API.
3. **Eval Flywheel**: Wire the completed Phase 2 skills through the Frontier judge for correction. Ensure corrections are persisted back to VFS as few-shot training nodes.
4. **Schema Evolution**: Allow kernel to propose SSSS primitives and test them in sandbox.

## ⏳ Phase 4: The Omnichannel Surface
**Objective**: Provide human access and external agent compatibility with CLI/UI parity.

1. **React Dashboard**: Build the rich UI SPA (`frontend/` directory) for chat, Voice Mode, VFS management (Memory Explorer, Skill Builder, Sandbox Playground), and background monitor status.
2. **Direct API**: Map the Express server to Ollama's `/v1/chat/completions` with bearer token auth.
3. **MCP Gateway**: Implement the Streamable HTTP interface mapping MCP tool calls and resource reads to the SSSS VFS.
4. **MCP Apps Wrap**: Embed the React Dashboard into `ui://` protocols using iframe `postMessage`.

## ⏳ Phase 5: Security & Ops
**Objective**: Ensure the system is hardened for 24/7 personal production use.

1. **Auth & TLS**: Bundle Caddy for auto-HTTPS. Implement bcrypt session auth and Argon2id secret KDF.
2. **Backups**: Implement `npx total-recall backup` to generate AES-256-GCM + GPG `.tar.gpg` archives, and `restore` command.
3. **Observability**: Expose `/health` diagnostic endpoints and emit structured logs to `logs/*.jsonl`.

## ⏳ Phase 6: Testing & Verification
**Objective**: Verify system stability, test beta pathways, and ensure zero regressions.

1. **Vitest Automation**: Build a suite of unit tests for all `.mjs` core modules (surface, steering, vault).
2. **Clean-Account Flow**: Test the deployment and VFS ingestion manually on a fresh environment.
3. **Code Mode Sandbox Tests**: Ensure scripts cannot mutate the host OS outside `~/.agent/`.
4. **Integration Eval**: Ensure confidence routing successfully falls back to Frontier Judge.
