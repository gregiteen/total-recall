# Sovereign Agentic Search (Deep Research) — Project Tracker

## Epic Overview
**Status:** Planned
**Target Phase:** Deep Research Integration

## ✅ Phase 1: Planning Engine
- [x] Define the Zod schema for sub-query generation in `schema.mjs`.
- [x] Add `proactive-research` interception logic to the background task daemon (`task_runner.mjs`).
- [x] Create system prompts to force Gemma 4 to output sub-queries rather than immediate conversational answers.

## ✅ Phase 2: Parallel Execution (`research.mjs`)
- [x] Implement `src/core/research.mjs`.
- [x] Wire the execution loop to spawn parallel Web Search MCP requests.
- [x] Create a parser to translate HTML/search results into temporary `status: draft` SSSS memory nodes.
- [x] Write these nodes to `.agent/memory-inbox/pending/`.

## ✅ Phase 3: Synthesis & Citation
- [x] Implement the synthesis pass in the task runner (triggering when all sub-queries complete).
- [x] Ensure the generated report strictly cites the drafted memory nodes.
- [x] Create an API hook to push the final summarized report into the active Chat session feed (Persisted to Task Body for Dashboard polling).

## ✅ Phase 4: UI Integration
- [x] Add a visual "Deep Research" toggle button to `frontend/src/pages/ChatPage.tsx`.
- [x] Modify the chat `handleSend` to post a `type: task` to the API instead of a direct `sendChat` if Deep Research is active.
- [x] Add a loading/progress indicator to the Chat UI showing "Agents researching...".

## ⏳ Phase 5: Testing & Verification
- [ ] Execute an end-to-end Deep Research query via the UI.
- [ ] Verify the daemon successfully spawns multiple sub-queries.
- [ ] Verify HTML is retrieved, parsed, and converted to `status: draft` nodes in the `memory-inbox`.
- [ ] Validate the final response in the chat feed contains correct markdown citations.
