# Total Recall 3.0 — Project Tracker

> Granular implementation checklist mapped directly to the Development Plan. Each checkbox represents a testable unit of work.

## ⏳ Phase 0: Kernel & Infrastructure
- [ ] Implement `bin/deploy.sh` wrapper for initial host infrastructure setup (Linux >=24GB RAM).
- [ ] Download and configure Ollama (Linux ARM64 version).
- [ ] Pull `Gemma-4-26B-A4B` (Q4_K_M) and configure `OLLAMA_KV_CACHE_TYPE=q4_0`.
- [ ] Pull and test `Kokoro-82M` for basic TTS responses.
- [ ] Create `src/core/sandbox.mjs` with `--experimental-vm-modules` isolated Node execution.
- [ ] Implement credential injection resolver (`{{secrets.*}}`) in sandbox runner.
- [ ] Wire up local Docker instance of SearXNG and base Readability JS web scraper.

## ⏳ Phase 1: SSSS Memory Architecture
- [ ] Scaffold `~/.agent/` directory structure (vault, inbox, skills, derived).
- [ ] Define Zod schemas in `src/core/schema.mjs` for Memory, Skill, Rule, and Task nodes.
- [ ] Implement `src/core/surface.mjs` hybrid BM25 + TF-IDF routing algorithm.
- [ ] Implement `surface.mjs` Tier 1 compiler logic (`priority: absolute` -> `INSTRUCTIONS.md`).
- [ ] Implement `src/core/steering.mjs` Layer 1 (Ontology SPO) collision check.
- [ ] Implement `src/core/steering.mjs` Layer 2 (Jaccard + Cosine Trigrams) collision check.
- [ ] Create UI/CLI quarantine workflows in `steering.mjs` (`memory-inbox/conflicts/`).
- [ ] Build the `src/core/dream.mjs` cron daemon (Light / REM / Deep Sleep).

## ⏳ Phase 2: Task Scheduler & Proactive Intelligence
- [ ] Implement `src/core/task_runner.mjs` priority queue manager (P0-P5 processing loop).
- [ ] Build the Pattern Detection heuristic module (watching user logs for missing knowledge).
- [ ] Create the autonomous Skill Engineering SSSS workflow file template.
- [ ] Implement blackboard local state tracking for multi-step workflows.
- [ ] Test the background agent running an end-to-end web search -> skill draft generation.

## ⏳ Phase 3: Tiered Intelligence & Recursive Evals
- [ ] Implement `src/core/frontier.mjs` bypass routing client for OpenAI-compatible endpoints.
- [ ] Hook up DeepSeek V4 Pro config template (`config/frontier.yml`).
- [ ] Add confidence thresholds to `sandbox.mjs` failure loops to trigger Frontier escalation.
- [ ] Create the SSSS Eval Workflow (Skill test -> Frontier Judge -> SSSS few-shot node generation).
- [ ] Implement self-evolution test allowing the kernel to propose schema upgrades.

## ⏳ Phase 4: The Omnichannel Surface
- [ ] Initialize React + Vite SPA dashboard inside `frontend/` directory (TypeScript).
- [ ] Implement Chat/Voice unified interface component.
- [ ] Implement SSSS VFS Graph Explorer component.
- [ ] Implement `src/server/api.mjs` Express routes for `/v1/chat/completions` auth passthrough.
- [ ] Implement `src/server/mcp.mjs` for Streamable HTTP endpoint adhering to MCP spec.
- [ ] Add `postMessage` handlers in SPA to render natively within Claude Desktop/Cursor MCP `ui://`.

## ⏳ Phase 5: Security & Ops
- [ ] Configure Caddyfile generation for auto TLS / Let's Encrypt.
- [ ] Implement bcrypt hashing and cookie session management for the SPA.
- [ ] Implement `src/core/crypto.mjs` with Argon2id and AES-256-GCM for `secrets.enc`.
- [ ] Build `bin/backup` generating encrypted tarballs.
- [ ] Build `bin/restore` handling extraction and `dream.mjs` index rebuilds.
- [ ] Add `/health` diagnostic endpoints and JSONL logging middleware.

## ⏳ Phase 6: Testing & Verification
- [ ] Write and pass Vitest specs for `steering.mjs` collision layers.
- [ ] Write and pass Vitest specs for `surface.mjs` BM25 + TF-IDF routing accuracy.
- [ ] Run clean-account walkthrough to verify SSSS initialization on an empty VFS.
- [ ] Manually verify Code Mode sandbox escape prevention.
- [ ] Verify Dashboard SPA correctly renders via MCP embedded iframe messaging.
