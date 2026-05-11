# DEVELOPMENT PLAN: The Sovereign SSSS Operating System

## Objective
Elevate Total Recall from a local file manager into a cloud-ready, hardware-agnostic Operating System powered by a fine-tuned Gemma-4 model executing autonomous SSSS workflows.

---

## ⏳ Phase 1: The Zero-Parser Engine (Local First)
Build the foundational Node.js wrapper that feeds events directly to the LLM. No brittle text-parsing algorithms.

1. **Event Router (`src/engine/router.mjs`)**: 
   - Listen for cron triggers and incoming HTTP webhooks.
   - Map triggers to the correct `type: workflow` VFS Markdown files.
2. **The Code Sandbox (`src/engine/sandbox.mjs`)**: 
   - Implement the secure Node.js/Bash execution environment.
   - Provide the `run_code` execution tool directly to the engine so the LLM can perform JIT integrations.
3. **State Management (`src/engine/blackboard.mjs`)**: 
   - Provide a mechanism for the LLM to write to `scratchpad.yml` or `execution.log` to pass state between parallel or sequential steps.

---

## ⏳ Phase 2: Internal Processing (Gemma 4 Fine-Tuning)
Establish the Sovereign Intelligence layer. Instead of falling back to paid Cloud APIs, we rely entirely on local execution.

1. **Dataset Generation**: 
   - Write a script to generate thousands of examples of `type: workflow` and `type: assistant` SSSS executions.
   - Include edge cases like `[Retry: 3]`, `[Parallel]`, and complex Code Mode generations.
2. **Fine-Tuning (`TotalRecall-Gemma-SSSS`)**:
   - Fine-tune the Gemma 4 E4B model on the SSSS dataset.
   - **Result**: The model natively understands the SSSS architecture. We no longer need to burn tokens stuffing `ssss/SKILL.md` into the context window for every request. The model *is* the SSSS OS Kernel.
3. **Local Hardware Provider**:
   - Integrate `llama.cpp` / Ollama support into the engine to run the fine-tuned `.gguf` weights directly.

---

## ⏳ Phase 3: The Omnichannel Interface
Expose the brain to the outside world securely across all client types.

1. **Direct API Configuration (`src/server/api.mjs`)**:
   - Expose the Ollama inference endpoint directly as an OpenAI-compatible API for webhooks and iOS Shortcuts.
2. **The MCP Gateway (`src/server/mcp.mjs`)**:
   - Expose the stateless **Streamable HTTP** route (POST/GET) for remote AI clients (Claude Desktop, Cursor).
3. **The Standalone Dashboard & MCP App (`src/ui/app.tsx`)**:
   - Build a visually stunning React SPA for the memory graph and inbox.
   - Serve it securely via password-protection for mobile browser access.
   - Wrap it as an **MCP App** (`ui://`) to render it natively inside Claude/Cursor via `postMessage`.

---

## ⏳ Phase 4: CLI Orchestration (`npx total-recall deploy`)
Provide a zero-friction deployment experience for users bringing their own hardware.

1. **Deployment Target**:
   - Build the `npx total-recall deploy` orchestrator.
   - When executed, it automatically targets the Oracle Cloud environment:
     - Installs Ollama.
     - Pulls the fine-tuned `TotalRecall-Gemma-SSSS` weights.
     - Starts the Event Router via Docker Compose.
     - Scaffolds the `.agent/memory-vault/` block storage.
