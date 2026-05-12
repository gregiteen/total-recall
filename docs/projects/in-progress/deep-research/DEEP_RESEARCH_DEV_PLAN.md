# Sovereign Agentic Search (Deep Research) — Development Plan

## Epic Objective
Implement a multi-step "Plan-Act-Observe" (ReAct) Deep Research workflow directly integrated into the Total Recall SSSS memory architecture, bypassing standard LLM responses in favor of autonomous, parallel web fact-finding.

## Architecture

1. **Trigger Phase**:
   - User toggles "Deep Research" in the chat interface.
   - Frontend issues a `type: task` payload with category `proactive-research` to the `/api/tasks` endpoint.
   
2. **Planning Phase (System 2 Kernel)**:
   - The Dream Daemon (background task loop) intercepts the new task.
   - It prompts Gemma 4 to decompose the prompt into 3-5 sub-queries.
   
3. **Execution Phase (Multi-Agent Tool Calling)**:
   - The daemon spawns an asynchronous execution loop for each sub-query.
   - Agents utilize the MCP gateway to perform web searches and scrape resulting HTML.
   - Information is mapped into temporary `type: memory` files with `status: draft` in `.agent/memory-inbox/pending/`.
   
4. **Synthesis Phase**:
   - The primary kernel retrieves all drafted `memory` nodes.
   - It synthesizes a final, unified Markdown report complete with citations tracing back to the drafted facts.
   - It promotes verified drafts to the permanent memory vault.

## Phase Breakdown

### Phase 1: Planning Engine
Update the Task Scheduler to recognize `proactive-research` tasks, invoke the Gemma 4 kernel, and output a structured list of sub-queries (JSON schema).

### Phase 2: Parallel Execution
Build the `src/core/research.mjs` executor to iterate through sub-queries, dispatching parallel MCP fetch tool calls, and writing Markdown drafts to the inbox.

### Phase 3: Synthesis & Citation
Hook the research output into the main chat response stream. The kernel will read the Inbox, write the final summary, and automatically advance the workflow state.

### Phase 4: UI Integration
Wire the Deep Research button in `ChatPage.tsx` to construct the proper task payload.

### Phase 5: Testing & Verification
End-to-end execution of a complex query (e.g., "Summarize the 2026 AI compute market") and verification that facts are drafted into the SSSS inbox.
