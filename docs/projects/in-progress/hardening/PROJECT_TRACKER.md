# Sovereign SSSS OS — Project Tracker

> Granular implementation tasks derived from the DEV PLAN. Each checkbox is a single, testable unit of work.

---

## ⏳ Phase 1: The Zero-Parser SSSS Engine (Event Router)

Replace brittle Node.js parsers with a seamless native execution layer.

- [ ] Delete all legacy `surface.mjs`, `steering.mjs`, and `dream.mjs` AST/regex parser logic.
- [ ] Implement `src/engine/router.mjs`:
  - Create the Express server specifically for catching external webhooks (Stripe, GitHub).
  - Create internal cron loop scheduler (using `node-cron`).
- [ ] Implement `src/engine/sandbox.mjs`:
  - Provide secure Node.js `vm` module and Bash execution environment.
  - Expose API key injection (`process.env.SECRET_*`).
- [ ] Implement `src/engine/vfs.mjs`:
  - Simple read/write/list wrapper for `.agent/memory-vault/`.

---

## ⏳ Phase 2: DeepSeek Distillation & Gemma Fine-Tuning

Generate the synthetic dataset and train the OS Kernel to natively execute SSSS workflows.

- [ ] **Data Generation (`scripts/generate-dataset.mjs`)**:
  - Connect to DeepSeek-V4 API.
  - Define 50 diverse workflow archetypes (Code Mode, Web Scraping, API Orchestration, Conflict Resolution).
  - Generate 15,000 synthetic trajectories (prompt → exact SSSS Markdown output).
- [ ] **Formatting (`scripts/format-lora.mjs`)**:
  - Convert the 15k trajectories into HuggingFace dataset format (JSONL).
  - Validate prompt structure matches Gemma 4 instruct format.
- [ ] **Fine-Tuning (`scripts/train.py`)**:
  - Write PyTorch/Unsloth training script for LoRA fine-tuning on Gemma 4 E4B.
  - Export trained weights as GGUF format for Ollama compatibility.

---

## ⏳ Phase 3: The Omnichannel Interface

Expose the fine-tuned Brain directly without complex middleman protocols, while remaining accessible across all ecosystems.

- [ ] **Direct API Integration (`src/server/api.mjs`)**:
  - Validate that the local Ollama instance correctly exposes `/v1/chat/completions`.
  - Expose this endpoint directly via the Express server for zero-friction access via webhooks and iOS Shortcuts.
- [ ] **MCP Gateway (`src/server/mcp.mjs`)**:
  - Implement the Streamable HTTP (POST/GET) transport layer for remote AI clients (Claude/Cursor).
- [ ] **Standalone Dashboard (`src/ui/app.tsx`)**:
  - Create a highly personalized, visually stunning React SPA containing a direct chat interface and a full data explorer for the memory graph and workflows.
  - Host the `dist/` folder securely via Express static middleware with password protection.
- [ ] **MCP App Wrapping (`src/ui/mcp-app.ts`)**:
  - Wrap the React SPA to expose it as an `ui://` resource.
  - Implement the `postMessage` event listeners for secure iframe rendering inside Claude/Cursor.

---

## ⏳ Phase 4: CLI Orchestration (`npx total-recall deploy`)

Provide a zero-friction deployment experience for the Oracle 24GB VM.

- [ ] **CLI Scaffolding (`bin/total-recall`)**:
  - Implement the `deploy` subcommand.
- [ ] **Infrastructure Setup Script**:
  - Auto-download and install Ollama for Linux ARM64 (Ampere A1).
  - Execute `ollama pull` for the custom GGUF weights.
  - Start the Ollama systemd service.
- [ ] **Environment Setup Script**:
  - Scaffold the `.agent/memory-vault/` block storage structure on the 200GB drive.
  - Pull down the Node.js Event Router/Sandbox codebase and start via PM2.

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| ⏳ Phase 1: Zero-Parser Engine | 4 | ⬜ Not started |
| ⏳ Phase 2: Distillation & Training | 3 | ⬜ Not started |
| ⏳ Phase 3: Direct API | 2 | ⬜ Not started |
| ⏳ Phase 4: CLI Orchestration | 3 | ⬜ Not started |
| **Total** | **12 tasks** | |
